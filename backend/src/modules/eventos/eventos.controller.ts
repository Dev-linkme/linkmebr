import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { criarEventoSchema, atualizarEventoSchema } from './eventos.schema';

const includeUsuario = { usuario: { select: { id: true, nome_completo: true } } };

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.query.silo_id);
    if (isNaN(siloId) || siloId <= 0) throw new AppError(400, 'silo_id é obrigatório');

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.evento.count({ where: { silo_id: siloId } }),
      prisma.evento.findMany({
        where: { silo_id: siloId },
        skip,
        take: limit,
        orderBy: { hora_referencia: 'desc' },
        include: includeUsuario,
      }),
    ]);

    res.json({ data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}

export async function criar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = criarEventoSchema.safeParse(req.body);
    if (!data.success) throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));

    const silo = await prisma.silo.findUnique({ where: { id: data.data.silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');

    const evento = await prisma.evento.create({
      data: { ...data.data, usuario_id: req.user!.id },
      include: includeUsuario,
    });
    res.status(201).json(evento);
  } catch (err) {
    next(err);
  }
}

export async function buscar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const evento = await prisma.evento.findUnique({ where: { id }, include: includeUsuario });
    if (!evento) throw new AppError(404, 'Evento não encontrado');

    res.json(evento);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarEventoSchema.safeParse(req.body);
    if (!data.success) throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));

    const evento = await prisma.evento.findUnique({ where: { id } });
    if (!evento) throw new AppError(404, 'Evento não encontrado');

    const atualizado = await prisma.evento.update({
      where: { id },
      data: data.data,
      include: includeUsuario,
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

    const evento = await prisma.evento.findUnique({ where: { id } });
    if (!evento) throw new AppError(404, 'Evento não encontrado');

    await prisma.evento.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
