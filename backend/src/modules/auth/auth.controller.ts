import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { loginSchema } from './auth.schema';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = loginSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const { email, senha } = data.data;

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { empresa: true },
    });

    if (!usuario || usuario.status === 'inativo' || usuario.perfil === 'sistema') {
      throw new AppError(401, 'Credenciais inválidas ou usuário inativo');
    }

    // Verifica se empresa vinculada está ativa
    if (usuario.empresa && usuario.empresa.status === 'inativa') {
      throw new AppError(401, 'Empresa vinculada está inativa. Contate o suporte.');
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      throw new AppError(401, 'Credenciais inválidas ou usuário inativo');
    }

    const payload = {
      id: usuario.id,
      perfil: usuario.perfil as 'administrador_geral' | 'administrador_empresa' | 'operador_empresa',
      empresa_id: usuario.empresa_id,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome_completo: usuario.nome_completo,
        perfil: usuario.perfil,
        empresa_id: usuario.empresa_id,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.token;
    if (!token) {
      throw new AppError(400, 'Token não encontrado');
    }

    // Calcula TTL restante do token para expirar a entrada no Redis junto com o JWT
    const decoded = jwt.decode(token) as { exp?: number } | null;
    const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;

    if (ttl > 0) {
      await redis.setex(`blacklist:${token}`, ttl, '1');
    }

    res.json({ message: 'Logout realizado com sucesso' });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Não autenticado');

    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        nome_completo: true,
        email: true,
        perfil: true,
        empresa_id: true,
        status: true,
        criado_em: true,
        empresa: {
          select: {
            id: true,
            razao_social: true,
            nome_fantasia: true,
            status: true,
          },
        },
      },
    });

    if (!usuario) throw new AppError(404, 'Usuário não encontrado');

    res.json(usuario);
  } catch (err) {
    next(err);
  }
}
