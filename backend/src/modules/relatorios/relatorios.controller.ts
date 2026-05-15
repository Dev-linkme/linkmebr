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

    const [total, leituras] = await Promise.all([
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
      }),
    ]);

    res.json({
      data: leituras,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
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

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
