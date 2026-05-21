import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from 'lucide-react';
import api from '../services/api';
import type { Silo, Barra, Sensor, Leitura } from '../types/index';

// ─── Constants ─────────────────────────────────────────────────────────────────

const LINE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

type GrandezaTipo = 'temperatura' | 'umidade' | 'co2';

const GRANDEZA_LABELS: Record<GrandezaTipo, string> = {
  temperatura: 'Temperatura',
  umidade: 'Umidade',
  co2: 'CO₂',
};

// ─── Types ──────────────────────────────────────────────────────────────────────

interface FiltrosForm {
  silo_id: string;
  barra_id: string;
  sensor_id: string;
  data_inicio: string;
  data_fim: string;
}

type SortField = 'valor_avg' | 'valor_max' | 'valor_min';
type SortDir = 'asc' | 'desc';

interface RelatorioResponse {
  dados: Leitura[];
  pagina: number;
  total_paginas: number;
  total: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${MM} ${HH}:${mm}`;
}

function formatFullTimestamp(ts: string): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
}

function formatNum(val: number | undefined | null, decimals = 2): string {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

// ─── Chart per grandeza ────────────────────────────────────────────────────────

interface GrandezaChartProps {
  grandeza: GrandezaTipo;
  dados: Leitura[];
  sensores: Sensor[];
}

function GrandezaChart({ grandeza, dados, sensores }: GrandezaChartProps) {
  // Filter sensors of this grandeza that actually appear in data
  const sensoresDaGrandeza = sensores.filter(
    (s) => s.tipo_grandeza === grandeza && dados.some((d) => d.sensor_id === s.id)
  );

  if (sensoresDaGrandeza.length === 0) return null;

  // Build chart data: sorted unique timestamps, each row has sensorId -> valor_avg
  const dadosDaGrandeza = dados.filter((d) =>
    sensoresDaGrandeza.some((s) => s.id === d.sensor_id)
  );

  const tsSet = new Set(dadosDaGrandeza.map((d) => d.timestamp));
  const tsArr = Array.from(tsSet).sort();

  const chartData = tsArr.map((ts) => {
    const row: Record<string, unknown> = { timestamp: ts };
    sensoresDaGrandeza.forEach((s) => {
      const leitura = dadosDaGrandeza.find(
        (d) => d.sensor_id === s.id && d.timestamp === ts
      );
      if (leitura) {
        row[String(s.id)] = leitura.valor_avg;
      }
    });
    return row;
  });

  // Determine unidade from first sensor
  const unidade = sensoresDaGrandeza[0]?.unidade_medida ?? '';

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        {GRANDEZA_LABELS[grandeza]}
        {unidade ? ` (${unidade})` : ''}
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTimestamp}
            tick={{ fontSize: 11 }}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            label={{
              value: unidade,
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 11 },
            }}
          />
          <Tooltip
            labelFormatter={(val) => formatTimestamp(String(val))}
            formatter={(val, name) => {
              const sensor = sensoresDaGrandeza.find((s) => String(s.id) === String(name));
              const label = sensor
                ? `${sensor.identificacao} (${sensor.altura_solo_m}m)`
                : String(name);
              const numVal = typeof val === 'number' ? val.toFixed(2) : val;
              return [`${numVal} ${unidade}`, label];
            }}
          />
          <Legend
            formatter={(value) => {
              const sensor = sensoresDaGrandeza.find((s) => String(s.id) === value);
              return sensor
                ? `${sensor.identificacao} (${sensor.altura_solo_m}m)`
                : value;
            }}
          />
          {sensoresDaGrandeza.map((s, idx) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={String(s.id)}
              stroke={LINE_COLORS[idx % LINE_COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const { t } = useTranslation();

  // Form
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FiltrosForm>({
    defaultValues: {
      silo_id: '',
      barra_id: '',
      sensor_id: '',
      data_inicio: '',
      data_fim: '',
    },
  });

  const siloId = watch('silo_id');
  const barraId = watch('barra_id');
  const dataInicio = watch('data_inicio');

  // Select options
  const [silos, setSilos] = useState<Silo[]>([]);
  const [barras, setBarras] = useState<Barra[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);

  // Results
  const [dados, setDados] = useState<Leitura[]>([]);
  const [todosSensores, setTodosSensores] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [lastFiltros, setLastFiltros] = useState<FiltrosForm | null>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<'tabela' | 'grafico'>('tabela');

  // Sort
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Load silos ──────────────────────────────────────────────────────────────
  useEffect(() => {
    api
      .get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => {
        const ativos = (res.data.data ?? []).filter((s) => s.status === 'ativo');
        setSilos(ativos);
      })
      .catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  // ── Load barras when silo changes ──────────────────────────────────────────
  useEffect(() => {
    setBarras([]);
    setSensores([]);
    setValue('barra_id', '');
    setValue('sensor_id', '');
    if (!siloId) return;
    api
      .get<{ data: Barra[] }>(`/silos/${siloId}/barras?per_page=200`)
      .then((res) => setBarras(res.data.data ?? []))
      .catch(() => toast.error('Erro ao carregar barras'));
  }, [siloId, setValue]);

  // ── Load sensores when barra changes ──────────────────────────────────────
  useEffect(() => {
    setSensores([]);
    setValue('sensor_id', '');
    if (!barraId) return;
    api
      .get<{ data: Sensor[] }>(`/barras/${barraId}/sensores?per_page=200`)
      .then((res) => setSensores(res.data.data ?? []))
      .catch(() => toast.error('Erro ao carregar sensores'));
  }, [barraId, setValue]);

  // ── Query ──────────────────────────────────────────────────────────────────
  const fetchDados = useCallback(
    async (filtros: FiltrosForm, page: number) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          silo_id: filtros.silo_id,
          page,
          limit: 50,
        };
        if (filtros.barra_id) params.barra_id = filtros.barra_id;
        if (filtros.sensor_id) params.sensor_id = filtros.sensor_id;
        if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
        if (filtros.data_fim) params.data_fim = filtros.data_fim;

        const res = await api.get<RelatorioResponse>('/relatorios/leituras', { params });
        setDados(res.data.dados);
        setPagina(res.data.pagina);
        setTotalPaginas(res.data.total_paginas);

        // Collect all unique sensors from the returned data
        const sensMap = new Map<number, Sensor>();
        res.data.dados.forEach((d) => {
          if (d.sensor) sensMap.set(d.sensor_id, d.sensor);
        });
        setTodosSensores(Array.from(sensMap.values()));
      } catch {
        toast.error('Erro ao consultar leituras');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const onSubmit = (filtros: FiltrosForm) => {
    setLastFiltros(filtros);
    setSortField(null);
    fetchDados(filtros, 1);
  };

  const handlePageChange = (newPage: number) => {
    if (!lastFiltros) return;
    fetchDados(lastFiltros, newPage);
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExportCSV = async () => {
    if (!lastFiltros) {
      toast.error('Execute uma consulta antes de exportar');
      return;
    }
    setLoadingExport(true);
    try {
      const params: Record<string, string> = { silo_id: lastFiltros.silo_id };
      if (lastFiltros.data_inicio) params.data_inicio = lastFiltros.data_inicio;
      if (lastFiltros.data_fim) params.data_fim = lastFiltros.data_fim;

      const res = await api.get<string>('/relatorios/leituras/export', {
        params,
        responseType: 'text',
      });

      const csvText: string =
        typeof res.data === 'string'
          ? res.data
          : Papa.unparse(res.data as unknown as object[]);

      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leituras_silo_${lastFiltros.silo_id}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV exportado com sucesso');
    } catch {
      toast.error('Erro ao exportar CSV');
    } finally {
      setLoadingExport(false);
    }
  };

  // ── Sort ───────────────────────────────────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedDados = [...dados].sort((a, b) => {
    if (!sortField) return 0;
    const va = a[sortField] ?? 0;
    const vb = b[sortField] ?? 0;
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  // ── Chart data ─────────────────────────────────────────────────────────────
  const grandezasPresentes = Array.from(
    new Set(todosSensores.map((s) => s.tipo_grandeza))
  ) as GrandezaTipo[];

  // ── Sort Icon helper ───────────────────────────────────────────────────────
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ChevronDown size={14} className="text-gray-300 inline ml-1" />;
    return sortDir === 'asc' ? (
      <ChevronUp size={14} className="text-primary-600 inline ml-1" />
    ) : (
      <ChevronDown size={14} className="text-primary-600 inline ml-1" />
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 size={28} className="text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t('relatorios.titulo')}</h1>
      </div>

      {/* Filter form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-lg shadow p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end">
          {/* Silo */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {t('relatorios.silo')} *
            </label>
            <select
              {...register('silo_id', { required: t('erros.campo_obrigatorio') })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Selecione...</option>
              {silos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            {errors.silo_id && (
              <p className="text-xs text-red-500 mt-1">{errors.silo_id.message}</p>
            )}
          </div>

          {/* Barra */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {t('relatorios.barra')}
            </label>
            <select
              {...register('barra_id')}
              disabled={!siloId}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">{t('relatorios.todas_barras')}</option>
              {barras.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.identificacao}
                </option>
              ))}
            </select>
          </div>

          {/* Sensor */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {t('relatorios.sensor')}
            </label>
            <select
              {...register('sensor_id')}
              disabled={!barraId}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">{t('relatorios.todos_sensores')}</option>
              {sensores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.identificacao} ({s.altura_solo_m}m)
                </option>
              ))}
            </select>
          </div>

          {/* Data início */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {t('relatorios.data_inicio')}
            </label>
            <input
              type="datetime-local"
              {...register('data_inicio')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Data fim */}
          <div className="xl:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {t('relatorios.data_fim')}
            </label>
            <input
              type="datetime-local"
              {...register('data_fim', {
                validate: (val) => {
                  if (!val || !dataInicio) return true;
                  return (
                    new Date(val) >= new Date(dataInicio) || t('erros.data_invalida')
                  );
                },
              })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {errors.data_fim && (
              <p className="text-xs text-red-500 mt-1">{errors.data_fim.message}</p>
            )}
          </div>

          {/* Buttons */}
          <div className="xl:col-span-1 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <Search size={15} />
              {loading ? t('geral.carregando') : t('relatorios.consultar')}
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={loadingExport || !lastFiltros}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <Download size={15} />
              {loadingExport ? t('geral.carregando') : t('relatorios.exportar_csv')}
            </button>
          </div>
        </div>
      </form>

      {/* Tabs */}
      {lastFiltros && (
        <div className="flex gap-1 border-b border-gray-200">
          {(['tabela', 'grafico'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'tabela' ? 'Tabela' : 'Gráfico'}
            </button>
          ))}
        </div>
      )}

      {/* Charts */}
      {dados.length > 0 && activeTab === 'grafico' && (
        <div>
          {grandezasPresentes.map((grandeza) => (
            <GrandezaChart
              key={grandeza}
              grandeza={grandeza}
              dados={dados}
              sensores={todosSensores}
            />
          ))}
        </div>
      )}

      {/* Table */}
      {lastFiltros && activeTab === 'tabela' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
              {t('geral.carregando')}
            </div>
          ) : dados.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
              {t('relatorios.sem_dados')}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                        {t('relatorios.coluna_data')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                        {t('relatorios.coluna_barra')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                        {t('relatorios.coluna_sensor')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                        {t('relatorios.coluna_grandeza')}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-gray-900"
                        onClick={() => handleSort('valor_avg')}
                      >
                        {t('relatorios.coluna_avg')}
                        <SortIcon field="valor_avg" />
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-gray-900"
                        onClick={() => handleSort('valor_max')}
                      >
                        {t('relatorios.coluna_max')}
                        <SortIcon field="valor_max" />
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-gray-900"
                        onClick={() => handleSort('valor_min')}
                      >
                        {t('relatorios.coluna_min')}
                        <SortIcon field="valor_min" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                        {t('relatorios.coluna_amostras')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                        {t('relatorios.coluna_desvio')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                        {t('relatorios.coluna_unidade')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedDados.map((leitura) => {
                      const sensor = leitura.sensor;
                      const barra = leitura.sensor?.barra;
                      const isInativo = sensor?.status === 'inativo';
                      return (
                        <tr key={leitura.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {formatFullTimestamp(leitura.timestamp)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {barra?.identificacao ?? '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            <span>{sensor?.identificacao ?? `Sensor ${leitura.sensor_id}`}</span>
                            {isInativo && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                (inativo)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700 capitalize">
                            {sensor
                              ? GRANDEZA_LABELS[sensor.tipo_grandeza] ?? sensor.tipo_grandeza
                              : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">
                            {formatNum(leitura.valor_avg)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {formatNum(leitura.valor_max)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {formatNum(leitura.valor_min)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {leitura.num_amostras}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {formatNum(leitura.desvio_padrao)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                            {sensor?.unidade_medida ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <p className="text-sm text-gray-600">
                    {t('geral.pagina')} {pagina} / {totalPaginas}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(pagina - 1)}
                      disabled={pagina <= 1 || loading}
                      className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={15} />
                      {t('geral.anterior')}
                    </button>
                    <button
                      onClick={() => handlePageChange(pagina + 1)}
                      disabled={pagina >= totalPaginas || loading}
                      className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('geral.proximo')}
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
