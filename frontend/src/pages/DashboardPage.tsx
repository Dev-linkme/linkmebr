import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { AlertTriangle, CheckCircle, Database, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { Silo } from '../types/index';

// Fix Leaflet default icon
L.Icon.Default.mergeOptions({ iconUrl, shadowUrl, iconRetinaUrl: iconUrl });

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function DashboardPage() {
  const navigate = useNavigate();
  const [silos, setSilos] = useState<Silo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: Silo[] }>('/dashboard/silos')
      .then((res) => setSilos(res.data.data ?? []))
      .catch(() => toast.error('Erro ao carregar dados do dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const total = silos.length;
  const emAlerta = silos.filter((s) => (s.alertas_ativos ?? 0) > 0).length;
  const normais = total - emAlerta;

  const silosComCoordenadas = silos.filter(
    (s) => s.latitude != null && s.longitude != null,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

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
        <div className="h-[400px]">
          <MapContainer
            center={[-15, -55]}
            zoom={4}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {silosComCoordenadas.map((silo) => (
              <Marker
                key={silo.id}
                position={[silo.latitude!, silo.longitude!]}
                icon={(silo.alertas_ativos ?? 0) > 0 ? redIcon : greenIcon}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-bold">{silo.nome}</p>
                    {silo.cidade && (
                      <p className="text-gray-500">
                        {silo.cidade}/{silo.estado}
                      </p>
                    )}
                    {(silo.alertas_ativos ?? 0) > 0 && (
                      <p className="text-red-600 font-semibold">
                        {silo.alertas_ativos} alerta(s)
                      </p>
                    )}
                    <button
                      onClick={() => navigate(`/dashboard/silos/${silo.id}`)}
                      className="mt-2 text-green-600 underline text-xs"
                    >
                      Ver detalhe
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {silos.map((silo) => {
          const hasAlert = (silo.alertas_ativos ?? 0) > 0;
          return (
            <button
              key={silo.id}
              onClick={() => navigate(`/dashboard/silos/${silo.id}`)}
              className="bg-white rounded-xl shadow p-5 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-bold text-gray-900 text-lg leading-tight">
                  {silo.nome}
                </h2>
                <span
                  className={`ml-2 flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                    hasAlert
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {hasAlert ? (
                    <>
                      <AlertTriangle size={11} />
                      {silo.alertas_ativos} alerta(s)
                    </>
                  ) : (
                    <>
                      <CheckCircle size={11} />
                      Normal
                    </>
                  )}
                </span>
              </div>

              {(silo.cidade || silo.estado) && (
                <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
                  <MapPin size={13} />
                  {[silo.cidade, silo.estado].filter(Boolean).join(' / ')}
                </p>
              )}

              <div className="flex gap-4 text-sm text-gray-600">
                <span>
                  <span className="font-semibold">{silo.total_barras_ativas ?? 0}</span>{' '}
                  barra(s)
                </span>
                <span>
                  <span className="font-semibold">
                    {silo.total_sensores_ativos ?? 0}
                  </span>{' '}
                  sensor(es)
                </span>
              </div>
            </button>
          );
        })}

        {silos.length === 0 && (
          <p className="col-span-full text-center text-gray-400 py-12">
            Nenhum silo cadastrado.
          </p>
        )}
      </div>
    </div>
  );
}
