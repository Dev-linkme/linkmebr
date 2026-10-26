import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getPrevisoeHistoricas, getSilosIa } from '../services/ia';
import type { Silo, IaPrevisaoSensorHistorico } from '../types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

type GrandezaTipo     = 'temperatura' | 'umidade' | 'co2';
type AgrupamentoGrafico = 'barra' | 'sensor' | 'altura';
type ModoDesvio       = 'absoluto' | 'percentual';

interface GraficoSerie   { sensor_id: number; bucket: string; avg: number; }
interface GraficoSensor  {
  id: number; identificacao: string; tipo_grandeza: GrandezaTipo;
  unidade_medida: string; altura_solo_m: number;
  barra_id: number; barra_identificacao: string;
}
interface GraficoResponse { series: GraficoSerie[]; sensores: GraficoSensor[]; }

type DesvioPoint = { label: string; ts: number; max: number | null; min: number | null };

// ─── Constants ────────────────────────────────────────────────────────────────

const BRT = 'America/Sao_Paulo';
const LIMIAR_PREVISTO = 0.1;
const GRANDEZA_TABS: { key: GrandezaTipo; label: string }[] = [
  { key: 'temperatura', label: 'Temperatura' },
  { key: 'umidade',     label: 'Umidade'     },
  { key: 'co2',         label: 'CO₂'         },
];
const AGRUPAMENTO_LABELS: Record<AgrupamentoGrafico, string> = {
  barra: 'Cabo Pêndulo', sensor: 'Sensor', altura: 'Altura',
};
const ALTURA_BY_CM: Record<number, 'topo' | 'meio' | 'fundo'> = { 15: 'topo', 13: 'meio', 11: 'fundo' };
const ALTURAS: { key: 'topo' | 'meio' | 'fundo'; label: string; m: number }[] = [
  { key: 'topo',  label: 'Topo',  m: 1.5 },
  { key: 'meio',  label: 'Meio',  m: 1.3 },
  { key: 'fundo', label: 'Fundo', m: 1.1 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}

function fmtDate(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}

function floorToHour(ts: string): string {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

// Map: `${sensor_id}_${hourIso}` → avg (hourly aggregate)
function buildRealMap(series: GraficoSerie[]): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const s of series) {
    const key = `${s.sensor_id}_${floorToHour(s.bucket)}`;
    if (!acc.has(key)) acc.set(key, { sum: 0, n: 0 });
    const e = acc.get(key)!;
    e.sum += s.avg;
    e.n   += 1;
  }
  const out = new Map<string, number>();
  acc.forEach(({ sum, n }, key) => out.set(key, sum / n));
  return out;
}

// Compute per-timestamp max/min deviation for a set of sensors
function buildDesvioData(
  sensorIds: number[],
  historicoSensores: IaPrevisaoSensorHistorico[],
  realMap: Map<string, number>,
  modo: ModoDesvio,
): DesvioPoint[] {
  const tsMap = new Map<number, { maxD: number; minD: number }>();

  for (const sId of sensorIds) {
    const hist = historicoSensores.find((s) => s.sensor_id === sId);
    if (!hist) continue;
    hist.timestamps.forEach((ts, i) => {
      const previsto = hist.valores[i];
      if (previsto == null) return;
      const hourIso  = floorToHour(ts);
      const realizado = realMap.get(`${sId}_${hourIso}`);
      if (realizado == null) return;
      let desvio = previsto - realizado;
      if (modo === 'percentual') {
        if (Math.abs(previsto) < LIMIAR_PREVISTO) return;
        desvio = (desvio / previsto) * 100;
      }
      const ms = new Date(hourIso).getTime();
      if (!tsMap.has(ms)) tsMap.set(ms, { maxD: -Infinity, minD: Infinity });
      const e = tsMap.get(ms)!;
      if (desvio > e.maxD) e.maxD = desvio;
      if (desvio < e.minD) e.minD = desvio;
    });
  }

  return [...tsMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ms, { maxD, minD }]) => ({
      ts:    ms,
      label: fmtTs(ms),
      max:   isFinite(maxD) ? maxD : null,
      min:   isFinite(minD) ? minD : null,
    }));
}

// Shared Y domain — always includes 0, pads 12%
function globalYDomainFrom(allData: DesvioPoint[]): [number, number] {
  let yMin = 0, yMax = 0;
  for (const { max, min } of allData) {
    if (max != null) yMax = Math.max(yMax, max);
    if (min != null) yMin = Math.min(yMin, min);
  }
  if (yMin === 0 && yMax === 0) return [-1, 1];
  const range = yMax - yMin;
  const pad   = Math.max(range * 0.12, Math.abs(range) * 0.05, 0.05);
  return [
    Math.floor((yMin - pad) * 100) / 100,
    Math.ceil ((yMax + pad) * 100) / 100,
  ];
}

// ─── DesvioChart ──────────────────────────────────────────────────────────────

function DesvioChart({ titulo, data, yDomain, unidade, grandeza }: {
  titulo:   string;
  data:     DesvioPoint[];
  yDomain:  [number, number];
  unidade:  string;
  grandeza: GrandezaTipo;
}) {
  if (data.length === 0) return (
    <div className="bg-white rounded-lg shadow p-4 flex items-center justify-center min-h-[160px]">
      <span className="text-xs text-gray-400">{titulo} — sem dados</span>
    </div>
  );

  const fmtVal = (v: number) =>
    grandeza === 'temperatura' ? v.toFixed(2) : grandeza === 'umidade' ? v.toFixed(1) : v.toFixed(0);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h4 className="text-xs font-semibold text-gray-600 mb-2">{titulo}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barGap={1} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9 }}
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={36}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 10 }}
            width={48}
            tickFormatter={fmtVal}
            label={{ value: unidade, angle: -90, position: 'insideLeft', offset: 14, style: { fontSize: 10 } }}
          />
          <Tooltip
            formatter={(val, name) => [
              `${typeof val === 'number' ? fmtVal(val) : val} ${unidade}`,
              name === 'max' ? 'Desvio máx.' : 'Desvio mín.',
            ]}
          />
          <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
          <Bar dataKey="max" fill="#3b82f6" name="max" radius={[2, 2, 0, 0]} maxBarSize={18} />
          <Bar dataKey="min" fill="#ef4444" name="min" radius={[0, 0, 2, 2]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IaQualidadePrevisaoPage() {
  const [silos,       setSilos]       = useState<Silo[]>([]);
  const [siloId,      setSiloId]      = useState('');
  const [grandeza,    setGrandeza]    = useState<GrandezaTipo>('temperatura');
  const [agrupamento, setAgrupamento] = useState<AgrupamentoGrafico>('barra');
  const [modo,        setModo]        = useState<ModoDesvio>('absoluto');
  const [windowEnd,   setWindowEnd]   = useState(() => new Date());

  const [historico,    setHistorico]    = useState<IaPrevisaoSensorHistorico[]>([]);
  const [realMap,      setRealMap]      = useState<Map<string, number>>(new Map());
  const [sensorMeta,   setSensorMeta]   = useState<GraficoSensor[]>([]);
  const [loading,      setLoading]      = useState(false);

  const windowStart = useMemo(
    () => new Date(windowEnd.getTime() - 48 * 3_600_000),
    [windowEnd],
  );

  // Load silos with IA
  useEffect(() => {
    Promise.all([
      api.get<{ data: Silo[] }>('/silos?per_page=200'),
      getSilosIa(),
    ]).then(([silosRes, iaRes]) => {
      const idsComIa = new Set(iaRes.silos.map((s) => s.silo_id));
      setSilos((silosRes.data.data ?? []).filter((s) => s.status === 'ativo' && idsComIa.has(s.id)));
    }).catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  const fetchData = useCallback(async (id: string, start: Date, end: Date) => {
    setLoading(true);
    try {
      const params = {
        silo_id:     id,
        data_inicio: start.toISOString(),
        data_fim:    end.toISOString(),
      };
      const [histRes, realRes] = await Promise.allSettled([
        getPrevisoeHistoricas(id, start.toISOString(), end.toISOString()),
        api.get<GraficoResponse>('/relatorios/leituras/grafico', { params }),
      ]);

      if (histRes.status === 'fulfilled') {
        setHistorico(histRes.value.sensores);
      } else {
        setHistorico([]);
        toast.error('Erro ao carregar previsões históricas');
      }

      if (realRes.status === 'fulfilled') {
        setRealMap(buildRealMap(realRes.value.data.series));
        setSensorMeta(realRes.value.data.sensores);
      } else {
        setRealMap(new Map());
        setSensorMeta([]);
        toast.error('Erro ao carregar medições reais');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!siloId) return;
    fetchData(siloId, windowStart, windowEnd);
  }, [siloId, windowStart, windowEnd, fetchData]);

  const goBack = () =>
    setWindowEnd((d) => new Date(d.getTime() - 24 * 3_600_000));
  const goForward = () =>
    setWindowEnd((d) => new Date(Math.min(d.getTime() + 24 * 3_600_000, Date.now())));
  const canGoForward = windowEnd.getTime() < Date.now() - 3_600_000;

  // Meta lookup: sensor_id → GraficoSensor
  const metaById = useMemo(() => {
    const m = new Map<number, GraficoSensor>();
    sensorMeta.forEach((s) => m.set(s.id, s));
    return m;
  }, [sensorMeta]);

  const historicoGrandeza = useMemo(
    () => historico.filter((s) => s.tipo_grandeza === grandeza),
    [historico, grandeza],
  );

  // Build grupos based on agrupamento
  const grupos = useMemo<{ key: string; label: string; sensorIds: number[] }[]>(() => {
    if (historicoGrandeza.length === 0) return [];

    if (agrupamento === 'sensor') {
      return historicoGrandeza.map((s) => {
        const meta = metaById.get(s.sensor_id);
        return {
          key:       String(s.sensor_id),
          label:     meta
            ? `${meta.barra_identificacao} · ${meta.identificacao} (${meta.altura_solo_m}m)`
            : `Sensor ${s.sensor_id}`,
          sensorIds: [s.sensor_id],
        };
      });
    }

    if (agrupamento === 'barra') {
      const map = new Map<number, { label: string; ids: number[] }>();
      historicoGrandeza.forEach((s) => {
        const meta  = metaById.get(s.sensor_id);
        const label = meta?.barra_identificacao ?? `Cabo ${s.barra_id}`;
        if (!map.has(s.barra_id)) map.set(s.barra_id, { label, ids: [] });
        map.get(s.barra_id)!.ids.push(s.sensor_id);
      });
      return [...map.entries()]
        .sort(([a], [b]) => a - b)
        .map(([k, v]) => ({ key: String(k), label: v.label, sensorIds: v.ids }));
    }

    // altura
    return ALTURAS.map(({ key, label, m }) => {
      const ids = historicoGrandeza
        .filter((s) => ALTURA_BY_CM[Math.round(s.altura_solo_m * 10)] === key)
        .map((s) => s.sensor_id);
      return { key, label: `${label} (${m} m)`, sensorIds: ids };
    }).filter((g) => g.sensorIds.length > 0);
  }, [historicoGrandeza, agrupamento, metaById]);

  const gruposComDados = useMemo(() =>
    grupos.map((g) => ({
      ...g,
      data: buildDesvioData(g.sensorIds, historicoGrandeza, realMap, modo),
    })),
    [grupos, historicoGrandeza, realMap, modo],
  );

  const globalYDomain = useMemo(
    () => globalYDomainFrom(gruposComDados.flatMap((g) => g.data)),
    [gruposComDados],
  );

  const unidade = modo === 'percentual'
    ? '%'
    : grandeza === 'temperatura' ? '°C' : grandeza === 'umidade' ? '%' : 'ppm';

  const tabCls = (g: GrandezaTipo) =>
    `px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
      grandeza === g
        ? 'border-primary-500 text-primary-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;
  const btnGroupCls = (active: boolean) =>
    `px-3 py-1.5 text-sm font-medium transition-colors border ${
      active
        ? 'bg-primary-600 text-white border-primary-600 z-10'
        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
    }`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp size={28} className="text-primary-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Qualidade da Previsão</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Desvio entre previsto e realizado · fórmula: previsto − realizado
          </p>
        </div>
      </div>

      {/* Silo */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Silo</label>
        <select
          value={siloId}
          onChange={(e) => setSiloId(e.target.value)}
          className="w-full max-w-xs border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Selecione um silo...</option>
          {silos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>

      {siloId && (
        <>
          {/* Navegação de janela */}
          <div className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-3">
            <button
              onClick={goBack}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              <ChevronLeft size={16} /> −24h
            </button>
            <span className="text-sm text-gray-600 font-medium">
              {fmtDate(windowStart)} → {fmtDate(windowEnd)}
            </span>
            <button
              onClick={goForward}
              disabled={loading || !canGoForward}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              +24h <ChevronRight size={16} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              {/* Grandeza tabs */}
              <div className="flex border-b border-gray-100">
                {GRANDEZA_TABS.map(({ key, label }) => (
                  <button key={key} onClick={() => setGrandeza(key)} className={tabCls(key)}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-4 space-y-4">
                {/* Controles */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">Agrupar por:</span>
                    <div className="flex rounded-lg overflow-hidden border border-gray-200">
                      {(['barra', 'sensor', 'altura'] as AgrupamentoGrafico[]).map((ag) => (
                        <button key={ag} type="button" onClick={() => setAgrupamento(ag)} className={btnGroupCls(agrupamento === ag)}>
                          {AGRUPAMENTO_LABELS[ag]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-gray-200">
                    <button type="button" onClick={() => setModo('absoluto')}   className={btnGroupCls(modo === 'absoluto')}>Absoluto</button>
                    <button type="button" onClick={() => setModo('percentual')} className={btnGroupCls(modo === 'percentual')}>Percentual</button>
                  </div>
                </div>

                {/* Legenda */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-3 rounded bg-blue-500" />
                    Desvio máx.
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-3 rounded bg-red-500" />
                    Desvio mín.
                  </span>
                  <span className="text-gray-400">
                    positivo = modelo superestimou · negativo = subestimou
                    {modo === 'percentual' && ' · % sobre o previsto · pontos com previsto ≈ 0 excluídos'}
                  </span>
                </div>

                {/* Gráficos */}
                {gruposComDados.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">
                    Nenhum dado de previsão comparável disponível para o período selecionado.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {gruposComDados.map((g) => (
                      <DesvioChart
                        key={g.key}
                        titulo={g.label}
                        data={g.data}
                        yDomain={globalYDomain}
                        unidade={unidade}
                        grandeza={grandeza}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
