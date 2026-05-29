import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/errors';
import { prisma } from '../../config/prisma';

const INGEST_BASE_URL = process.env.INGEST_BASE_URL ?? '';
const INGEST_IA_CLIENT_ID = process.env.INGEST_IA_CLIENT_ID ?? 'server-ia';
const INGEST_IA_CLIENT_SECRET = process.env.INGEST_IA_CLIENT_SECRET ?? '';

type TokenCache = { token: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

async function getIngestToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const res = await fetch(`${INGEST_BASE_URL}/v1/ingest/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: INGEST_IA_CLIENT_ID,
      client_secret: INGEST_IA_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new AppError(502, 'Falha ao autenticar com o servidor de ingestão');
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.token;
}

async function proxyExport(
  tabela: 'leitura_interna' | 'leitura_externa',
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!INGEST_BASE_URL) {
      throw new AppError(503, 'Servidor de exportação não configurado (INGEST_BASE_URL ausente)');
    }

    const token = await getIngestToken();

    const url = new URL(`${INGEST_BASE_URL}/v1/export/${tabela}`);
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, String(v));
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const ingestRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!ingestRes.ok) {
      const err = await ingestRes.json().catch(() => ({})) as { detail?: string };
      throw new AppError(ingestRes.status, err.detail ?? 'Erro na exportação');
    }

    const contentType = ingestRes.headers.get('Content-Type') ?? 'application/octet-stream';
    const contentDisposition = ingestRes.headers.get('Content-Disposition');

    res.setHeader('Content-Type', contentType);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);

    if (!ingestRes.body) {
      res.end();
      return;
    }

    const reader = ingestRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    next(err);
  }
}

export function exportarLeituraInterna(req: Request, res: Response, next: NextFunction): Promise<void> {
  return proxyExport('leitura_interna', req, res, next);
}

export function exportarLeituraExterna(req: Request, res: Response, next: NextFunction): Promise<void> {
  return proxyExport('leitura_externa', req, res, next);
}

export async function periodoDisponivel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.query.silo_id);
    if (isNaN(siloId) || siloId <= 0) throw new AppError(400, 'silo_id inválido');

    const tipo = req.query.tipo as string;
    const filtroSensor = { sensor: { barra: { silo_id: siloId } } };

    let inicio: Date | null = null;
    let fim: Date | null = null;

    if (tipo === 'leitura_externa') {
      const agg = await prisma.leituraExterna.aggregate({
        where: filtroSensor,
        _min: { timestamp: true },
        _max: { timestamp: true },
      });
      inicio = agg._min.timestamp;
      fim = agg._max.timestamp;
    } else {
      const agg = await prisma.leituraInterna.aggregate({
        where: filtroSensor,
        _min: { timestamp: true },
        _max: { timestamp: true },
      });
      inicio = agg._min.timestamp;
      fim = agg._max.timestamp;
    }

    res.json({ inicio, fim });
  } catch (err) {
    next(err);
  }
}
