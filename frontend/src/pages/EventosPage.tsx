import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { CalendarClock, Plus, Pencil, Trash2, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../services/api';
import type { Silo, Evento } from '../types/index';

interface EventoFormData {
  hora_referencia: string;
  descricao_resumida: string;
  descricao_completa: string;
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

// ─── Modal de Visualização ────────────────────────────────────────────────────

function ViewModal({ evento, onClose }: { evento: Evento; onClose: () => void }) {
  const campos = [
    { label: 'ID', value: String(evento.id) },
    { label: 'Data/Hora', value: formatHora(evento.hora_referencia) },
    { label: 'Responsável', value: evento.usuario?.nome_completo ?? `Usuário ${evento.usuario_id}` },
    { label: 'Descrição Resumida', value: evento.descricao_resumida },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-7xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Detalhes do Evento</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <dl className="space-y-3">
          {campos.map(({ label, value }) => (
            <div key={label} className="flex items-start gap-2">
              <dt className="w-36 shrink-0 text-xs font-semibold text-gray-500 uppercase pt-0.5">{label}</dt>
              <dd className="text-sm text-gray-800">{value}</dd>
            </div>
          ))}
          <div className="flex items-start gap-2">
            <dt className="w-36 shrink-0 text-xs font-semibold text-gray-500 uppercase pt-0.5">Descrição Completa</dt>
            <dd className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded p-3 flex-1">
              {evento.descricao_completa || '—'}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function EventosPage() {
  const [silos, setSilos] = useState<Silo[]>([]);
  const [siloId, setSiloId] = useState('');

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [viewingEvento, setViewingEvento] = useState<Evento | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EventoFormData>();

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => {
        const ativos = (res.data.data ?? []).filter((s) => s.status === 'ativo');
        setSilos(ativos);
        if (ativos.length === 1) setSiloId(String(ativos[0].id));
      })
      .catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  const fetchEventos = useCallback(async (sid: string, page: number) => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Evento[]; meta: { totalPages: number } }>('/eventos', {
        params: { silo_id: sid, page, limit: 20 },
      });
      setEventos(res.data.data ?? []);
      setTotalPaginas(res.data.meta?.totalPages ?? 0);
      setPagina(page);
    } catch {
      toast.error('Erro ao carregar eventos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setEventos([]); setShowForm(false); setEditingId(null);
    if (!siloId) return;
    fetchEventos(siloId, 1);
  }, [siloId, fetchEventos]);

  const openNew = () => {
    setEditingId(null);
    reset({ hora_referencia: '', descricao_resumida: '', descricao_completa: '' });
    setShowForm(true);
  };

  const openEdit = (e: Evento) => {
    setEditingId(e.id);
    reset({
      hora_referencia: isoToDatetimeLocal(e.hora_referencia),
      descricao_resumida: e.descricao_resumida,
      descricao_completa: e.descricao_completa ?? '',
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); reset(); };

  const onSubmit = async (data: EventoFormData) => {
    const payload = {
      hora_referencia: datetimeLocalToISO(data.hora_referencia),
      descricao_resumida: data.descricao_resumida,
      descricao_completa: data.descricao_completa || undefined,
    };
    try {
      if (editingId !== null) {
        await api.put(`/eventos/${editingId}`, payload);
        toast.success('Evento atualizado com sucesso.');
      } else {
        await api.post('/eventos', { ...payload, silo_id: Number(siloId) });
        toast.success('Evento criado com sucesso.');
      }
      closeForm();
      fetchEventos(siloId, pagina);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao salvar evento.';
      toast.error(msg);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/eventos/${id}`);
      toast.success('Evento excluído.');
      setConfirmDeleteId(null);
      fetchEventos(siloId, pagina);
    } catch {
      toast.error('Erro ao excluir evento.');
    }
  };

  const cls = (hasError: boolean) =>
    `w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarClock size={28} className="text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Eventos</h1>
        </div>
        {siloId && !showForm && (
          <button onClick={openNew} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded">
            <Plus size={16} /> Novo Evento
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500">
        Registre anotações sobre eventos importantes relacionados à gestão de um silo (ex.: retirada de um sensor, manutenção, etc.).
      </p>

      {/* Seletor de silo */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Silo *</label>
        <select
          value={siloId}
          onChange={(e) => setSiloId(e.target.value)}
          className="w-full sm:w-80 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Selecione um silo...</option>
          {silos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>

      {!siloId ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-10 text-center text-gray-400 text-sm">
          Selecione um silo para ver ou registrar eventos.
        </div>
      ) : (
        <>
          {/* Formulário inline */}
          {showForm && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{editingId !== null ? 'Editar Evento' : 'Novo Evento'}</h2>
                <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data/Hora de Referência <span className="text-red-500">*</span></label>
                    <input type="datetime-local" {...register('hora_referencia', { required: 'Data/hora é obrigatória.' })} className={cls(!!errors.hora_referencia)} />
                    {errors.hora_referencia && <p className="text-red-500 text-xs mt-1">{errors.hora_referencia.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição Resumida <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={200}
                      {...register('descricao_resumida', { required: 'Descrição resumida é obrigatória.' })}
                      className={cls(!!errors.descricao_resumida)}
                    />
                    {errors.descricao_resumida && <p className="text-red-500 text-xs mt-1">{errors.descricao_resumida.message}</p>}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição Completa (opcional)</label>
                    <textarea rows={4} {...register('descricao_completa')} className={cls(false)} />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeForm} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60">
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
            ) : eventos.length === 0 ? (
              <div className="flex justify-center items-center py-12"><span className="text-gray-500">Nenhum evento registrado para este silo.</span></div>
            ) : (
              <div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição Resumida</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsável</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {eventos.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-500 font-mono whitespace-nowrap">{e.id}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{formatHora(e.hora_referencia)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{e.descricao_resumida}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{e.usuario?.nome_completo ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setViewingEvento(e)} title="Visualizar" className="text-gray-500 hover:text-blue-600 p-1 rounded">
                              <Eye size={16} />
                            </button>
                            <button onClick={() => openEdit(e)} title="Editar" className="text-gray-500 hover:text-green-600 p-1 rounded">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => setConfirmDeleteId(e.id)} title="Excluir" className="text-gray-500 hover:text-red-600 p-1 rounded">
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
                      <button onClick={() => fetchEventos(siloId, pagina - 1)} disabled={pagina <= 1 || loading}
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <ChevronLeft size={15} />Anterior
                      </button>
                      <button onClick={() => fetchEventos(siloId, pagina + 1)} disabled={pagina >= totalPaginas || loading}
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

      {viewingEvento && <ViewModal evento={viewingEvento} onClose={() => setViewingEvento(null)} />}

      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-600 mb-6">Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita.</p>
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
