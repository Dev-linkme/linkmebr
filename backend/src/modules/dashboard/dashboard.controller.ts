import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../utils/errors';
import { assertEmpresa } from '../../middlewares/tenantGuard';

const CLIMA_CACHE_TTL = 30 * 60; // 30 minutos

export async function listarSilos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const where: Record<string, unknown> = { status: 'ativo' };

    if (req.user?.perfil !== 'administrador_geral') {
      where.empresa_id = req.user?.empresa_id;
    } else if (req.query.empresa_id) {
      where.empresa_id = Number(req.query.empresa_id);
    }

    const silos = await prisma.silo.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: {
        empresa: { select: { id: true, razao_social: true, nome_fantasia: true } },
        alertas: {
          orderBy: { criado_em: 'desc' },
          take: 5,
        },
        barras: {
          where: { status: 'ativa' },
          include: {
            sensores: {
              where: { status: 'ativo' },
              include: {
                leituras: {
                  orderBy: { timestamp: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    // Resumo por silo
    const resultado = silos.map((silo) => {
      const totalSensores = silo.barras.reduce((acc, b) => acc + b.sensores.length, 0);
      const ultimasLeituras = silo.barras.flatMap((b) =>
        b.sensores.flatMap((s) =>
          s.leituras.map((l) => ({
            sensor_id: s.id,
            sensor_identificacao: s.identificacao,
            tipo_grandeza: s.tipo_grandeza,
            unidade_medida: s.unidade_medida,
            valor_avg: l.valor_avg,
            timestamp: l.timestamp,
          })),
        ),
      );

      return {
        id: silo.id,
        nome: silo.nome,
        cidade: silo.cidade,
        estado: silo.estado,
        status: silo.status,
        empresa: silo.empresa,
        total_barras_ativas: silo.barras.length,
        total_sensores_ativos: totalSensores,
        alertas_ativos: silo.alertas.length,
        ultimas_leituras: ultimasLeituras,
      };
    });

    res.json({ data: resultado });
  } catch (err) {
    next(err);
  }
}

export async function detalharSilo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const silo = await prisma.silo.findUnique({
      where: { id },
      include: {
        empresa: { select: { id: true, razao_social: true, nome_fantasia: true } },
        alertas: { orderBy: { criado_em: 'desc' } },
        barras: {
          orderBy: { identificacao: 'asc' },
          include: {
            sensores: {
              orderBy: { altura_solo_m: 'asc' },
              include: {
                leituras: {
                  orderBy: { timestamp: 'desc' },
                  take: 10,
                },
              },
            },
          },
        },
      },
    });

    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    res.json(silo);
  } catch (err) {
    next(err);
  }
}

export async function climaSilo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const silo = await prisma.silo.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        latitude: true,
        longitude: true,
        empresa_id: true,
      },
    });

    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    if (!silo.latitude || !silo.longitude) {
      throw new AppError(
        422,
        'Este silo não possui coordenadas geográficas cadastradas',
      );
    }

    // Verifica cache Redis
    const cacheKey = `clima:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json({ source: 'cache', data: JSON.parse(cached) });
      return;
    }

    // Busca dados da Open-Meteo (sem chave de API, gratuita)
    const lat = silo.latitude.toString();
    const lon = silo.longitude.toString();
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lon);
    url.searchParams.set('current', [
      'temperature_2m',
      'relative_humidity_2m',
      'wind_speed_10m',
      'weather_code',
      'apparent_temperature',
    ].join(','));
    url.searchParams.set('timezone', 'America/Sao_Paulo');
    url.searchParams.set('forecast_days', '1');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new AppError(502, 'Erro ao consultar dados climáticos');
    }

    const climaData = await response.json() as Record<string, unknown>;

    // Armazena no Redis com TTL de 30 minutos
    await redis.setex(cacheKey, CLIMA_CACHE_TTL, JSON.stringify(climaData));

    res.json({ source: 'api', data: climaData });
  } catch (err) {
    next(err);
  }
}
