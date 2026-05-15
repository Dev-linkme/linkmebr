import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft,
  Plus,
  Power,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Layers,
  Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Silo, Barra, Sensor } from '../types/index';

interface BarraComSensores extends Barra {
  sensores: Sensor[];
  loadingSensores: boolean;
}

interface BarraForm {
  identificacao: string;
}

interface SensorForm {
  identificacao: string;
  altura_solo_m: string;
  tipo_grandeza: 'temperatura' | 'umidade' | 'co2';
}

export default function BarrasPage() {
  const { id: siloId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdminEmpresa, isAdminGeral } = useAuth();
  const podeEditar = isAdminEmpresa || isAdminGeral;

  const [silo, setSilo] = useState<Silo | null>(null);
  const [barras, setBarras] = useState<BarraComSensores[]>([]);
  const [loading, setLoading] = useState(true);
  const [openBarras, setOpenBarras] = useState<Set<number>>(new Set());

  // Form barra
  const [showBarraForm, setShowBarraForm] = useState(false);
  const {
    register: regBarra,
    handleSubmit: handleBarra,
    reset: resetBarra,
    formState: { isSubmitting: submittingBarra },
  } = useForm<BarraForm>();

  // Form sensor — { barraId } | null
  const [sensorFormBarraId, setSensorFormBarraId] = useState<number | null>(null);
  const {
    register: regSensor,
    handleSubmit: handleSensor,
    reset: resetSensor,
    formState: { isSubmitting: submittingSensor },
  } = useForm<SensorForm>();

  const fetchSensores = useCallback(async (barraId: number) => {
    try {
      const res = await api.get<{ data: Sensor[] }>(`/barras/${barraId}/sensores`);
      setBarras((prev) =>
        prev.map((b) =>
          b.id === barraId
            ? { ...b, sensores: res.data.data ?? [], loadingSensores: false }
            : b,
        ),
      );
    } catch {
      setBarras((prev) =>
        prev.map((b) =>
          b.id === barraId ? { ...b, loadingSensores: false } : b,
        ),
      );
    }
  }, []);

  const fetchBarras = useCallback(async () => {
    if (!siloId) return;
    try {
      const res = await api.get<{ data: Barra[] }>(`/silos/${siloId}/barras`);
      const barrasComSensores: BarraComSensores[] = (res.data.data ?? []).map((b) => ({
        ...b,
        sensores: [],
        loadingSensores: true,
      }));
      setBarras(barrasComSensores);
      // Carregar sensores de cada barra
      barrasComSensores.forEach((b) => fetchSensores(b.id));
    } catch {
      toast.error('Erro ao carregar barras');
    }
  }, [siloId, fetchSensores]);

  useEffect(() => {
    if (!siloId) return;
    setLoading(true);
    Promise.all([
      api.get<Silo>(`/dashboard/silos/${siloId}`).catch(() => ({ data: null })),
      api.get<{ data: Barra[] }>(`/silos/${siloId}/barras`).catch(() => ({ data: { data: [] } })),
    ])
      .then(([siloRes, barrasRes]) => {
        setSilo(siloRes.data);
        const barrasComSensores: BarraComSensores[] = (barrasRes.data.data ?? []).map(
          (b: Barra) => ({
            ...b,
            sensores: [],
            loadingSensores: true,
          }),
        );
        setBarras(barrasComSensores);
        barrasComSensores.forEach((b) => fetchSensores(b.id));
      })
      .finally(() => setLoading(false));
  }, [siloId, fetchSensores]);

  function toggleBarra(barraId: number) {
    setOpenBarras((prev) => {
      const next = new Set(prev);
      if (next.has(barraId)) next.delete(barraId);
      else next.add(barraId);
      return next;
    });
  }

  // --- Barra form ---
  async function onSubmitBarra(data: BarraForm) {
    try {
      await api.post(`/silos/${siloId}/barras`, data);
      toast.success('Barra criada com sucesso!');
      setShowBarraForm(false);
      resetBarra();
      await fetchBarras();
    } catch {
      toast.error('Erro ao criar barra');
    }
  }

  async function desativarBarra(barraId: number) {
    try {
      await api.patch(`/barras/${barraId}/status`, { status: 'inativo' });
      toast.success('Barra desativada!');
      await fetchBarras();
    } catch {
      toast.error('Erro ao desativar barra');
    }
  }

  // --- Sensor form ---
  function openSensorForm(barraId: number) {
    setSensorFormBarraId(barraId);
    resetSensor({ tipo_grandeza: 'temperatura', identificacao: '', altura_solo_m: '' });
  }

  function closeSensorForm() {
    setSensorFormBarraId(null);
    resetSensor();
  }

  async function onSubmitSensor(data: SensorForm) {
    if (!sensorFormBarraId) return;
    try {
      await api.post(`/barras/${sensorFormBarraId}/sensores`, {
        ...data,
        altura_solo_m: parseFloat(data.altura_solo_m),
      });
      toast.success('Sensor criado com sucesso!');
      closeSensorForm();
      fetchSensores(sensorFormBarraId);
    } catch {
      toast.error('Erro ao criar sensor');
    }
  }

  async function desativarSensor(sensorId: number, barraId: number) {
    try {
      await api.patch(`/sensores/${sensorId}/status`, { status: 'inativo' });
      toast.success('Sensor desativado!');
      fetchSensores(barraId);
    } catch {
      toast.error('Erro ao desativar sensor');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/silos')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Barras{silo ? ` — ${silo.nome}` : ''}
          </h1>
          {silo?.cidade && (
            <p className="text-sm text-gray-500">
              {[silo.cidade, silo.estado].filter(Boolean).join(' / ')}
            </p>
          )}
        </div>
        {podeEditar && !showBarraForm && (
          <button
            onClick={() => {
              setShowBarraForm(true);
              resetBarra();
            }}
            className="ml-auto inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nova Barra
          </button>
        )}
      </div>

      {/* Formulário nova barra */}
      {showBarraForm && podeEditar && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Layers size={18} className="text-green-600" />
              Nova Barra
            </h2>
            <button
              onClick={() => setShowBarraForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleBarra(onSubmitBarra)} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Identificação *
              </label>
              <input
                {...regBarra('identificacao', { required: true })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Ex: Barra A1"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowBarraForm(false)}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingBarra}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Check size={16} />
              {submittingBarra ? 'Salvando...' : 'Criar Barra'}
            </button>
          </form>
        </div>
      )}

      {/* Lista de barras */}
      {barras.length === 0 && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-gray-400">
          Nenhuma barra cadastrada para este silo.
        </div>
      )}

      <div className="space-y-4">
        {barras.map((barra) => {
          const isOpen = openBarras.has(barra.id);

          return (
            <div key={barra.id} className="bg-white rounded-xl shadow overflow-hidden">
              {/* Header da barra */}
              <div className="flex items-center px-5 py-4">
                <button
                  onClick={() => toggleBarra(barra.id)}
                  className="flex items-center gap-3 flex-1 text-left"
                >
                  {isOpen ? (
                    <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
                  )}
                  <Layers size={16} className="text-green-600 flex-shrink-0" />
                  <span className="font-semibold text-gray-800">{barra.identificacao}</span>
                  <span
                    className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      barra.status === 'ativo'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {barra.status}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {barra.loadingSensores ? '...' : `${barra.sensores.length} sensor(es)`}
                  </span>
                </button>

                {podeEditar && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => openSensorForm(barra.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
                    >
                      <Plus size={13} />
                      Sensor
                    </button>
                    {barra.status === 'ativo' && (
                      <button
                        onClick={() => desativarBarra(barra.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                      >
                        <Power size={13} />
                        Desativar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Formulário novo sensor */}
              {sensorFormBarraId === barra.id && podeEditar && (
                <div className="border-t border-gray-100 bg-green-50 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Activity size={15} className="text-green-600" />
                      Novo Sensor
                    </h3>
                    <button onClick={closeSensorForm} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>
                  <form
                    onSubmit={handleSensor(onSubmitSensor)}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                  >
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Identificação *
                      </label>
                      <input
                        {...regSensor('identificacao', { required: true })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                        placeholder="Ex: T1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Altura do solo (m) *
                      </label>
                      <input
                        {...regSensor('altura_solo_m', { required: true })}
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                        placeholder="Ex: 1.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Tipo de grandeza *
                      </label>
                      <select
                        {...regSensor('tipo_grandeza', { required: true })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        <option value="temperatura">Temperatura</option>
                        <option value="umidade">Umidade</option>
                        <option value="co2">CO₂</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={closeSensorForm}
                        className="px-3 py-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={submittingSensor}
                        className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
                      >
                        <Check size={14} />
                        {submittingSensor ? 'Criando...' : 'Criar Sensor'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Sensores */}
              {isOpen && (
                <div className="border-t border-gray-100">
                  {barra.loadingSensores ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
                    </div>
                  ) : barra.sensores.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">
                      Nenhum sensor cadastrado nesta barra.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">
                              Identificação
                            </th>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">
                              Tipo
                            </th>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">
                              Altura (m)
                            </th>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">
                              Unidade
                            </th>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">
                              Status
                            </th>
                            {podeEditar && (
                              <th className="px-5 py-2 text-right text-xs font-semibold text-gray-400 uppercase">
                                Ações
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {barra.sensores.map((sensor) => (
                            <tr key={sensor.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-3 text-sm font-medium text-gray-800">
                                {sensor.identificacao}
                              </td>
                              <td className="px-5 py-3 text-sm text-gray-600 capitalize">
                                {sensor.tipo_grandeza}
                              </td>
                              <td className="px-5 py-3 text-sm text-gray-600">
                                {sensor.altura_solo_m}
                              </td>
                              <td className="px-5 py-3 text-sm text-gray-600">
                                {sensor.unidade_medida}
                              </td>
                              <td className="px-5 py-3">
                                <span
                                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    sensor.status === 'ativo'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {sensor.status}
                                </span>
                              </td>
                              {podeEditar && (
                                <td className="px-5 py-3 text-right">
                                  {sensor.status === 'ativo' && (
                                    <button
                                      onClick={() =>
                                        desativarSensor(sensor.id, barra.id)
                                      }
                                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                                    >
                                      <Power size={12} />
                                      Desativar
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
