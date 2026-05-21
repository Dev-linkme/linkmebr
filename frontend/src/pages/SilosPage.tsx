import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Layers, Trash2, X, Check, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Silo } from '../types/index';

interface SiloForm {
  nome: string;
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  latitude?: string;
  longitude?: string;
  descricao?: string;
}

interface SilosResponse {
  data: Silo[];
  total?: number;
  page?: number;
  per_page?: number;
}

// ─── Modal de Visualização ────────────────────────────────────────────────────

function ViewModal({ silo, onClose }: { silo: Silo; onClose: () => void }) {
  const campos = [
    { label: 'ID', value: String(silo.id) },
    { label: 'Nome', value: silo.nome },
    { label: 'Cidade', value: silo.cidade ?? '—' },
    { label: 'Estado', value: silo.estado ?? '—' },
    { label: 'Latitude', value: silo.latitude != null ? String(silo.latitude) : '—' },
    { label: 'Longitude', value: silo.longitude != null ? String(silo.longitude) : '—' },
    { label: 'Barras ativas', value: String(silo.total_barras_ativas ?? 0) },
    { label: 'Sensores ativos', value: String(silo.total_sensores_ativos ?? 0) },
    { label: 'Descrição', value: silo.descricao ?? '—' },
    {
      label: 'Status',
      value: silo.status === 'ativo' ? 'Ativo' : 'Inativo',
      badge: silo.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Detalhes do Silo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <dl className="space-y-3">
          {campos.map(({ label, value, badge }) => (
            <div key={label} className="flex items-start gap-2">
              <dt className="w-36 shrink-0 text-xs font-semibold text-gray-500 uppercase pt-0.5">{label}</dt>
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

export default function SilosPage() {
  const navigate = useNavigate();
  const { isAdminEmpresa } = useAuth();
  const podeEditar = isAdminEmpresa;

  const [silos, setSilos] = useState<Silo[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [formMode, setFormMode] = useState<null | 'new' | number>(null);
  const [viewingSilo, setViewingSilo] = useState<Silo | null>(null);
  const perPage = 10;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SiloForm>();

  function fetchSilos(p = 1) {
    setLoading(true);
    api
      .get<SilosResponse | Silo[]>(`/silos?page=${p}&per_page=${perPage}`)
      .then((res) => {
        if (Array.isArray(res.data)) {
          setSilos(res.data);
          setTotal(res.data.length);
        } else {
          setSilos(res.data.data);
          setTotal(res.data.total ?? res.data.data.length);
        }
      })
      .catch(() => toast.error('Erro ao carregar silos'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchSilos(page); }, [page]);

  function openNew() { reset({}); setFormMode('new'); }

  function openEdit(silo: Silo) {
    reset({
      nome: silo.nome,
      cidade: silo.cidade ?? '',
      estado: silo.estado ?? '',
      latitude: silo.latitude != null ? String(silo.latitude) : '',
      longitude: silo.longitude != null ? String(silo.longitude) : '',
      descricao: silo.descricao ?? '',
    });
    setFormMode(silo.id);
  }

  function closeForm() { setFormMode(null); reset({}); }

  async function onSubmit(data: SiloForm) {
    const payload = {
      ...data,
      latitude: data.latitude ? parseFloat(data.latitude) : undefined,
      longitude: data.longitude ? parseFloat(data.longitude) : undefined,
    };
    try {
      if (formMode === 'new') {
        await api.post('/silos', payload);
        toast.success('Silo criado com sucesso!');
      } else {
        await api.put(`/silos/${formMode}`, payload);
        toast.success('Silo atualizado com sucesso!');
      }
      closeForm();
      fetchSilos(page);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao salvar silo.';
      toast.error(msg);
    }
  }

  async function excluirSilo(silo: Silo) {
    if (!confirm(`Excluir o silo "${silo.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/silos/${silo.id}`);
      toast.success('Silo excluído com sucesso!');
      fetchSilos(page);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao excluir silo.';
      toast.error(msg);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const cls = (hasError: boolean) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Silos</h1>
        {podeEditar && formMode === null && (
          <button onClick={openNew} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus size={16} /> Novo Silo
          </button>
        )}
      </div>

      {/* Formulário inline */}
      {formMode !== null && podeEditar && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">{formMode === 'new' ? 'Novo Silo' : 'Editar Silo'}</h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome <span className="text-red-500">*</span></label>
                <input
                  {...register('nome', { required: 'Nome do silo é obrigatório.' })}
                  className={cls(!!errors.nome)}
                  placeholder="Nome do silo"
                />
                {errors.nome && <p className="text-red-500 text-xs mt-1">{errors.nome.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
                <input {...register('cidade')} className={cls(false)} placeholder="Cidade" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                <input {...register('estado')} className={cls(false)} placeholder="UF" maxLength={2} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Logradouro</label>
                <input {...register('logradouro')} className={cls(false)} placeholder="Endereço" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Bairro</label>
                <input {...register('bairro')} className={cls(false)} placeholder="Bairro" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
                <input {...register('latitude')} type="number" step="any" className={cls(false)} placeholder="-15.000000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
                <input {...register('longitude')} type="number" step="any" className={cls(false)} placeholder="-55.000000" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
                <textarea {...register('descricao')} rows={2} className={cls(false)} placeholder="Descrição opcional" />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={closeForm} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                <Check size={16} />{isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center min-h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Localização</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Barras / Sensores</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {silos.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">Nenhum silo cadastrado.</td></tr>
                )}
                {silos.map((silo) => (
                  <tr key={silo.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-medium text-gray-900">{silo.nome}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{[silo.cidade, silo.estado].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{silo.total_barras_ativas ?? 0} / {silo.total_sensores_ativos ?? 0}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${silo.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {silo.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setViewingSilo(silo)} title="Visualizar" className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors">
                          <Eye size={13} /> Ver
                        </button>
                        <button onClick={() => navigate(`/admin/silos/${silo.id}/barras`)} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors" title="Gerenciar barras">
                          <Layers size={13} /> Barras
                        </button>
                        {podeEditar && (
                          <>
                            <button onClick={() => openEdit(silo)} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors" title="Editar">
                              <Edit2 size={13} /> Editar
                            </button>
                            <button onClick={() => excluirSilo(silo)} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors" title="Excluir">
                              <Trash2 size={13} /> Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>Página {page} de {totalPages} ({total} silos)</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Anterior</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Próxima</button>
              </div>
            </div>
          )}
        </div>
      )}

      {viewingSilo && <ViewModal silo={viewingSilo} onClose={() => setViewingSilo(null)} />}
    </div>
  );
}
