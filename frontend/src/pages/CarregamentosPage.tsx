import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Boxes, Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../services/api';
import type { Silo, Carregamento } from '../types/index';

interface CarregamentoFormData {
  hora_referencia: string;
  nivel_m: number;
  volume_sacos: number;
}

const BRT = 'America/Sao_Paulo';

function formatHora(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}

// datetime-local não tem timezone — interpreta o valor digitado como horário de Brasília
function datetimeLocalToISO(value: string): string {
  return new Date(`${value}:00-03:00`).toISOString();
}
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

export default function CarregamentosPage() {
  const [silos, setSilos] = useState<Silo[]>([]);
  const [siloId, setSiloId] = useState('');

  const [carregamentos, setCarregamentos] = useState<Carregamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CarregamentoFormData>();

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => {
        const ativos = (res.data.data ?? []).filter((s) => s.status === 'ativo');
        setSilos(ativos);
        if (ativos.length === 1) setSiloId(String(ativos[0].id));
      })
      .catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  const fetchCarregamentos = useCallback(async (sid: string, page: number) => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Carregamento[]; meta: { totalPages: number } }>('/carregamentos', {
        params: { silo_id: sid, page, limit: 20 },
      });
      setCarregamentos(res.data.data ?? []);
      setTotalPaginas(res.data.meta?.totalPages ?? 0);
      setPagina(page);
    } catch {
      toast.error('Erro ao carregar registros de carregamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCarregamentos([]); setShowForm(false); setEditingId(null);
    if (!siloId) return;
    fetchCarregamentos(siloId, 1);
  }, [siloId, fetchCarregamentos]);

  const openNew = () => {
    setEditingId(null);
    reset({ hora_referencia: '', nivel_m: 0, volume_sacos: 0 });
    setShowForm(true);
  };

  const openEdit = (c: Carregamento) => {
    setEditingId(c.id);
    reset({
      hora_referencia: isoToDatetimeLocal(c.hora_referencia),
      nivel_m: c.nivel_m,
      volume_sacos: c.volume_sacos,
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); reset(); };

  const onSubmit = async (data: CarregamentoFormData) => {
    const payload = {
      hora_referencia: datetimeLocalToISO(data.hora_referencia),
      nivel_m: Number(data.nivel_m),
      volume_sacos: Number(data.volume_sacos),
    };
    try {
      if (editingId !== null) {
        await api.put(`/carregamentos/${editingId}`, payload);
        toast.success('Registro atualizado com sucesso.');
      } else {
        await api.post('/carregamentos', { ...payload, silo_id: Number(siloId) });
        toast.success('Registro criado com sucesso.');
      }
      closeForm();
      fetchCarregamentos(siloId, pagina);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao salvar registro.';
      toast.error(msg);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/carregamentos/${id}`);
      toast.success('Registro excluído.');
      setConfirmDeleteId(null);
      fetchCarregamentos(siloId, pagina);
    } catch {
      toast.error('Erro ao excluir registro.');
    }
  };

  const cls = (hasError: boolean) =>
    `w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Boxes size={28} className="text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Carregamento de Silos</h1>
        </div>
        {siloId && !showForm && (
          <button onClick={openNew} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">
            <Plus size={16} /> Novo Registro
          </button>
        )}
      </div>

      {/* Seletor de silo */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Silo *</label>
        <select
          value={siloId}
          onChange={(e) => setSiloId(e.target.value)}
          className="w-full sm:w-80 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Selecione um silo...</option>
          {silos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>

      {!siloId ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-10 text-center text-gray-400 text-sm">
          Selecione um silo para ver ou lançar registros de carregamento.
        </div>
      ) : (
        <>
          {/* Formulário inline */}
          {showForm && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{editingId !== null ? 'Editar Registro' : 'Novo Registro'}</h2>
                <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data/Hora de Referência <span className="text-red-500">*</span></label>
                    <input type="datetime-local" {...register('hora_referencia', { required: 'Data/hora é obrigatória.' })} className={cls(!!errors.hora_referencia)} />
                    {errors.hora_referencia && <p className="text-red-500 text-xs mt-1">{errors.hora_referencia.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nível (m) <span className="text-red-500">*</span></label>
                    <input type="number" step="0.01" min="0"
                      {...register('nivel_m', { required: 'Nível é obrigatório.', min: { value: 0, message: 'Nível não pode ser negativo.' } })}
                      className={cls(!!errors.nivel_m)}
                    />
                    {errors.nivel_m && <p className="text-red-500 text-xs mt-1">{errors.nivel_m.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Volume (sacos de 60kg) <span className="text-red-500">*</span></label>
                    <input type="number" step="0.01" min="0"
                      {...register('volume_sacos', { required: 'Volume é obrigatório.', min: { value: 0, message: 'Volume não pode ser negativo.' } })}
                      className={cls(!!errors.volume_sacos)}
                    />
                    {errors.volume_sacos && <p className="text-red-500 text-xs mt-1">{errors.volume_sacos.message}</p>}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeForm} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60">
                    {isSubmitting ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tabela */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-x-auto">
            {loading ? (
              <div className="flex justify-center items-center py-12"><span className="text-gray-500">Carregando...</span></div>
            ) : carregamentos.length === 0 ? (
              <div className="flex justify-center items-center py-12"><span className="text-gray-500">Nenhum registro de carregamento para este silo.</span></div>
            ) : (
              <div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nível (m)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Volume (sc)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {carregamentos.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{formatHora(c.hora_referencia)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{Number(c.nivel_m).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{Number(c.volume_sacos).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(c)} title="Editar" className="text-gray-500 hover:text-green-600 p-1 rounded">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => setConfirmDeleteId(c.id)} title="Excluir" className="text-gray-500 hover:text-red-600 p-1 rounded">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <p className="text-sm text-gray-600">Página {pagina} / {totalPaginas}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => fetchCarregamentos(siloId, pagina - 1)} disabled={pagina <= 1 || loading}
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <ChevronLeft size={15} />Anterior
                      </button>
                      <button onClick={() => fetchCarregamentos(siloId, pagina + 1)} disabled={pagina >= totalPaginas || loading}
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        Próximo<ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-600 mb-6">Tem certeza que deseja excluir este registro de carregamento? Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm">Cancelar</button>
              <button onClick={() => handleDelete(confirmDeleteId)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
