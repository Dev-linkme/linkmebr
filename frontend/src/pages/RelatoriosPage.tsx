import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea,
} from 'recharts';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import {
  BarChart2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, Search,
} from 'lucide-react';
import api from '../services/api';
import type { Silo, Barra, Sensor, LeituraInterna, Regra } from '../types/index';

// ─── Constants ────────────────────────────────────────────────────────────────

const LINE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const GAP_THRESHOLD_MS = 15 * 60 * 1000;

interface GapInfo { x1: string; x2: string; durationH: number }

function detectGapsAndInject(buckets: string[]): { enriched: string[]; gaps: GapInfo[] } {
  const enriched: string[] = [];
  const gaps: GapInfo[] = [];
  for (let i = 0; i < buckets.length; i++) {
    enriched.push(buckets[i]);
    if (i < buckets.length - 1) {
      const curr = new Date(buckets[i]).getTime();
      const next = new Date(buckets[i + 1]).getTime();
      if (next - curr > GAP_THRESHOLD_MS) {
        const n1 = new Date(curr + 1000).toISOString();
        const n2 = new Date(next - 1000).toISOString();
        enriched.push(n1);
        enriched.push(n2);
        gaps.push({ x1: n1, x2: n2, durationH: Math.round((next - curr) / 3_600_000) });
      }
    }
  }
  return { enriched, gaps };
}

type GrandezaTipo = 'temperatura' | 'umidade' | 'co2' | 'rele';
const GRANDEZA_LABELS: Record<GrandezaTipo, string> = {
  temperatura: 'Temperatura', umidade: 'Umidade', co2: 'CO₂', rele: 'Relé',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface FiltrosForm { silo_id: string; barra_id: string; sensor_id: string; }

interface FiltrosComDatas extends FiltrosForm { data_inicio: string; data_fim: string; }

type SortField           = 'valor_avg' | 'valor_max' | 'valor_min';
type SortDir             = 'asc' | 'desc';
type ValorTipo           = 'avg' | 'min' | 'max';
type AbaAtiva            = 'interna' | 'externa';
type SubAba              = 'tabela'  | 'grafico';
type PeriodoPreset       = '24h' | '72h' | 'semana' | 'mes' | 'custom';
type AgrupamentoGrafico  = 'silo' | 'barra' | 'sensor' | 'altura';

const VALOR_LABELS: Record<ValorTipo, string> = { avg: 'Média', min: 'Mínimo', max: 'Máximo' };
const PERIODO_LABELS: Record<PeriodoPreset, string> = {
  '24h': 'Últimas 24h', '72h': 'Últimas 72h', semana: 'Última semana', mes: 'Último mês', custom: 'Personalizado',
};
const AGRUPAMENTO_LABELS: Record<AgrupamentoGrafico, string> = {
  silo: 'Silo', barra: 'Cabo Pêndulo', sensor: 'Sensor', altura: 'Altura',
};

interface RelatorioResponse { dados: LeituraInterna[]; pagina: number; total_paginas: number; total: number; }

interface GraficoSerie   { sensor_id: number; bucket: string; avg: number; max: number; min: number; }
interface GraficoSensor  {
  id: number; identificacao: string; tipo_grandeza: GrandezaTipo;
  unidade_medida: string; altura_solo_m: number;
  barra_id: number; barra_identificacao: string;
}
interface GraficoResponse { series: GraficoSerie[]; sensores: GraficoSensor[]; }

type RangeHint = { data_inicio: string | null; data_fim: string | null } | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRT = 'America/Sao_Paulo';

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}
function formatFullTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}
function formatRangeDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return formatFullTimestamp(ts);
}
function fmtSensor(val: number | null | undefined, tipo: string): string {
  if (val == null) return '—';
  return tipo === 'temperatura' ? val.toFixed(1) : val.toFixed(0);
}

function computePeriodo(
  preset: PeriodoPreset,
  customInicio: string,
  customFim: string,
): { data_inicio: string; data_fim: string } | null {
  const now = new Date();
  const h = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  if (preset === '24h')    return { data_inicio: h(24),  data_fim: now.toISOString() };
  if (preset === '72h')    return { data_inicio: h(72),  data_fim: now.toISOString() };
  if (preset === 'semana') return { data_inicio: h(168), data_fim: now.toISOString() };
  if (preset === 'mes')    return { data_inicio: h(720), data_fim: now.toISOString() };
  if (!customInicio || !customFim) return null;
  const ini = new Date(customInicio);
  const fim = new Date(customFim);
  if (isNaN(ini.getTime()) || isNaN(fim.getTime()) || fim <= ini) return null;
  if (fim.getTime() - ini.getTime() > 30 * 24 * 3_600_000) return null;
  return { data_inicio: ini.toISOString(), data_fim: fim.toISOString() };
}

function sensorLabel(s: { identificacao: string; barra_identificacao: string; altura_solo_m: number }): string {
  return `${s.barra_identificacao} - ${s.identificacao} (${s.altura_solo_m}m)`;
}

function yDomainFrom(values: (number | undefined)[]): [number, number] {
  const nums = values.filter((v): v is number => v != null);
  const yMin = nums.length > 0 ? Math.min(...nums) : 0;
  const yMax = nums.length > 0 ? Math.max(...nums) : 100;
  const yPad = Math.max((yMax - yMin) * 0.1, 0.5);
  return [Math.floor((yMin - yPad) * 10) / 10, Math.ceil((yMax + yPad) * 10) / 10];
}

// ─── MultiSensorChart ─────────────────────────────────────────────────────────

function MultiSensorChart({ titulo, series, sensores, valor, unidade }: {
  titulo?: string; series: GraficoSerie[]; sensores: GraficoSensor[];
  valor: ValorTipo; unidade: string;
}) {
  if (sensores.length === 0 || series.length === 0) return null;
  const sortedBuckets = Array.from(new Set(series.map((s) => s.bucket))).sort();
  const { enriched, gaps } = detectGapsAndInject(sortedBuckets);
  const chartData = enriched.map((bucket) => {
    const row: Record<string, unknown> = { bucket };
    sensores.forEach((s) => {
      const p = series.find((d) => d.bucket === bucket && d.sensor_id === s.id);
      if (p) row[String(s.id)] = p[valor];
    });
    return row;
  });
  const yDomain = yDomainFrom(
    chartData.flatMap((row) => sensores.map((s) => row[String(s.id)] as number | undefined))
  );
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        {titulo && <h3 className="text-sm font-semibold text-gray-700">{titulo}</h3>}
        {gaps.length > 0 && (
          <span className="text-xs text-amber-600 font-medium ml-auto">
            ⚠ {gaps.length} gap{gaps.length > 1 ? 's' : ''} de dados
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="bucket" tickFormatter={formatTimestamp} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} domain={yDomain} label={{ value: unidade, angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
          <Tooltip labelFormatter={(v) => formatTimestamp(String(v))} formatter={(val, name) => {
            if (val == null) return ['Sem dados', ''];
            const s = sensores.find((x) => String(x.id) === String(name));
            return [`${typeof val === 'number' ? fmtSensor(val, s?.tipo_grandeza ?? '') : val} ${unidade}`, s ? sensorLabel(s) : String(name)];
          }} />
          <Legend formatter={(v) => { const s = sensores.find((x) => String(x.id) === v); return s ? sensorLabel(s) : v; }} />
          {gaps.map((gap, i) => (
            <ReferenceArea key={i} x1={gap.x1} x2={gap.x2}
              fill="rgba(180,180,180,0.2)" stroke="rgba(180,180,180,0.5)" strokeDasharray="3 3"
              label={{ value: `sem dados (${gap.durationH}h)`, position: 'insideTop', fontSize: 10, fill: '#9ca3af' }} />
          ))}
          {sensores.map((s, idx) => (
            <Line key={s.id} type="monotone" dataKey={String(s.id)} stroke={LINE_COLORS[idx % LINE_COLORS.length]}
              dot={false} strokeWidth={2} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SingleSensorChart ────────────────────────────────────────────────────────

const SENSOR_METRIC_COLORS = { avg: '#3b82f6', max: '#ef4444', min: '#22c55e' };

function SingleSensorChart({ sensor, series, unidade }: {
  sensor: GraficoSensor; series: GraficoSerie[]; unidade: string;
}) {
  const mine = series.filter((d) => d.sensor_id === sensor.id);
  if (mine.length === 0) return null;
  const sortedBuckets = Array.from(new Set(mine.map((d) => d.bucket))).sort();
  const { enriched, gaps } = detectGapsAndInject(sortedBuckets);
  const chartData = enriched.map((bucket) => {
    const row: Record<string, unknown> = { bucket };
    const p = mine.find((d) => d.bucket === bucket);
    if (p) { row.avg = p.avg; row.max = p.max; row.min = p.min; }
    return row;
  });
  const yDomain = yDomainFrom(
    chartData.flatMap((r) => [r.avg, r.max, r.min] as (number | undefined)[])
  );
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {sensorLabel(sensor)}{unidade ? ` — ${unidade}` : ''}
        </h3>
        {gaps.length > 0 && (
          <span className="text-xs text-amber-600 font-medium">
            ⚠ {gaps.length} gap{gaps.length > 1 ? 's' : ''} de dados
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="bucket" tickFormatter={formatTimestamp} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} domain={yDomain} label={{ value: unidade, angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
          <Tooltip labelFormatter={(v) => formatTimestamp(String(v))} formatter={(val, name) => {
            if (val == null) return ['Sem dados', ''];
            const labels: Record<string, string> = { avg: 'Média', max: 'Máximo', min: 'Mínimo' };
            return [`${typeof val === 'number' ? fmtSensor(val, sensor.tipo_grandeza) : val} ${unidade}`, labels[String(name)] ?? String(name)];
          }} />
          <Legend formatter={(v) => { const l: Record<string, string> = { avg: 'Média', max: 'Máximo', min: 'Mínimo' }; return l[String(v)] ?? String(v); }} />
          {gaps.map((gap, i) => (
            <ReferenceArea key={i} x1={gap.x1} x2={gap.x2}
              fill="rgba(180,180,180,0.2)" stroke="rgba(180,180,180,0.5)" strokeDasharray="3 3"
              label={{ value: `sem dados (${gap.durationH}h)`, position: 'insideTop', fontSize: 10, fill: '#9ca3af' }} />
          ))}
          <Line type="monotone" dataKey="avg" stroke={SENSOR_METRIC_COLORS.avg} strokeWidth={2} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="max" stroke={SENSOR_METRIC_COLORS.max} strokeWidth={1.5} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="min" stroke={SENSOR_METRIC_COLORS.min} strokeWidth={1.5} dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Paginacao ────────────────────────────────────────────────────────────────

function Paginacao({ pagina, totalPaginas, loading, onPageChange, t }: {
  pagina: number; totalPaginas: number; loading: boolean;
  onPageChange: (p: number) => void; t: (k: string) => string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
      <p className="text-sm text-gray-600">{t('geral.pagina')} {pagina} / {totalPaginas}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(pagina - 1)} disabled={pagina <= 1 || loading}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={15} />{t('geral.anterior')}
        </button>
        <button onClick={() => onPageChange(pagina + 1)} disabled={pagina >= totalPaginas || loading}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {t('geral.proximo')}<ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Status Análise ───────────────────────────────────────────────────────────

function resolveStatusAnalise(status: string | null | undefined, regras: Regra[]) {
  if (!status) return [];
  return status.split(',').map((c) => c.trim()).filter(Boolean).map((codigo) => {
    const r = regras.find((x) => x.codigo === codigo);
    return r ?? { codigo, criterio: codigo, logica: '', severidade: 'erro' as const };
  });
}

function StatusAnaliseBadge({ status, regras }: { status: string | null | undefined; regras: Regra[] }) {
  const itens = resolveStatusAnalise(status, regras);
  if (itens.length === 0) return <span className="text-gray-300">—</span>;
  const temErro = itens.some((i) => i.severidade === 'erro');
  const badgeCls = temErro
    ? 'bg-red-100 text-red-700 border border-red-200'
    : 'bg-yellow-100 text-yellow-700 border border-yellow-200';
  const tooltipText = itens.map((i) => `[${i.codigo}] ${i.criterio}: ${i.logica}`).join('\n');
  return (
    <div className="relative group inline-flex">
      <span className={`px-2 py-0.5 rounded text-xs font-medium cursor-help ${badgeCls}`} title={tooltipText}>
        {itens.map((i) => i.codigo).join(', ')}
      </span>
      <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20 w-72 bg-gray-900 text-white text-xs rounded p-2 shadow-xl whitespace-pre-line pointer-events-none">
        {itens.map((i) => (
          <p key={i.codigo} className="mb-1 last:mb-0">
            <span className={i.severidade === 'erro' ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>[{i.codigo}]</span>{' '}
            <span className="font-medium">{i.criterio}:</span> {i.logica}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const { t } = useTranslation();
  const { register, handleSubmit, watch, setValue } = useForm<FiltrosForm>({
    defaultValues: { silo_id: '', barra_id: '', sensor_id: '' },
  });

  const siloId   = watch('silo_id');
  const barraId  = watch('barra_id');
  const sensorId = watch('sensor_id');

  const [silos,    setSilos]    = useState<Silo[]>([]);
  const [barras,   setBarras]   = useState<Barra[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);
  const [regras,   setRegras]   = useState<Regra[]>([]);

  // Period
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>('24h');
  const [customInicio,  setCustomInicio]  = useState('');
  const [customFim,     setCustomFim]     = useState('');

  const hasInterna = barras.some((b) => b.local === 'interno ao silo');
  const hasExterna = barras.some((b) => b.local === 'externo ao silo');

  const [abaAtiva,        setAbaAtiva]        = useState<AbaAtiva>('interna');
  const [grandezaInterna, setGrandezaInterna] = useState<GrandezaTipo>('temperatura');
  const [grandezaExterna, setGrandezaExterna] = useState<GrandezaTipo>('temperatura');
  const [subAbaInterna,   setSubAbaInterna]   = useState<SubAba>('tabela');
  const [subAbaExterna,   setSubAbaExterna]   = useState<SubAba>('tabela');
  const [agrupamento,     setAgrupamento]     = useState<AgrupamentoGrafico>('silo');
  const [valorTipo,       setValorTipo]       = useState<ValorTipo>('avg');

  const [rangeInterna, setRangeInterna] = useState<RangeHint>(null);
  const [rangeExterna, setRangeExterna] = useState<RangeHint>(null);

  const [dados,              setDados]              = useState<LeituraInterna[]>([]);
  const [grafico,            setGrafico]            = useState<GraficoResponse | null>(null);
  const [loadingInterna,     setLoadingInterna]     = useState(false);
  const [loadingGrafInterna, setLoadingGrafInterna] = useState(false);
  const [paginaInterna,      setPaginaInterna]      = useState(1);
  const [totalPagInterna,    setTotalPagInterna]    = useState(0);

  const [dadosExternos,      setDadosExternos]      = useState<LeituraInterna[]>([]);
  const [graficoExterno,     setGraficoExterno]     = useState<GraficoResponse | null>(null);
  const [loadingExterna,     setLoadingExterna]     = useState(false);
  const [loadingGrafExterna, setLoadingGrafExterna] = useState(false);
  const [paginaExterna,      setPaginaExterna]      = useState(1);
  const [totalPagExterna,    setTotalPagExterna]    = useState(0);

  const [loadingExportInt, setLoadingExportInt] = useState(false);
  const [loadingExportExt, setLoadingExportExt] = useState(false);

  const [sortField,   setSortField]   = useState<SortField | null>(null);
  const [sortDir,     setSortDir]     = useState<SortDir>('asc');
  const [lastFiltros, setLastFiltros] = useState<FiltrosComDatas | null>(null);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => setSilos((res.data.data ?? []).filter((s) => s.status === 'ativo')))
      .catch(() => toast.error('Erro ao carregar silos'));
    api.get<Regra[]>('/regras').then((res) => setRegras(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setBarras([]); setSensores([]);
    setValue('barra_id', ''); setValue('sensor_id', '');
    setRangeInterna(null); setRangeExterna(null);
    setDados([]); setGrafico(null);
    setDadosExternos([]); setGraficoExterno(null);
    setLastFiltros(null);
    if (!siloId) return;
    api.get<{ data: Barra[] }>(`/silos/${siloId}/barras?per_page=200`)
      .then((res) => setBarras(res.data.data ?? []))
      .catch(() => toast.error('Erro ao carregar cabos pêndulo'));
  }, [siloId, setValue]);

  useEffect(() => {
    if (!siloId) return;
    setAbaAtiva((prev) => {
      if (prev === 'interna' && !barras.some((b) => b.local === 'interno ao silo')) return 'externa';
      if (prev === 'externa' && !barras.some((b) => b.local === 'externo ao silo')) return 'interna';
      return prev;
    });
  }, [barras, siloId]);

  useEffect(() => {
    setSensores([]); setValue('sensor_id', '');
    setDados([]); setGrafico(null);
    setDadosExternos([]); setGraficoExterno(null);
    setLastFiltros(null);
    if (!barraId) return;
    api.get<{ data: Sensor[] }>(`/barras/${barraId}/sensores?per_page=200`)
      .then((res) => setSensores(res.data.data ?? []))
      .catch(() => toast.error('Erro ao carregar sensores'));
  }, [barraId, setValue]);

  useEffect(() => {
    setDados([]); setGrafico(null);
    setDadosExternos([]); setGraficoExterno(null);
    setLastFiltros(null);
  }, [sensorId]);

  useEffect(() => {
    if (!siloId) return;
    const p: Record<string, string> = { silo_id: siloId };
    if (barraId)  p.barra_id  = barraId;
    if (sensorId) p.sensor_id = sensorId;
    const barraLocal = barraId ? barras.find((b) => String(b.id) === barraId)?.local : null;
    if (hasInterna && (!barraLocal || barraLocal === 'interno ao silo'))
      api.get<RangeHint>('/relatorios/leituras/range', { params: p }).then((r) => setRangeInterna(r.data)).catch(() => {});
    if (hasExterna && (!barraLocal || barraLocal === 'externo ao silo'))
      api.get<RangeHint>('/relatorios/leituras-externas/range', { params: p }).then((r) => setRangeExterna(r.data)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siloId, barraId, sensorId, hasInterna, hasExterna]);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchInterna = useCallback(async (f: FiltrosComDatas, page: number) => {
    setLoadingInterna(true);
    try {
      const params: Record<string, string | number> = { silo_id: f.silo_id, page, limit: 50, data_inicio: f.data_inicio, data_fim: f.data_fim };
      if (f.barra_id)  params.barra_id  = f.barra_id;
      if (f.sensor_id) params.sensor_id = f.sensor_id;
      const res = await api.get<RelatorioResponse>('/relatorios/leituras', { params });
      setDados(res.data.dados); setPaginaInterna(res.data.pagina); setTotalPagInterna(res.data.total_paginas);
    } catch { toast.error('Erro ao consultar leituras internas'); }
    finally  { setLoadingInterna(false); }
  }, []);

  const fetchGraficoInterna = useCallback(async (f: FiltrosComDatas) => {
    setLoadingGrafInterna(true);
    try {
      const params: Record<string, string> = { silo_id: f.silo_id, data_inicio: f.data_inicio, data_fim: f.data_fim };
      if (f.barra_id)  params.barra_id  = f.barra_id;
      if (f.sensor_id) params.sensor_id = f.sensor_id;
      const res = await api.get<GraficoResponse>('/relatorios/leituras/grafico', { params });
      setGrafico(res.data);
    } catch { toast.error('Erro ao carregar gráfico interno'); }
    finally  { setLoadingGrafInterna(false); }
  }, []);

  const fetchExterna = useCallback(async (f: FiltrosComDatas, page: number) => {
    setLoadingExterna(true);
    try {
      const params: Record<string, string | number> = { silo_id: f.silo_id, page, limit: 50, data_inicio: f.data_inicio, data_fim: f.data_fim };
      if (f.barra_id)  params.barra_id  = f.barra_id;
      if (f.sensor_id) params.sensor_id = f.sensor_id;
      const res = await api.get<RelatorioResponse>('/relatorios/leituras-externas', { params });
      setDadosExternos(res.data.dados); setPaginaExterna(res.data.pagina); setTotalPagExterna(res.data.total_paginas);
    } catch { toast.error('Erro ao consultar leituras externas'); }
    finally  { setLoadingExterna(false); }
  }, []);

  const fetchGraficoExterna = useCallback(async (f: FiltrosComDatas) => {
    setLoadingGrafExterna(true);
    try {
      const params: Record<string, string> = { silo_id: f.silo_id, data_inicio: f.data_inicio, data_fim: f.data_fim };
      if (f.barra_id)  params.barra_id  = f.barra_id;
      if (f.sensor_id) params.sensor_id = f.sensor_id;
      const res = await api.get<GraficoResponse>('/relatorios/leituras-externas/grafico', { params });
      setGraficoExterno(res.data);
    } catch { toast.error('Erro ao carregar gráfico externo'); }
    finally  { setLoadingGrafExterna(false); }
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────

  const onSubmit = (filtros: FiltrosForm) => {
    const periodo = computePeriodo(periodoPreset, customInicio, customFim);
    if (!periodo) {
      toast.error(periodoPreset === 'custom' ? 'Período inválido ou superior a 30 dias' : 'Período inválido');
      return;
    }
    const f: FiltrosComDatas = { ...filtros, ...periodo };
    setLastFiltros(f); setSortField(null); setPaginaInterna(1); setPaginaExterna(1);
    const barraLocal = barraId ? barras.find((b) => String(b.id) === barraId)?.local : null;
    const deveInterna = hasInterna && (!barraLocal || barraLocal === 'interno ao silo');
    const deveExterna = hasExterna && (!barraLocal || barraLocal === 'externo ao silo');
    if (deveInterna) { fetchInterna(f, 1); fetchGraficoInterna(f); }
    if (deveExterna) { fetchExterna(f, 1); fetchGraficoExterna(f); }
  };

  const handlePageInterna = (p: number) => { if (lastFiltros) { setPaginaInterna(p); fetchInterna(lastFiltros, p); } };
  const handlePageExterna = (p: number) => { if (lastFiltros) { setPaginaExterna(p); fetchExterna(lastFiltros, p); } };

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExportInterna = async () => {
    if (!lastFiltros) { toast.error('Execute uma consulta antes de exportar'); return; }
    setLoadingExportInt(true);
    try {
      const params: Record<string, string> = { silo_id: lastFiltros.silo_id, data_inicio: lastFiltros.data_inicio, data_fim: lastFiltros.data_fim };
      if (lastFiltros.barra_id)  params.barra_id  = lastFiltros.barra_id;
      if (lastFiltros.sensor_id) params.sensor_id = lastFiltros.sensor_id;
      const res = await api.get<string>('/relatorios/leituras/export', { params, responseType: 'text' });
      const csv = typeof res.data === 'string' ? res.data : Papa.unparse(res.data as unknown as object[]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = `leituras_internas_silo_${lastFiltros.silo_id}_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      toast.success('CSV exportado');
    } catch { toast.error('Erro ao exportar CSV'); }
    finally { setLoadingExportInt(false); }
  };

  const handleExportExterna = async () => {
    if (!lastFiltros) { toast.error('Execute uma consulta antes de exportar'); return; }
    setLoadingExportExt(true);
    try {
      const params: Record<string, string> = { silo_id: lastFiltros.silo_id, data_inicio: lastFiltros.data_inicio, data_fim: lastFiltros.data_fim };
      if (lastFiltros.barra_id)  params.barra_id  = lastFiltros.barra_id;
      if (lastFiltros.sensor_id) params.sensor_id = lastFiltros.sensor_id;
      const res = await api.get<string>('/relatorios/leituras-externas/export', { params, responseType: 'text' });
      const csv = typeof res.data === 'string' ? res.data : Papa.unparse(res.data as unknown as object[]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = `leituras_externas_silo_${lastFiltros.silo_id}_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      toast.success('CSV exportado');
    } catch { toast.error('Erro ao exportar CSV'); }
    finally { setLoadingExportExt(false); }
  };

  // ── Sort ──────────────────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };
  const sortedDados = [...dados].sort((a, b) => {
    if (!sortField) {
      const tDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (tDiff !== 0) return tDiff;
      const bDiff = (a.sensor?.barra?.id ?? 0) - (b.sensor?.barra?.id ?? 0);
      if (bDiff !== 0) return bDiff;
      return (a.sensor?.altura_solo_m ?? 0) - (b.sensor?.altura_solo_m ?? 0);
    }
    const va = a[sortField] ?? 0;
    const vb = b[sortField] ?? 0;
    return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
  const sortedDadosExternos = [...dadosExternos].sort((a, b) => {
    if (!sortField) {
      const tDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (tDiff !== 0) return tDiff;
      const bDiff = (a.sensor?.barra?.id ?? 0) - (b.sensor?.barra?.id ?? 0);
      if (bDiff !== 0) return bDiff;
      return (a.sensor?.altura_solo_m ?? 0) - (b.sensor?.altura_solo_m ?? 0);
    }
    const va = a[sortField] ?? 0;
    const vb = b[sortField] ?? 0;
    return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown size={14} className="text-gray-300 inline ml-1" />;
    return sortDir === 'asc'
      ? <ChevronUp   size={14} className="text-primary-600 inline ml-1" />
      : <ChevronDown size={14} className="text-primary-600 inline ml-1" />;
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeRange = abaAtiva === 'interna' ? rangeInterna : rangeExterna;

  // ── CSS helpers ───────────────────────────────────────────────────────────

  const mainTabCls = (aba: AbaAtiva) =>
    `px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
      abaAtiva === aba
        ? 'border-primary-600 text-primary-600 bg-white'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;
  const subTabCls = (sub: SubAba, active: SubAba) =>
    `px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
      sub === active ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;
  const btnGroupCls = (active: boolean) =>
    `px-3 py-1.5 text-sm font-medium transition-colors border ${
      active ? 'bg-primary-600 text-white border-primary-600 z-10' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
    }`;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 size={28} className="text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t('relatorios.titulo')}</h1>
      </div>

      {/* Filter form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-4 space-y-4">
        {/* Silo / Barra / Sensor */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('relatorios.silo')} *</label>
            <select {...register('silo_id', { required: true })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Selecione...</option>
              {silos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('relatorios.barra')}</label>
            <select {...register('barra_id')} disabled={!siloId}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed">
              <option value="">{t('relatorios.todas_barras')}</option>
              {barras.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.identificacao} · {b.local === 'interno ao silo' ? 'interno' : 'externo'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('relatorios.sensor')}</label>
            <select {...register('sensor_id')} disabled={!barraId}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed">
              <option value="">{t('relatorios.todos_sensores')}</option>
              {sensores.map((s) => <option key={s.id} value={s.id}>{s.identificacao} ({s.altura_solo_m}m)</option>)}
            </select>
          </div>
        </div>

        {/* Period selector */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">Período</label>
          <div className="flex flex-wrap gap-2">
            {(['24h', '72h', 'semana', 'mes', 'custom'] as PeriodoPreset[]).map((p) => (
              <button key={p} type="button" onClick={() => { setPeriodoPreset(p); setLastFiltros(null); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                  periodoPreset === p
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                {PERIODO_LABELS[p]}
              </button>
            ))}
          </div>
          {periodoPreset === 'custom' && (
            <div className="flex flex-wrap gap-3 items-end pt-1">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('relatorios.data_inicio')}</label>
                <input type="datetime-local" value={customInicio} onChange={(e) => setCustomInicio(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('relatorios.data_fim')}</label>
                <input type="datetime-local" value={customFim} onChange={(e) => setCustomFim(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <p className="text-xs text-gray-400 pb-2">Máximo 30 dias</p>
            </div>
          )}
          {activeRange && (
            <p className="text-xs text-gray-400">
              Dados disponíveis: {formatRangeDate(activeRange.data_inicio)} → {formatRangeDate(activeRange.data_fim)}
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={loadingInterna || loadingExterna || !siloId}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-5 py-2 rounded-md text-sm font-medium transition-colors">
            <Search size={15} />
            {(loadingInterna || loadingExterna) ? t('geral.carregando') : t('relatorios.consultar')}
          </button>
        </div>
      </form>

      {/* Main tabs — exibido após primeira consulta */}
      {lastFiltros && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="flex border-b border-gray-200">
            {hasInterna && <button onClick={() => setAbaAtiva('interna')} className={mainTabCls('interna')}>Leituras Internas</button>}
            {hasExterna && <button onClick={() => setAbaAtiva('externa')} className={mainTabCls('externa')}>Leituras Externas</button>}
          </div>

          {/* ── ABA: Leituras Internas ── */}
          {abaAtiva === 'interna' && (
            <div className="p-4 space-y-4">
              {(() => {
                const grandezasComDados = new Set(dados.map((l) => l.sensor?.tipo_grandeza).filter(Boolean)) as Set<GrandezaTipo>;
                const GRANDEZA_TABS: { key: GrandezaTipo; label: string }[] = [
                  { key: 'temperatura', label: 'Temperatura' },
                  { key: 'umidade',     label: 'Umidade' },
                  { key: 'co2',         label: 'CO₂' },
                  { key: 'rele',        label: 'Relé' },
                ];
                const grandezaTabCls = (g: GrandezaTipo) =>
                  `px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                    grandezaInterna === g
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`;
                const dadosFiltrados    = sortedDados.filter((l) => l.sensor?.tipo_grandeza === grandezaInterna);
                const serieFiltrada     = (grafico?.series ?? []).filter((s) =>
                  (grafico?.sensores ?? []).some((x) => x.id === s.sensor_id && x.tipo_grandeza === grandezaInterna)
                );
                const sensoresFiltrados = (grafico?.sensores ?? []).filter((s) => s.tipo_grandeza === grandezaInterna);
                const unidade           = sensoresFiltrados[0]?.unidade_medida ?? '';
                return (
                  <>
                    {/* Grandeza selector */}
                    <div className="flex border-b border-gray-100 -mt-1">
                      {GRANDEZA_TABS.map(({ key, label }) => {
                        const temDados = lastFiltros ? grandezasComDados.has(key) : true;
                        return (
                          <button key={key} onClick={() => setGrandezaInterna(key)}
                            className={`${grandezaTabCls(key)} ${!temDados && lastFiltros ? 'opacity-40' : ''}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Tabela/Gráfico + export */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                        <button onClick={() => setSubAbaInterna('tabela')}  className={subTabCls('tabela',  subAbaInterna)}>Tabela</button>
                        <button onClick={() => setSubAbaInterna('grafico')} className={subTabCls('grafico', subAbaInterna)}>Gráfico</button>
                      </div>
                      {lastFiltros && subAbaInterna === 'tabela' && (
                        <button onClick={handleExportInterna} disabled={loadingExportInt}
                          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
                          <Download size={14} />{loadingExportInt ? 'Exportando...' : 'Exportar CSV'}
                        </button>
                      )}
                    </div>

                    {/* Tabela */}
                    {subAbaInterna === 'tabela' && (
                      !lastFiltros ? (
                        <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                      ) : loadingInterna ? (
                        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                      ) : dadosFiltrados.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-10">{t('relatorios.sem_dados')}</p>
                      ) : grandezaInterna === 'rele' ? (
                        /* Tabela especial para relé — estado discreto */
                        <div className="rounded-lg border border-gray-200 overflow-x-auto">
                          <div>
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_data')}</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_barra')}</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_sensor')}</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Estado</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_amostras')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {dadosFiltrados.map((leitura) => {
                                  const sensor = leitura.sensor;
                                  const barra  = sensor?.barra;
                                  const ligado = leitura.valor_avg === 1.0;
                                  return (
                                    <tr key={leitura.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatFullTimestamp(leitura.timestamp)}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{barra?.identificacao ?? '—'}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{sensor?.identificacao ?? `Sensor ${leitura.sensor_id}`}</td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        {ligado
                                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">● Ligado</span>
                                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500">● Desligado</span>}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{leitura.num_amostras}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {totalPagInterna > 1 && <Paginacao pagina={paginaInterna} totalPaginas={totalPagInterna} loading={loadingInterna} onPageChange={handlePageInterna} t={t} />}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-gray-200 overflow-x-auto">
                          <div>
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_data')}</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_barra')}</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_sensor')}</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Altura (m)</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_unidade')}</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('valor_avg')}>
                                    {t('relatorios.coluna_avg')}<SortIcon field="valor_avg" />
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('valor_max')}>
                                    {t('relatorios.coluna_max')}<SortIcon field="valor_max" />
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('valor_min')}>
                                    {t('relatorios.coluna_min')}<SortIcon field="valor_min" />
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_amostras')}</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_desvio')}</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {dadosFiltrados.map((leitura) => {
                                  const sensor = leitura.sensor;
                                  const barra  = sensor?.barra;
                                  return (
                                    <tr key={leitura.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatFullTimestamp(leitura.timestamp)}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{barra?.identificacao ?? '—'}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{sensor?.identificacao ?? `Sensor ${leitura.sensor_id}`}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{sensor?.altura_solo_m != null ? `${sensor.altura_solo_m} m` : '—'}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{sensor?.unidade_medida ?? '—'}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">{fmtSensor(leitura.valor_avg, sensor?.tipo_grandeza ?? '')}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtSensor(leitura.valor_max, sensor?.tipo_grandeza ?? '')}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtSensor(leitura.valor_min, sensor?.tipo_grandeza ?? '')}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{leitura.num_amostras}</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtSensor(leitura.desvio_padrao, sensor?.tipo_grandeza ?? '')}</td>
                                      <td className="px-4 py-3 whitespace-nowrap"><StatusAnaliseBadge status={leitura.status_analise} regras={regras} /></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {totalPagInterna > 1 && <Paginacao pagina={paginaInterna} totalPaginas={totalPagInterna} loading={loadingInterna} onPageChange={handlePageInterna} t={t} />}
                        </div>
                      )
                    )}

                    {/* Gráfico */}
                    {subAbaInterna === 'grafico' && (
                      !lastFiltros ? (
                        <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                      ) : loadingGrafInterna ? (
                        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                      ) : grandezaInterna === 'rele' ? (
                        <p className="text-center text-gray-400 text-sm py-10">
                          Relé é um estado discreto — use a aba Tabela para visualizar o histórico de acionamentos.
                        </p>
                      ) : serieFiltrada.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-10">{t('relatorios.sem_dados')}</p>
                      ) : (
                        <div className="space-y-3">
                          {/* Agrupamento */}
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">Agrupar por:</span>
                            <div className="flex rounded-lg overflow-hidden border border-gray-200">
                              {(['silo', 'barra', 'sensor', 'altura'] as AgrupamentoGrafico[]).map((ag) => (
                                <button key={ag} type="button" onClick={() => setAgrupamento(ag)} className={btnGroupCls(agrupamento === ag)}>
                                  {AGRUPAMENTO_LABELS[ag]}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Métrica (oculta no modo Sensor) */}
                          {agrupamento !== 'sensor' && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">Exibindo:</span>
                              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                                {(['avg', 'min', 'max'] as ValorTipo[]).map((v) => (
                                  <button key={v} type="button" onClick={() => setValorTipo(v)}
                                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${valorTipo === v ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                    {VALOR_LABELS[v]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Silo: um gráfico com todos os sensores */}
                          {agrupamento === 'silo' && (
                            <MultiSensorChart
                              titulo={`${GRANDEZA_LABELS[grandezaInterna]}${unidade ? ` (${unidade})` : ''}`}
                              series={serieFiltrada} sensores={sensoresFiltrados}
                              valor={valorTipo} unidade={unidade}                            />
                          )}

                          {/* Barra: um gráfico por barra */}
                          {agrupamento === 'barra' && (() => {
                            const barrasUnicas = [
                              ...new Map(sensoresFiltrados.map((s) => [s.barra_id, { id: s.barra_id, identificacao: s.barra_identificacao }])).values()
                            ];
                            return barrasUnicas.map((barra) => (
                              <MultiSensorChart key={barra.id}
                                titulo={`${barra.identificacao} — ${GRANDEZA_LABELS[grandezaInterna]}${unidade ? ` (${unidade})` : ''}`}
                                series={serieFiltrada}
                                sensores={sensoresFiltrados.filter((s) => s.barra_id === barra.id)}
                                valor={valorTipo} unidade={unidade}                              />
                            ));
                          })()}

                          {/* Sensor: um gráfico por sensor com média+máx+mín */}
                          {agrupamento === 'sensor' && sensoresFiltrados.map((sensor) => (
                            <SingleSensorChart key={sensor.id}
                              sensor={sensor} series={serieFiltrada} unidade={unidade} />
                          ))}

                          {/* Altura: um gráfico por altura */}
                          {agrupamento === 'altura' && (() => {
                            const alturas = [...new Set(sensoresFiltrados.map((s) => s.altura_solo_m))].sort((a, b) => a - b);
                            return alturas.map((alt) => (
                              <MultiSensorChart key={alt}
                                titulo={`${alt} m — ${GRANDEZA_LABELS[grandezaInterna]}${unidade ? ` (${unidade})` : ''}`}
                                series={serieFiltrada}
                                sensores={sensoresFiltrados.filter((s) => s.altura_solo_m === alt)}
                                valor={valorTipo} unidade={unidade}                              />
                            ));
                          })()}
                        </div>
                      )
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── ABA: Leituras Externas ── */}
          {abaAtiva === 'externa' && (
            <div className="p-4 space-y-4">
              {(() => {
                const grandezasComDadosExt = new Set(dadosExternos.map((l) => l.sensor?.tipo_grandeza).filter(Boolean)) as Set<GrandezaTipo>;
                const GRANDEZA_TABS: { key: GrandezaTipo; label: string }[] = [
                  { key: 'temperatura', label: 'Temperatura' },
                  { key: 'umidade',     label: 'Umidade' },
                  { key: 'co2',         label: 'CO₂' },
                  { key: 'rele',        label: 'Relé' },
                ];
                const grandezaTabCls = (g: GrandezaTipo) =>
                  `px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                    grandezaExterna === g
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`;
                const dadosFiltradosExt    = sortedDadosExternos.filter((l) => l.sensor?.tipo_grandeza === grandezaExterna);
                const serieFiltradaExt     = (graficoExterno?.series ?? []).filter((s) =>
                  (graficoExterno?.sensores ?? []).some((x) => x.id === s.sensor_id && x.tipo_grandeza === grandezaExterna)
                );
                const sensoresFiltradosExt = (graficoExterno?.sensores ?? []).filter((s) => s.tipo_grandeza === grandezaExterna);
                const unidadeExt           = sensoresFiltradosExt[0]?.unidade_medida ?? '';
                return (
                  <>
                    {/* Grandeza selector */}
                    <div className="flex border-b border-gray-100 -mt-1">
                      {GRANDEZA_TABS.map(({ key, label }) => {
                        const temDados = lastFiltros ? grandezasComDadosExt.has(key) : true;
                        return (
                          <button key={key} onClick={() => setGrandezaExterna(key)}
                            className={`${grandezaTabCls(key)} ${!temDados && lastFiltros ? 'opacity-40' : ''}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Tabela/Gráfico + export */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                        <button onClick={() => setSubAbaExterna('tabela')}  className={subTabCls('tabela',  subAbaExterna)}>Tabela</button>
                        <button onClick={() => setSubAbaExterna('grafico')} className={subTabCls('grafico', subAbaExterna)}>Gráfico</button>
                      </div>
                      {lastFiltros && subAbaExterna === 'tabela' && (
                        <button onClick={handleExportExterna} disabled={loadingExportExt}
                          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
                          <Download size={14} />{loadingExportExt ? 'Exportando...' : 'Exportar CSV'}
                        </button>
                      )}
                    </div>

                    {/* Tabela */}
                    {subAbaExterna === 'tabela' && (
                      !lastFiltros ? (
                        <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                      ) : loadingExterna ? (
                        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                      ) : dadosFiltradosExt.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-10">{t('relatorios.sem_dados')}</p>
                      ) : grandezaExterna === 'rele' ? (
                        <div className="rounded-lg border border-gray-200 overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_data')}</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_barra')}</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_sensor')}</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Estado</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_amostras')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {dadosFiltradosExt.map((leitura) => {
                                const sensor = leitura.sensor;
                                const barra  = sensor?.barra;
                                const ligado = leitura.valor_avg === 1.0;
                                return (
                                  <tr key={leitura.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatFullTimestamp(leitura.timestamp)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{barra?.identificacao ?? '—'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{sensor?.identificacao ?? `Sensor ${leitura.sensor_id}`}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {ligado
                                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">● Ligado</span>
                                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500">● Desligado</span>}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{leitura.num_amostras}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {totalPagExterna > 1 && <Paginacao pagina={paginaExterna} totalPaginas={totalPagExterna} loading={loadingExterna} onPageChange={handlePageExterna} t={t} />}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-gray-200 overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_data')}</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_barra')}</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_sensor')}</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Altura (m)</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_unidade')}</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('valor_avg')}>
                                  {t('relatorios.coluna_avg')}<SortIcon field="valor_avg" />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('valor_max')}>
                                  {t('relatorios.coluna_max')}<SortIcon field="valor_max" />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('valor_min')}>
                                  {t('relatorios.coluna_min')}<SortIcon field="valor_min" />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_amostras')}</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_desvio')}</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {dadosFiltradosExt.map((leitura) => {
                                const sensor = leitura.sensor;
                                const barra  = sensor?.barra;
                                return (
                                  <tr key={leitura.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatFullTimestamp(leitura.timestamp)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{barra?.identificacao ?? '—'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{sensor?.identificacao ?? `Sensor ${leitura.sensor_id}`}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{sensor?.altura_solo_m != null ? `${sensor.altura_solo_m} m` : '—'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{sensor?.unidade_medida ?? '—'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">{fmtSensor(leitura.valor_avg, sensor?.tipo_grandeza ?? '')}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtSensor(leitura.valor_max, sensor?.tipo_grandeza ?? '')}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtSensor(leitura.valor_min, sensor?.tipo_grandeza ?? '')}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{leitura.num_amostras}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtSensor(leitura.desvio_padrao, sensor?.tipo_grandeza ?? '')}</td>
                                    <td className="px-4 py-3 whitespace-nowrap"><StatusAnaliseBadge status={leitura.status_analise} regras={regras} /></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {totalPagExterna > 1 && <Paginacao pagina={paginaExterna} totalPaginas={totalPagExterna} loading={loadingExterna} onPageChange={handlePageExterna} t={t} />}
                        </div>
                      )
                    )}

                    {/* Gráfico */}
                    {subAbaExterna === 'grafico' && (
                      !lastFiltros ? (
                        <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                      ) : loadingGrafExterna ? (
                        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                      ) : grandezaExterna === 'rele' ? (
                        <p className="text-center text-gray-400 text-sm py-10">
                          Relé é um estado discreto — use a aba Tabela para visualizar o histórico de acionamentos.
                        </p>
                      ) : serieFiltradaExt.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-10">{t('relatorios.sem_dados')}</p>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">Agrupar por:</span>
                            <div className="flex rounded-lg overflow-hidden border border-gray-200">
                              {(['silo', 'barra', 'sensor', 'altura'] as AgrupamentoGrafico[]).map((ag) => (
                                <button key={ag} type="button" onClick={() => setAgrupamento(ag)} className={btnGroupCls(agrupamento === ag)}>
                                  {AGRUPAMENTO_LABELS[ag]}
                                </button>
                              ))}
                            </div>
                          </div>
                          {agrupamento !== 'sensor' && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">Exibindo:</span>
                              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                                {(['avg', 'min', 'max'] as ValorTipo[]).map((v) => (
                                  <button key={v} type="button" onClick={() => setValorTipo(v)}
                                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${valorTipo === v ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                    {VALOR_LABELS[v]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {agrupamento === 'silo' && (
                            <MultiSensorChart
                              titulo={`${GRANDEZA_LABELS[grandezaExterna]}${unidadeExt ? ` (${unidadeExt})` : ''}`}
                              series={serieFiltradaExt} sensores={sensoresFiltradosExt}
                              valor={valorTipo} unidade={unidadeExt} />
                          )}
                          {agrupamento === 'barra' && (() => {
                            const barrasUnicas = [
                              ...new Map(sensoresFiltradosExt.map((s) => [s.barra_id, { id: s.barra_id, identificacao: s.barra_identificacao }])).values()
                            ];
                            return barrasUnicas.map((barra) => (
                              <MultiSensorChart key={barra.id}
                                titulo={`${barra.identificacao} — ${GRANDEZA_LABELS[grandezaExterna]}${unidadeExt ? ` (${unidadeExt})` : ''}`}
                                series={serieFiltradaExt}
                                sensores={sensoresFiltradosExt.filter((s) => s.barra_id === barra.id)}
                                valor={valorTipo} unidade={unidadeExt} />
                            ));
                          })()}
                          {agrupamento === 'sensor' && sensoresFiltradosExt.map((sensor) => (
                            <SingleSensorChart key={sensor.id}
                              sensor={sensor} series={serieFiltradaExt} unidade={unidadeExt} />
                          ))}
                          {agrupamento === 'altura' && (() => {
                            const alturas = [...new Set(sensoresFiltradosExt.map((s) => s.altura_solo_m))].sort((a, b) => a - b);
                            return alturas.map((alt) => (
                              <MultiSensorChart key={alt}
                                titulo={`${alt} m — ${GRANDEZA_LABELS[grandezaExterna]}${unidadeExt ? ` (${unidadeExt})` : ''}`}
                                series={serieFiltradaExt}
                                sensores={sensoresFiltradosExt.filter((s) => s.altura_solo_m === alt)}
                                valor={valorTipo} unidade={unidadeExt} />
                            ));
                          })()}
                        </div>
                      )
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
