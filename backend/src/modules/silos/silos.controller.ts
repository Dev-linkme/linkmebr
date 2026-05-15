import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { assertEmpresa } from '../../middlewares/tenantGuard';
import { criarSiloSchema, atualizarSiloSchema, alterarStatusSiloSchema } from './silos.schema';

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const busca = req.query.busca as string | undefined;
    const status = req.query.status as string | undefined;

    const where: Record<string, unknown> = {};

    if (req.user?.perfil !== 'administrador_geral') {
      where.empresa_id = req.user?.empresa_id;
    } else if (req.query.empresa_id) {
      where.empresa_id = Number(req.query.empresa_id);
    }

    if (status) where.status = status;
    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { cidade: { contains: busca, mode: 'insensitive' } },
      ];
    }

    const [total, silos] = await Promise.all([
      prisma.silo.count({ where }),
      prisma.silo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nome: 'asc' },
        include: {
          empresa: { select: { id: true, razao_social: true, nome_fantasia: true } },
          _count: { select: { barras: true, alertas: true } },
        },
      }),
    ]);

    res.json({
      data: silos,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function criar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = criarSiloSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    assertEmpresa(req.user?.empresa_id ?? null, data.data.empresa_id);

    const empresa = await prisma.empresa.findUnique({ where: { id: data.data.empresa_id } });
    if (!empresa) throw new AppError(404, 'Empresa não encontrada');
    if (empresa.status === 'inativa') throw new AppError(400, 'Não é possível criar silo para empresa inativa');

    const silo = await prisma.silo.create({
      data: {
        ...data.data,
        latitude: data.data.latitude !== undefined ? data.data.latitude : null,
        longitude: data.data.longitude !== undefined ? data.data.longitude : null,
      },
      include: {
        empresa: { select: { id: true, razao_social: true } },
      },
    });

    res.status(201).json(silo);
  } catch (err) {
    next(err);
  }
}

export async function buscar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const silo = await prisma.silo.findUnique({
      where: { id },
      include: {
        empresa: { select: { id: true, razao_social: true, nome_fantasia: true } },
        _count: { select: { barras: true, alertas: true } },
      },
    });

    if (!silo) throw new AppError(404, 'Silo não encontrado');

    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    res.json(silo);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarSiloSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const silo = await prisma.silo.findUnique({ where: { id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');

    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const atualizado = await prisma.silo.update({
      where: { id },
      data: data.data,
      include: {
        empresa: { select: { id: true, razao_social: true } },
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

    const data = alterarStatusSiloSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const silo = await prisma.silo.findUnique({ where: { id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');

    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const atualizado = await prisma.silo.update({
      where: { id },
      data: { status: data.data.status },
    });

    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}

export async function excluir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const silo = await prisma.silo.findUnique({ where: { id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');

    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const barrasCount = await prisma.barra.count({ where: { silo_id: id } });
    if (barrasCount > 0) {
      throw new AppError(
        409,
        `Não é possível excluir o silo pois ele possui ${barrasCount} barra(s) associada(s)`,
      );
    }

    await prisma.silo.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
