import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { criarCarregamentoSchema, atualizarCarregamentoSchema } from './carregamentos.schema';

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.query.silo_id);
    if (isNaN(siloId) || siloId <= 0) throw new AppError(400, 'silo_id é obrigatório');

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.carregamento.count({ where: { silo_id: siloId } }),
      prisma.carregamento.findMany({
        where: { silo_id: siloId },
        skip,
        take: limit,
        orderBy: { hora_referencia: 'desc' },
      }),
    ]);

    res.json({ data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}

export async function criar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = criarCarregamentoSchema.safeParse(req.body);
    if (!data.success) throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));

    const silo = await prisma.silo.findUnique({ where: { id: data.data.silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');

    const carregamento = await prisma.carregamento.create({ data: data.data });
    res.status(201).json(carregamento);
  } catch (err) {
    next(err);
  }
}

export async function buscar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const carregamento = await prisma.carregamento.findUnique({ where: { id } });
    if (!carregamento) throw new AppError(404, 'Carregamento não encontrado');

    res.json(carregamento);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarCarregamentoSchema.safeParse(req.body);
    if (!data.success) throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));

    const carregamento = await prisma.carregamento.findUnique({ where: { id } });
    if (!carregamento) throw new AppError(404, 'Carregamento não encontrado');

    const atualizado = await prisma.carregamento.update({ where: { id }, data: data.data });
    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}

export async function excluir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const carregamento = await prisma.carregamento.findUnique({ where: { id } });
    if (!carregamento) throw new AppError(404, 'Carregamento não encontrado');

    await prisma.carregamento.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
