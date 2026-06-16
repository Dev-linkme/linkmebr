import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Sparkles, Search, Info, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getPrevisoes } from '../services/ia';
import type { Silo, Barra, Sensor, LeituraInterna, Regra, IaPrevisoes } from '../types/index';

// ─── Constants ────────────────────────────────────────────────────────────────

const LINE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

type GrandezaTipo = 'temperatura' | 'umidade' | 'co2';
const GRANDEZA_TABS: { key: GrandezaTipo; label: string }[] = [
  { key: 'temperatura', label: 'Temperatura' },
  { key: 'umidade',     label: 'Umidade' },
  { key: 'co2',         label: 'CO₂' },
];
type SubAba            = 'tabela' | 'grafico';
type AgrupamentoGrafico = 'barra' | 'sensor' | 'altura';
type SortField          = 'valor_avg' | 'valor_max' | 'valor_min';
type SortDir            = 'asc' | 'desc';

const AGRUPAMENTO_LABELS: Record<AgrupamentoGrafico, string> = {
  barra: 'Cabo Pêndulo', sensor: 'Sensor', altura: 'Altura',
};
const BRT = 'America/Sao_Paulo';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FiltrosForm { silo_id: string; barra_id: string; sensor_id: string; }

interface GraficoSerie   { sensor_id: number; bucket: string; avg: number; max: number; min: number; }
interface GraficoSensor  {
  id: number; id_labrador: number | null; identificacao: string; tipo_grandeza: GrandezaTipo;
  unidade_medida: string; altura_solo_m: number;
  barra_id: number; barra_id_labrador: number | null; barra_identificacao: string;
}
interface GraficoResponse { series: GraficoSerie[]; sensores: GraficoSensor[]; }
interface RelatorioResponse { dados: LeituraInterna[]; pagina: number; total_paginas: number; total: number; }

// Ponto unificado do gráfico: timestamp + valores reais (r_N) e previsão (p_N)
type ChartPoint = { ts: string; [key: string]: number | string | null };

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
function fmtSensor(val: number | null | undefined, tipo: string): string {
  if (val == null) return '—';
  return tipo === 'temperatura' ? val.toFixed(1) : val.toFixed(0);
}
function sensorLabel(s: { identificacao: string; barra_identificacao: string; altura_solo_m: number }): string {
  return `${s.barra_identificacao} - ${s.identificacao} (${s.altura_solo_m}m)`;
}
function yDomainFrom(values: (number | undefined | null)[]): [number, number] {
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const v of values) {
    if (v != null && !isNaN(v) && isFinite(v)) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (!isFinite(yMin)) return [0, 100];
  const yPad = Math.max((yMax - yMin) * 0.15, 2);
  return [Math.floor(yMin - yPad), Math.ceil(yMax + yPad)];
}

// Chave composta para mapeamento previsão → sensor real.
// sensor_id da previsão é id_labrador do sensor, mas só é único dentro de uma barra.
function barraSensorKey(barraIdLabrador: number, sensorIdLabrador: number): string {
  return `${barraIdLabrador}_${sensorIdLabrador}`;
}

// Mescla dados reais e previsão numa linha de tempo unificada.
// Normaliza os sensor_id da previsão (id_labrador) para IDs internos via sensorByBarraSensor.
function buildChartData(
  realSeries: GraficoSerie[],
  realSensores: GraficoSensor[],
  previsoes: IaPrevisoes | null,
  prevSensoresFiltrados: IaPrevisoes['sensores'],
  sensorByBarraSensor: Map<string, GraficoSensor>,
): ChartPoint[] {
  const map = new Map<string, Record<string, number>>();

  const set = (ts: string, key: string, val: number) => {
    if (!map.has(ts)) map.set(ts, {});
    map.get(ts)![key] = val;
  };

  realSeries.forEach((s) => {
    if (realSensores.some((x) => x.id === s.sensor_id)) {
      set(s.bucket, `r_${s.sensor_id}`, s.avg);
    }
  });

  if (previsoes) {
    previsoes.timestamps.forEach((ts, i) => {
      prevSensoresFiltrados.forEach((s) => {
        const internalSensor = sensorByBarraSensor.get(barraSensorKey(s.barra_id, s.sensor_id));
        if (!internalSensor) return;
        set(ts, `p_${internalSensor.id}`, s.valores[i]);
      });
    });
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ts, vals]) => ({ ts, ...vals }));
}

// ─── Paginacao ────────────────────────────────────────────────────────────────

function Paginacao({ pagina, totalPaginas, loading, onPageChange }: {
  pagina: number; totalPaginas: number; loading: boolean; onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
      <p className="text-sm text-gray-600">Página {pagina} / {totalPaginas}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(pagina - 1)} disabled={pagina <= 1 || loading}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={15} />Anterior
        </button>
        <button onClick={() => onPageChange(pagina + 1)} disabled={pagina >= totalPaginas || loading}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          Próximo<ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Gráfico Previsão ─────────────────────────────────────────────────────────

function PrevisaoChart({
  titulo, chartData, realSensores, prevSensores, unidade,
}: {
  titulo?: string;
  chartData: ChartPoint[];
  realSensores: GraficoSensor[];
  prevSensores: IaPrevisoes['sensores'];
  unidade: string;
}) {
  const nowTs = new Date().toISOString();
  if (realSensores.length === 0 && prevSensores.length === 0) return null;

  const allSensoresIds = [
    ...new Set([...realSensores.map((s) => s.id), ...prevSensores.map((s) => s.sensor_id)]),
  ];

  const yDomain = yDomainFrom(
    chartData.flatMap((row) =>
      allSensoresIds.flatMap((id) => [
        row[`r_${id}`] as number | null,
        row[`p_${id}`] as number | null,
      ])
    )
  );

  const findMeta = (sensorId: number): { identificacao: string; barra_identificacao: string; altura_solo_m: number } => {
    const real = realSensores.find((s) => s.id === sensorId);
    if (real) return { identificacao: real.identificacao, barra_identificacao: real.barra_identificacao, altura_solo_m: real.altura_solo_m };
    const prev = prevSensores.find((s) => s.sensor_id === sensorId);
    if (prev) return { identificacao: `Sensor ${sensorId}`, barra_identificacao: `Barra ${prev.barra_id}`, altura_solo_m: prev.altura_solo_m };
    return { identificacao: `Sensor ${sensorId}`, barra_identificacao: '—', altura_solo_m: 0 };
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      {titulo && <h3 className="text-sm font-semibold text-gray-700 mb-3">{titulo}</h3>}
      <div className="flex items-center gap-4 mb-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-2 border-gray-700" /> Leitura real</span>
        <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-2 border-dashed border-gray-700" /> Previsão IA</span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 4, right: 24, left: 16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="ts" tickFormatter={formatTimestamp} tick={{ fontSize: 11 }} minTickGap={60} />
          <YAxis width={60} tick={{ fontSize: 11 }} domain={yDomain}
            label={{ value: unidade, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11 } }} />
          <Tooltip
            labelFormatter={(v) => formatTimestamp(String(v))}
            formatter={(val, name) => {
              const n = String(name ?? '');
              const isPrevisao = n.startsWith('p_');
              const sId = Number(n.replace(/^[rp]_/, ''));
              const meta = findMeta(sId);
              const label = `${sensorLabel(meta)} — ${isPrevisao ? 'Previsão IA' : 'Real'}`;
              return [`${typeof val === 'number' ? val.toFixed(2) : val} ${unidade}`, label];
            }}
          />
          <Legend
            formatter={(v) => {
              const n = String(v ?? '');
              const isPrevisao = n.startsWith('p_');
              const sId = Number(n.replace(/^[rp]_/, ''));
              const meta = findMeta(sId);
              return `${sensorLabel(meta)} (${isPrevisao ? 'Previsão' : 'Real'})`;
            }}
          />
          {/* Linha "Agora" */}
          <ReferenceLine
            x={nowTs}
            stroke="#6b7280"
            strokeDasharray="4 4"
            label={{ value: 'Agora', position: 'insideTopLeft', fontSize: 11, fill: '#6b7280' }}
          />
          {allSensoresIds.map((sId, idx) => {
            const color = LINE_COLORS[idx % LINE_COLORS.length];
            const hasReal = realSensores.some((s) => s.id === sId);
            const hasPrev = prevSensores.some((s) => s.sensor_id === sId);
            return [
              hasReal && (
                <Line key={`r_${sId}`} type="monotone" dataKey={`r_${sId}`}
                  stroke={color} strokeWidth={2} dot={false} connectNulls />
              ),
              hasPrev && (
                <Line key={`p_${sId}`} type="monotone" dataKey={`p_${sId}`}
                  stroke={color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
              ),
            ].filter(Boolean);
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── StatusAnaliseBadge simplificado ─────────────────────────────────────────

function StatusAnaliseBadge({ status, regras }: { status: string | null | undefined; regras: Regra[] }) {
  if (!status) return <span className="text-gray-300">—</span>;
  const itens = status.split(',').map((c) => c.trim()).filter(Boolean).map((codigo) => {
    const r = regras.find((x) => x.codigo === codigo);
    return r ?? { codigo, criterio: codigo, logica: '', severidade: 'erro' as const };
  });
  if (itens.length === 0) return <span className="text-gray-300">—</span>;
  const temErro = itens.some((i) => i.severidade === 'erro');
  const badgeCls = temErro ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-yellow-100 text-yellow-700 border border-yellow-200';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeCls}`}>
      {itens.map((i) => i.codigo).join(', ')}
    </span>
  );
}

// ─── SortIcon ─────────────────────────────────────────────────────────────────

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField | null; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronDown size={14} className="text-gray-300 inline ml-1" />;
  return sortDir === 'asc'
    ? <ChevronUp size={14} className="text-primary-600 inline ml-1" />
    : <ChevronDown size={14} className="text-primary-600 inline ml-1" />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IaPrevisaoPage() {
  const { register, handleSubmit, watch, setValue } = useForm<FiltrosForm>({
    defaultValues: { silo_id: '', barra_id: '', sensor_id: '' },
  });

  const siloId   = watch('silo_id');
  const barraId  = watch('barra_id');

  const [silos,    setSilos]    = useState<Silo[]>([]);
  const [barras,   setBarras]   = useState<Barra[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);
  const [regras,   setRegras]   = useState<Regra[]>([]);

  const [grandeza,    setGrandeza]    = useState<GrandezaTipo>('temperatura');
  const [subAba,      setSubAba]      = useState<SubAba>('grafico');
  const [agrupamento, setAgrupamento] = useState<AgrupamentoGrafico>('barra');

  const [previsoes,    setPrevisoes]    = useState<IaPrevisoes | null>(null);
  const [grafico,      setGrafico]      = useState<GraficoResponse | null>(null);
  const [leituras,     setLeituras]     = useState<LeituraInterna[]>([]);
  const [pagina,       setPagina]       = useState(1);
  const [totalPags,    setTotalPags]    = useState(0);
  const [loadingMain,  setLoadingMain]  = useState(false);
  const [loadingTabela,setLoadingTabela]= useState(false);

  const [consultado,   setConsultado]   = useState(false);
  const [lastSiloId,   setLastSiloId]   = useState('');
  const [lastFiltros,  setLastFiltros]  = useState<FiltrosForm | null>(null);
  const [erroPrevisao, setErroPrevisao] = useState<string | null>(null);
  const [sortField,    setSortField]    = useState<SortField | null>(null);
  const [sortDir,      setSortDir]      = useState<SortDir>('asc');

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => setSilos((res.data.data ?? []).filter((s) => s.status === 'ativo')))
      .catch(() => toast.error('Erro ao carregar silos'));
    api.get<Regra[]>('/regras').then((res) => setRegras(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setBarras([]); setSensores([]);
    setValue('barra_id', ''); setValue('sensor_id', '');
    setConsultado(false); setPrevisoes(null); setGrafico(null); setLeituras([]);
    if (!siloId) return;
    api.get<{ data: Barra[] }>(`/silos/${siloId}/barras?per_page=200`)
      .then((res) => setBarras(res.data.data ?? []))
      .catch(() => toast.error('Erro ao carregar cabos pêndulo'));
  }, [siloId, setValue]);

  useEffect(() => {
    setSensores([]); setValue('sensor_id', '');
    if (!barraId) return;
    api.get<{ data: Sensor[] }>(`/barras/${barraId}/sensores?per_page=200`)
      .then((res) => setSensores(res.data.data ?? []))
      .catch(() => toast.error('Erro ao carregar sensores'));
  }, [barraId, setValue]);

  const now24hAgo = () => new Date(Date.now() - 24 * 3_600_000).toISOString();

  const fetchTabela = useCallback(async (f: FiltrosForm, page: number) => {
    setLoadingTabela(true);
    try {
      const params: Record<string, string | number> = {
        silo_id: f.silo_id, page, limit: 50,
        data_inicio: now24hAgo(), data_fim: new Date().toISOString(),
      };
      if (f.barra_id)  params.barra_id  = f.barra_id;
      if (f.sensor_id) params.sensor_id = f.sensor_id;
      const res = await api.get<RelatorioResponse>('/relatorios/leituras', { params });
      setLeituras(res.data.dados); setPagina(res.data.pagina); setTotalPags(res.data.total_paginas);
    } catch { toast.error('Erro ao carregar leituras'); }
    finally  { setLoadingTabela(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (filtros: FiltrosForm) => {
    if (!filtros.silo_id) { toast.error('Selecione um silo'); return; }
    setLoadingMain(true);
    setConsultado(false);
    setErroPrevisao(null);
    setLastFiltros(filtros);
    setLastSiloId(filtros.silo_id);
    setPagina(1);
    setSortField(null);

    const params: Record<string, string> = {
      silo_id: filtros.silo_id,
      data_inicio: now24hAgo(),
      data_fim: new Date().toISOString(),
    };
    if (filtros.barra_id)  params.barra_id  = filtros.barra_id;
    if (filtros.sensor_id) params.sensor_id = filtros.sensor_id;

    const [graficoRes, previsoesRes] = await Promise.allSettled([
      api.get<GraficoResponse>('/relatorios/leituras/grafico', { params }),
      getPrevisoes(filtros.silo_id),
    ]);

    setGrafico(graficoRes.status === 'fulfilled' ? graficoRes.value.data : null);

    if (previsoesRes.status === 'fulfilled') {
      setPrevisoes(previsoesRes.value);
    } else {
      const status = (previsoesRes.reason as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setErroPrevisao('Projeções ainda não disponíveis. O modelo precisa ser treinado antes de gerar previsões.');
      } else {
        setErroPrevisao('Não foi possível carregar as previsões da IA.');
      }
      setPrevisoes(null);
    }

    await fetchTabela(filtros, 1);
    setConsultado(true);
    setLoadingMain(false);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const handlePage = (p: number) => { if (lastFiltros) { setPagina(p); fetchTabela(lastFiltros, p); } };

  // ── CSS helpers ───────────────────────────────────────────────────────────

  const grandezaTabCls = (g: GrandezaTipo) =>
    `px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
      grandeza === g
        ? 'border-primary-500 text-primary-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;
  const subTabCls = (sub: SubAba) =>
    `px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
      sub === subAba ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;
  const btnGroupCls = (active: boolean) =>
    `px-3 py-1.5 text-sm font-medium transition-colors border ${
      active ? 'bg-primary-600 text-white border-primary-600 z-10' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
    }`;

  // ── Dados derivados por grandeza ──────────────────────────────────────────

  const realSensoresFiltrados = (grafico?.sensores ?? []).filter((s) => s.tipo_grandeza === grandeza);
  const realSeriesFiltradas   = (grafico?.series  ?? []).filter((s) =>
    realSensoresFiltrados.some((x) => x.id === s.sensor_id)
  );

  // Mapa composto (barra_id_labrador + sensor_id_labrador) → sensor real interno.
  // sensor_id da previsão só é único dentro de uma barra, nunca globalmente.
  const sensorByBarraSensor = new Map<string, GraficoSensor>();
  (grafico?.sensores ?? []).forEach((s) => {
    if (s.id_labrador != null && s.barra_id_labrador != null) {
      sensorByBarraSensor.set(barraSensorKey(s.barra_id_labrador, s.id_labrador), s);
    }
  });
  const barraIdLabradorAtivos = new Set(
    barras.map((b) => b.id_labrador).filter((v): v is number => v != null)
  );

  const prevSensoresFiltrados = (previsoes?.sensores ?? []).filter((s) =>
    s.tipo_grandeza === grandeza &&
    barraIdLabradorAtivos.has(s.barra_id) &&
    sensorByBarraSensor.has(barraSensorKey(s.barra_id, s.sensor_id))
  );
  // Normaliza prevSensores: substitui id_labrador por IDs internos para agrupamentos
  const prevSensoresNorm = prevSensoresFiltrados.map((s) => {
    const interno = sensorByBarraSensor.get(barraSensorKey(s.barra_id, s.sensor_id));
    return { ...s, sensor_id: interno?.id ?? s.sensor_id, barra_id: interno?.barra_id ?? s.barra_id };
  });

  const unidade = realSensoresFiltrados[0]?.unidade_medida ?? (grandeza === 'temperatura' ? '°C' : grandeza === 'umidade' ? '%' : 'ppm');

  const chartData = buildChartData(realSeriesFiltradas, realSensoresFiltrados, previsoes, prevSensoresFiltrados, sensorByBarraSensor);

  const grandezasComDados = new Set([
    ...(grafico?.sensores ?? []).map((s) => s.tipo_grandeza),
    ...(previsoes?.sensores ?? []).map((s) => s.tipo_grandeza),
  ]) as Set<GrandezaTipo>;

  const dadosFiltrados = [...leituras]
    .filter((l) => l.sensor?.tipo_grandeza === grandeza)
    .sort((a, b) => {
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

  const temDadosGrafico = realSensoresFiltrados.length > 0 || prevSensoresNorm.length > 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Sparkles size={28} className="text-primary-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Previsão IA</h1>
          <p className="text-sm text-gray-500 mt-0.5">Leituras reais (últimas 24h) + projeções do modelo (próximas 48h)</p>
        </div>
      </div>

      {/* Filtros */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Silo *</label>
            <select {...register('silo_id', { required: true })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Selecione...</option>
              {silos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cabo Pêndulo (opcional)</label>
            <select {...register('barra_id')} disabled={!siloId}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed">
              <option value="">Todos os cabos pêndulo</option>
              {barras.filter((b) => b.local === 'interno ao silo').map((b) => (
                <option key={b.id} value={b.id}>{b.identificacao}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sensor (opcional)</label>
            <select {...register('sensor_id')} disabled={!barraId}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed">
              <option value="">Todos os sensores</option>
              {sensores.map((s) => <option key={s.id} value={s.id}>{s.identificacao} ({s.altura_solo_m}m)</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={loadingMain || !siloId}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-5 py-2 rounded-md text-sm font-medium transition-colors">
            <Search size={15} />
            {loadingMain ? 'Carregando...' : 'Consultar'}
          </button>
        </div>
      </form>

      {/* Resultados */}
      {consultado && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Banner previsão */}
          {previsoes && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-primary-50 border-b border-primary-100 text-sm text-primary-700">
              <Info size={14} className="flex-shrink-0" />
              Projeções geradas em {formatFullTimestamp(previsoes.gerado_em)} · Horizonte: {previsoes.horizonte_horas}h · Intervalo: {previsoes.intervalo_minutos} min
            </div>
          )}
          {erroPrevisao && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-sm text-amber-700">
              <Info size={14} className="flex-shrink-0" />
              {erroPrevisao}
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Abas grandeza */}
            <div className="flex border-b border-gray-100 -mt-1">
              {GRANDEZA_TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setGrandeza(key)}
                  className={`${grandezaTabCls(key)} ${!grandezasComDados.has(key) ? 'opacity-40' : ''}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Sub-abas Tabela / Gráfico */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button onClick={() => setSubAba('grafico')} className={subTabCls('grafico')}>Gráfico</button>
                <button onClick={() => setSubAba('tabela')}  className={subTabCls('tabela')}>Tabela</button>
              </div>
              {subAba === 'grafico' && (
                <span className="text-xs text-gray-400">
                  {silos.find((s) => String(s.id) === lastSiloId)?.nome ?? `Silo ${lastSiloId}`}
                </span>
              )}
            </div>

            {/* ── Gráfico ── */}
            {subAba === 'grafico' && (
              loadingMain ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : !temDadosGrafico ? (
                <p className="text-center text-gray-400 text-sm py-10">
                  Nenhum dado disponível para {grandeza === 'co2' ? 'CO₂' : grandeza === 'temperatura' ? 'Temperatura' : 'Umidade'} com os filtros selecionados.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Agrupamento */}
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

                  {/* Barra: um gráfico por barra */}
                  {agrupamento === 'barra' && (() => {
                    const barrasMap = new Map<number, string>();
                    realSensoresFiltrados.forEach((s) => barrasMap.set(s.barra_id, s.barra_identificacao));
                    prevSensoresNorm.forEach((s) => {
                      if (!barrasMap.has(s.barra_id)) {
                        const nome = realSensoresFiltrados.find((r) => r.barra_id === s.barra_id)?.barra_identificacao ?? `Barra ${s.barra_id}`;
                        barrasMap.set(s.barra_id, nome);
                      }
                    });
                    return [...barrasMap.entries()].map(([barraIdN, barraIdent]) => (
                      <PrevisaoChart key={barraIdN}
                        titulo={`${barraIdent} — ${grandeza === 'temperatura' ? 'Temperatura' : grandeza === 'umidade' ? 'Umidade' : 'CO₂'}${unidade ? ` (${unidade})` : ''}`}
                        chartData={chartData}
                        realSensores={realSensoresFiltrados.filter((s) => s.barra_id === barraIdN)}
                        prevSensores={prevSensoresNorm.filter((s) => s.barra_id === barraIdN)}
                        unidade={unidade}
                      />
                    ));
                  })()}

                  {/* Sensor: um gráfico por sensor */}
                  {agrupamento === 'sensor' && (() => {
                    const allIds = [...new Set([
                      ...realSensoresFiltrados.map((s) => s.id),
                      ...prevSensoresNorm.map((s) => s.sensor_id),
                    ])];
                    return allIds.map((sId) => {
                      const real = realSensoresFiltrados.filter((s) => s.id === sId);
                      const prev = prevSensoresNorm.filter((s) => s.sensor_id === sId);
                      const meta = real[0] ?? { identificacao: `Sensor ${sId}`, barra_identificacao: `Barra ${prev[0]?.barra_id ?? '?'}`, altura_solo_m: prev[0]?.altura_solo_m ?? 0 };
                      return (
                        <PrevisaoChart key={sId}
                          titulo={sensorLabel(meta)}
                          chartData={chartData}
                          realSensores={real}
                          prevSensores={prev}
                          unidade={unidade}
                        />
                      );
                    });
                  })()}

                  {/* Altura: um gráfico por altura */}
                  {agrupamento === 'altura' && (() => {
                    const alts = [...new Set([
                      ...realSensoresFiltrados.map((s) => s.altura_solo_m),
                      ...prevSensoresNorm.map((s) => s.altura_solo_m),
                    ])].sort((a, b) => a - b);
                    return alts.map((alt) => (
                      <PrevisaoChart key={alt}
                        titulo={`${alt} m — ${grandeza === 'temperatura' ? 'Temperatura' : grandeza === 'umidade' ? 'Umidade' : 'CO₂'}${unidade ? ` (${unidade})` : ''}`}
                        chartData={chartData}
                        realSensores={realSensoresFiltrados.filter((s) => s.altura_solo_m === alt)}
                        prevSensores={prevSensoresNorm.filter((s) => s.altura_solo_m === alt)}
                        unidade={unidade}
                      />
                    ));
                  })()}
                </div>
              )
            )}

            {/* ── Tabela (leituras reais) ── */}
            {subAba === 'tabela' && (
              loadingTabela ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : dadosFiltrados.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">Nenhuma leitura real encontrada nas últimas 24h para os filtros selecionados.</p>
              ) : (
                <div className="rounded-lg border border-gray-200 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Data/Hora</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Cabo Pêndulo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Sensor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Altura (m)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Unidade</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-900"
                          onClick={() => handleSort('valor_avg')}>
                          Média<SortIcon field="valor_avg" sortField={sortField} sortDir={sortDir} />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-900"
                          onClick={() => handleSort('valor_max')}>
                          Máximo<SortIcon field="valor_max" sortField={sortField} sortDir={sortDir} />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-900"
                          onClick={() => handleSort('valor_min')}>
                          Mínimo<SortIcon field="valor_min" sortField={sortField} sortDir={sortDir} />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Amostras</th>
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
                            <td className="px-4 py-3 whitespace-nowrap"><StatusAnaliseBadge status={leitura.status_analise} regras={regras} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {totalPags > 1 && <Paginacao pagina={pagina} totalPaginas={totalPags} loading={loadingTabela} onPageChange={handlePage} />}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
