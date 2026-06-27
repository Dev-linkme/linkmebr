import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../utils/errors';
import { assertEmpresa } from '../../middlewares/tenantGuard';

const CLIMA_CACHE_TTL  = 30 * 60; // 30 minutos
const PAINEL_CACHE_TTL = 2  * 60; // 2 minutos
const SILOS_CACHE_TTL  = 60;      // 1 minuto

// ── Helper: clima com cache Redis ────────────────────────────────────────────

async function fetchClima(
  siloId: number,
  lat: string,
  lon: string,
): Promise<Record<string, unknown> | null> {
  try {
    const key = `clima:${siloId}`;
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lon);
    url.searchParams.set('current', [
      'temperature_2m', 'relative_humidity_2m', 'wind_speed_10m',
      'weather_code', 'apparent_temperature',
    ].join(','));
    url.searchParams.set('timezone', 'America/Sao_Paulo');
    url.searchParams.set('forecast_days', '1');

    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    await redis.setex(key, CLIMA_CACHE_TTL, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

// ── listarSilos ───────────────────────────────────────────────────────────────

export async function listarSilos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const where: Record<string, unknown> = { status: 'ativo' };

    if (req.user?.perfil !== 'administrador_geral') {
      where.empresa_id = req.user?.empresa_id;
    } else if (req.query.empresa_id) {
      where.empresa_id = Number(req.query.empresa_id);
    }

    const cacheKey = `silos_lista:${JSON.stringify(where)}`;
    const cached = await redis.get(cacheKey);
    if (cached) { res.json(JSON.parse(cached)); return; }

    const silos = await prisma.silo.findMany({
      where,
      orderBy: { nome: 'asc' },
      select: {
        id: true, nome: true, cidade: true, estado: true,
        latitude: true, longitude: true, status: true,
        empresa: { select: { id: true, razao_social: true, nome_fantasia: true } },
        alertas: { select: { id: true }, orderBy: { criado_em: 'desc' }, take: 5 },
        barras: {
          where: { status: 'ativa' },
          select: {
            id: true,
            sensores: { where: { status: 'ativo' }, select: { id: true } },
          },
        },
      },
    });

    const resultado = {
      data: silos.map((silo) => ({
        id: silo.id,
        nome: silo.nome,
        cidade: silo.cidade,
        estado: silo.estado,
        latitude: silo.latitude,
        longitude: silo.longitude,
        status: silo.status,
        empresa: silo.empresa,
        total_barras_ativas: silo.barras.length,
        total_sensores_ativos: silo.barras.reduce((n, b) => n + b.sensores.length, 0),
        alertas_ativos: silo.alertas.length,
      })),
    };

    await redis.setex(cacheKey, SILOS_CACHE_TTL, JSON.stringify(resultado));
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

// ── detalharSilo ──────────────────────────────────────────────────────────────

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
                leituras_internas: {
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

    const ultimoCarregamento = await prisma.carregamento.findFirst({
      where: { silo_id: id },
      orderBy: { hora_referencia: 'desc' },
      select: { hora_referencia: true, nivel_m: true, volume_sacos: true },
    });

    const resultado = { ...silo, ultimo_carregamento: ultimoCarregamento };

    res.json(JSON.parse(JSON.stringify(resultado, (_, v) => typeof v === 'bigint' ? v.toString() : v)));
  } catch (err) {
    next(err);
  }
}

// ── painelSilo ────────────────────────────────────────────────────────────────

export async function painelSilo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    // Serve do cache se disponível
    const painelKey = `painel:${id}`;
    const cachedPainel = await redis.get(painelKey);
    if (cachedPainel) { res.json(JSON.parse(cachedPainel)); return; }

    const janela = new Date(Date.now() - 10 * 60 * 1000); // últimos 10 min

    // Busca DB e clima em paralelo
    const siloPromise = prisma.silo.findUnique({
      where: { id },
      include: {
        barras: {
          where: { status: 'ativa' },
          orderBy: { identificacao: 'asc' },
          include: {
            sensores: {
              where: { status: 'ativo' },
              include: {
                leituras_internas: {
                  where: { timestamp: { gte: janela } },
                  orderBy: { timestamp: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    // Busca coordenadas primeiro para lançar clima em paralelo
    // (usamos Promise.all após descobrir as coords do silo)
    const silo = await siloPromise;

    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    // Clima e último carregamento em paralelo com o processamento dos dados do silo
    const climaPromise = silo.latitude && silo.longitude
      ? fetchClima(id, silo.latitude.toString(), silo.longitude.toString())
      : Promise.resolve(null);

    const ultimoCarregamentoPromise = prisma.carregamento.findFirst({
      where: { silo_id: id },
      orderBy: { hora_referencia: 'desc' },
      select: { hora_referencia: true, nivel_m: true, volume_sacos: true },
    });

    type SensorEntry = {
      local: string; altura_solo_m: number; tipo_grandeza: string;
      unidade_medida: string; valor_avg: number; valor_max: number; valor_min: number;
      timestamp: Date;
    };

    const sensoresFlat: SensorEntry[] = silo.barras.flatMap((b) =>
      b.sensores
        .filter((s) => s.leituras_internas.length > 0 && s.tipo_grandeza !== 'rele')
        .map((s): SensorEntry => ({
          local: b.local,
          altura_solo_m: Number(s.altura_solo_m),
          tipo_grandeza: s.tipo_grandeza,
          unidade_medida: s.unidade_medida,
          valor_avg: Number(s.leituras_internas[0].valor_avg),
          valor_max: Number(s.leituras_internas[0].valor_max),
          valor_min: Number(s.leituras_internas[0].valor_min),
          timestamp: s.leituras_internas[0].timestamp,
        })),
    );

    const referencia = sensoresFlat.length > 0
      ? sensoresFlat.reduce((max, s) => s.timestamp > max ? s.timestamp : max, sensoresFlat[0].timestamp)
      : null;

    const grandezas = ['temperatura', 'umidade', 'co2'] as const;

    function buildResumoAlturas(sensores: typeof sensoresFlat) {
      const alturas = [...new Set(sensores.map((s) => s.altura_solo_m))].sort((a, b) => a - b);
      return alturas.map((altura) => {
        const row: Record<string, unknown> = { altura_m: altura };
        for (const grandeza of grandezas) {
          const grupo = sensores.filter((s) => s.altura_solo_m === altura && s.tipo_grandeza === grandeza);
          if (grupo.length > 0) {
            const n = grupo.length;
            row[grandeza] = {
              avg_avg: +(grupo.reduce((sum, s) => sum + s.valor_avg, 0) / n).toFixed(4),
              avg_min: +(grupo.reduce((sum, s) => sum + s.valor_min, 0) / n).toFixed(4),
              avg_max: +(grupo.reduce((sum, s) => sum + s.valor_max, 0) / n).toFixed(4),
              unidade: grupo[0].unidade_medida,
            };
          }
        }
        return row;
      });
    }

    const locaisOrdenados = ['interno ao silo', 'externo ao silo'] as const;
    const resumo_por_local = locaisOrdenados
      .map((local) => {
        const sensoresDoLocal = sensoresFlat.filter((s) => s.local === local);
        if (sensoresDoLocal.length === 0) return null;
        return { local, resumo_alturas: buildResumoAlturas(sensoresDoLocal) };
      })
      .filter(Boolean);

    const releSensor = silo.barras
      .flatMap((b) => b.sensores)
      .find((s) => s.tipo_grandeza === 'rele' && s.leituras_internas.length > 0);

    const rele = releSensor
      ? {
          ligado: Number(releSensor.leituras_internas[0].valor_avg) === 1,
          timestamp: releSensor.leituras_internas[0].timestamp.toISOString(),
        }
      : null;

    // Aguarda clima e último carregamento (que estavam rodando em paralelo)
    const [climaData, ultimoCarregamento] = await Promise.all([climaPromise, ultimoCarregamentoPromise]);

    const semLeituras = sensoresFlat.length === 0;
    const statusSilo  = semLeituras ? 'Sem leituras há mais de 10 minutos' : silo.status;

    const payload = {
      silo: {
        id: silo.id, nome: silo.nome, cidade: silo.cidade, estado: silo.estado,
        latitude: silo.latitude, longitude: silo.longitude, status: statusSilo,
        total_barras_ativas: silo.barras.length,
        total_sensores_ativos: silo.barras.reduce((n, b) => n + b.sensores.length, 0),
        alertas_ativos: 0,
        ultimo_carregamento: ultimoCarregamento,
      },
      clima: (climaData as { current?: unknown } | null)?.current ?? null,
      referencia: referencia ? (referencia as Date).toISOString() : null,
      resumo_por_local,
      rele,
    };

    await redis.setex(painelKey, PAINEL_CACHE_TTL, JSON.stringify(payload));
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

// ── climaSilo ─────────────────────────────────────────────────────────────────

export async function climaSilo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const silo = await prisma.silo.findUnique({
      where: { id },
      select: { id: true, nome: true, latitude: true, longitude: true, empresa_id: true },
    });

    if (!silo) throw new AppError(404, 'Silo não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, silo.empresa_id);

    if (!silo.latitude || !silo.longitude) {
      throw new AppError(422, 'Este silo não possui coordenadas geográficas cadastradas');
    }

    const key = `clima:${id}`;
    const cached = await redis.get(key);
    if (cached) { res.json({ source: 'cache', data: JSON.parse(cached) }); return; }

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', silo.latitude.toString());
    url.searchParams.set('longitude', silo.longitude.toString());
    url.searchParams.set('current', [
      'temperature_2m', 'relative_humidity_2m', 'wind_speed_10m',
      'weather_code', 'apparent_temperature',
    ].join(','));
    url.searchParams.set('timezone', 'America/Sao_Paulo');
    url.searchParams.set('forecast_days', '1');

    const response = await fetch(url.toString());
    if (!response.ok) throw new AppError(502, 'Erro ao consultar dados climáticos');

    const climaData = await response.json() as Record<string, unknown>;
    await redis.setex(key, CLIMA_CACHE_TTL, JSON.stringify(climaData));

    res.json({ source: 'api', data: climaData });
  } catch (err) {
    next(err);
  }
}
