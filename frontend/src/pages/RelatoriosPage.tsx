import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import {
  BarChart2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, Search,
} from 'lucide-react';
import api from '../services/api';
import type { Silo, Barra, Sensor, LeituraInterna, LeituraExterna, Regra } from '../types/index';

// ─── Constants ──────────────────────────────────────────────────────────────────

const LINE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

type GrandezaTipo = 'temperatura' | 'umidade' | 'co2';
const GRANDEZA_LABELS: Record<GrandezaTipo, string> = {
  temperatura: 'Temperatura', umidade: 'Umidade', co2: 'CO₂',
};

// ─── Types ───────────────────────────────────────────────────────────────────────

interface FiltrosForm {
  silo_id: string; barra_id: string; sensor_id: string;
  data_inicio: string; data_fim: string;
}

type SortField = 'valor_avg' | 'valor_max' | 'valor_min';
type SortDir   = 'asc' | 'desc';
type ValorTipo = 'avg' | 'min' | 'max';
type AbaAtiva  = 'interna' | 'externa';
type SubAba    = 'tabela'  | 'grafico';

const VALOR_LABELS: Record<ValorTipo, string> = { avg: 'Média', min: 'Mínimo', max: 'Máximo' };

interface RelatorioResponse         { dados: LeituraInterna[];  pagina: number; total_paginas: number; total: number; }
interface RelatorioExternoResponse  { dados: LeituraExterna[];  pagina: number; total_paginas: number; total: number; }

interface GraficoSerie   { sensor_id: number; bucket: string; avg: number; max: number; min: number; }
interface GraficoSensor  { id: number; identificacao: string; tipo_grandeza: GrandezaTipo; unidade_medida: string; altura_solo_m: number; }
interface GraficoResponse { series: GraficoSerie[]; sensores: GraficoSensor[]; }

interface GraficoExternoSerie   { sensor_id: number; bucket: string; avg_temp: number | null; avg_umid: number | null; }
interface GraficoExternoSensor  { id: number; identificacao: string; altura_solo_m: number; }
interface GraficoExternoResponse { series: GraficoExternoSerie[]; sensores: GraficoExternoSensor[]; }

type RangeHint = { data_inicio: string | null; data_fim: string | null } | null;

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatFullTimestamp(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatRangeDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return formatFullTimestamp(ts);
}
function formatNum(val: number | undefined | null, decimals = 2): string {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

// ─── GrandezaChart ───────────────────────────────────────────────────────────────

function GrandezaChart({ grandeza, series, sensores, valor }: {
  grandeza: GrandezaTipo; series: GraficoSerie[]; sensores: GraficoSensor[]; valor: ValorTipo;
}) {
  const sens = sensores.filter((s) => s.tipo_grandeza === grandeza);
  if (sens.length === 0) return null;
  const seriesFilt = series.filter((s) => sens.some((x) => x.id === s.sensor_id));
  if (seriesFilt.length === 0) return null;
  const buckets = Array.from(new Set(seriesFilt.map((s) => s.bucket))).sort();
  const chartData = buckets.map((bucket) => {
    const row: Record<string, unknown> = { bucket };
    sens.forEach((s) => {
      const p = seriesFilt.find((d) => d.bucket === bucket && d.sensor_id === s.id);
      if (p) row[String(s.id)] = p[valor];
    });
    return row;
  });
  const unidade = sens[0]?.unidade_medida ?? '';
  const yValues = chartData.flatMap((row) =>
    sens.map((s) => row[String(s.id)] as number | undefined).filter((v): v is number => v != null)
  );
  const yMin = yValues.length > 0 ? Math.min(...yValues) : 0;
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 100;
  const yPad = Math.max((yMax - yMin) * 0.1, 0.5);
  const yDomain: [number, number] = [
    Math.floor((yMin - yPad) * 10) / 10,
    Math.ceil((yMax + yPad) * 10) / 10,
  ];
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{GRANDEZA_LABELS[grandeza]}{unidade ? ` (${unidade})` : ''}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="bucket" tickFormatter={formatTimestamp} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} domain={yDomain} label={{ value: unidade, angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
          <Tooltip labelFormatter={(v) => formatTimestamp(String(v))} formatter={(val, name) => {
            const s = sens.find((x) => String(x.id) === String(name));
            return [`${typeof val === 'number' ? val.toFixed(2) : val} ${unidade}`, s ? `${s.identificacao} (${s.altura_solo_m}m)` : String(name)];
          }} />
          <Legend formatter={(v) => { const s = sens.find((x) => String(x.id) === v); return s ? `${s.identificacao} (${s.altura_solo_m}m)` : v; }} />
          {sens.map((s, idx) => (
            <Line key={s.id} type="monotone" dataKey={String(s.id)} stroke={LINE_COLORS[idx % LINE_COLORS.length]} dot={false} strokeWidth={2} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── ExternoChart ────────────────────────────────────────────────────────────────

function ExternoChart({ campo, label, unidade, series, sensores }: {
  campo: 'avg_temp' | 'avg_umid'; label: string; unidade: string;
  series: GraficoExternoSerie[]; sensores: GraficoExternoSensor[];
}) {
  const buckets = Array.from(new Set(series.map((s) => s.bucket))).sort();
  if (buckets.length === 0) return null;
  const chartData = buckets.map((bucket) => {
    const row: Record<string, unknown> = { bucket };
    sensores.forEach((s) => {
      const p = series.find((d) => d.bucket === bucket && Number(d.sensor_id) === Number(s.id));
      if (p && p[campo] != null) row[String(s.id)] = p[campo];
    });
    return row;
  });
  const yValues = chartData.flatMap((row) =>
    sensores.map((s) => row[String(s.id)] as number | undefined).filter((v): v is number => v != null)
  );
  const yMin = yValues.length > 0 ? Math.min(...yValues) : 0;
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 100;
  const yPad = Math.max((yMax - yMin) * 0.1, 0.5);
  const yDomain: [number, number] = [
    Math.floor((yMin - yPad) * 10) / 10,
    Math.ceil((yMax + yPad) * 10) / 10,
  ];
  if (yValues.length === 0) return null;
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{label}{unidade ? ` (${unidade})` : ''}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="bucket" tickFormatter={formatTimestamp} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} domain={yDomain} />
          <Tooltip labelFormatter={(v) => formatTimestamp(String(v))} formatter={(val, name) => {
            const s = sensores.find((x) => String(x.id) === String(name));
            return [`${typeof val === 'number' ? val.toFixed(2) : val} ${unidade}`, s ? `${s.identificacao} (${s.altura_solo_m}m)` : String(name)];
          }} />
          <Legend formatter={(v) => { const s = sensores.find((x) => String(x.id) === v); return s ? `${s.identificacao} (${s.altura_solo_m}m)` : v; }} />
          {sensores.map((s, idx) => (
            <Line key={s.id} type="monotone" dataKey={String(s.id)} stroke={LINE_COLORS[idx % LINE_COLORS.length]} dot={false} strokeWidth={2} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Paginacao ───────────────────────────────────────────────────────────────────

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

// ─── Status Análise ───────────────────────────────────────────────────────────────

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
            <span className={i.severidade === 'erro' ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>
              [{i.codigo}]
            </span>{' '}
            <span className="font-medium">{i.criterio}:</span> {i.logica}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const { t } = useTranslation();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FiltrosForm>({
    defaultValues: { silo_id: '', barra_id: '', sensor_id: '', data_inicio: '', data_fim: '' },
  });

  const siloId    = watch('silo_id');
  const barraId   = watch('barra_id');
  const sensorId  = watch('sensor_id');
  const dataInicio = watch('data_inicio');

  // Select options
  const [silos,    setSilos]    = useState<Silo[]>([]);
  const [barras,   setBarras]   = useState<Barra[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);

  // Catálogo de regras de análise
  const [regras, setRegras] = useState<Regra[]>([]);

  // Derived tab visibility
  const hasInterna = barras.some((b) => b.local === 'interno ao silo');
  const hasExterna = barras.some((b) => b.local === 'externo ao silo');

  // Tabs
  const [abaAtiva,      setAbaAtiva]      = useState<AbaAtiva>('interna');
  const [subAbaInterna, setSubAbaInterna] = useState<SubAba>('tabela');
  const [subAbaExterna, setSubAbaExterna] = useState<SubAba>('tabela');

  // Range hints
  const [rangeInterna, setRangeInterna] = useState<RangeHint>(null);
  const [rangeExterna, setRangeExterna] = useState<RangeHint>(null);

  // Leituras Internas
  const [dados,              setDados]              = useState<LeituraInterna[]>([]);
  const [grafico,            setGrafico]            = useState<GraficoResponse | null>(null);
  const [loadingInterna,     setLoadingInterna]     = useState(false);
  const [loadingGrafInterna, setLoadingGrafInterna] = useState(false);
  const [paginaInterna,      setPaginaInterna]      = useState(1);
  const [totalPagInterna,    setTotalPagInterna]    = useState(0);

  // Leituras Externas
  const [dadosExternos,      setDadosExternos]      = useState<LeituraExterna[]>([]);
  const [graficoExterno,     setGraficoExterno]     = useState<GraficoExternoResponse | null>(null);
  const [loadingExterna,     setLoadingExterna]     = useState(false);
  const [loadingGrafExterna, setLoadingGrafExterna] = useState(false);
  const [paginaExterna,      setPaginaExterna]      = useState(1);
  const [totalPagExterna,    setTotalPagExterna]    = useState(0);

  // Export
  const [loadingExportInt, setLoadingExportInt] = useState(false);
  const [loadingExportExt, setLoadingExportExt] = useState(false);

  // Sort (interna)
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir,   setSortDir]   = useState<SortDir>('asc');
  const [valorTipo, setValorTipo] = useState<ValorTipo>('avg');

  const [lastFiltros, setLastFiltros] = useState<FiltrosForm | null>(null);

  // ── Load silos + regras ───────────────────────────────────────────────────────
  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => setSilos((res.data.data ?? []).filter((s) => s.status === 'ativo')))
      .catch(() => toast.error('Erro ao carregar silos'));
    api.get<Regra[]>('/regras')
      .then((res) => setRegras(res.data))
      .catch(() => {});
  }, []);

  // ── Load barras when silo changes ────────────────────────────────────────────
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
      .catch(() => toast.error('Erro ao carregar barras'));
  }, [siloId, setValue]);

  // ── Auto-select valid tab when barras load ───────────────────────────────────
  useEffect(() => {
    if (!siloId) return;
    setAbaAtiva((prev) => {
      if (prev === 'interna' && !barras.some((b) => b.local === 'interno ao silo')) return 'externa';
      if (prev === 'externa' && !barras.some((b) => b.local === 'externo ao silo')) return 'interna';
      return prev;
    });
  }, [barras, siloId]);

  // ── Load sensores when barra changes ─────────────────────────────────────────
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

  // ── Clear data when sensor changes ───────────────────────────────────────────
  useEffect(() => {
    setDados([]); setGrafico(null);
    setDadosExternos([]); setGraficoExterno(null);
    setLastFiltros(null);
  }, [sensorId]);

  // ── Fetch ranges ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!siloId) return;
    const p: Record<string, string> = { silo_id: siloId };
    if (barraId)  p.barra_id  = barraId;
    if (sensorId) p.sensor_id = sensorId;

    if (hasInterna)
      api.get<RangeHint>('/relatorios/leituras/range', { params: p }).then((r) => setRangeInterna(r.data)).catch(() => {});
    if (hasExterna)
      api.get<RangeHint>('/relatorios/leituras-externas/range', { params: p }).then((r) => setRangeExterna(r.data)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siloId, barraId, sensorId, hasInterna, hasExterna]);

  // ── Fetch functions ───────────────────────────────────────────────────────────

  const fetchInterna = useCallback(async (filtros: FiltrosForm, page: number) => {
    setLoadingInterna(true);
    try {
      const params: Record<string, string | number> = { silo_id: filtros.silo_id, page, limit: 50 };
      if (filtros.barra_id)    params.barra_id    = filtros.barra_id;
      if (filtros.sensor_id)   params.sensor_id   = filtros.sensor_id;
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<RelatorioResponse>('/relatorios/leituras', { params });
      setDados(res.data.dados);
      setPaginaInterna(res.data.pagina);
      setTotalPagInterna(res.data.total_paginas);
    } catch { toast.error('Erro ao consultar leituras internas'); }
    finally  { setLoadingInterna(false); }
  }, []);

  const fetchGraficoInterna = useCallback(async (filtros: FiltrosForm) => {
    setLoadingGrafInterna(true);
    try {
      const params: Record<string, string> = { silo_id: filtros.silo_id };
      if (filtros.barra_id)    params.barra_id    = filtros.barra_id;
      if (filtros.sensor_id)   params.sensor_id   = filtros.sensor_id;
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<GraficoResponse>('/relatorios/leituras/grafico', { params });
      setGrafico(res.data);
    } catch { toast.error('Erro ao carregar gráfico interno'); }
    finally  { setLoadingGrafInterna(false); }
  }, []);

  const fetchExterna = useCallback(async (filtros: FiltrosForm, page: number) => {
    setLoadingExterna(true);
    try {
      const params: Record<string, string | number> = { silo_id: filtros.silo_id, page, limit: 50 };
      if (filtros.barra_id)    params.barra_id    = filtros.barra_id;
      if (filtros.sensor_id)   params.sensor_id   = filtros.sensor_id;
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<RelatorioExternoResponse>('/relatorios/leituras-externas', { params });
      setDadosExternos(res.data.dados);
      setPaginaExterna(res.data.pagina);
      setTotalPagExterna(res.data.total_paginas);
    } catch { toast.error('Erro ao consultar leituras externas'); }
    finally  { setLoadingExterna(false); }
  }, []);

  const fetchGraficoExterna = useCallback(async (filtros: FiltrosForm) => {
    setLoadingGrafExterna(true);
    try {
      const params: Record<string, string> = { silo_id: filtros.silo_id };
      if (filtros.barra_id)    params.barra_id    = filtros.barra_id;
      if (filtros.sensor_id)   params.sensor_id   = filtros.sensor_id;
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<GraficoExternoResponse>('/relatorios/leituras-externas/grafico', { params });
      setGraficoExterno(res.data);
    } catch { toast.error('Erro ao carregar gráfico externo'); }
    finally  { setLoadingGrafExterna(false); }
  }, []);

  // ── Submit ───────────────────────────────────────────────────────────────────

  const onSubmit = (filtros: FiltrosForm) => {
    setLastFiltros(filtros);
    setSortField(null);
    setPaginaInterna(1); setPaginaExterna(1);

    if (hasInterna) { fetchInterna(filtros, 1); fetchGraficoInterna(filtros); }
    if (hasExterna) { fetchExterna(filtros, 1); fetchGraficoExterna(filtros); }
  };

  // ── Page change handlers ──────────────────────────────────────────────────────

  const handlePageInterna = (p: number) => {
    if (!lastFiltros) return;
    setPaginaInterna(p);
    fetchInterna(lastFiltros, p);
  };
  const handlePageExterna = (p: number) => {
    if (!lastFiltros) return;
    setPaginaExterna(p);
    fetchExterna(lastFiltros, p);
  };
  // ── Export ────────────────────────────────────────────────────────────────────

  const handleExportInterna = async () => {
    if (!lastFiltros) { toast.error('Execute uma consulta antes de exportar'); return; }
    setLoadingExportInt(true);
    try {
      const params: Record<string, string> = { silo_id: lastFiltros.silo_id };
      if (lastFiltros.data_inicio) params.data_inicio = lastFiltros.data_inicio;
      if (lastFiltros.data_fim)    params.data_fim    = lastFiltros.data_fim;
      const res = await api.get<string>('/relatorios/leituras/export', { params, responseType: 'text' });
      const csvText = typeof res.data === 'string' ? res.data : Papa.unparse(res.data as unknown as object[]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csvText], { type: 'text/csv;charset=utf-8;' }));
      a.download = `leituras_internas_silo_${lastFiltros.silo_id}_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      toast.success('CSV exportado');
    } catch { toast.error('Erro ao exportar CSV'); }
    finally   { setLoadingExportInt(false); }
  };

  const handleExportExterna = async () => {
    if (!lastFiltros) { toast.error('Execute uma consulta antes de exportar'); return; }
    setLoadingExportExt(true);
    try {
      const params: Record<string, string> = { silo_id: lastFiltros.silo_id };
      if (lastFiltros.data_inicio) params.data_inicio = lastFiltros.data_inicio;
      if (lastFiltros.data_fim)    params.data_fim    = lastFiltros.data_fim;
      const res = await api.get<string>('/relatorios/leituras-externas/export', { params, responseType: 'text' });
      const csvText = typeof res.data === 'string' ? res.data : Papa.unparse(res.data as unknown as object[]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csvText], { type: 'text/csv;charset=utf-8;' }));
      a.download = `leituras_externas_silo_${lastFiltros.silo_id}_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      toast.success('CSV exportado');
    } catch { toast.error('Erro ao exportar CSV'); }
    finally   { setLoadingExportExt(false); }
  };

  // ── Sort ──────────────────────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortedDados = [...dados].sort((a, b) => {
    if (!sortField) return 0;
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

  const grandezasPresentes = Array.from(new Set((grafico?.sensores ?? []).map((s) => s.tipo_grandeza))) as GrandezaTipo[];

  // ── Range hint for active tab ─────────────────────────────────────────────────

  const activeRange = abaAtiva === 'interna' ? rangeInterna : rangeExterna;

  // ── Tab style helpers ─────────────────────────────────────────────────────────

  const mainTabCls = (aba: AbaAtiva) =>
    `px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
      abaAtiva === aba
        ? 'border-primary-600 text-primary-600 bg-white'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  const subTabCls = (sub: SubAba, active: SubAba) =>
    `px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
      sub === active
        ? 'bg-primary-600 text-white'
        : 'text-gray-600 hover:bg-gray-100'
    }`;

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 size={28} className="text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t('relatorios.titulo')}</h1>
      </div>

      {/* Filter form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end">
          {/* Silo */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('relatorios.silo')} *</label>
            <select {...register('silo_id', { required: t('erros.campo_obrigatorio') })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Selecione...</option>
              {silos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            {errors.silo_id && <p className="text-xs text-red-500 mt-1">{errors.silo_id.message}</p>}
          </div>

          {/* Barra */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('relatorios.barra')}</label>
            <select {...register('barra_id')} disabled={!siloId}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed">
              <option value="">{t('relatorios.todas_barras')}</option>
              {barras.map((b) => <option key={b.id} value={b.id}>{b.identificacao}</option>)}
            </select>
          </div>

          {/* Sensor */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('relatorios.sensor')}</label>
            <select {...register('sensor_id')} disabled={!barraId}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed">
              <option value="">{t('relatorios.todos_sensores')}</option>
              {sensores.map((s) => <option key={s.id} value={s.id}>{s.identificacao} ({s.altura_solo_m}m)</option>)}
            </select>
          </div>

          {/* Data início */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('relatorios.data_inicio')}</label>
            <input type="datetime-local" {...register('data_inicio')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            {activeRange && <p className="text-xs text-gray-400 mt-1">Disponível: {formatRangeDate(activeRange.data_inicio)}</p>}
          </div>

          {/* Data fim */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('relatorios.data_fim')}</label>
            <input type="datetime-local" {...register('data_fim', {
              validate: (val) => !val || !dataInicio || new Date(val) >= new Date(dataInicio) || t('erros.data_invalida'),
            })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            {activeRange && <p className="text-xs text-gray-400 mt-1">Disponível: {formatRangeDate(activeRange.data_fim)}</p>}
            {errors.data_fim && <p className="text-xs text-red-500 mt-1">{errors.data_fim.message}</p>}
          </div>

          {/* Botão consultar */}
          <div className="xl:col-span-1">
            <button type="submit" disabled={loadingInterna || loadingExterna}
              className="w-full flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
              <Search size={15} />
              {(loadingInterna || loadingExterna) ? t('geral.carregando') : t('relatorios.consultar')}
            </button>
          </div>
        </div>
      </form>

      {/* Main tabs — visible after silo selected */}
      {siloId && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            {hasInterna && (
              <button onClick={() => setAbaAtiva('interna')} className={mainTabCls('interna')}>
                Leituras Internas
              </button>
            )}
            {hasExterna && (
              <button onClick={() => setAbaAtiva('externa')} className={mainTabCls('externa')}>
                Leituras Externas
              </button>
            )}
          </div>

          {/* ── ABA: Leituras Internas ── */}
          {abaAtiva === 'interna' && (
            <div className="p-4 space-y-4">
              {/* Sub-tab bar */}
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

              {/* Tabela interna */}
              {subAbaInterna === 'tabela' && (
                !lastFiltros ? (
                  <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                ) : loadingInterna ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                ) : dados.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">{t('relatorios.sem_dados')}</p>
                ) : (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_data')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_barra')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_sensor')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Altura (m)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_grandeza')}</th>
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
                          {sortedDados.map((leitura) => {
                            const sensor = leitura.sensor;
                            const barra  = leitura.sensor?.barra;
                            return (
                              <tr key={leitura.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatFullTimestamp(leitura.timestamp)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{barra?.identificacao ?? '—'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{sensor?.identificacao ?? `Sensor ${leitura.sensor_id}`}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{sensor?.altura_solo_m != null ? `${sensor.altura_solo_m} m` : '—'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700 capitalize">{sensor ? (GRANDEZA_LABELS[sensor.tipo_grandeza] ?? sensor.tipo_grandeza) : '—'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-500">{sensor?.unidade_medida ?? '—'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">{formatNum(leitura.valor_avg)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatNum(leitura.valor_max)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatNum(leitura.valor_min)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{leitura.num_amostras}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatNum(leitura.desvio_padrao)}</td>
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

              {/* Gráfico interno */}
              {subAbaInterna === 'grafico' && (
                !lastFiltros ? (
                  <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                ) : loadingGrafInterna ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                ) : !grafico || grafico.series.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">{t('relatorios.sem_dados')}</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Exibindo:</span>
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        {(['avg', 'min', 'max'] as ValorTipo[]).map((v) => (
                          <button key={v} onClick={() => setValorTipo(v)}
                            className={`px-4 py-1.5 text-sm font-medium transition-colors ${valorTipo === v ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                            {VALOR_LABELS[v]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {grandezasPresentes.map((g) => (
                      <GrandezaChart key={g} grandeza={g} series={grafico.series} sensores={grafico.sensores} valor={valorTipo} />
                    ))}
                  </>
                )
              )}
            </div>
          )}

          {/* ── ABA: Leituras Externas ── */}
          {abaAtiva === 'externa' && (
            <div className="p-4 space-y-4">
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

              {subAbaExterna === 'tabela' && (
                !lastFiltros ? (
                  <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                ) : loadingExterna ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                ) : dadosExternos.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">{t('relatorios.sem_dados')}</p>
                ) : (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_data')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_barra')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">{t('relatorios.coluna_sensor')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Temp. Média (°C)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Umid. Média (%)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Amostras</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Relé</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">SHT Online</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Firmware</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dadosExternos.map((leitura) => {
                            const sensor = leitura.sensor;
                            const barra  = sensor?.barra;
                            return (
                              <tr key={leitura.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatFullTimestamp(leitura.timestamp)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{barra?.identificacao ?? '—'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{sensor?.identificacao ?? `Sensor ${leitura.sensor_id}`}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">{formatNum(leitura.temp_avg)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatNum(leitura.umid_avg)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{leitura.n_amostras}</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {leitura.rele === null ? '—' : leitura.rele
                                    ? <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Ligado</span>
                                    : <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Desligado</span>}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {leitura.sht_online === null ? '—' : leitura.sht_online
                                    ? <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Online</span>
                                    : <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600">Offline</span>}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-xs">{leitura.fw}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {totalPagExterna > 1 && <Paginacao pagina={paginaExterna} totalPaginas={totalPagExterna} loading={loadingExterna} onPageChange={handlePageExterna} t={t} />}
                  </div>
                )
              )}

              {subAbaExterna === 'grafico' && (
                !lastFiltros ? (
                  <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                ) : loadingGrafExterna ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                ) : !graficoExterno || graficoExterno.series.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">{t('relatorios.sem_dados')}</p>
                ) : (
                  <>
                    <ExternoChart campo="avg_temp" label="Temperatura" unidade="°C" series={graficoExterno.series} sensores={graficoExterno.sensores} />
                    <ExternoChart campo="avg_umid" label="Umidade"     unidade="%" series={graficoExterno.series} sensores={graficoExterno.sensores} />
                  </>
                )
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
