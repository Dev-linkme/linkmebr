import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import toast from 'react-hot-toast';
import { HeartPulse, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import api from '../services/api';
import { getSilosIa } from '../services/ia';
import type { Silo } from '../types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FiltrosForm {
  silo_id: string;
  data_inicio: string;
  data_fim: string;
}

type SubAba = 'tabela' | 'grafico';
type RangeHint = { data_inicio: string | null; data_fim: string | null } | null;

interface HeartbeatRow {
  id: number;
  recebido_em: string;
  timestamp: string | null;
  versao_modelo: string | null;
  modelo_hash: string | null;
  ciclo_ok: boolean;
  n_emergencias: number | null;
  risco_max: number | null;
  cat_max: string | null;
}

interface HeartbeatListResponse {
  dados: HeartbeatRow[];
  pagina: number;
  total_paginas: number;
  total: number;
}

interface HeartbeatGraficoSerie {
  timestamp: string | null;
  risco_max: number | null;
  ciclo_ok: boolean;
}

interface HeartbeatGraficoResponse {
  series: HeartbeatGraficoSerie[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRT = 'America/Sao_Paulo';

function formatFullTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}

function formatRangeDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return formatFullTimestamp(ts);
}

function catMaxColor(cat: string | null): string {
  if (!cat) return 'text-gray-400';
  if (cat === 'Emergência') return 'text-red-600 font-semibold';
  if (cat === 'Atenção')    return 'text-yellow-600 font-semibold';
  return 'text-green-700';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function HeartbeatChart({ series }: { series: HeartbeatGraficoSerie[] }) {
  if (series.length === 0) return null;
  const data = series.filter((s) => s.timestamp != null);
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Risco Máximo por Ciclo (0–100)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(v) => formatTimestamp(String(v))}
            tick={{ fontSize: 11 }}
            minTickGap={40}
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip
            labelFormatter={(v) => formatTimestamp(String(v))}
            formatter={(val) => [`${typeof val === 'number' ? val.toFixed(1) : val}`, 'Risco máx.']}
          />
          <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'Atenção', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }} />
          <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Emergência', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
          <Line
            type="monotone"
            dataKey="risco_max"
            stroke="#6366f1"
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SaudeIaPage() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FiltrosForm>({
    defaultValues: { silo_id: '', data_inicio: '', data_fim: '' },
  });

  const siloId     = watch('silo_id');
  const dataInicio = watch('data_inicio');

  const [silos, setSilos] = useState<Silo[]>([]);

  const [subAba,     setSubAba]     = useState<SubAba>('tabela');
  const [rangeHint,  setRangeHint]  = useState<RangeHint>(null);

  const [dados,          setDados]          = useState<HeartbeatRow[]>([]);
  const [grafico,        setGrafico]        = useState<HeartbeatGraficoResponse | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [loadingGrafico, setLoadingGrafico] = useState(false);
  const [pagina,         setPagina]         = useState(1);
  const [totalPags,      setTotalPags]      = useState(0);
  const [lastFiltros,    setLastFiltros]    = useState<FiltrosForm | null>(null);

  // ── Carregar silos (apenas com modelo IA) ────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get<{ data: Silo[] }>('/silos?per_page=200'),
      getSilosIa(),
    ]).then(([silosRes, iaRes]) => {
      const idsComIa = new Set(iaRes.silos.map((s) => s.silo_id));
      setSilos((silosRes.data.data ?? []).filter((s) => s.status === 'ativo' && idsComIa.has(s.id)));
    }).catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  // ── Range hint ao selecionar silo ────────────────────────────────────────────
  useEffect(() => {
    setDados([]); setGrafico(null); setLastFiltros(null); setRangeHint(null);
    if (!siloId) return;
    api.get<RangeHint>('/ia/heartbeat/range', { params: { silo_id: siloId } })
      .then((r) => setRangeHint(r.data)).catch(() => {});
  }, [siloId]);

  // ── Fetch tabela ─────────────────────────────────────────────────────────────
  const fetchTabela = useCallback(async (filtros: FiltrosForm, page: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { silo_id: filtros.silo_id, page, limit: 50 };
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<HeartbeatListResponse>('/ia/heartbeat', { params });
      setDados(res.data.dados);
      setPagina(res.data.pagina);
      setTotalPags(res.data.total_paginas);
    } catch { toast.error('Erro ao consultar heartbeats'); }
    finally  { setLoading(false); }
  }, []);

  // ── Fetch gráfico ─────────────────────────────────────────────────────────────
  const fetchGrafico = useCallback(async (filtros: FiltrosForm) => {
    setLoadingGrafico(true);
    try {
      const params: Record<string, string> = { silo_id: filtros.silo_id };
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim)    params.data_fim    = filtros.data_fim;
      const res = await api.get<HeartbeatGraficoResponse>('/ia/heartbeat/grafico', { params });
      setGrafico(res.data);
    } catch { toast.error('Erro ao carregar gráfico'); }
    finally  { setLoadingGrafico(false); }
  }, []);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const onSubmit = (filtros: FiltrosForm) => {
    setLastFiltros(filtros);
    setPagina(1);
    fetchTabela(filtros, 1);
    fetchGrafico(filtros);
  };

  const handlePageChange = (p: number) => {
    if (!lastFiltros) return;
    setPagina(p);
    fetchTabela(lastFiltros, p);
  };

  // ── Tab style helpers ─────────────────────────────────────────────────────────
  const subTabCls = (sub: SubAba) =>
    `px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
      sub === subAba ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HeartPulse size={28} className="text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Saúde da IA</h1>
      </div>

      {/* Filtros */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
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

          {/* Data início */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data início</label>
            <input type="datetime-local" {...register('data_inicio')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            {rangeHint && <p className="text-xs text-gray-400 mt-1">Disponível: {formatRangeDate(rangeHint.data_inicio)}</p>}
          </div>

          {/* Data fim */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data fim</label>
            <input type="datetime-local" {...register('data_fim', {
              validate: (val) => !val || !dataInicio || new Date(val) >= new Date(dataInicio) || 'Data fim deve ser após data início',
            })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            {rangeHint && <p className="text-xs text-gray-400 mt-1">Disponível: {formatRangeDate(rangeHint.data_fim)}</p>}
            {errors.data_fim && <p className="text-xs text-red-500 mt-1">{errors.data_fim.message}</p>}
          </div>

          {/* Botão */}
          <div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
              <Search size={15} />
              {loading ? 'Consultando...' : 'Consultar'}
            </button>
          </div>
        </div>
      </form>

      {/* Conteúdo — visível após seleção de silo */}
      {siloId && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Sub-tabs */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              <button onClick={() => setSubAba('tabela')}  className={subTabCls('tabela')}>Tabela</button>
              <button onClick={() => setSubAba('grafico')} className={subTabCls('grafico')}>Gráfico</button>
            </div>
          </div>

          <div className="p-4">
            {/* ── Tabela ── */}
            {subAba === 'tabela' && (
              !lastFiltros ? (
                <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
              ) : loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
                </div>
              ) : dados.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">Nenhum dado encontrado.</p>
              ) : (
                <div className="rounded-lg border border-gray-200 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Timestamp ciclo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Recebido em</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Versão modelo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Hash</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Ciclo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Emergências</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Risco máx.</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Categoria</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dados.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {row.timestamp ? formatFullTimestamp(row.timestamp) : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">
                            {formatFullTimestamp(row.recebido_em)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                            {row.versao_modelo ? formatFullTimestamp(row.versao_modelo) : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-500">
                            {row.modelo_hash ?? '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium">
                            <span className={row.ciclo_ok ? 'text-green-700' : 'text-yellow-600'}>
                              {row.ciclo_ok ? '✔ OK' : '✗ Abortado'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium">
                            <span className={(row.n_emergencias ?? 0) > 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                              {row.n_emergencias ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {row.risco_max != null ? row.risco_max.toFixed(1) : '—'}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap ${catMaxColor(row.cat_max)}`}>
                            {row.cat_max ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalPags > 1 && (
                    <Paginacao pagina={pagina} totalPaginas={totalPags} loading={loading} onPageChange={handlePageChange} />
                  )}
                </div>
              )
            )}

            {/* ── Gráfico ── */}
            {subAba === 'grafico' && (
              !lastFiltros ? (
                <p className="text-center text-gray-400 text-sm py-10">Selecione os filtros e clique em Consultar.</p>
              ) : loadingGrafico ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
                </div>
              ) : !grafico || grafico.series.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">Nenhum dado encontrado.</p>
              ) : (
                <HeartbeatChart series={grafico.series} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
