import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import {
  criarEmpresaSchema,
  atualizarEmpresaSchema,
  alterarStatusEmpresaSchema,
} from './empresas.schema';

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const busca = req.query.busca as string | undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (busca) {
      where.OR = [
        { razao_social: { contains: busca, mode: 'insensitive' } },
        { nome_fantasia: { contains: busca, mode: 'insensitive' } },
        { cnpj: { contains: busca } },
      ];
    }

    const [total, empresas] = await Promise.all([
      prisma.empresa.count({ where }),
      prisma.empresa.findMany({
        where,
        skip,
        take: limit,
        orderBy: { razao_social: 'asc' },
      }),
    ]);

    res.json({
      data: empresas,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function criar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = criarEmpresaSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const cnpjExistente = await prisma.empresa.findUnique({
      where: { cnpj: data.data.cnpj },
    });
    if (cnpjExistente) {
      throw new AppError(409, 'Já existe uma empresa cadastrada com este CNPJ');
    }

    const empresa = await prisma.empresa.create({ data: data.data });
    res.status(201).json(empresa);
  } catch (err) {
    next(err);
  }
}

export async function buscar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const empresa = await prisma.empresa.findUnique({
      where: { id },
      include: {
        _count: { select: { silos: true, usuarios: true } },
      },
    });

    if (!empresa) throw new AppError(404, 'Empresa não encontrada');

    res.json(empresa);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarEmpresaSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const empresa = await prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new AppError(404, 'Empresa não encontrada');

    const atualizada = await prisma.empresa.update({
      where: { id },
      data: data.data,
    });

    res.json(atualizada);
  } catch (err) {
    next(err);
  }
}

export async function alterarStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = alterarStatusEmpresaSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const empresa = await prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new AppError(404, 'Empresa não encontrada');

    const atualizada = await prisma.empresa.update({
      where: { id },
      data: { status: data.data.status },
    });

    res.json(atualizada);
  } catch (err) {
    next(err);
  }
}

export async function excluir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const empresa = await prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new AppError(404, 'Empresa não encontrada');

    const [silosCount, usuariosCount] = await Promise.all([
      prisma.silo.count({ where: { empresa_id: id } }),
      prisma.usuario.count({ where: { empresa_id: id } }),
    ]);

    if (silosCount > 0) {
      throw new AppError(
        409,
        `Não é possível excluir a empresa pois ela possui ${silosCount} silo(s) associado(s)`,
      );
    }

    if (usuariosCount > 0) {
      throw new AppError(
        409,
        `Não é possível excluir a empresa pois ela possui ${usuariosCount} usuário(s) associado(s)`,
      );
    }

    await prisma.empresa.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
