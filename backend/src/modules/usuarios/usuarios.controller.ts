import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../utils/errors';
import {
  criarUsuarioSchema,
  atualizarUsuarioSchema,
  alterarStatusUsuarioSchema,
} from './usuarios.schema';

// Duração em segundos do JWT_EXPIRES_IN para TTL do blacklist
const JWT_BLACKLIST_TTL = 8 * 60 * 60; // 8 horas padrão

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const busca = req.query.busca as string | undefined;
    const status = req.query.status as string | undefined;

    const where: Record<string, unknown> = {};

    // administrador_empresa só vê usuários da própria empresa
    if (req.user?.perfil === 'administrador_empresa') {
      where.empresa_id = req.user.empresa_id;
    } else if (req.query.empresa_id) {
      where.empresa_id = Number(req.query.empresa_id);
    }

    if (status) where.status = status;
    if (busca) {
      where.OR = [
        { nome_completo: { contains: busca, mode: 'insensitive' } },
        { email: { contains: busca, mode: 'insensitive' } },
      ];
    }

    const [total, usuarios] = await Promise.all([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nome_completo: 'asc' },
        select: {
          id: true,
          nome_completo: true,
          email: true,
          perfil: true,
          empresa_id: true,
          status: true,
          criado_em: true,
          atualizado_em: true,
          empresa: {
            select: { id: true, razao_social: true, nome_fantasia: true },
          },
        },
      }),
    ]);

    res.json({
      data: usuarios,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function criar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = criarUsuarioSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const { nome_completo, email, senha, perfil, empresa_id, status } = data.data;

    // Regras de perfil por quem está criando
    if (req.user?.perfil === 'administrador_empresa') {
      // pode criar administrador_empresa ou operador_empresa — nunca administrador_geral
      if (perfil === 'administrador_geral') {
        throw new AppError(403, 'Administrador de empresa não pode criar administrador geral');
      }
      // empresa sempre é a do próprio criador — ignora qualquer empresa_id enviado
    }

    if (req.user?.perfil === 'administrador_geral') {
      // não pode criar operador_empresa
      if (perfil === 'operador_empresa') {
        throw new AppError(403, 'Administrador geral não pode criar operador de empresa');
      }
      if (perfil === 'administrador_empresa' && !empresa_id) {
        throw new AppError(400, 'Administrador de empresa deve ter uma empresa vinculada');
      }
      if (perfil === 'administrador_geral' && empresa_id) {
        throw new AppError(400, 'Administrador geral não pode ter empresa vinculada');
      }
    }

    // administrador_empresa sempre cria na própria empresa
    const empresaIdFinal =
      req.user?.perfil === 'administrador_empresa'
        ? (req.user.empresa_id ?? null)
        : (empresa_id ?? null);

    // Verifica email duplicado
    const emailExistente = await prisma.usuario.findUnique({ where: { email } });
    if (emailExistente) {
      throw new AppError(409, 'Já existe um usuário cadastrado com este e-mail');
    }

    // Verifica se empresa existe quando informada
    if (empresaIdFinal) {
      const empresa = await prisma.empresa.findUnique({ where: { id: empresaIdFinal } });
      if (!empresa) throw new AppError(404, 'Empresa não encontrada');
      if (empresa.status === 'inativa') throw new AppError(400, 'Não é possível vincular usuário a uma empresa inativa');
    }

    const senha_hash = await bcrypt.hash(senha, 12);

    const usuario = await prisma.usuario.create({
      data: {
        nome_completo,
        email,
        senha_hash,
        perfil,
        empresa_id: empresaIdFinal,
        status,
      },
      select: {
        id: true,
        nome_completo: true,
        email: true,
        perfil: true,
        empresa_id: true,
        status: true,
        criado_em: true,
      },
    });

    res.status(201).json(usuario);
  } catch (err) {
    next(err);
  }
}

export async function buscar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nome_completo: true,
        email: true,
        perfil: true,
        empresa_id: true,
        status: true,
        criado_em: true,
        atualizado_em: true,
        empresa: {
          select: { id: true, razao_social: true, nome_fantasia: true },
        },
      },
    });

    if (!usuario) throw new AppError(404, 'Usuário não encontrado');

    // administrador_empresa só vê usuários da própria empresa
    if (
      req.user?.perfil === 'administrador_empresa' &&
      usuario.empresa_id !== req.user.empresa_id
    ) {
      throw new AppError(403, 'Acesso negado a este usuário');
    }

    res.json(usuario);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarUsuarioSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new AppError(404, 'Usuário não encontrado');

    if (
      req.user?.perfil === 'administrador_empresa' &&
      usuario.empresa_id !== req.user.empresa_id
    ) {
      throw new AppError(403, 'Acesso negado a este usuário');
    }

    const { senha, perfil: novoPerfil, ...resto } = data.data;

    // Mesmas restrições de perfil da criação
    if (novoPerfil) {
      if (req.user?.perfil === 'administrador_empresa' && novoPerfil === 'administrador_geral') {
        throw new AppError(403, 'Administrador de empresa não pode atribuir perfil de administrador geral');
      }
      if (req.user?.perfil === 'administrador_geral' && novoPerfil === 'operador_empresa') {
        throw new AppError(403, 'Administrador geral não pode atribuir perfil de operador de empresa');
      }
    }

    const dadosAtualizacao: Record<string, unknown> = { ...resto };
    if (novoPerfil) dadosAtualizacao.perfil = novoPerfil;

    if (senha) {
      dadosAtualizacao.senha_hash = await bcrypt.hash(senha, 12);
    }

    const atualizado = await prisma.usuario.update({
      where: { id },
      data: dadosAtualizacao,
      select: {
        id: true,
        nome_completo: true,
        email: true,
        perfil: true,
        empresa_id: true,
        status: true,
        atualizado_em: true,
      },
    });

    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}

export async function alterarStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = alterarStatusUsuarioSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new AppError(404, 'Usuário não encontrado');

    if (
      req.user?.perfil === 'administrador_empresa' &&
      usuario.empresa_id !== req.user.empresa_id
    ) {
      throw new AppError(403, 'Acesso negado a este usuário');
    }

    const atualizado = await prisma.usuario.update({
      where: { id },
      data: { status: data.data.status },
      select: {
        id: true,
        nome_completo: true,
        email: true,
        perfil: true,
        status: true,
        atualizado_em: true,
      },
    });

    // Ao desativar, insere flag de blacklist por usuário no Redis
    // O middleware authenticate pode checar `blacklist_user:{id}` para invalidar todos os tokens
    if (data.data.status === 'inativo') {
      await redis.setex(`blacklist_user:${id}`, JWT_BLACKLIST_TTL, '1');
    } else {
      // Ao reativar, remove a flag de blacklist
      await redis.del(`blacklist_user:${id}`);
    }

    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}
