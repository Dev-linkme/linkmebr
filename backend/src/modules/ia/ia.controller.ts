import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { prisma } from '../../config/prisma';
import { assertEmpresa } from '../../middlewares/tenantGuard';

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

// ─── Heartbeat — lista paginada ───────────────────────────────────────────────

export async function listarHeartbeats(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    const limit  = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const where: string[]  = ['silo_id = $1'];
    const params: unknown[] = [silo_id];
    if (data_inicio) { params.push(data_inicio); where.push(`timestamp >= $${params.length}`); }
    if (data_fim)    { params.push(data_fim);    where.push(`timestamp <= $${params.length}`); }
    const whereStr = where.join(' AND ');

    const countRes = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) FROM silos.ia_heartbeat WHERE ${whereStr}`, ...params,
    );
    const total = Number(countRes[0].count);

    params.push(limit, offset);
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: bigint; recebido_em: Date; timestamp: Date | null;
      versao_modelo: string | null; modelo_hash: string | null; modelo_info: unknown;
      ciclo_ok: boolean; n_emergencias: number | null;
      risco_max: number | null; cat_max: string | null;
    }>>(
      `SELECT id, recebido_em, timestamp, versao_modelo, modelo_hash, modelo_info,
              ciclo_ok, n_emergencias, risco_max, cat_max
       FROM silos.ia_heartbeat WHERE ${whereStr}
       ORDER BY recebido_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      ...params,
    );

    res.json({
      dados: rows.map((r) => ({
        id:            Number(r.id),
        recebido_em:   r.recebido_em instanceof Date ? r.recebido_em.toISOString() : String(r.recebido_em),
        timestamp:     r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp ?? null,
        versao_modelo: r.versao_modelo,
        modelo_hash:   r.modelo_hash,
        modelo_info:   r.modelo_info,
        ciclo_ok:      r.ciclo_ok,
        n_emergencias: r.n_emergencias != null ? Number(r.n_emergencias) : null,
        risco_max:     r.risco_max     != null ? Number(r.risco_max)     : null,
        cat_max:       r.cat_max,
      })),
      total,
      pagina: page,
      total_paginas: Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
}

export async function rangeHeartbeat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const agg = await prisma.$queryRawUnsafe<[{ min_ts: Date | null; max_ts: Date | null }]>(
      `SELECT MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts
       FROM silos.ia_heartbeat WHERE silo_id = $1`,
      silo_id,
    );
    res.json({ data_inicio: agg[0].min_ts, data_fim: agg[0].max_ts });
  } catch (err) { next(err); }
}

export async function graficoHeartbeat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim    = req.query.data_fim    ? new Date(req.query.data_fim    as string) : undefined;

    const where: string[]  = ['silo_id = $1'];
    const params: unknown[] = [silo_id];
    if (data_inicio) { params.push(data_inicio); where.push(`timestamp >= $${params.length}`); }
    if (data_fim)    { params.push(data_fim);    where.push(`timestamp <= $${params.length}`); }

    const rows = await prisma.$queryRawUnsafe<Array<{
      timestamp: Date | null; risco_max: number | null; ciclo_ok: boolean;
    }>>(
      `SELECT timestamp, risco_max, ciclo_ok
       FROM silos.ia_heartbeat WHERE ${where.join(' AND ')}
       ORDER BY timestamp ASC LIMIT 720`,
      ...params,
    );

    res.json({
      series: rows.map((r) => ({
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp ?? null,
        risco_max: r.risco_max != null ? Number(r.risco_max) : null,
        ciclo_ok:  r.ciclo_ok,
      })),
    });
  } catch (err) { next(err); }
}

// ─── Risco — série prevista (proxy linkme-ia) ────────────────────────────────

export async function riscoSerie(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { silo_id } = req.params;
    const { data } = await axios.get(iaUrl(`/api/v1/risco-serie/${silo_id}`), {
      headers: iaHeaders(req),
      timeout: 30_000,
    });
    res.json(data);
  } catch (err) {
    forwardIaError(err, next);
  }
}

// ─── Risco — série histórica medida (banco) ───────────────────────────────────

export async function riscoHistorico(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const silo_id = Number(req.params.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id inválido');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const horas = Math.min(168, Math.max(1, Number(req.query.horas) || 24));

    const rows = await prisma.$queryRawUnsafe<Array<{
      barra_id: bigint; node_id: number | null; altura: string;
      gerado_em: Date; risco_agora: number;
    }>>(
      `SELECT r.barra_id, b.id_labrador AS node_id, r.altura,
              c.gerado_em, r.risco_agora::float AS risco_agora
       FROM silos_ia.ia_ciclos_risco r
       JOIN silos_ia.ia_ciclos_previsao c ON c.id = r.ciclo_id
       JOIN silos.barras b ON b.id = r.barra_id
       WHERE r.silo_id = $1
         AND c.gerado_em >= NOW() - ($2 * interval '1 hour')
       ORDER BY r.barra_id, r.altura, c.gerado_em`,
      silo_id, horas,
    );

    type Ponto = { barra_id: number; node_id: number | null; altura: string; timestamps: string[]; riscos: number[] };
    const pontosMap = new Map<string, Ponto>();
    for (const row of rows) {
      const key = `${row.barra_id}_${row.altura}`;
      if (!pontosMap.has(key)) {
        pontosMap.set(key, {
          barra_id: Number(row.barra_id),
          node_id:  row.node_id != null ? Number(row.node_id) : null,
          altura:   row.altura,
          timestamps: [],
          riscos:     [],
        });
      }
      const p = pontosMap.get(key)!;
      p.timestamps.push(row.gerado_em instanceof Date ? row.gerado_em.toISOString() : String(row.gerado_em));
      p.riscos.push(Number(row.risco_agora));
    }

    res.json({ silo_id, pontos: [...pontosMap.values()] });
  } catch (err) { next(err); }
}

// ─── Previsões históricas (últimos N ciclos, janela passada) ─────────────────

export async function previsoeHistoricas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const silo_id = Number(req.params.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id inválido');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const data_inicio   = req.query.data_inicio   ? new Date(req.query.data_inicio   as string) : undefined;
    const data_fim      = req.query.data_fim      ? new Date(req.query.data_fim      as string) : undefined;
    const gerado_em_max = req.query.gerado_em_max ? new Date(req.query.gerado_em_max as string) : undefined;
    if (!data_inicio || !data_fim) throw new AppError(400, 'data_inicio e data_fim são obrigatórios');
    if (isNaN(data_inicio.getTime()) || isNaN(data_fim.getTime())) throw new AppError(400, 'datas inválidas');
    if (gerado_em_max && isNaN(gerado_em_max.getTime())) throw new AppError(400, 'gerado_em_max inválido');

    // DISTINCT ON: para cada (sensor, barra, timestamp_previsto), usa a previsão do ciclo mais recente
    // gerado_em_max limita a janela de ciclos considerados, permitindo recuperar a previsão de um ciclo
    // específico (ex: o ciclo que gerou a previsão 24h antes da janela atual).
    const rows = await prisma.$queryRawUnsafe<Array<{
      sensor_id: bigint; node_id: number | null; barra_id: bigint;
      tipo_grandeza: string; altura_solo_m: string;
      timestamp_previsto: Date; valor_previsto: string;
    }>>(
      `SELECT DISTINCT ON (p.sensor_id, p.barra_id, p.timestamp_previsto)
           p.sensor_id,
           b.id_labrador  AS node_id,
           p.barra_id,
           p.tipo_grandeza,
           p.altura_solo_m::float AS altura_solo_m,
           p.timestamp_previsto,
           p.valor_previsto::float AS valor_previsto
       FROM silos_ia.ia_previsoes p
       JOIN silos_ia.ia_ciclos_previsao c ON c.id = p.ciclo_id
       JOIN silos.barras b ON b.id = p.barra_id
       WHERE p.silo_id = $1
         AND p.timestamp_previsto BETWEEN $2 AND $3
         ${gerado_em_max ? 'AND c.gerado_em <= $4' : ''}
       ORDER BY p.sensor_id, p.barra_id, p.timestamp_previsto, c.gerado_em DESC`,
      ...(gerado_em_max ? [silo_id, data_inicio, data_fim, gerado_em_max] : [silo_id, data_inicio, data_fim]),
    );

    type SensorEntry = {
      sensor_id: number; node_id: number | null; barra_id: number;
      tipo_grandeza: string; altura_solo_m: number;
      timestamps: string[]; valores: number[];
    };
    const sensoresMap = new Map<string, SensorEntry>();

    for (const row of rows) {
      const key = `${row.sensor_id}_${row.barra_id}`;
      if (!sensoresMap.has(key)) {
        sensoresMap.set(key, {
          sensor_id:     Number(row.sensor_id),
          node_id:       row.node_id != null ? Number(row.node_id) : null,
          barra_id:      Number(row.barra_id),
          tipo_grandeza: row.tipo_grandeza,
          altura_solo_m: Number(row.altura_solo_m),
          timestamps:    [],
          valores:       [],
        });
      }
      const entry = sensoresMap.get(key)!;
      entry.timestamps.push(
        row.timestamp_previsto instanceof Date
          ? row.timestamp_previsto.toISOString()
          : String(row.timestamp_previsto),
      );
      entry.valores.push(Number(row.valor_previsto));
    }

    res.json({
      silo_id,
      data_inicio: data_inicio.toISOString(),
      data_fim:    data_fim.toISOString(),
      sensores: [...sensoresMap.values()],
    });
  } catch (err) { next(err); }
}

// ─── Heartbeat — último por silo ─────────────────────────────────────────────

export async function buscarHeartbeat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const silo_id = Number(req.params.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id inválido');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const rows = await prisma.$queryRawUnsafe<Array<{
      recebido_em:   Date;
      timestamp:     Date | null;
      versao_modelo: string | null;
      modelo_hash:   string | null;
      modelo_info:   unknown;
      ciclo_ok:      boolean;
      n_emergencias: number | null;
      risco_max:     number | null;
      cat_max:       string | null;
    }>>(
      `SELECT recebido_em, timestamp, versao_modelo, modelo_hash, modelo_info,
              ciclo_ok, n_emergencias, risco_max, cat_max
       FROM silos.ia_heartbeat
       WHERE silo_id = $1
       ORDER BY recebido_em DESC
       LIMIT 1`,
      silo_id,
    );

    if (rows.length === 0) throw new AppError(404, 'Nenhum heartbeat recebido');

    const row = rows[0];
    const silencio_h = (Date.now() - row.recebido_em.getTime()) / 3_600_000;

    res.json({
      silo_id,
      recebido_em:   row.recebido_em.toISOString(),
      timestamp:     row.timestamp?.toISOString() ?? null,
      versao_modelo: row.versao_modelo,
      modelo_hash:   row.modelo_hash,
      modelo_info:   row.modelo_info,
      ciclo_ok:      row.ciclo_ok,
      n_emergencias: row.n_emergencias,
      risco_max:     row.risco_max,
      cat_max:       row.cat_max,
      silencio_h:    Math.round(silencio_h * 100) / 100,
      status:        silencio_h <= 2 && row.ciclo_ok ? 'ok' : 'alerta',
    });
  } catch (err) {
    next(err);
  }
}
