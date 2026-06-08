import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/errors';
import { prisma } from '../../config/prisma';
import archiver from 'archiver';

// ── Ingest proxy (exportação individualizada) ─────────────────────────────────

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

// ── Exportação Agrupada por Cabo ──────────────────────────────────────────────

type HeightLabel = 'fundo' | 'meio' | 'topo';
type GrandezaLabel = 'temp' | 'umid' | 'co2';

interface CelulaPivot {
  sum: bigint | null;
  max: number;
  min: number;
  n: number;
  sum2: bigint | null;
}

type PivotCells = { [h in HeightLabel]: { [g in GrandezaLabel]: CelulaPivot | null } };

interface PivotRow {
  timestamp: Date;
  cells: PivotCells;
}

const HEIGHTS: HeightLabel[] = ['fundo', 'meio', 'topo'];
const GRANDEZAS: GrandezaLabel[] = ['temp', 'umid', 'co2'];

const GRANDEZA_MAP: Record<string, GrandezaLabel> = {
  temperatura: 'temp',
  umidade: 'umid',
  co2: 'co2',
};

const CSV_HEADER = [
  'data_hora', 'silo_id', 'cabo_id',
  ...HEIGHTS.flatMap((h) =>
    GRANDEZAS.flatMap((g) => [
      `${h}_${g}_sum`, `${h}_${g}_max`, `${h}_${g}_min`, `${h}_${g}_n`, `${h}_${g}_sum2`,
    ]),
  ),
].join(';');

function emptyCells(): PivotCells {
  return {
    fundo: { temp: null, umid: null, co2: null },
    meio:  { temp: null, umid: null, co2: null },
    topo:  { temp: null, umid: null, co2: null },
  };
}

// UTC → America/Sao_Paulo (-03:00, sem horário de verão desde 2019)
function toSaoPauloISO(utcDate: Date): string {
  const local = new Date(utcDate.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().replace(/\.\d{3}Z$/, '-03:00');
}

// ddMMyyyyHHmmss em horário de Sao Paulo para uso em nomes de arquivo
function fileTimestamp(utcDate: Date): string {
  const sp = new Date(utcDate.getTime() - 3 * 60 * 60 * 1000);
  const dd   = String(sp.getUTCDate()).padStart(2, '0');
  const MM   = String(sp.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = sp.getUTCFullYear();
  const HH   = String(sp.getUTCHours()).padStart(2, '0');
  const mm   = String(sp.getUTCMinutes()).padStart(2, '0');
  const ss   = String(sp.getUTCSeconds()).padStart(2, '0');
  return `${dd}${MM}${yyyy}${HH}${mm}${ss}`;
}

function bigintCol(v: bigint | null): string {
  return v === null ? '' : v.toString();
}

function rowToCsvLine(row: PivotRow, siloNum: number, caboNum: number): string {
  const cols: string[] = [toSaoPauloISO(row.timestamp), String(siloNum), String(caboNum)];
  for (const h of HEIGHTS) {
    for (const g of GRANDEZAS) {
      const c = row.cells[h][g];
      if (c === null) {
        cols.push('', '', '', '', '');
      } else {
        cols.push(
          bigintCol(c.sum),
          c.max.toFixed(4),
          c.min.toFixed(4),
          String(c.n),
          bigintCol(c.sum2),
        );
      }
    }
  }
  return cols.join(';');
}

function cellToJson(c: CelulaPivot | null) {
  if (c === null) return { sum: null, max: null, min: null, n: null, sum2: null };
  return {
    sum:  c.sum  !== null ? Number(c.sum)  : null,
    max:  c.max,
    min:  c.min,
    n:    c.n,
    sum2: c.sum2 !== null ? Number(c.sum2) : null,
  };
}

function rowsToJson(rows: PivotRow[], siloNum: number, caboNum: number): string {
  return JSON.stringify(
    rows.map((row) => ({
      data_hora: toSaoPauloISO(row.timestamp),
      silo_id:   siloNum,
      cabo_id:   caboNum,
      fundo: {
        temp: cellToJson(row.cells.fundo.temp),
        umid: cellToJson(row.cells.fundo.umid),
        co2:  cellToJson(row.cells.fundo.co2),
      },
      meio: {
        temp: cellToJson(row.cells.meio.temp),
        umid: cellToJson(row.cells.meio.umid),
        co2:  cellToJson(row.cells.meio.co2),
      },
      topo: {
        temp: cellToJson(row.cells.topo.temp),
        umid: cellToJson(row.cells.topo.umid),
        co2:  cellToJson(row.cells.topo.co2),
      },
    })),
    null,
    2,
  );
}

export async function exportarAgrupada(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.query.silo_id);
    if (isNaN(siloId) || siloId <= 0) throw new AppError(400, 'silo_id inválido');

    const formato = (req.query.formato as string) === 'json' ? 'json' : 'csv';

    const start = req.query.start ? new Date(req.query.start as string) : undefined;
    const end   = req.query.end   ? new Date(req.query.end   as string) : undefined;
    if (start && isNaN(start.getTime())) throw new AppError(400, 'Parâmetro start inválido');
    if (end   && isNaN(end.getTime()))   throw new AppError(400, 'Parâmetro end inválido');

    // 1. Silo
    const silo = await prisma.silo.findUnique({ where: { id: siloId } });
    if (!silo) throw new AppError(404, 'Silo não encontrado');
    const siloNum = silo.id;

    // 2. Todos os sensores do silo com suas barras (ordenados por barra + grandeza + altura ASC)
    const sensores = await prisma.sensor.findMany({
      where: { barra: { silo_id: siloId } },
      include: { barra: true },
      orderBy: [
        { barra_id: 'asc' },
        { tipo_grandeza: 'asc' },
        { altura_solo_m: 'asc' },
      ],
    });
    if (sensores.length === 0) throw new AppError(404, 'Nenhum sensor cadastrado para este silo');

    // 3. Classificar sensores: por barra × grandeza → rank de altura → fundo/meio/topo
    type SensorMeta = { barraId: number; caboNum: number; height: HeightLabel; grandeza: GrandezaLabel };
    const metaMap = new Map<number, SensorMeta>();
    const barraNumMap = new Map<number, number>(); // barra_id → cabo_num

    const byBarraGrandeza = new Map<string, typeof sensores>();
    for (const s of sensores) {
      const g = GRANDEZA_MAP[s.tipo_grandeza];
      if (!g) continue;
      const key = `${s.barra_id}:${g}`;
      if (!byBarraGrandeza.has(key)) byBarraGrandeza.set(key, []);
      byBarraGrandeza.get(key)!.push(s);
    }

    for (const [, grupo] of byBarraGrandeza) {
      // grupo já está ordenado por altura_solo_m ASC
      grupo.slice(0, 3).forEach((s, idx) => {
        const g = GRANDEZA_MAP[s.tipo_grandeza]!;
        const caboNum = s.barra.id;
        metaMap.set(s.id, { barraId: s.barra_id, caboNum, height: HEIGHTS[idx], grandeza: g });
        if (!barraNumMap.has(s.barra_id)) barraNumMap.set(s.barra_id, caboNum);
      });
    }

    const sensorIds = [...metaMap.keys()];

    // 4. Leituras internas no período
    const leituras = await prisma.leituraInterna.findMany({
      where: {
        sensor_id: { in: sensorIds },
        ...(start || end
          ? { timestamp: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
          : {}),
      },
      orderBy: { timestamp: 'asc' },
    });

    if (leituras.length === 0) {
      throw new AppError(404, 'Nenhum dado encontrado para o período selecionado');
    }

    // 5. Pivotar em memória: barra_id → Map<timestamp_iso, PivotRow>
    const barraData = new Map<number, Map<string, PivotRow>>();

    for (const l of leituras) {
      const meta = metaMap.get(l.sensor_id);
      if (!meta) continue;

      if (!barraData.has(meta.barraId)) barraData.set(meta.barraId, new Map());
      const rowMap = barraData.get(meta.barraId)!;

      const tsKey = l.timestamp.toISOString();
      if (!rowMap.has(tsKey)) {
        rowMap.set(tsKey, { timestamp: l.timestamp, cells: emptyCells() });
      }

      rowMap.get(tsKey)!.cells[meta.height][meta.grandeza] = {
        sum:  l.sum  ?? null,
        max:  l.valor_max.toNumber(),
        min:  l.valor_min.toNumber(),
        n:    l.num_amostras,
        sum2: l.sum2 ?? null,
      };
    }

    // 6. Gerar ZIP com um arquivo por barra
    const ts = fileTimestamp(new Date());
    const zipName = `silo_${siloNum}_agrupada_${ts}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      if (!res.headersSent) next(new AppError(500, err.message));
    });
    archive.pipe(res);

    for (const [barraId, rowMap] of barraData) {
      if (rowMap.size === 0) continue;
      const caboNum = barraNumMap.get(barraId)!;
      const fileName = `silo_${siloNum}_cabo_${caboNum}_${ts}.${formato}`;

      // rowMap preserva ordem de inserção (leituras já vieram ordenadas por timestamp ASC)
      const rows = [...rowMap.values()];

      const content = formato === 'csv'
        ? [CSV_HEADER, ...rows.map((r) => rowToCsvLine(r, siloNum, caboNum))].join('\n')
        : rowsToJson(rows, siloNum, caboNum);

      archive.append(Buffer.from(content, 'utf-8'), { name: fileName });
    }

    archive.finalize();
  } catch (err) {
    next(err);
  }
}
