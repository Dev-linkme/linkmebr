import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import { env } from '../../config/env';
import { getIngestTokenCached } from '../../config/iaClient';
import { AppError } from '../../utils/errors';

function ingestUrl(path: string) {
  return `${env.INGEST_BASE_URL}${path}`;
}

async function ingestHeaders() {
  const token = await getIngestTokenCached();
  return { Authorization: `Bearer ${token}` };
}

function forwardIngestError(err: unknown, next: NextFunction): void {
  if (axios.isAxiosError(err) && err.response) {
    const detail = (err.response.data as { detail?: string } | null)?.detail ?? 'Erro no canal de comando remoto';
    next(new AppError(err.response.status, detail));
    return;
  }
  if (err instanceof Error && err.message.includes('não configurado')) {
    next(new AppError(503, err.message));
    return;
  }
  next(err);
}

// ── Catálogo fixo de comandos (espelha ESPECIFICACAO_ACESSO_COMANDOS.md seção 6) ──
// Validação rápida no servidor antes de publicar — defesa em profundidade, mesmo
// com a UI restringindo a botões fixos. A validação definitiva continua sendo do Labrador.

const NODE_IDS_VALIDOS = [101, 102, 103, 104, 201];

function validarComando(comandoId: number, parametro: number | null, parametroExtra: string | null): void {
  if (!Number.isInteger(comandoId) || comandoId < 1 || comandoId > 7) {
    throw new AppError(422, 'comando_id deve ser um inteiro entre 1 e 7');
  }
  if (comandoId === 1 || comandoId === 2) return; // sistema / banco — sem parâmetro

  // 3 (STATUS), 4 (REBOOT), 5 (relé ON), 6 (relé OFF), 7 (OTA) exigem node_id
  if (parametro === null || !NODE_IDS_VALIDOS.includes(parametro)) {
    throw new AppError(422, `parametro (node_id) deve ser um dos valores válidos: ${NODE_IDS_VALIDOS.join(', ')}`);
  }
  if ((comandoId === 5 || comandoId === 6) && parametro !== 201) {
    throw new AppError(422, 'Comando de relé é exclusivo do node_id 201 (DTG05)');
  }
  if (comandoId === 7 && !parametroExtra) {
    throw new AppError(422, 'parametro_extra (file_name do firmware) é obrigatório para o comando OTA');
  }
}

export async function dispararComando(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id, comando_id, parametro, parametro_extra } = req.body as {
      silo_id?: number;
      comando_id?: number;
      parametro?: number | null;
      parametro_extra?: string | null;
    };

    if (!silo_id || !comando_id) throw new AppError(400, 'silo_id e comando_id são obrigatórios');
    validarComando(comando_id, parametro ?? null, parametro_extra ?? null);

    const { data } = await axios.post(
      ingestUrl('/v1/labrador/comandos'),
      { silo_id, comando_id, parametro: parametro ?? null, parametro_extra: parametro_extra ?? null },
      { headers: await ingestHeaders(), timeout: 15_000 },
    );
    res.status(202).json(data);
  } catch (err) {
    forwardIngestError(err, next);
  }
}

export async function consultarComando(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { request_id } = req.params;
    const { data } = await axios.get(ingestUrl(`/v1/labrador/comandos/${request_id}`), {
      headers: await ingestHeaders(),
      timeout: 10_000,
    });
    res.json(data);
  } catch (err) {
    forwardIngestError(err, next);
  }
}

export async function listarComandosDisponiveis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id } = req.params;
    const { data } = await axios.get(ingestUrl(`/v1/labrador/silos/${silo_id}/comandos`), {
      headers: await ingestHeaders(),
      timeout: 10_000,
    });
    res.json(data);
  } catch (err) {
    forwardIngestError(err, next);
  }
}

export async function deletarComando(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { request_id } = req.params;
    await axios.delete(ingestUrl(`/v1/labrador/comandos/${request_id}`), {
      headers: await ingestHeaders(),
      timeout: 10_000,
    });
    res.status(204).send();
  } catch (err) {
    forwardIngestError(err, next);
  }
}

export async function listarComandos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id, limit = '20' } = req.query;
    if (!silo_id) throw new AppError(400, 'silo_id é obrigatório');
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const { data } = await axios.get(ingestUrl('/v1/labrador/comandos'), {
      headers: await ingestHeaders(),
      params: { silo_id, limit: limitNum },
      timeout: 15_000,
    });
    res.json(data);
  } catch (err) {
    forwardIngestError(err, next);
  }
}

const CATEGORIAS_VALIDAS = ['DTG01-04', 'DTG05'];

export async function uploadFirmware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file;
    const { categoria, descricao } = req.body as { categoria?: string; descricao?: string };

    if (!file) throw new AppError(400, 'Arquivo de firmware (.bin) é obrigatório');
    if (!categoria || !CATEGORIAS_VALIDAS.includes(categoria)) {
      throw new AppError(422, `categoria deve ser uma de: ${CATEGORIAS_VALIDAS.join(', ')}`);
    }

    const form = new FormData();
    form.append('file', file.buffer, { filename: file.originalname });
    form.append('categoria', categoria);
    if (descricao) form.append('descricao', descricao);

    const { data } = await axios.post(ingestUrl('/v1/firmwares'), form, {
      headers: { ...(await ingestHeaders()), ...form.getHeaders() },
      timeout: 30_000,
    });
    res.status(201).json(data);
  } catch (err) {
    forwardIngestError(err, next);
  }
}

export async function listarFirmwares(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { categoria } = req.query;
    const { data } = await axios.get(ingestUrl('/v1/firmwares'), {
      headers: await ingestHeaders(),
      params: categoria ? { categoria } : {},
      timeout: 15_000,
    });
    res.json(data);
  } catch (err) {
    forwardIngestError(err, next);
  }
}
