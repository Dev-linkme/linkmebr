import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import {
  AlertTriangle, CheckCircle, Database, MapPin,
  Thermometer, Droplets, Wind, Maximize2,
  ChevronDown, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { Silo } from '../types/index';

// ── Ícones do mapa (padrão Leaflet colorido) ────────────────────────────────

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

// ── Ajusta mapa para exibir todos os silos ──────────────────────────────────

function MapFitAll({ silos, trigger }: { silos: Silo[]; trigger: number }) {
  const map = useMap();
  const silosRef = useRef(silos);
  silosRef.current = silos;
  useEffect(() => {
    const s = silosRef.current;
    if (s.length === 0) return;
    if (s.length === 1) {
      map.setView([Number(s[0].latitude!), Number(s[0].longitude!)], 13, { animate: trigger > 0 });
    } else {
      const bounds = L.latLngBounds(s.map((x) => [Number(x.latitude), Number(x.longitude)] as [number, number]));
      map.fitBounds(bounds, { padding: [50, 50], animate: trigger > 0 });
    }
  }, [trigger, map]);
  return null;
}

// ── Centraliza mapa no silo selecionado ─────────────────────────────────────
// Sempre montado para que isFirst não seja zerado quando um silo sem
// coordenadas é selecionado intermediariamente.

function MapFlyTo({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  const isFirst = useRef(true);
  useEffect(() => {
    if (lat === null || lng === null) return;
    if (isFirst.current) { isFirst.current = false; return; }
    map.flyTo([lat, lng], 14, { duration: 1 });
  }, [lat, lng, map]);
  return null;
}

// ── Tipos ───────────────────────────────────────────────────────────────────

interface ResumoGrandeza {
  avg_avg: number;
  avg_min: number;
  avg_max: number;
  unidade: string;
}

interface ResumoAltura {
  altura_m: number;
  temperatura?: ResumoGrandeza;
  umidade?: ResumoGrandeza;
  co2?: ResumoGrandeza;
}

interface ClimaAtual {
  time?: string;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
  weather_code?: number;
  apparent_temperature?: number;
}

interface ResumoLocal {
  local: string;
  resumo_alturas: ResumoAltura[];
}

interface ReleStatus {
  ligado: boolean;
  timestamp: string;
}

interface PainelResponse {
  silo: Silo & { total_barras_ativas: number; total_sensores_ativos: number };
  clima: ClimaAtual | null;
  referencia: string | null;
  resumo_por_local: ResumoLocal[];
  rele: ReleStatus | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v?: number | null, dec = 1) {
  return v != null ? v.toFixed(dec) : '—';
}

function fmtTs(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  });
}

function WeatherIcon({ code }: { code?: number }) {
  if (code == null) return <Thermometer size={26} className="text-yellow-500" />;
  if (code === 0)  return <span className="text-3xl">☀️</span>;
  if (code <= 3)   return <span className="text-3xl">⛅</span>;
  if (code <= 67)  return <span className="text-3xl">🌧️</span>;
  if (code <= 77)  return <span className="text-3xl">❄️</span>;
  return <span className="text-3xl">⛈️</span>;
}

const GRANDEZA_LABEL: Record<string, string> = {
  temperatura: 'Temperatura',
  umidade: 'Umidade',
  co2: 'CO₂',
};

// ── Componente principal ─────────────────────────────────────────────────────

export default function DashboardPage() {
  const [silos, setSilos] = useState<Silo[]>([]);
  const [loading, setLoading] = useState(true);
  const [siloSelecionado, setSiloSelecionado] = useState<number | null>(null);
  const [painel, setPainel] = useState<PainelResponse | null>(null);
  const [loadingPainel, setLoadingPainel] = useState(false);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const [listaAberta, setListaAberta] = useState(false);
  const seletorRef = useRef<HTMLDivElement>(null);

  // Fecha a lista ao clicar fora do seletor
  useEffect(() => {
    if (!listaAberta) return;
    const handler = (e: MouseEvent) => {
      if (seletorRef.current && !seletorRef.current.contains(e.target as Node)) {
        setListaAberta(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [listaAberta]);

  // Carrega lista de silos
  useEffect(() => {
    api
      .get<{ data: Silo[] }>('/dashboard/silos')
      .then((res) => {
        const lista = res.data.data ?? [];
        setSilos(lista);
        if (lista.length > 0) setSiloSelecionado(lista[0].id);
      })
      .catch(() => toast.error('Erro ao carregar dados do dashboard'))
      .finally(() => setLoading(false));
  }, []);

  // Carrega painel do silo selecionado
  const carregarPainel = useCallback((id: number) => {
    setLoadingPainel(true);
    api
      .get<PainelResponse>(`/dashboard/silos/${id}/painel`)
      .then((res) => setPainel(res.data))
      .catch(() => toast.error('Erro ao carregar painel do silo'))
      .finally(() => setLoadingPainel(false));
  }, []);

  useEffect(() => {
    if (siloSelecionado != null) carregarPainel(siloSelecionado);
  }, [siloSelecionado, carregarPainel]);

  const total    = silos.length;
  const emAlerta = silos.filter((s) => (s.alertas_ativos ?? 0) > 0).length;
  const normais  = total - emAlerta;

  const silosComCoordenadas = useMemo(
    () => silos.filter((s) => s.latitude != null && s.longitude != null),
    [silos],
  );

  const siloAtual = silos.find((s) => s.id === siloSelecionado);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    );
  }

  function grandezasDoLocal(alturas: ResumoAltura[]) {
    return (['temperatura', 'umidade', 'co2'] as const).filter((g) =>
      alturas.some((r) => r[g] != null),
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Painel</h1>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
          <Database className="text-gray-400" size={32} />
          <div>
            <p className="text-sm text-gray-500">Total de Silos</p>
            <p className="text-3xl font-bold text-gray-900">{total}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
          <AlertTriangle className="text-red-500" size={32} />
          <div>
            <p className="text-sm text-gray-500">Em Alerta</p>
            <p className="text-3xl font-bold text-red-600">{emAlerta}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
          <CheckCircle className="text-green-500" size={32} />
          <div>
            <p className="text-sm text-gray-500">Normais</p>
            <p className="text-3xl font-bold text-green-600">{normais}</p>
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <MapPin size={18} className="text-gray-400" />
          <span className="font-semibold text-gray-700">Mapa de Silos</span>
        </div>
        <div className="h-[360px] relative">
          <MapContainer
            center={[-15, -55]}
            zoom={4}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapFitAll silos={silosComCoordenadas} trigger={fitAllTrigger} />
            <MapFlyTo
              lat={siloAtual?.latitude != null ? Number(siloAtual.latitude) : null}
              lng={siloAtual?.longitude != null ? Number(siloAtual.longitude) : null}
            />
            {silosComCoordenadas.map((silo) => {
              const hasAlert = (silo.alertas_ativos ?? 0) > 0;
              const isSelected = silo.id === siloSelecionado;
              return (
                <Marker
                  key={silo.id}
                  position={[Number(silo.latitude), Number(silo.longitude)]}
                  icon={hasAlert ? redIcon : greenIcon}
                  eventHandlers={{ click: () => { setSiloSelecionado(silo.id); setListaAberta(false); } }}
                >
                  <Tooltip permanent direction="top" offset={[0, -42]} opacity={1}>
                    <span className="text-xs font-semibold">{silo.nome}</span>
                  </Tooltip>
                  <Popup>
                    <div className="text-sm space-y-1">
                      <p className="font-bold">{silo.nome}</p>
                      {silo.cidade && (
                        <p className="text-gray-500">{silo.cidade}/{silo.estado}</p>
                      )}
                      {hasAlert && (
                        <p className="text-red-600 font-semibold">
                          {silo.alertas_ativos} alerta(s)
                        </p>
                      )}
                      {!isSelected && (
                        <button
                          onClick={() => setSiloSelecionado(silo.id)}
                          className="text-green-600 underline text-xs"
                        >
                          Ver painel
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Controles sobrepostos ao mapa */}
          <div className="absolute top-2 left-2 z-[1000]" ref={seletorRef}>
            {/* Botão que mostra o silo atual e abre a lista */}
            <button
              onClick={() => setListaAberta((v) => !v)}
              className="flex items-center gap-2 bg-white rounded-lg shadow-md px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-w-[180px] max-w-[260px]"
            >
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  siloAtual && (siloAtual.alertas_ativos ?? 0) > 0 ? 'bg-red-500' : 'bg-green-500'
                }`}
              />
              <span className="flex-1 text-left truncate">
                {siloAtual?.nome ?? 'Selecione um silo'}
              </span>
              <ChevronDown
                size={14}
                className={`flex-shrink-0 text-gray-400 transition-transform duration-150 ${listaAberta ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Lista suspensa de silos */}
            {listaAberta && (
              <div className="mt-1 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden w-72 max-h-64 overflow-y-auto">
                {silos.map((s) => {
                  const temAlerta = (s.alertas_ativos ?? 0) > 0;
                  const selecionado = s.id === siloSelecionado;
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setSiloSelecionado(s.id); setListaAberta(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors ${
                        selecionado ? 'bg-green-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${temAlerta ? 'bg-red-500' : 'bg-green-500'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${selecionado ? 'text-green-700' : 'text-gray-700'}`}>
                          {s.nome}
                        </p>
                        {s.cidade && (
                          <p className="text-xs text-gray-400 truncate">
                            {s.cidade}/{s.estado}
                          </p>
                        )}
                      </div>
                      {temAlerta && (
                        <AlertTriangle size={13} className="flex-shrink-0 text-red-400" />
                      )}
                      {selecionado && (
                        <Check size={13} className="flex-shrink-0 text-green-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Botão "Todos os silos" */}
          {silosComCoordenadas.length > 0 && (
            <div className="absolute top-2 right-2 z-[1000]">
              <button
                onClick={() => setFitAllTrigger((n) => n + 1)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white shadow-md hover:bg-gray-50 text-gray-700 transition-colors"
                title="Zoom inicial — todos os silos"
              >
                <Maximize2 size={13} /> Todos os silos
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Painel do silo selecionado */}
      {siloSelecionado && (
        <div className="space-y-4">
          {loadingPainel ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            </div>
          ) : painel ? (
            <>
              {/* Info + Clima lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Info do silo */}
                <div className="bg-white rounded-xl shadow p-5">
                  <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2 flex-wrap">
                    <Database size={16} className="text-gray-400" />
                    {painel.silo.nome}
                    {painel.silo.cidade && (
                      <span className="text-sm font-normal text-gray-400 ml-1">
                        — {painel.silo.cidade}/{painel.silo.estado}
                      </span>
                    )}
                    {painel.silo.status === 'Sem leituras há mais de 10 minutos' ? (
                      <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
                        <AlertTriangle size={12} /> Sem leituras
                      </span>
                    ) : (painel.silo.alertas_ativos ?? 0) > 0 ? (
                      <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                        <AlertTriangle size={12} /> Alerta
                      </span>
                    ) : (
                      <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                        <CheckCircle size={12} /> Normal
                      </span>
                    )}
                  </h2>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400 mb-0.5">Status</p>
                      {painel.silo.status === 'Sem leituras há mais de 10 minutos' ? (
                        <p className="font-semibold text-yellow-600 text-xs">{painel.silo.status}</p>
                      ) : (
                        <p className="font-semibold capitalize">{painel.silo.status}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">Cabos pêndulo ativos</p>
                      <p className="font-semibold">{painel.silo.total_barras_ativas}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">Sensores ativos</p>
                      <p className="font-semibold">{painel.silo.total_sensores_ativos}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">Referência</p>
                      <p className="font-semibold text-xs">{fmtTs(painel.referencia)}</p>
                    </div>
                  </div>
                </div>

                {/* Clima */}
                {painel.clima ? (
                  <div className="bg-white rounded-xl shadow p-5">
                    <h2 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
                      <MapPin size={16} className="text-gray-400" />
                      Condições climáticas locais
                    </h2>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-xs text-gray-400">
                        Fonte: <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Open-Meteo</a>
                      </span>
                      {painel.clima?.time && (
                        <span className="text-xs text-gray-400">
                          · {fmtTs(painel.clima.time)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex items-center gap-2 bg-yellow-50 rounded-lg p-3">
                        <WeatherIcon code={painel.clima.weather_code} />
                        <div>
                          <p className="text-xs text-gray-500">Temperatura</p>
                          <p className="font-bold text-gray-800">
                            {fmt(painel.clima.temperature_2m)}°C
                          </p>
                          {painel.clima.apparent_temperature != null && (
                            <p className="text-xs text-gray-400">
                              Sensação {fmt(painel.clima.apparent_temperature)}°C
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-3">
                        <Droplets size={22} className="text-blue-500 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500">Umidade</p>
                          <p className="font-bold text-gray-800">
                            {fmt(painel.clima.relative_humidity_2m, 0)}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                        <Wind size={22} className="text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500">Vento</p>
                          <p className="font-bold text-gray-800">
                            {fmt(painel.clima.wind_speed_10m)} km/h
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow p-5 flex items-center justify-center text-gray-400 text-sm">
                    Dados climáticos indisponíveis
                  </div>
                )}
              </div>

              {/* Tabelas de leituras por local */}
              {painel.resumo_por_local.length > 0 && painel.resumo_por_local.map((grupo) => {
                const grandezasPresentes = grandezasDoLocal(grupo.resumo_alturas);
                return (
                  <div key={grupo.local} className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h2 className="font-semibold text-gray-700">Valores médios da última leitura</h2>
                        <p className="text-xs text-blue-600 font-medium mt-0.5 capitalize">{grupo.local}</p>
                      </div>
                      {painel.referencia && (
                        <span className="text-xs text-gray-400">
                          Referência: {fmtTs(painel.referencia)}
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                              Altura (m)
                            </th>
                            {grandezasPresentes.map((g) => (
                              <th
                                key={g}
                                colSpan={3}
                                className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase border-l border-gray-100 whitespace-nowrap"
                              >
                                {GRANDEZA_LABEL[g]}
                              </th>
                            ))}
                          </tr>
                          <tr className="bg-gray-50 border-t border-gray-100">
                            <th className="px-4 py-2" />
                            {grandezasPresentes.map((g) => (
                              <>
                                <th key={`${g}-avg`} className="px-3 py-2 text-center text-xs text-gray-400 border-l border-gray-100 font-medium">Média</th>
                                <th key={`${g}-min`} className="px-3 py-2 text-center text-xs text-gray-400 font-medium">Mín</th>
                                <th key={`${g}-max`} className="px-3 py-2 text-center text-xs text-gray-400 font-medium">Máx</th>
                              </>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {grupo.resumo_alturas.map((row) => (
                            <tr key={row.altura_m} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                                {row.altura_m.toFixed(1)} m
                              </td>
                              {grandezasPresentes.map((g) => {
                                const d = row[g] as ResumoGrandeza | undefined;
                                return d ? (
                                  <>
                                    <td key={`${g}-avg`} className="px-3 py-3 text-center text-gray-800 font-medium border-l border-gray-100 whitespace-nowrap">
                                      {fmt(d.avg_avg, g === 'temperatura' ? 1 : 0)} <span className="text-gray-400 text-xs">{d.unidade}</span>
                                    </td>
                                    <td key={`${g}-min`} className="px-3 py-3 text-center text-blue-600 whitespace-nowrap">
                                      {fmt(d.avg_min, g === 'temperatura' ? 1 : 0)}
                                    </td>
                                    <td key={`${g}-max`} className="px-3 py-3 text-center text-red-500 whitespace-nowrap">
                                      {fmt(d.avg_max, g === 'temperatura' ? 1 : 0)}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td key={`${g}-avg`} className="px-3 py-3 text-center text-gray-300 border-l border-gray-100">—</td>
                                    <td key={`${g}-min`} className="px-3 py-3 text-center text-gray-300">—</td>
                                    <td key={`${g}-max`} className="px-3 py-3 text-center text-gray-300">—</td>
                                  </>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {/* Relé de aeração */}
              {painel.rele !== null && (
                <div className="bg-white rounded-xl shadow p-5">
                  <h2 className="font-semibold text-gray-700 mb-3">Relé de Aeração (DTG05)</h2>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          painel.rele.ligado ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                      />
                      <span
                        className={`font-semibold text-sm ${
                          painel.rele.ligado ? 'text-green-700' : 'text-gray-500'
                        }`}
                      >
                        {painel.rele.ligado ? 'Ligado' : 'Desligado'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      Última leitura: {fmtTs(painel.rele.timestamp)}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
