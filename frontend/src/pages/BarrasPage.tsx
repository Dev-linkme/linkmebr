import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Plus, Power, ChevronDown, ChevronRight, X, Check, Layers, Activity, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Silo, Barra, Sensor } from '../types/index';

interface BarraComSensores extends Barra {
  sensores: Sensor[];
  loadingSensores: boolean;
}

interface BarraForm { identificacao: string; }

interface SensorForm {
  identificacao: string;
  altura_solo_m: string;
  tipo_grandeza: 'temperatura' | 'umidade' | 'co2';
}

const TIPO_LABELS: Record<string, string> = {
  temperatura: 'Temperatura',
  umidade: 'Umidade',
  co2: 'CO₂',
};

// ─── Modal de Visualização de Sensor ─────────────────────────────────────────

function SensorViewModal({ sensor, onClose }: { sensor: Sensor; onClose: () => void }) {
  const campos = [
    { label: 'ID', value: String(sensor.id) },
    { label: 'Identificação', value: sensor.identificacao },
    { label: 'Tipo', value: TIPO_LABELS[sensor.tipo_grandeza] ?? sensor.tipo_grandeza },
    { label: 'Altura (m)', value: String(sensor.altura_solo_m) },
    { label: 'Unidade', value: sensor.unidade_medida },
    {
      label: 'Status',
      value: sensor.status === 'ativo' ? 'Ativo' : 'Inativo',
      badge: sensor.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Detalhes do Sensor</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <dl className="space-y-3">
          {campos.map(({ label, value, badge }) => (
            <div key={label} className="flex items-start gap-2">
              <dt className="w-32 shrink-0 text-xs font-semibold text-gray-500 uppercase pt-0.5">{label}</dt>
              <dd className="text-sm text-gray-800">
                {badge ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>{value}</span> : value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function BarrasPage() {
  const { id: siloId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdminEmpresa } = useAuth();
  const podeEditar = isAdminEmpresa;

  const [silo, setSilo] = useState<Silo | null>(null);
  const [barras, setBarras] = useState<BarraComSensores[]>([]);
  const [loading, setLoading] = useState(true);
  const [openBarras, setOpenBarras] = useState<Set<number>>(new Set());
  const [viewingSensor, setViewingSensor] = useState<Sensor | null>(null);

  const {
    register: regBarra,
    handleSubmit: handleBarra,
    reset: resetBarra,
    formState: { errors: errBarra, isSubmitting: submittingBarra },
  } = useForm<BarraForm>();

  const [showBarraForm, setShowBarraForm] = useState(false);
  const [sensorFormBarraId, setSensorFormBarraId] = useState<number | null>(null);

  const {
    register: regSensor,
    handleSubmit: handleSensor,
    reset: resetSensor,
    formState: { errors: errSensor, isSubmitting: submittingSensor },
  } = useForm<SensorForm>();

  const fetchSensores = useCallback(async (barraId: number) => {
    try {
      const res = await api.get<{ data: Sensor[] }>(`/barras/${barraId}/sensores`);
      setBarras((prev) => prev.map((b) => b.id === barraId ? { ...b, sensores: res.data.data ?? [], loadingSensores: false } : b));
    } catch {
      setBarras((prev) => prev.map((b) => b.id === barraId ? { ...b, loadingSensores: false } : b));
    }
  }, []);

  const fetchBarras = useCallback(async () => {
    if (!siloId) return;
    try {
      const res = await api.get<{ data: Barra[] }>(`/silos/${siloId}/barras`);
      const barrasComSensores: BarraComSensores[] = (res.data.data ?? []).map((b) => ({ ...b, sensores: [], loadingSensores: true }));
      setBarras(barrasComSensores);
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
        const barrasComSensores: BarraComSensores[] = (barrasRes.data.data ?? []).map((b: Barra) => ({ ...b, sensores: [], loadingSensores: true }));
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

  async function onSubmitBarra(data: BarraForm) {
    try {
      await api.post(`/silos/${siloId}/barras`, data);
      toast.success('Barra criada com sucesso!');
      setShowBarraForm(false);
      resetBarra();
      await fetchBarras();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao criar barra.';
      toast.error(msg);
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

  function openSensorForm(barraId: number) {
    setSensorFormBarraId(barraId);
    resetSensor({ tipo_grandeza: 'temperatura', identificacao: '', altura_solo_m: '' });
  }

  function closeSensorForm() { setSensorFormBarraId(null); resetSensor(); }

  async function onSubmitSensor(data: SensorForm) {
    if (!sensorFormBarraId) return;
    try {
      await api.post(`/barras/${sensorFormBarraId}/sensores`, { ...data, altura_solo_m: parseFloat(data.altura_solo_m) });
      toast.success('Sensor criado com sucesso!');
      closeSensorForm();
      fetchSensores(sensorFormBarraId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao criar sensor.';
      toast.error(msg);
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

  const clsInput = (hasError: boolean) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white ${hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

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
        <button onClick={() => navigate('/admin/silos')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Voltar">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Barras{silo ? ` — ${silo.nome}` : ''}</h1>
          {silo?.cidade && <p className="text-sm text-gray-500">{[silo.cidade, silo.estado].filter(Boolean).join(' / ')}</p>}
        </div>
        {podeEditar && !showBarraForm && (
          <button onClick={() => { setShowBarraForm(true); resetBarra(); }} className="ml-auto inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus size={16} /> Nova Barra
          </button>
        )}
      </div>

      {/* Formulário nova barra */}
      {showBarraForm && podeEditar && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Layers size={18} className="text-green-600" /> Nova Barra
            </h2>
            <button onClick={() => setShowBarraForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <form onSubmit={handleBarra(onSubmitBarra)} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Identificação <span className="text-red-500">*</span></label>
              <input
                {...regBarra('identificacao', { required: 'Identificação da barra é obrigatória.' })}
                className={clsInput(!!errBarra.identificacao)}
                placeholder="Ex: Barra A1"
              />
              {errBarra.identificacao && <p className="text-red-500 text-xs mt-1">{errBarra.identificacao.message}</p>}
            </div>
            <div className="flex gap-2 sm:pt-5">
              <button type="button" onClick={() => setShowBarraForm(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancelar</button>
              <button type="submit" disabled={submittingBarra} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                <Check size={16} />{submittingBarra ? 'Salvando...' : 'Criar Barra'}
              </button>
            </div>
          </form>
        </div>
      )}

      {barras.length === 0 && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-gray-400">Nenhuma barra cadastrada para este silo.</div>
      )}

      <div className="space-y-4">
        {barras.map((barra) => {
          const isOpen = openBarras.has(barra.id);
          return (
            <div key={barra.id} className="bg-white rounded-xl shadow overflow-hidden">
              {/* Header da barra */}
              <div className="flex items-center px-5 py-4">
                <button onClick={() => toggleBarra(barra.id)} className="flex items-center gap-3 flex-1 text-left">
                  {isOpen ? <ChevronDown size={18} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />}
                  <Layers size={16} className="text-green-600 flex-shrink-0" />
                  <span className="font-semibold text-gray-800">{barra.identificacao}</span>
                  <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${barra.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {barra.status}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">{barra.loadingSensores ? '...' : `${barra.sensores.length} sensor(es)`}</span>
                </button>

                {podeEditar && (
                  <div className="flex items-center gap-2 ml-4">
                    <button onClick={() => openSensorForm(barra.id)} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors">
                      <Plus size={13} /> Sensor
                    </button>
                    {barra.status === 'ativo' && (
                      <button onClick={() => desativarBarra(barra.id)} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors">
                        <Power size={13} /> Desativar
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
                      <Activity size={15} className="text-green-600" /> Novo Sensor
                    </h3>
                    <button onClick={closeSensorForm} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                  </div>
                  <form onSubmit={handleSensor(onSubmitSensor)} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Identificação <span className="text-red-500">*</span></label>
                      <input {...regSensor('identificacao', { required: 'Identificação é obrigatória.' })} className={clsInput(!!errSensor.identificacao)} placeholder="Ex: T1" />
                      {errSensor.identificacao && <p className="text-red-500 text-xs mt-1">{errSensor.identificacao.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Altura do solo (m) <span className="text-red-500">*</span></label>
                      <input
                        {...regSensor('altura_solo_m', {
                          required: 'Altura é obrigatória.',
                          min: { value: 0, message: 'Altura deve ser maior ou igual a zero.' },
                        })}
                        type="number" step="0.01" min="0"
                        className={clsInput(!!errSensor.altura_solo_m)}
                        placeholder="Ex: 1.5"
                      />
                      {errSensor.altura_solo_m && <p className="text-red-500 text-xs mt-1">{errSensor.altura_solo_m.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de grandeza <span className="text-red-500">*</span></label>
                      <select {...regSensor('tipo_grandeza', { required: 'Selecione o tipo.' })} className={clsInput(!!errSensor.tipo_grandeza)}>
                        <option value="temperatura">Temperatura</option>
                        <option value="umidade">Umidade</option>
                        <option value="co2">CO₂</option>
                      </select>
                      {errSensor.tipo_grandeza && <p className="text-red-500 text-xs mt-1">{errSensor.tipo_grandeza.message}</p>}
                    </div>
                    <div className="sm:col-span-3 flex justify-end gap-3">
                      <button type="button" onClick={closeSensorForm} className="px-3 py-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors">Cancelar</button>
                      <button type="submit" disabled={submittingSensor} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors">
                        <Check size={14} />{submittingSensor ? 'Criando...' : 'Criar Sensor'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Tabela de sensores */}
              {isOpen && (
                <div className="border-t border-gray-100">
                  {barra.loadingSensores ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
                    </div>
                  ) : barra.sensores.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">Nenhum sensor cadastrado nesta barra.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Identificação</th>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Tipo</th>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Altura (m)</th>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Unidade</th>
                            <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                            <th className="px-5 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {barra.sensores.map((sensor) => (
                            <tr key={sensor.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-3 text-sm font-medium text-gray-800">{sensor.identificacao}</td>
                              <td className="px-5 py-3 text-sm text-gray-600">{TIPO_LABELS[sensor.tipo_grandeza] ?? sensor.tipo_grandeza}</td>
                              <td className="px-5 py-3 text-sm text-gray-600">{sensor.altura_solo_m}</td>
                              <td className="px-5 py-3 text-sm text-gray-600">{sensor.unidade_medida}</td>
                              <td className="px-5 py-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sensor.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {sensor.status}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => setViewingSensor(sensor)} title="Visualizar" className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors">
                                    <Eye size={12} />
                                  </button>
                                  {podeEditar && sensor.status === 'ativo' && (
                                    <button onClick={() => desativarSensor(sensor.id, barra.id)} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors">
                                      <Power size={12} /> Desativar
                                    </button>
                                  )}
                                </div>
                              </td>
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

      {viewingSensor && <SensorViewModal sensor={viewingSensor} onClose={() => setViewingSensor(null)} />}
    </div>
  );
}
