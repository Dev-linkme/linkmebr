import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { assertEmpresa } from '../../middlewares/tenantGuard';

// ─── Leitura Interna ──────────────────────────────────────────────────────────

export async function buscarLeituras(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) {
      throw new AppError(400, 'silo_id é obrigatório');
    }

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const barra_id = req.query.barra_id ? Number(req.query.barra_id) : undefined;
    const sensor_id = req.query.sensor_id ? Number(req.query.sensor_id) : undefined;
    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim = req.query.data_fim ? new Date(req.query.data_fim as string) : undefined;

    if (data_inicio && isNaN(data_inicio.getTime())) throw new AppError(400, 'data_inicio inválida');
    if (data_fim && isNaN(data_fim.getTime())) throw new AppError(400, 'data_fim inválida');

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    const sensorIds = await getSensorIds(silo_id, barra_id, sensor_id);

    const whereTimestamp: Record<string, unknown> = {};
    if (data_inicio) whereTimestamp.gte = data_inicio;
    if (data_fim) whereTimestamp.lte = data_fim;

    const where = {
      sensor_id: { in: sensorIds },
      ...(Object.keys(whereTimestamp).length > 0 ? { timestamp: whereTimestamp } : {}),
    };

    const [totalRaw, leituras] = await Promise.all([
      prisma.leituraInterna.count({ where }),
      prisma.leituraInterna.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          sensor: {
            select: {
              id: true,
              identificacao: true,
              altura_solo_m: true,
              tipo_grandeza: true,
              unidade_medida: true,
              status: true,
              barra: { select: { id: true, identificacao: true } },
            },
          },
        },
      }),
    ]);

    const total = Number(totalRaw);
    res.json({
      dados: leituras.map(serializeLeituraInterna),
      total,
      pagina: page,
      total_paginas: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function exportarCSV(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const barra_id = req.query.barra_id ? Number(req.query.barra_id) : undefined;
    const sensor_id = req.query.sensor_id ? Number(req.query.sensor_id) : undefined;
    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim = req.query.data_fim ? new Date(req.query.data_fim as string) : undefined;

    const sensorIds = await getSensorIds(silo_id, barra_id, sensor_id);

    const whereTimestamp: Record<string, unknown> = {};
    if (data_inicio) whereTimestamp.gte = data_inicio;
    if (data_fim) whereTimestamp.lte = data_fim;

    const where = {
      sensor_id: { in: sensorIds },
      ...(Object.keys(whereTimestamp).length > 0 ? { timestamp: whereTimestamp } : {}),
    };

    const leituras = await prisma.leituraInterna.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      include: {
        sensor: {
          select: {
            id: true,
            identificacao: true,
            tipo_grandeza: true,
            unidade_medida: true,
            barra: { select: { id: true, identificacao: true } },
          },
        },
      },
    });

    const dataInicioStr = data_inicio ? data_inicio.toISOString().split('T')[0] : 'inicio';
    const dataFimStr = data_fim ? data_fim.toISOString().split('T')[0] : 'fim';
    const filename = `silo_${silo_id}_${dataInicioStr}_${dataFimStr}.csv`;

    const cabecalho = [
      'id_leitura', 'sensor_id', 'sensor_identificacao', 'barra_id', 'barra_identificacao',
      'tipo_grandeza', 'unidade_medida', 'timestamp',
      'valor_avg', 'valor_max', 'valor_min', 'num_amostras', 'desvio_padrao',
    ].join(',');

    const linhas = leituras.map((l) =>
      [
        l.id.toString(),
        l.sensor_id.toString(),
        escapeCsvField(l.sensor.identificacao),
        l.sensor.barra.id.toString(),
        escapeCsvField(l.sensor.barra.identificacao),
        escapeCsvField(l.sensor.tipo_grandeza),
        escapeCsvField(l.sensor.unidade_medida),
        l.timestamp.toISOString(),
        l.valor_avg.toString(),
        l.valor_max.toString(),
        l.valor_min.toString(),
        l.num_amostras.toString(),
        l.desvio_padrao !== null ? l.desvio_padrao.toString() : '',
      ].join(','),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send('﻿' + [cabecalho, ...linhas].join('\n'));
  } catch (err) {
    next(err);
  }
}

export async function buscarRange(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const barra_id = req.query.barra_id ? Number(req.query.barra_id) : undefined;
    const sensor_id = req.query.sensor_id ? Number(req.query.sensor_id) : undefined;
    const sensorIds = await getSensorIds(silo_id, barra_id, sensor_id);

    const agg = await prisma.leituraInterna.aggregate({
      where: { sensor_id: { in: sensorIds } },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });

    res.json({ data_inicio: agg._min.timestamp, data_fim: agg._max.timestamp });
  } catch (err) {
    next(err);
  }
}

export async function buscarGrafico(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const silo_id = Number(req.query.silo_id);
    if (!silo_id || isNaN(silo_id)) throw new AppError(400, 'silo_id é obrigatório');

    const silo = await prisma.silo.findUnique({ where: { id: silo_id } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    const barra_id = req.query.barra_id ? Number(req.query.barra_id) : undefined;
    const sensor_id = req.query.sensor_id ? Number(req.query.sensor_id) : undefined;
    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim = req.query.data_fim ? new Date(req.query.data_fim as string) : undefined;

    const sensorIds = await getSensorIds(silo_id, barra_id, sensor_id);
    if (sensorIds.length === 0) { res.json({ series: [], sensores: [] }); return; }

    const diffHoras = data_inicio && data_fim
      ? (data_fim.getTime() - data_inicio.getTime()) / 3_600_000
      : 24 * 7;
    const bucketSec = diffHoras <= 24 ? 600 : diffHoras <= 24 * 7 ? 3600 : 10800;

    const whereClause: string[] = [`l.sensor_id = ANY($1::int[])`];
    const params: unknown[] = [sensorIds];
    if (data_inicio) { params.push(data_inicio); whereClause.push(`l.timestamp >= $${params.length}`); }
    if (data_fim)    { params.push(data_fim);    whereClause.push(`l.timestamp <= $${params.length}`); }

    const rows = await prisma.$queryRawUnsafe<Array<{
      sensor_id: number;
      bucket: Date;
      avg: number;
      max: number;
      min: number;
    }>>(
      `SELECT l.sensor_id,
              to_timestamp(floor(extract(epoch from l.timestamp) / ${bucketSec}) * ${bucketSec}) AS bucket,
              AVG(l.valor_avg)::float AS avg,
              MAX(l.valor_max)::float AS max,
              MIN(l.valor_min)::float AS min
       FROM silos.leitura_interna l
       WHERE ${whereClause.join(' AND ')}
       GROUP BY l.sensor_id, bucket
       ORDER BY l.sensor_id, bucket`,
      ...params,
    );

    const sensores = await prisma.sensor.findMany({
      where: { id: { in: sensorIds } },
      select: { id: true, identificacao: true, tipo_grandeza: true, unidade_medida: true, altura_solo_m: true },
      orderBy: { id: 'asc' },
    });

    res.json({
      series: rows.map((r) => ({
        sensor_id: r.sensor_id,
        bucket: r.bucket instanceof Date ? r.bucket.toISOString() : r.bucket,
        avg: Number(r.avg),
        max: Number(r.max),
        min: Number(r.min),
      })),
      sensores: sensores.map((s) => ({ ...s, altura_solo_m: Number(s.altura_solo_m) })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Leitura Externa ─────────────────────────────────────────────────────────

export async function buscarLeiturasExternas(
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
    const sensor_id = req.query.sensor_id ? Number(req.query.sensor_id) : undefined;
    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim = req.query.data_fim ? new Date(req.query.data_fim as string) : undefined;

    if (data_inicio && isNaN(data_inicio.getTime())) throw new AppError(400, 'data_inicio inválida');
    if (data_fim && isNaN(data_fim.getTime())) throw new AppError(400, 'data_fim inválida');

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    const sensorIds = await getSensorIdsExternos(silo_id, barra_id, sensor_id);

    const whereTimestamp: Record<string, unknown> = {};
    if (data_inicio) whereTimestamp.gte = data_inicio;
    if (data_fim) whereTimestamp.lte = data_fim;

    const where = {
      sensor_id: { in: sensorIds },
      ...(Object.keys(whereTimestamp).length > 0 ? { timestamp: whereTimestamp } : {}),
    };

    const [totalRaw, leituras] = await Promise.all([
      prisma.leituraExterna.count({ where }),
      prisma.leituraExterna.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          sensor: {
            select: {
              id: true,
              identificacao: true,
              status: true,
              barra: { select: { id: true, identificacao: true, local: true } },
            },
          },
        },
      }),
    ]);

    const total = Number(totalRaw);
    res.json({
      dados: leituras.map((l) => ({
        id: l.id.toString(),
        sensor_id: l.sensor_id,
        timestamp: l.timestamp.toISOString(),
        temp_avg: l.temp_avg,
        umid_avg: l.umid_avg,
        n_amostras: l.n_amostras,
        rele: l.rele,
        sht_online: l.sht_online,
        fw: l.fw,
        sensor: l.sensor,
      })),
      total,
      pagina: page,
      total_paginas: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function exportarCSVExterno(
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
    const sensor_id = req.query.sensor_id ? Number(req.query.sensor_id) : undefined;
    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim = req.query.data_fim ? new Date(req.query.data_fim as string) : undefined;

    const sensorIds = await getSensorIdsExternos(silo_id, barra_id, sensor_id);

    const whereTimestamp: Record<string, unknown> = {};
    if (data_inicio) whereTimestamp.gte = data_inicio;
    if (data_fim) whereTimestamp.lte = data_fim;

    const where = {
      sensor_id: { in: sensorIds },
      ...(Object.keys(whereTimestamp).length > 0 ? { timestamp: whereTimestamp } : {}),
    };

    const leituras = await prisma.leituraExterna.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      include: {
        sensor: {
          select: {
            id: true,
            identificacao: true,
            barra: { select: { id: true, identificacao: true } },
          },
        },
      },
    });

    const dataInicioStr = data_inicio ? data_inicio.toISOString().split('T')[0] : 'inicio';
    const dataFimStr = data_fim ? data_fim.toISOString().split('T')[0] : 'fim';
    const filename = `silo_${silo_id}_externa_${dataInicioStr}_${dataFimStr}.csv`;

    const cabecalho = [
      'id_leitura', 'sensor_id', 'sensor_identificacao', 'barra_id', 'barra_identificacao',
      'timestamp', 'temp_avg', 'umid_avg', 'n_amostras', 'rele', 'sht_online', 'fw',
    ].join(',');

    const linhas = leituras.map((l) =>
      [
        l.id.toString(),
        l.sensor_id.toString(),
        escapeCsvField(l.sensor.identificacao),
        l.sensor.barra.id.toString(),
        escapeCsvField(l.sensor.barra.identificacao),
        l.timestamp.toISOString(),
        l.temp_avg !== null ? l.temp_avg.toString() : '',
        l.umid_avg !== null ? l.umid_avg.toString() : '',
        l.n_amostras.toString(),
        l.rele !== null ? (l.rele ? 'true' : 'false') : '',
        l.sht_online !== null ? (l.sht_online ? 'true' : 'false') : '',
        escapeCsvField(l.fw),
      ].join(','),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send('﻿' + [cabecalho, ...linhas].join('\n'));
  } catch (err) {
    next(err);
  }
}

export async function buscarRangeExterno(
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
    const sensor_id = req.query.sensor_id ? Number(req.query.sensor_id) : undefined;
    const sensorIds = await getSensorIdsExternos(silo_id, barra_id, sensor_id);

    const agg = await prisma.leituraExterna.aggregate({
      where: { sensor_id: { in: sensorIds } },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });

    res.json({ data_inicio: agg._min.timestamp, data_fim: agg._max.timestamp });
  } catch (err) {
    next(err);
  }
}

export async function buscarGraficoExterno(
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
    const sensor_id = req.query.sensor_id ? Number(req.query.sensor_id) : undefined;
    const data_inicio = req.query.data_inicio ? new Date(req.query.data_inicio as string) : undefined;
    const data_fim = req.query.data_fim ? new Date(req.query.data_fim as string) : undefined;

    const sensorIds = await getSensorIdsExternos(silo_id, barra_id, sensor_id);
    if (sensorIds.length === 0) { res.json({ series: [], sensores: [] }); return; }

    const diffHoras = data_inicio && data_fim
      ? (data_fim.getTime() - data_inicio.getTime()) / 3_600_000
      : 24 * 7;
    const bucketSec = diffHoras <= 24 ? 600 : diffHoras <= 24 * 7 ? 3600 : 10800;

    const whereClause: string[] = [`l.sensor_id = ANY($1::int[])`];
    const params: unknown[] = [sensorIds];
    if (data_inicio) { params.push(data_inicio); whereClause.push(`l.timestamp >= $${params.length}`); }
    if (data_fim)    { params.push(data_fim);    whereClause.push(`l.timestamp <= $${params.length}`); }

    const rows = await prisma.$queryRawUnsafe<Array<{
      sensor_id: number;
      bucket: Date;
      avg_temp: number | null;
      avg_umid: number | null;
    }>>(
      `SELECT l.sensor_id,
              to_timestamp(floor(extract(epoch from l.timestamp) / ${bucketSec}) * ${bucketSec}) AS bucket,
              AVG(l.temp_avg)::float AS avg_temp,
              AVG(l.umid_avg)::float AS avg_umid
       FROM silos.leitura_externa l
       WHERE ${whereClause.join(' AND ')}
       GROUP BY l.sensor_id, bucket
       ORDER BY l.sensor_id, bucket`,
      ...params,
    );

    const sensores = await prisma.sensor.findMany({
      where: { id: { in: sensorIds } },
      select: { id: true, identificacao: true, altura_solo_m: true },
      orderBy: { id: 'asc' },
    });

    res.json({
      series: rows.map((r) => ({
        sensor_id: r.sensor_id,
        bucket: r.bucket instanceof Date ? r.bucket.toISOString() : r.bucket,
        avg_temp: r.avg_temp !== null ? Number(r.avg_temp) : null,
        avg_umid: r.avg_umid !== null ? Number(r.avg_umid) : null,
      })),
      sensores: sensores.map((s) => ({ ...s, altura_solo_m: Number(s.altura_solo_m) })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSensorIds(
  siloId: number,
  barraId?: number,
  sensorId?: number,
): Promise<number[]> {
  if (sensorId) return [sensorId];

  const where: Record<string, unknown> = { barra: { silo_id: siloId } };
  if (barraId) where.barra_id = barraId;

  const sensores = await prisma.sensor.findMany({ where, select: { id: true } });
  return sensores.map((s) => s.id);
}

async function getSensorIdsExternos(
  siloId: number,
  barraId?: number,
  sensorId?: number,
): Promise<number[]> {
  if (sensorId) return [sensorId];

  const where: Record<string, unknown> = {
    barra: { silo_id: siloId, local: 'externo ao silo' },
  };
  if (barraId) where.barra_id = barraId;

  const sensores = await prisma.sensor.findMany({ where, select: { id: true } });
  return sensores.map((s) => s.id);
}

function serializeLeituraInterna(l: {
  id: bigint;
  sensor_id: number;
  timestamp: Date;
  valor_avg: { toNumber(): number };
  valor_max: { toNumber(): number };
  valor_min: { toNumber(): number };
  num_amostras: number;
  desvio_padrao: { toNumber(): number } | null;
  sensor: {
    id: number;
    identificacao: string;
    altura_solo_m: { toNumber(): number };
    tipo_grandeza: string;
    unidade_medida: string;
    status: string;
    barra: { id: number; identificacao: string };
  };
}) {
  return {
    id: l.id.toString(),
    sensor_id: l.sensor_id,
    timestamp: l.timestamp.toISOString(),
    valor_avg: l.valor_avg.toNumber(),
    valor_max: l.valor_max.toNumber(),
    valor_min: l.valor_min.toNumber(),
    num_amostras: l.num_amostras,
    desvio_padrao: l.desvio_padrao ? l.desvio_padrao.toNumber() : null,
    sensor: {
      ...l.sensor,
      altura_solo_m: l.sensor.altura_solo_m.toNumber(),
    },
  };
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
