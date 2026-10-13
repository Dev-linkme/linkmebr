import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';

function iaUrl(path: string) {
  if (!env.IA_BASE_URL) throw new Error('Serviço de IA não configurado (IA_BASE_URL)');
  return `${env.IA_BASE_URL}${path}`;
}

function iaHeaders(req: Request) {
  return { Authorization: `Bearer ${req.token}` };
}

function forwardIaError(err: unknown, next: NextFunction): void {
  if (axios.isAxiosError(err) && err.response) {
    const detail = (err.response.data as { detail?: string } | null)?.detail ?? 'Erro no serviço de IA';
    next(new AppError(err.response.status, detail));
    return;
  }
  if (err instanceof Error && err.message.includes('não configurado')) {
    next(new AppError(503, err.message));
    return;
  }
  next(err);
}

export async function buscarStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id } = req.query;
    if (!silo_id) throw new AppError(400, 'silo_id é obrigatório');
    const { data } = await axios.get(iaUrl('/api/v1/status'), {
      headers: iaHeaders(req),
      params: { silo_id },
      timeout: 15_000,
    });
    res.json(data);
  } catch (err) {
    forwardIaError(err, next);
  }
}

export async function solicitarTreino(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id, modo } = req.body as { silo_id?: number; modo?: string };
    if (!silo_id || !modo) throw new AppError(400, 'silo_id e modo são obrigatórios');
    if (!['full', 'incremental', 'bootstrap'].includes(modo)) throw new AppError(422, 'Modo inválido. Use full, incremental ou bootstrap');
    const { data } = await axios.post(
      iaUrl('/api/v1/treino'),
      { silo_id, modo },
      { headers: iaHeaders(req), timeout: 15_000 },
    );
    res.status(202).json(data);
  } catch (err) {
    forwardIaError(err, next);
  }
}

export async function buscarPrevisoes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id } = req.params;
    const { data } = await axios.get(iaUrl(`/api/v1/previsoes/${silo_id}`), {
      headers: iaHeaders(req),
      timeout: 30_000,
    });
    res.json(data);
  } catch (err) {
    forwardIaError(err, next);
  }
}

export async function buscarRisco(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id } = req.params;
    const { data } = await axios.get(iaUrl(`/api/v1/risco/${silo_id}`), {
      headers: iaHeaders(req),
      timeout: 15_000,
    });
    res.json(data);
  } catch (err) {
    forwardIaError(err, next);
  }
}

export async function listarSilosIa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data } = await axios.get(iaUrl('/api/v1/silos'), {
      headers: iaHeaders(req),
      timeout: 15_000,
    });
    res.json(data);
  } catch (err) {
    forwardIaError(err, next);
  }
}
