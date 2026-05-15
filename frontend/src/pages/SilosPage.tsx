import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Layers, Power, X, Check } from 'lucide-react';
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

export default function SilosPage() {
  const navigate = useNavigate();
  const { isAdminEmpresa, isAdminGeral } = useAuth();
  const podeEditar = isAdminEmpresa || isAdminGeral;

  const [silos, setSilos] = useState<Silo[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 10;

  // Form state: null = fechado, 'new' = novo silo, number = id editando
  const [formMode, setFormMode] = useState<null | 'new' | number>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<SiloForm>();

  function fetchSilos(p = 1) {
    setLoading(true);
    api
      .get<SilosResponse | Silo[]>(`/silos?page=${p}&per_page=${perPage}`)
      .then((res) => {
        // Suporte a resposta paginada ou array simples
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

  useEffect(() => {
    fetchSilos(page);
  }, [page]);

  function openNew() {
    reset({});
    setFormMode('new');
  }

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

  function closeForm() {
    setFormMode(null);
    reset({});
  }

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
    } catch {
      toast.error('Erro ao salvar silo');
    }
  }

  async function toggleStatus(silo: Silo) {
    const novoStatus = silo.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      await api.patch(`/silos/${silo.id}/status`, { status: novoStatus });
      toast.success(`Silo ${novoStatus === 'ativo' ? 'ativado' : 'desativado'} com sucesso!`);
      fetchSilos(page);
    } catch {
      toast.error('Erro ao alterar status do silo');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Silos</h1>
        {podeEditar && formMode === null && (
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Novo Silo
          </button>
        )}
      </div>

      {/* Formulário inline */}
      {formMode !== null && podeEditar && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">
              {formMode === 'new' ? 'Novo Silo' : 'Editar Silo'}
            </h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nome *
                </label>
                <input
                  {...register('nome', { required: true })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Nome do silo"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cidade
                </label>
                <input
                  {...register('cidade')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Cidade"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Estado
                </label>
                <input
                  {...register('estado')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Logradouro
                </label>
                <input
                  {...register('logradouro')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Endereço"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Bairro
                </label>
                <input
                  {...register('bairro')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Bairro"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Latitude
                </label>
                <input
                  {...register('latitude')}
                  type="number"
                  step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="-15.000000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Longitude
                </label>
                <input
                  {...register('longitude')}
                  type="number"
                  step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="-55.000000"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Descrição
                </label>
                <textarea
                  {...register('descricao')}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Descrição opcional"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                <Check size={16} />
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de silos */}
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
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Localização
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Barras / Sensores
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {silos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                      Nenhum silo cadastrado.
                    </td>
                  </tr>
                )}
                {silos.map((silo) => (
                  <tr key={silo.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-medium text-gray-900">{silo.nome}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">
                      {[silo.cidade, silo.estado].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {silo.total_barras_ativas ?? 0} / {silo.total_sensores_ativos ?? 0}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                          silo.status === 'ativo'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {silo.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/silos/${silo.id}/barras`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                          title="Gerenciar barras"
                        >
                          <Layers size={13} />
                          Barras
                        </button>
                        {podeEditar && (
                          <>
                            <button
                              onClick={() => openEdit(silo)}
                              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={13} />
                              Editar
                            </button>
                            <button
                              onClick={() => toggleStatus(silo)}
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                                silo.status === 'ativo'
                                  ? 'bg-red-50 hover:bg-red-100 text-red-700'
                                  : 'bg-green-50 hover:bg-green-100 text-green-700'
                              }`}
                              title={silo.status === 'ativo' ? 'Desativar' : 'Ativar'}
                            >
                              <Power size={13} />
                              {silo.status === 'ativo' ? 'Desativar' : 'Ativar'}
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

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>
                Página {page} de {totalPages} ({total} silos)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
