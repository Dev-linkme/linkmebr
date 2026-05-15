import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { criarFaqSchema, atualizarFaqSchema, atualizarOrdemFaqSchema, langSchema } from './faq.schema';

// Seleciona apenas os campos do idioma solicitado
function selectPorLang(lang: string) {
  switch (lang) {
    case 'en':
      return {
        id: true,
        pergunta_en: true,
        resposta_en: true,
        ordem: true,
      };
    case 'es':
      return {
        id: true,
        pergunta_es: true,
        resposta_es: true,
        ordem: true,
      };
    default: // pt
      return {
        id: true,
        pergunta_pt: true,
        resposta_pt: true,
        ordem: true,
      };
  }
}

// GET /faq — público, apenas publicados
export async function listarPublico(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const langResult = langSchema.safeParse(req.query.lang);
    const lang = langResult.success ? langResult.data : 'pt';

    const faqs = await prisma.faq.findMany({
      where: { status: 'publicado' },
      orderBy: { ordem: 'asc' },
      select: selectPorLang(lang),
    });

    res.json({ data: faqs, lang });
  } catch (err) {
    next(err);
  }
}

// GET /admin/faq — admin, todos os campos
export async function listarAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [total, faqs] = await Promise.all([
      prisma.faq.count({ where }),
      prisma.faq.findMany({
        where,
        skip,
        take: limit,
        orderBy: { ordem: 'asc' },
      }),
    ]);

    res.json({
      data: faqs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function criar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = criarFaqSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const faq = await prisma.faq.create({ data: data.data });
    res.status(201).json(faq);
  } catch (err) {
    next(err);
  }
}

export async function buscar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const faq = await prisma.faq.findUnique({ where: { id } });
    if (!faq) throw new AppError(404, 'FAQ não encontrada');

    res.json(faq);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarFaqSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const faq = await prisma.faq.findUnique({ where: { id } });
    if (!faq) throw new AppError(404, 'FAQ não encontrada');

    const atualizada = await prisma.faq.update({ where: { id }, data: data.data });
    res.json(atualizada);
  } catch (err) {
    next(err);
  }
}

export async function atualizarOrdem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarOrdemFaqSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const faq = await prisma.faq.findUnique({ where: { id } });
    if (!faq) throw new AppError(404, 'FAQ não encontrada');

    const atualizada = await prisma.faq.update({
      where: { id },
      data: { ordem: data.data.ordem },
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

    const faq = await prisma.faq.findUnique({ where: { id } });
    if (!faq) throw new AppError(404, 'FAQ não encontrada');

    await prisma.faq.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
