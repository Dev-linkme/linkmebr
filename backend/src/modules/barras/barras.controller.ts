import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { assertEmpresa } from '../../middlewares/tenantGuard';
import { criarBarraSchema, atualizarBarraSchema, alterarStatusBarraSchema } from './barras.schema';

async function verificarAcessoSilo(siloId: number, userEmpresaId: number | null | undefined) {
  const silo = await prisma.silo.findUnique({ where: { id: siloId } });
  if (!silo) throw new AppError(404, 'Silo não encontrado');
  assertEmpresa(userEmpresaId ?? null, silo.empresa_id);
  return silo;
}

// Listagem de barras de um silo (usada em /silos/:id/barras)
export async function listarBarrasDeSilo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const siloId = Number(req.params.id);
    if (isNaN(siloId)) throw new AppError(400, 'ID do silo inválido');

    await verificarAcessoSilo(siloId, req.user?.empresa_id);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [total, barras] = await Promise.all([
      prisma.barra.count({ where: { silo_id: siloId } }),
      prisma.barra.findMany({
        where: { silo_id: siloId },
        skip,
        take: limit,
        orderBy: { identificacao: 'asc' },
        include: {
          _count: { select: { sensores: true } },
        },
      }),
    ]);

    res.json({
      data: barras,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// Criação de barra em um silo (usada em /silos/:id/barras)
export async function criarBarra(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const siloId = Number(req.params.id);
    if (isNaN(siloId)) throw new AppError(400, 'ID do silo inválido');

    await verificarAcessoSilo(siloId, req.user?.empresa_id);

    const data = criarBarraSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const barra = await prisma.barra.create({
      data: { ...data.data, silo_id: siloId },
    });

    res.status(201).json(barra);
  } catch (err) {
    next(err);
  }
}

// Listagem de barras (rota independente /barras)
export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = req.query.silo_id ? Number(req.query.silo_id) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (siloId) where.silo_id = siloId;

    if (req.user?.perfil !== 'administrador_geral') {
      where.silo = { empresa_id: req.user?.empresa_id };
    }

    const [total, barras] = await Promise.all([
      prisma.barra.count({ where }),
      prisma.barra.findMany({
        where,
        skip,
        take: limit,
        orderBy: { identificacao: 'asc' },
        include: {
          silo: { select: { id: true, nome: true, empresa_id: true } },
          _count: { select: { sensores: true } },
        },
      }),
    ]);

    res.json({
      data: barras,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function buscar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const barra = await prisma.barra.findUnique({
      where: { id },
      include: {
        silo: { select: { id: true, nome: true, empresa_id: true } },
        sensores: { orderBy: { altura_solo_m: 'asc' } },
      },
    });

    if (!barra) throw new AppError(404, 'Barra não encontrada');
    assertEmpresa(req.user?.empresa_id ?? null, barra.silo.empresa_id);

    res.json(barra);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarBarraSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const barra = await prisma.barra.findUnique({
      where: { id },
      include: { silo: { select: { empresa_id: true } } },
    });
    if (!barra) throw new AppError(404, 'Barra não encontrada');
    assertEmpresa(req.user?.empresa_id ?? null, barra.silo.empresa_id);

    const atualizada = await prisma.barra.update({ where: { id }, data: data.data });
    res.json(atualizada);
  } catch (err) {
    next(err);
  }
}

export async function alterarStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = alterarStatusBarraSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const barra = await prisma.barra.findUnique({
      where: { id },
      include: { silo: { select: { empresa_id: true } } },
    });
    if (!barra) throw new AppError(404, 'Barra não encontrada');
    assertEmpresa(req.user?.empresa_id ?? null, barra.silo.empresa_id);

    const atualizada = await prisma.barra.update({
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

    const barra = await prisma.barra.findUnique({
      where: { id },
      include: { silo: { select: { empresa_id: true } } },
    });
    if (!barra) throw new AppError(404, 'Barra não encontrada');
    assertEmpresa(req.user?.empresa_id ?? null, barra.silo.empresa_id);

    const sensoresCount = await prisma.sensor.count({ where: { barra_id: id } });
    if (sensoresCount > 0) {
      throw new AppError(
        409,
        `Não é possível excluir a barra pois ela possui ${sensoresCount} sensor(es) associado(s)`,
      );
    }

    await prisma.barra.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
