import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { assertEmpresa } from '../../middlewares/tenantGuard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getBarraIds(siloId: number, barraId?: number): Promise<number[]> {
  if (barraId) return [barraId];
  const barras = await prisma.barra.findMany({
    where: { silo_id: siloId, status: 'ativa' },
    select: { id: true },
  });
  return barras.map((b) => b.id);
}

function buildWhere(
  siloId: number,
  extra: Record<string, unknown> = {},
): { params: unknown[]; clauses: string[] } {
  const params: unknown[] = [siloId];
  const clauses: string[] = [];
  Object.entries(extra).forEach(([, v]) => {
    params.push(v);
    // caller fills clauses
  });
  return { params, clauses };
}
void buildWhere; // unused — kept for reference, queries built inline below

// ─── Labrador Status ──────────────────────────────────────────────────────────

export async function buscarLabradorStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim    = req.query.data_fim    ? new Date(req.query.data_fim    as string) : undefined;
    if (data_inicio && isNaN(data_inicio.getTime())) throw new AppError(400, 'data_inicio inválida');
    if (data_fim    && isNaN(data_fim.getTime()))    throw new AppError(400, 'data_fim inválida');

    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const where: string[] = ['silo_id = $1'];
    const params: unknown[] = [silo_id];
    if (data_inicio) { params.push(data_inicio); where.push(`timestamp >= $${params.length}`); }
    if (data_fim)    { params.push(data_fim);    where.push(`timestamp <= $${params.length}`); }
    const whereStr = where.join(' AND ');

    const countRes = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) FROM silos.labrador_status WHERE ${whereStr}`, ...params,
    );
    const total = Number(countRes[0].count);

    params.push(limit, offset);
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: bigint; received_at: Date; silo_id: number; timestamp: Date;
      cpu_percent: number | null; ram_percent: number | null; disk_percent: number | null;
    }>>(
      `SELECT id, received_at, silo_id, timestamp, cpu_percent, ram_percent, disk_percent
       FROM silos.labrador_status WHERE ${whereStr}
       ORDER BY timestamp DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      ...params,
    );

    res.json({
      dados: rows.map((d) => ({
        id:           d.id.toString(),
        received_at:  d.received_at instanceof Date ? d.received_at.toISOString() : String(d.received_at),
        silo_id:      Number(d.silo_id),
        timestamp:    d.timestamp instanceof Date ? d.timestamp.toISOString() : String(d.timestamp),
        cpu_percent:  d.cpu_percent  != null ? Number(d.cpu_percent)  : null,
        ram_percent:  d.ram_percent  != null ? Number(d.ram_percent)  : null,
        disk_percent: d.disk_percent != null ? Number(d.disk_percent) : null,
      })),
      total,
      pagina: page,
      total_paginas: Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
}

export async function buscarRangeLabrador(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const agg = await prisma.$queryRawUnsafe<[{ min_ts: Date | null; max_ts: Date | null }]>(
      `SELECT MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts
       FROM silos.labrador_status WHERE silo_id = $1`,
      silo_id,
    );
    res.json({ data_inicio: agg[0].min_ts, data_fim: agg[0].max_ts });
  } catch (err) { next(err); }
}

export async function buscarGraficoLabrador(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim    = req.query.data_fim    ? new Date(req.query.data_fim    as string) : undefined;

    const diffHoras = data_inicio && data_fim
      ? (data_fim.getTime() - data_inicio.getTime()) / 3_600_000 : 24 * 7;
    const bucketSec = diffHoras <= 24 ? 600 : diffHoras <= 24 * 7 ? 3600 : 10800;

    const where: string[] = ['silo_id = $1'];
    const params: unknown[] = [silo_id];
    if (data_inicio) { params.push(data_inicio); where.push(`timestamp >= $${params.length}`); }
    if (data_fim)    { params.push(data_fim);    where.push(`timestamp <= $${params.length}`); }

    const rows = await prisma.$queryRawUnsafe<Array<{
      bucket: Date; avg_cpu: number | null; avg_ram: number | null; avg_disk: number | null;
    }>>(
      `SELECT to_timestamp(floor(extract(epoch from timestamp) / ${bucketSec}) * ${bucketSec}) AS bucket,
              AVG(cpu_percent)::float  AS avg_cpu,
              AVG(ram_percent)::float  AS avg_ram,
              AVG(disk_percent)::float AS avg_disk
       FROM silos.labrador_status WHERE ${where.join(' AND ')}
       GROUP BY bucket ORDER BY bucket`,
      ...params,
    );

    res.json({
      series: rows.map((r) => ({
        bucket:   r.bucket instanceof Date ? r.bucket.toISOString() : r.bucket,
        avg_cpu:  r.avg_cpu  != null ? Number(r.avg_cpu)  : null,
        avg_ram:  r.avg_ram  != null ? Number(r.avg_ram)  : null,
        avg_disk: r.avg_disk != null ? Number(r.avg_disk) : null,
      })),
    });
  } catch (err) { next(err); }
}

// ─── Comunicação Status ───────────────────────────────────────────────────────

export async function buscarComunicacao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const barra_id    = req.query.barra_id ? Number(req.query.barra_id) : undefined;
    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim    = req.query.data_fim    ? new Date(req.query.data_fim    as string) : undefined;
    if (data_inicio && isNaN(data_inicio.getTime())) throw new AppError(400, 'data_inicio inválida');
    if (data_fim    && isNaN(data_fim.getTime()))    throw new AppError(400, 'data_fim inválida');

    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const barraIds = await getBarraIds(silo_id, barra_id);
    if (barraIds.length === 0) {
      res.json({ dados: [], total: 0, pagina: page, total_paginas: 0 }); return;
    }

    const where: string[] = [`barra_id = ANY($1::int[])`];
    const params: unknown[] = [barraIds];
    if (data_inicio) { params.push(data_inicio); where.push(`timestamp >= $${params.length}`); }
    if (data_fim)    { params.push(data_fim);    where.push(`timestamp <= $${params.length}`); }
    const whereStr = where.join(' AND ');

    const countRes = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) FROM silos.comunicacao_status WHERE ${whereStr}`, ...params,
    );
    const total = Number(countRes[0].count);

    params.push(limit, offset);
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: bigint; barra_id: number; timestamp: Date;
      ptime_esp32_s: number | null; rssi_dbm: number | null; snr_db: number | null;
    }>>(
      `SELECT c.id, c.barra_id, c.timestamp, c.ptime_esp32_s, c.rssi_dbm, c.snr_db
       FROM silos.comunicacao_status c
       WHERE ${whereStr}
       ORDER BY c.timestamp DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      ...params,
    );

    // Busca identificações das barras para enriquecer a resposta
    const barrasInfo = await prisma.barra.findMany({
      where: { id: { in: barraIds } },
      select: { id: true, identificacao: true },
    });
    const barraMap = new Map(barrasInfo.map((b) => [b.id, b.identificacao]));

    res.json({
      dados: rows.map((r) => ({
        id:            r.id.toString(),
        barra_id:      r.barra_id,
        barra_identificacao: barraMap.get(r.barra_id) ?? String(r.barra_id),
        timestamp:     r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
        ptime_esp32_s: r.ptime_esp32_s != null ? Number(r.ptime_esp32_s) : null,
        rssi_dbm:      r.rssi_dbm      != null ? Number(r.rssi_dbm)      : null,
        snr_db:        r.snr_db        != null ? Number(r.snr_db)        : null,
      })),
      total,
      pagina: page,
      total_paginas: Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
}

export async function buscarRangeComunicacao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const barra_id = req.query.barra_id ? Number(req.query.barra_id) : undefined;
    const barraIds = await getBarraIds(silo_id, barra_id);

    if (barraIds.length === 0) {
      res.json({ data_inicio: null, data_fim: null }); return;
    }

    const agg = await prisma.$queryRawUnsafe<[{ min_ts: Date | null; max_ts: Date | null }]>(
      `SELECT MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts
       FROM silos.comunicacao_status WHERE barra_id = ANY($1::int[])`,
      barraIds,
    );
    res.json({ data_inicio: agg[0].min_ts, data_fim: agg[0].max_ts });
  } catch (err) { next(err); }
}

export async function buscarGraficoComunicacao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const barra_id    = req.query.barra_id ? Number(req.query.barra_id) : undefined;
    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim    = req.query.data_fim    ? new Date(req.query.data_fim    as string) : undefined;

    const barraIds = await getBarraIds(silo_id, barra_id);
    if (barraIds.length === 0) { res.json({ series: [], barras: [] }); return; }

    const diffHoras = data_inicio && data_fim
      ? (data_fim.getTime() - data_inicio.getTime()) / 3_600_000 : 24 * 7;
    const bucketSec = diffHoras <= 24 ? 600 : diffHoras <= 24 * 7 ? 3600 : 10800;

    const where: string[] = [`barra_id = ANY($1::int[])`];
    const params: unknown[] = [barraIds];
    if (data_inicio) { params.push(data_inicio); where.push(`timestamp >= $${params.length}`); }
    if (data_fim)    { params.push(data_fim);    where.push(`timestamp <= $${params.length}`); }

    const rows = await prisma.$queryRawUnsafe<Array<{
      barra_id: number; bucket: Date;
      avg_rssi: number | null; avg_snr: number | null; avg_ptime: number | null;
    }>>(
      `SELECT barra_id,
              to_timestamp(floor(extract(epoch from timestamp) / ${bucketSec}) * ${bucketSec}) AS bucket,
              AVG(rssi_dbm)::float      AS avg_rssi,
              AVG(snr_db)::float        AS avg_snr,
              AVG(ptime_esp32_s)::float AS avg_ptime
       FROM silos.comunicacao_status
       WHERE ${where.join(' AND ')}
       GROUP BY barra_id, bucket
       ORDER BY barra_id, bucket`,
      ...params,
    );

    const barrasInfo = await prisma.barra.findMany({
      where: { id: { in: barraIds } },
      select: { id: true, identificacao: true },
    });

    res.json({
      series: rows.map((r) => ({
        barra_id:  r.barra_id,
        bucket:    r.bucket instanceof Date ? r.bucket.toISOString() : r.bucket,
        avg_rssi:  r.avg_rssi  != null ? Number(r.avg_rssi)  : null,
        avg_snr:   r.avg_snr   != null ? Number(r.avg_snr)   : null,
        avg_ptime: r.avg_ptime != null ? Number(r.avg_ptime) : null,
      })),
      barras: barrasInfo,
    });
  } catch (err) { next(err); }
}
