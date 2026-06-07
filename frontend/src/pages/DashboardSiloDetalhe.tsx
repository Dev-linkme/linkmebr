import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Thermometer,
  Droplets,
  Wind,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { Silo } from '../types/index';

interface LeituraAgrupada {
  barra_id: number;
  barra_identificacao: string;
  sensores: SensorLeitura[];
}

interface SensorLeitura {
  sensor_id: number;
  sensor_identificacao: string;
  altura_solo_m: number;
  tipo_grandeza: string;
  valor_avg: number | null;
  unidade_medida: string;
  timestamp: string | null;
  em_alerta: boolean;
}

interface ClimaResponse {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  hourly?: unknown;
  daily?: unknown;
}

function WeatherIcon({ code }: { code?: number }) {
  if (!code) return <Thermometer size={28} className="text-yellow-500" />;
  if (code === 0) return <span className="text-3xl">☀️</span>;
  if (code <= 3) return <span className="text-3xl">⛅</span>;
  if (code <= 67) return <span className="text-3xl">🌧️</span>;
  if (code <= 77) return <span className="text-3xl">❄️</span>;
  return <span className="text-3xl">⛈️</span>;
}

export default function DashboardSiloDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [silo, setSilo] = useState<Silo | null>(null);
  const [leituras, setLeituras] = useState<LeituraAgrupada[]>([]);
  const [clima, setClima] = useState<ClimaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openBarras, setOpenBarras] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!id) return;

    Promise.all([
      api.get<Silo>(`/dashboard/silos/${id}`),
      api.get<LeituraAgrupada[]>(`/dashboard/silos/${id}/leituras`).catch(() => ({ data: [] })),
      api.get<ClimaResponse>(`/dashboard/silos/${id}/clima`).catch(() => ({ data: null })),
    ])
      .then(([siloRes, leiturasRes, climaRes]) => {
        setSilo(siloRes.data);
        setLeituras(leiturasRes.data ?? []);
        setClima(climaRes.data);
        // Abrir todas as barras por padrão
        const ids = new Set((leiturasRes.data ?? []).map((b: LeituraAgrupada) => b.barra_id));
        setOpenBarras(ids);
      })
      .catch(() => toast.error('Erro ao carregar detalhes do silo'))
      .finally(() => setLoading(false));
  }, [id]);

  function toggleBarra(barraId: number) {
    setOpenBarras((prev) => {
      const next = new Set(prev);
      if (next.has(barraId)) next.delete(barraId);
      else next.add(barraId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    );
  }

  if (!silo) {
    return (
      <div className="text-center py-16 text-gray-400">Silo não encontrado.</div>
    );
  }

  const hasAlert = (silo.alertas_ativos ?? 0) > 0;
  const current = clima?.current;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{silo.nome}</h1>
          {(silo.cidade || silo.estado) && (
            <p className="text-sm text-gray-500">
              {[silo.cidade, silo.estado].filter(Boolean).join(' / ')}
            </p>
          )}
        </div>
        <span
          className={`ml-auto flex-shrink-0 inline-flex items-center gap-1 text-sm font-semibold px-3 py-1 rounded-full ${
            hasAlert ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {hasAlert ? (
            <>
              <AlertTriangle size={14} />
              {silo.alertas_ativos} alerta(s)
            </>
          ) : (
            <>
              <CheckCircle size={14} />
              Normal
            </>
          )}
        </span>
      </div>

      {/* Info resumo */}
      <div className="bg-white rounded-xl shadow p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-gray-400 mb-1">Status</p>
          <p className="font-semibold capitalize">{silo.status}</p>
        </div>
        <div>
          <p className="text-gray-400 mb-1">Cabos pêndulo ativos</p>
          <p className="font-semibold">{silo.total_barras_ativas ?? 0}</p>
        </div>
        <div>
          <p className="text-gray-400 mb-1">Sensores ativos</p>
          <p className="font-semibold">{silo.total_sensores_ativos ?? 0}</p>
        </div>
        <div>
          <p className="text-gray-400 mb-1">Alertas ativos</p>
          <p className={`font-semibold ${hasAlert ? 'text-red-600' : 'text-green-600'}`}>
            {silo.alertas_ativos ?? 0}
          </p>
        </div>
      </div>

      {/* Clima */}
      {current && (
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Condições Atuais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 bg-yellow-50 rounded-lg p-4">
              <WeatherIcon code={current.weather_code} />
              <div>
                <p className="text-xs text-gray-500 mb-1">Temperatura</p>
                <p className="text-xl font-bold text-gray-800">
                  {current.temperature_2m != null
                    ? `${current.temperature_2m}°C`
                    : '—'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-blue-50 rounded-lg p-4">
              <Droplets size={28} className="text-blue-500" />
              <div>
                <p className="text-xs text-gray-500 mb-1">Umidade relativa</p>
                <p className="text-xl font-bold text-gray-800">
                  {current.relative_humidity_2m != null
                    ? `${current.relative_humidity_2m}%`
                    : '—'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-4">
              <Wind size={28} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500 mb-1">Vento</p>
                <p className="text-xl font-bold text-gray-800">
                  {current.wind_speed_10m != null
                    ? `${current.wind_speed_10m} km/h`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leituras por barra */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-700">Leituras por Cabo Pêndulo</h2>

        {leituras.length === 0 && (
          <p className="text-gray-400 text-sm bg-white rounded-xl shadow p-5">
            Nenhuma leitura disponível.
          </p>
        )}

        {leituras.map((barra) => {
          const isOpen = openBarras.has(barra.barra_id);
          const barraAlerta = barra.sensores.some((s) => s.em_alerta);

          return (
            <div key={barra.barra_id} className="bg-white rounded-xl shadow overflow-hidden">
              {/* Header accordion */}
              <button
                onClick={() => toggleBarra(barra.barra_id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isOpen ? (
                    <ChevronDown size={18} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={18} className="text-gray-400" />
                  )}
                  <span className="font-semibold text-gray-800">
                    Barra: {barra.barra_identificacao}
                  </span>
                  {barraAlerta && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      <AlertTriangle size={11} />
                      Alerta
                    </span>
                  )}
                </div>
                <span className="text-sm text-gray-400">
                  {barra.sensores.length} sensor(es)
                </span>
              </button>

              {/* Sensores */}
              {isOpen && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {barra.sensores.length === 0 && (
                    <p className="px-5 py-3 text-sm text-gray-400">
                      Sem sensores cadastrados.
                    </p>
                  )}
                  {barra.sensores.map((sensor) => (
                    <div
                      key={sensor.sensor_id}
                      className={`px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                        sensor.em_alerta ? 'bg-red-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {sensor.em_alerta && (
                          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-gray-800 text-sm">
                            {sensor.sensor_identificacao}
                          </p>
                          <p className="text-xs text-gray-400">
                            {sensor.tipo_grandeza} · {sensor.altura_solo_m} m do solo
                          </p>
                        </div>
                      </div>
                      <div className="text-right sm:text-right">
                        <p
                          className={`text-lg font-bold ${
                            sensor.em_alerta ? 'text-red-600' : 'text-gray-800'
                          }`}
                        >
                          {sensor.valor_avg != null
                            ? `${sensor.tipo_grandeza === 'temperatura' ? Number(sensor.valor_avg).toFixed(1) : Math.round(Number(sensor.valor_avg))} ${sensor.unidade_medida}`
                            : '—'}
                        </p>
                        {sensor.timestamp && (
                          <p className="text-xs text-gray-400">
                            {new Date(sensor.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
