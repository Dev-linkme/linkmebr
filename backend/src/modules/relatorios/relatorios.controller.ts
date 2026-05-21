import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { assertEmpresa } from '../../middlewares/tenantGuard';

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

    if (data_inicio && isNaN(data_inicio.getTime())) {
      throw new AppError(400, 'data_inicio inválida');
    }
    if (data_fim && isNaN(data_fim.getTime())) {
      throw new AppError(400, 'data_fim inválida');
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    // Monta filtro de sensor_id's baseado na hierarquia silo > barra > sensor
    const sensorIds = await getSensorIds(silo_id, barra_id, sensor_id);

    const whereTimestamp: Record<string, unknown> = {};
    if (data_inicio) whereTimestamp.gte = data_inicio;
    if (data_fim) whereTimestamp.lte = data_fim;

    const where = {
      sensor_id: { in: sensorIds },
      ...(Object.keys(whereTimestamp).length > 0 ? { timestamp: whereTimestamp } : {}),
    };

    const [totalRaw, leituras] = await Promise.all([
      prisma.leitura.count({ where }),
      prisma.leitura.findMany({
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
              barra: {
                select: {
                  id: true,
                  identificacao: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const total = Number(totalRaw);
    res.json({
      dados: leituras.map(serializeLeitura),
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

    const sensorIds = await getSensorIds(silo_id, barra_id, sensor_id);

    const whereTimestamp: Record<string, unknown> = {};
    if (data_inicio) whereTimestamp.gte = data_inicio;
    if (data_fim) whereTimestamp.lte = data_fim;

    const where = {
      sensor_id: { in: sensorIds },
      ...(Object.keys(whereTimestamp).length > 0 ? { timestamp: whereTimestamp } : {}),
    };

    const leituras = await prisma.leitura.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      include: {
        sensor: {
          select: {
            id: true,
            identificacao: true,
            tipo_grandeza: true,
            unidade_medida: true,
            barra: {
              select: {
                id: true,
                identificacao: true,
              },
            },
          },
        },
      },
    });

    // Gera nome do arquivo
    const dataInicioStr = data_inicio
      ? data_inicio.toISOString().split('T')[0]
      : 'inicio';
    const dataFimStr = data_fim
      ? data_fim.toISOString().split('T')[0]
      : 'fim';
    const filename = `silo_${silo_id}_${dataInicioStr}_${dataFimStr}.csv`;

    // Constrói CSV manualmente
    const cabecalho = [
      'id_leitura',
      'sensor_id',
      'sensor_identificacao',
      'barra_id',
      'barra_identificacao',
      'tipo_grandeza',
      'unidade_medida',
      'timestamp',
      'valor_avg',
      'valor_max',
      'valor_min',
      'num_amostras',
      'desvio_padrao',
    ].join(',');

    const linhas = leituras.map((l) => {
      const campos = [
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
      ];
      return campos.join(',');
    });

    const csv = [cabecalho, ...linhas].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send('﻿' + csv); // BOM para compatibilidade com Excel
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

    const agg = await prisma.leitura.aggregate({
      where: { sensor_id: { in: sensorIds } },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });

    res.json({
      data_inicio: agg._min.timestamp,
      data_fim: agg._max.timestamp,
    });
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

    // Escolhe o bucket de tempo conforme o intervalo selecionado
    const diffHoras = data_inicio && data_fim
      ? (data_fim.getTime() - data_inicio.getTime()) / 3_600_000
      : 24 * 7;
    const bucket = diffHoras <= 24 ? '10 minutes' : diffHoras <= 24 * 7 ? '1 hour' : '3 hours';

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
              date_trunc('${bucket}', l.timestamp) AS bucket,
              AVG(l.valor_avg)::float AS avg,
              MAX(l.valor_max)::float AS max,
              MIN(l.valor_min)::float AS min
       FROM silos.leituras l
       WHERE ${whereClause.join(' AND ')}
       GROUP BY l.sensor_id, bucket
       ORDER BY l.sensor_id, bucket`,
      ...params,
    );

    // Busca metadados dos sensores
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

// Retorna IDs de sensores com base em silo/barra/sensor
async function getSensorIds(
  siloId: number,
  barraId?: number,
  sensorId?: number,
): Promise<number[]> {
  if (sensorId) return [sensorId];

  const where: Record<string, unknown> = {
    barra: { silo_id: siloId },
  };
  if (barraId) where.barra_id = barraId;

  const sensores = await prisma.sensor.findMany({
    where,
    select: { id: true },
  });

  return sensores.map((s) => s.id);
}

function serializeLeitura(l: {
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
