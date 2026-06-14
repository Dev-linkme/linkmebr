import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { env } from '../../config/env';
import { getIaTokenCached } from '../../config/iaClient';
import { AppError } from '../../utils/errors';

function iaUrl(path: string) {
  return `${env.IA_BASE_URL}${path}`;
}

async function iaHeaders() {
  const token = await getIaTokenCached();
  return { Authorization: `Bearer ${token}` };
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

export async function listarJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id, limit = '100', offset = '0' } = req.query;
    if (!silo_id) throw new AppError(400, 'silo_id é obrigatório');
    const { data } = await axios.get(iaUrl('/v1/ia/jobs'), {
      headers: await iaHeaders(),
      params: { silo_id, limit, offset },
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
    if (!['full', 'incremental'].includes(modo)) throw new AppError(422, 'Modo inválido. Use full ou incremental');
    const { data } = await axios.post(
      iaUrl('/v1/ia/treino'),
      { silo_id, modo },
      { headers: await iaHeaders(), timeout: 15_000 },
    );
    res.status(202).json(data);
  } catch (err) {
    forwardIaError(err, next);
  }
}

export async function buscarPrevisoes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id } = req.params;
    const { data } = await axios.get(iaUrl(`/v1/ia/previsoes/${silo_id}`), {
      headers: await iaHeaders(),
      timeout: 30_000,
    });
    res.json(data);
  } catch (err) {
    forwardIaError(err, next);
  }
}
