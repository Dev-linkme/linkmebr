import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { criarSolicitacaoContatoSchema, atualizarStatusContatoSchema } from './contato.schema';

// POST /contato — público
export async function criarSolicitacao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = criarSolicitacaoContatoSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const solicitacao = await prisma.solicitacaoContato.create({
      data: {
        ...data.data,
        status: 'novo',
      },
    });

    res.status(201).json({
      message: 'Solicitação de contato registrada com sucesso. Entraremos em contato em breve.',
      id: solicitacao.id,
    });
  } catch (err) {
    next(err);
  }
}

// GET /admin/contatos — admin
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
        { nome: { contains: busca, mode: 'insensitive' } },
        { email: { contains: busca, mode: 'insensitive' } },
        { empresa: { contains: busca, mode: 'insensitive' } },
      ];
    }

    const [total, solicitacoes] = await Promise.all([
      prisma.solicitacaoContato.count({ where }),
      prisma.solicitacaoContato.findMany({
        where,
        skip,
        take: limit,
        orderBy: { data_hora: 'desc' },
      }),
    ]);

    res.json({
      data: solicitacoes,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// GET /admin/contatos/:id
export async function buscar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const solicitacao = await prisma.solicitacaoContato.findUnique({ where: { id } });
    if (!solicitacao) throw new AppError(404, 'Solicitação de contato não encontrada');

    res.json(solicitacao);
  } catch (err) {
    next(err);
  }
}

// PATCH /admin/contatos/:id/status
export async function atualizarStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarStatusContatoSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const solicitacao = await prisma.solicitacaoContato.findUnique({ where: { id } });
    if (!solicitacao) throw new AppError(404, 'Solicitação de contato não encontrada');

    const atualizada = await prisma.solicitacaoContato.update({
      where: { id },
      data: {
        status: data.data.status,
        ...(data.data.observacoes_internas !== undefined
          ? { observacoes_internas: data.data.observacoes_internas }
          : {}),
      },
    });

    res.json(atualizada);
  } catch (err) {
    next(err);
  }
}
