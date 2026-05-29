import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import toast from 'react-hot-toast';
import { Activity, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import api from '../services/api';
import type { Silo, Barra, LabradorStatus, ComunicacaoStatus } from '../types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FiltrosForm {
  silo_id: string;
  barra_id: string;
  data_inicio: string;
  data_fim: string;
}

type AbaAtiva = 'operacional' | 'comunicacao';
type SubAba   = 'tabela' | 'grafico';
type RangeHint = { data_inicio: string | null; data_fim: string | null } | null;

interface LabradorRelatorioResponse {
  dados: LabradorStatus[]; pagina: number; total_paginas: number; total: number;
}
interface LabradorGraficoSerie {
  bucket: string; avg_cpu: number | null; avg_ram: number | null; avg_disk: number | null; avg_sd: number | null;
}
interface LabradorGraficoResponse { series: LabradorGraficoSerie[]; }

interface ComunicacaoResponse {
  dados: ComunicacaoStatus[]; pagina: number; total_paginas: number; total: number;
}
interface ComunicacaoGraficoSerie {
  barra_id: number; bucket: string;
  avg_rssi: number | null; avg_snr: number | null; avg_uptime: number | null;
}
interface ComunicacaoGraficoResponse {
  series: ComunicacaoGraficoSerie[];
  barras: { id: number; identificacao: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFullTimestamp(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatRangeDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return formatFullTimestamp(ts);
}
function formatNum(val: number | null | undefined, dec = 1): string {
  return val != null ? val.toFixed(dec) : '—';
}

function rssiColor(val: number | null): string {
  if (val == null) return 'text-gray-400';
  if (val > -70)  return 'text-green-700';
  if (val > -90)  return 'text-yellow-600';
  return 'text-red-600';
}
function percentColor(val: number | null): string {
  if (val == null) return 'text-gray-400';
  if (val > 80)  return 'text-red-600';
  if (val > 60)  return 'text-yellow-600';
  return 'text-green-700';
}

const LINE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ─── Sub-components ───────────────────────────────────────────────────────────

const LABRADOR_SERIES = [
  { key: 'avg_cpu'  as const, label: 'CPU (%)',     color: '#22c55e' },
  { key: 'avg_ram'  as const, label: 'RAM (%)',     color: '#3b82f6' },
  { key: 'avg_disk' as const, label: 'Disco (%)',   color: '#f59e0b' },
  { key: 'avg_sd'   as const, label: 'SD Card (%)', color: '#8b5cf6' },
];

function LabradorChart({ series }: { series: LabradorGraficoSerie[] }) {
  if (series.length === 0) return null;
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Uso de Recursos (%)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={series} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="bucket" tickFormatter={formatTimestamp} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
          <Tooltip labelFormatter={(v) => formatTimestamp(String(v))} formatter={(val, name) => {
            const s = LABRADOR_SERIES.find((x) => x.key === name);
            return [`${typeof val === 'number' ? val.toFixed(1) : val}%`, s?.label ?? String(name)];
          }} />
          <Legend formatter={(v) => LABRADOR_SERIES.find((x) => x.key === v)?.label ?? v} />
          {LABRADOR_SERIES.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} dot={false} strokeWidth={2} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComunicacaoChart({ campo, label, unidade, series, barras }: {
  campo: 'avg_rssi' | 'avg_snr' | 'avg_uptime';
  label: string; unidade: string;
  series: ComunicacaoGraficoSerie[];
  barras: { id: number; identificacao: string }[];
}) {
  const buckets = Array.from(new Set(series.map((s) => s.bucket))).sort();
  if (buckets.length === 0) return null;
  const chartData = buckets.map((bucket) => {
    const row: Record<string, unknown> = { bucket };
    barras.forEach((b) => {
      const p = series.find((d) => d.bucket === bucket && d.barra_id === b.id);
      if (p) row[String(b.id)] = p[campo];
    });
    return row;
  });
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{label}{unidade ? ` (${unidade})` : ''}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="bucket" tickFormatter={formatTimestamp} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} unit={unidade} />
          <Tooltip labelFormatter={(v) => formatTimestamp(String(v))} formatter={(val, name) => {
            const b = barras.find((x) => String(x.id) === String(name));
            return [`${typeof val === 'number' ? val.toFixed(1) : val}${unidade}`, b?.identificacao ?? String(name)];
          }} />
          <Legend formatter={(v) => barras.find((x) => String(x.id) === v)?.identificacao ?? v} />
          {barras.map((b, idx) => (
            <Line key={b.id} type="monotone" dataKey={String(b.id)} stroke={LINE_COLORS[idx % LINE_COLORS.length]} dot={false} strokeWidth={2} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Paginacao({ pagina, totalPaginas, loading, onPageChange }: {
  pagina: number; totalPaginas: number; loading: boolean;
  onPageChange: (p: number) => void;
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SaudeSistemaPage() {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FiltrosForm>({
    defaultValues: { silo_id: '', barra_id: '', data_inicio: '', data_fim: '' },
  });

  const siloId    = watch('silo_id');
  const barraId   = watch('barra_id');
  const dataInicio = watch('data_inicio');

  const [silos,  setSilos]  = useState<Silo[]>([]);
  const [barras, setBarras] = useState<Barra[]>([]);

  const [abaAtiva,          setAbaAtiva]          = useState<AbaAtiva>('operacional');
  const [subAbaOperacional, setSubAbaOperacional] = useState<SubAba>('tabela');
  const [subAbaComunicacao, setSubAbaComunicacao] = useState<SubAba>('tabela');

  const [rangeLabrador,  setRangeLabrador]  = useState<RangeHint>(null);
  const [rangeComunicacao, setRangeComunicacao] = useState<RangeHint>(null);

  // Condições Operacionais
  const [dadosLabrador,       setDadosLabrador]       = useState<LabradorStatus[]>([]);
  const [graficoLabrador,     setGraficoLabrador]     = useState<LabradorGraficoResponse | null>(null);
  const [loadingLabrador,     setLoadingLabrador]     = useState(false);
  const [loadingGrafLabrador, setLoadingGrafLabrador] = useState(false);
  const [paginaLabrador,      setPaginaLabrador]      = useState(1);
  const [totalPagLabrador,    setTotalPagLabrador]    = useState(0);

  // Comunicação
  const [dadosComunicacao,       setDadosComunicacao]       = useState<ComunicacaoStatus[]>([]);
  const [graficoComunicacao,     setGraficoComunicacao]     = useState<ComunicacaoGraficoResponse | null>(null);
  const [loadingComunicacao,     setLoadingComunicacao]     = useState(false);
  const [loadingGrafComunicacao, setLoadingGrafComunicacao] = useState(false);
  const [paginaComunicacao,      setPaginaComunicacao]      = useState(1);
  const [totalPagComunicacao,    setTotalPagComunicacao]    = useState(0);

  const [lastFiltros, setLastFiltros] = useState<FiltrosForm | null>(null);

  // ── Load silos ───────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => setSilos((res.data.data ?? []).filter((s) => s.status === 'ativo')))
      .catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  // ── Load barras when silo changes ────────────────────────────────────────────
  useEffect(() => {
    setBarras([]); setValue('barra_id', '');
    setRangeLabrador(null); setRangeComunicacao(null);
    setDadosLabrador([]); setGraficoLabrador(null);
    setDadosComunicacao([]); setGraficoComunicacao(null);
    setLastFiltros(null);
    if (!siloId) return;
    api.get<{ data: Barra[] }>(`/silos/${siloId}/barras?per_page=200`)
      .then((res) => setBarras(res.data.data ?? []))
      .catch(() => toast.error('Erro ao carregar barras'));
  }, [siloId, setValue]);

  // ── Clear data when barra changes ────────────────────────────────────────────
  useEffect(() => {
    setDadosLabrador([]); setGraficoLabrador(null);
    setDadosComunicacao([]); setGraficoComunicacao(null);
    setLastFiltros(null);
  }, [barraId]);

  // ── Fetch ranges ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!siloId) return;
    const p: Record<string, string> = { silo_id: siloId };
    if (barraId) p.barra_id = barraId;
    api.get<RangeHint>('/saude-sistema/labrador-status/range', { params: p })
      .then((r) => setRangeLabrador(r.data)).catch(() => {});
    api.get<RangeHint>('/saude-sistema/comunicacao/range', { params: p })
      .then((r) => setRangeComunicacao(r.data)).catch(() => {});
  }, [siloId, barraId]);

  // ── Fetch functions ───────────────────────────────────────────────────────────

  const fetchLabrador = useCallback(async (filtros: FiltrosForm, page: number) => {
    setLoadingLabrador(true);
    try {
      const params: Record<string, string | number> = { silo_id: filtros.silo_id, page, limit: 50 };
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<LabradorRelatorioResponse>('/saude-sistema/labrador-status', { params });
      setDadosLabrador(res.data.dados);
      setPaginaLabrador(res.data.pagina);
      setTotalPagLabrador(res.data.total_paginas);
    } catch { toast.error('Erro ao consultar condições operacionais'); }
    finally  { setLoadingLabrador(false); }
  }, []);

  const fetchGraficoLabrador = useCallback(async (filtros: FiltrosForm) => {
    setLoadingGrafLabrador(true);
    try {
      const params: Record<string, string> = { silo_id: filtros.silo_id };
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<LabradorGraficoResponse>('/saude-sistema/labrador-status/grafico', { params });
      setGraficoLabrador(res.data);
    } catch { toast.error('Erro ao carregar gráfico operacional'); }
    finally  { setLoadingGrafLabrador(false); }
  }, []);

  const fetchComunicacao = useCallback(async (filtros: FiltrosForm, page: number) => {
    setLoadingComunicacao(true);
    try {
      const params: Record<string, string | number> = { silo_id: filtros.silo_id, page, limit: 50 };
      if (filtros.barra_id)    params.barra_id    = filtros.barra_id;
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<ComunicacaoResponse>('/saude-sistema/comunicacao', { params });
      setDadosComunicacao(res.data.dados);
      setPaginaComunicacao(res.data.pagina);
      setTotalPagComunicacao(res.data.total_paginas);
    } catch { toast.error('Erro ao consultar comunicação'); }
    finally  { setLoadingComunicacao(false); }
  }, []);

  const fetchGraficoComunicacao = useCallback(async (filtros: FiltrosForm) => {
    setLoadingGrafComunicacao(true);
    try {
      const params: Record<string, string> = { silo_id: filtros.silo_id };
      if (filtros.barra_id)    params.barra_id    = filtros.barra_id;
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<ComunicacaoGraficoResponse>('/saude-sistema/comunicacao/grafico', { params });
      setGraficoComunicacao(res.data);
    } catch { toast.error('Erro ao carregar gráfico de comunicação'); }
    finally  { setLoadingGrafComunicacao(false); }
  }, []);

  // ── Submit ───────────────────────────────────────────────────────────────────

  const onSubmit = (filtros: FiltrosForm) => {
    setLastFiltros(filtros);
    setPaginaLabrador(1); setPaginaComunicacao(1);
    fetchLabrador(filtros, 1);
    fetchGraficoLabrador(filtros);
    fetchComunicacao(filtros, 1);
    fetchGraficoComunicacao(filtros);
  };

  // ── Page change handlers ──────────────────────────────────────────────────────

  const handlePageLabrador = (p: number) => {
    if (!lastFiltros) return;
    setPaginaLabrador(p);
    fetchLabrador(lastFiltros, p);
  };

  const handlePageComunicacao = (p: number) => {
    if (!lastFiltros) return;
    setPaginaComunicacao(p);
    fetchComunicacao(lastFiltros, p);
  };

  // ── Range hint ────────────────────────────────────────────────────────────────

  const activeRange = abaAtiva === 'operacional' ? rangeLabrador : rangeComunicacao;

  // ── Tab style helpers ─────────────────────────────────────────────────────────

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

  const loadingAny = loadingLabrador || loadingComunicacao;

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity size={28} className="text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Saúde do Sistema</h1>
      </div>

      {/* Filter form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-end">
          {/* Silo */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Silo *</label>
            <select {...register('silo_id', { required: 'Silo obrigatório' })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Selecione...</option>
              {silos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            {errors.silo_id && <p className="text-xs text-red-500 mt-1">{errors.silo_id.message}</p>}
          </div>

          {/* Barra (filtra apenas aba Comunicação) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Barra <span className="text-gray-400">(Comunicação)</span>
            </label>
            <select {...register('barra_id')} disabled={!siloId}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed">
              <option value="">Todas as barras</option>
              {barras.map((b) => <option key={b.id} value={b.id}>{b.identificacao}</option>)}
            </select>
          </div>

          {/* Data início */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data início</label>
            <input type="datetime-local" {...register('data_inicio')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            {activeRange && <p className="text-xs text-gray-400 mt-1">Disponível: {formatRangeDate(activeRange.data_inicio)}</p>}
          </div>

          {/* Data fim */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data fim</label>
            <input type="datetime-local" {...register('data_fim', {
              validate: (val) => !val || !dataInicio || new Date(val) >= new Date(dataInicio) || 'Data fim deve ser após data início',
            })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            {activeRange && <p className="text-xs text-gray-400 mt-1">Disponível: {formatRangeDate(activeRange.data_fim)}</p>}
            {errors.data_fim && <p className="text-xs text-red-500 mt-1">{errors.data_fim.message}</p>}
          </div>

          {/* Botão */}
          <div>
            <button type="submit" disabled={loadingAny}
              className="w-full flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
              <Search size={15} />
              {loadingAny ? 'Consultando...' : 'Consultar'}
            </button>
          </div>
        </div>
      </form>

      {/* Tabs — visible after silo selected */}
      {siloId && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            <button onClick={() => setAbaAtiva('operacional')} className={mainTabCls('operacional')}>
              Condições Operacionais
            </button>
            <button onClick={() => setAbaAtiva('comunicacao')} className={mainTabCls('comunicacao')}>
              Comunicação
            </button>
          </div>

          {/* ── ABA: Condições Operacionais ── */}
          {abaAtiva === 'operacional' && (
            <div className="p-4 space-y-4">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                <button onClick={() => setSubAbaOperacional('tabela')}  className={subTabCls('tabela',  subAbaOperacional)}>Tabela</button>
                <button onClick={() => setSubAbaOperacional('grafico')} className={subTabCls('grafico', subAbaOperacional)}>Gráfico</button>
              </div>

              {subAbaOperacional === 'tabela' && (
                !lastFiltros ? (
                  <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                ) : loadingLabrador ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                ) : dadosLabrador.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">Nenhum dado encontrado.</p>
                ) : (
                  <div className="rounded-lg border border-gray-200 overflow-x-auto">
                    <div>
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Timestamp</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">CPU (%)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">RAM (%)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Disco (%)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">SD Card (%)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Recebido em</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dadosLabrador.map((row) => (
                            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatFullTimestamp(row.timestamp)}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-medium">
                                <span className={percentColor(row.cpu_percent)}>{formatNum(row.cpu_percent)}%</span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-medium">
                                <span className={percentColor(row.ram_percent)}>{formatNum(row.ram_percent)}%</span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-medium">
                                <span className={percentColor(row.disk_percent)}>{formatNum(row.disk_percent)}%</span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-medium">
                                <span className={percentColor(row.sd_percent)}>{row.sd_percent != null ? `${formatNum(row.sd_percent)}%` : '—'}</span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">{formatFullTimestamp(row.received_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {totalPagLabrador > 1 && (
                      <Paginacao pagina={paginaLabrador} totalPaginas={totalPagLabrador} loading={loadingLabrador} onPageChange={handlePageLabrador} />
                    )}
                  </div>
                )
              )}

              {subAbaOperacional === 'grafico' && (
                !lastFiltros ? (
                  <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                ) : loadingGrafLabrador ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                ) : !graficoLabrador || graficoLabrador.series.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">Nenhum dado encontrado.</p>
                ) : (
                  <LabradorChart series={graficoLabrador.series} />
                )
              )}
            </div>
          )}

          {/* ── ABA: Comunicação ── */}
          {abaAtiva === 'comunicacao' && (
            <div className="p-4 space-y-4">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                <button onClick={() => setSubAbaComunicacao('tabela')}  className={subTabCls('tabela',  subAbaComunicacao)}>Tabela</button>
                <button onClick={() => setSubAbaComunicacao('grafico')} className={subTabCls('grafico', subAbaComunicacao)}>Gráfico</button>
              </div>

              {subAbaComunicacao === 'tabela' && (
                !lastFiltros ? (
                  <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                ) : loadingComunicacao ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                ) : dadosComunicacao.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">Nenhum dado encontrado.</p>
                ) : (
                  <div className="rounded-lg border border-gray-200 overflow-x-auto">
                    <div>
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Timestamp</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Barra</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Tempo ESP32 (s)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">RSSI (dBm)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">SNR (dB)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dadosComunicacao.map((row) => (
                            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatFullTimestamp(row.timestamp)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.barra_identificacao}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.uptime_esp32_s ?? '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-medium">
                                <span className={rssiColor(row.rssi_dbm)}>{row.rssi_dbm != null ? `${row.rssi_dbm} dBm` : '—'}</span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatNum(row.snr_db)} dB</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {totalPagComunicacao > 1 && (
                      <Paginacao pagina={paginaComunicacao} totalPaginas={totalPagComunicacao} loading={loadingComunicacao} onPageChange={handlePageComunicacao} />
                    )}
                  </div>
                )
              )}

              {subAbaComunicacao === 'grafico' && (
                !lastFiltros ? (
                  <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
                ) : loadingGrafComunicacao ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
                ) : !graficoComunicacao || graficoComunicacao.series.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">Nenhum dado encontrado.</p>
                ) : (
                  <>
                    <ComunicacaoChart campo="avg_rssi"  label="Sinal RSSI"        unidade="dBm" series={graficoComunicacao.series} barras={graficoComunicacao.barras} />
                    <ComunicacaoChart campo="avg_snr"   label="Relação Sinal/Ruído (SNR)" unidade="dB"  series={graficoComunicacao.series} barras={graficoComunicacao.barras} />
                    <ComunicacaoChart campo="avg_uptime" label="Tempo de Processamento ESP32" unidade="s" series={graficoComunicacao.series} barras={graficoComunicacao.barras} />
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
