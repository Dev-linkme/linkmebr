import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Users, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Eye } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Usuario, Empresa } from '../types/index.ts';

type Perfil = 'administrador_geral' | 'administrador_empresa' | 'operador_empresa';

interface UsuarioFormData {
  nome_completo: string;
  email: string;
  senha: string;
  perfil: Perfil;
  empresa_id: string;
}

const PERFIL_LABELS: Record<Perfil, string> = {
  administrador_geral: 'Administrador Geral',
  administrador_empresa: 'Administrador Empresa',
  operador_empresa: 'Operador Empresa',
};

const PERFIL_BADGE: Record<Perfil, string> = {
  administrador_geral: 'bg-purple-100 text-purple-800',
  administrador_empresa: 'bg-blue-100 text-blue-800',
  operador_empresa: 'bg-gray-100 text-gray-800',
};

const SENHA_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
const SENHA_HINT = 'Mínimo 8 caracteres com letra maiúscula, minúscula, número e caractere especial (@$!%*?&).';

// ─── Modal de Visualização ────────────────────────────────────────────────────

interface ViewModalProps {
  usuario: Usuario;
  empresaNome: string;
  onClose: () => void;
}

function ViewModal({ usuario, empresaNome, onClose }: ViewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Detalhes do Usuário</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <dl className="space-y-3">
          {[
            { label: 'ID', value: String(usuario.id) },
            { label: 'Nome Completo', value: usuario.nome_completo },
            { label: 'E-mail', value: usuario.email },
            {
              label: 'Perfil',
              value: PERFIL_LABELS[usuario.perfil] ?? usuario.perfil,
              badge: PERFIL_BADGE[usuario.perfil],
            },
            { label: 'Empresa', value: empresaNome },
            {
              label: 'Status',
              value: usuario.status === 'ativo' ? 'Ativo' : 'Inativo',
              badge:
                usuario.status === 'ativo'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800',
            },
          ].map(({ label, value, badge }) => (
            <div key={label} className="flex items-start gap-2">
              <dt className="w-36 shrink-0 text-xs font-semibold text-gray-500 uppercase pt-0.5">
                {label}
              </dt>
              <dd className="text-sm text-gray-800">
                {badge ? (
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>
                    {value}
                  </span>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const { user: authUser, isAdminGeral } = useAuth();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [viewingUsuario, setViewingUsuario] = useState<Usuario | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UsuarioFormData>();

  const perfilSelecionado = watch('perfil');

  const fetchUsuarios = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: Usuario[] }>('/usuarios');
      setUsuarios(res.data.data ?? []);
    } catch {
      toast.error('Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmpresas = async () => {
    if (!isAdminGeral) return;
    try {
      const res = await api.get<{ data: Empresa[] }>('/empresas');
      setEmpresas(res.data.data ?? []);
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    fetchUsuarios();
    fetchEmpresas();
  }, [isAdminGeral]);

  const openNew = () => {
    setEditingId(null);
    reset({
      nome_completo: '',
      email: '',
      senha: '',
      perfil: 'operador_empresa',
      empresa_id: '',
    });
    setShowForm(true);
  };

  const openEdit = (usuario: Usuario) => {
    setEditingId(usuario.id);
    reset({
      nome_completo: usuario.nome_completo,
      email: usuario.email,
      senha: '',
      perfil: usuario.perfil as Perfil,
      empresa_id: usuario.empresa_id !== null ? String(usuario.empresa_id) : '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    reset();
  };

  const showEmpresaField = isAdminGeral && perfilSelecionado !== 'administrador_geral';

  const onSubmit = async (data: UsuarioFormData) => {
    const payload: Record<string, unknown> = {
      nome_completo: data.nome_completo,
      email: data.email,
      perfil: data.perfil,
    };

    if (data.senha) payload.senha = data.senha;
    if (showEmpresaField && data.empresa_id) payload.empresa_id = Number(data.empresa_id);

    try {
      if (editingId !== null) {
        await api.put(`/usuarios/${editingId}`, payload);
        toast.success('Usuário atualizado com sucesso.');
      } else {
        await api.post('/usuarios', payload);
        toast.success('Usuário criado com sucesso.');
      }
      closeForm();
      fetchUsuarios();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erro ao salvar usuário.';
      toast.error(msg);
    }
  };

  const toggleStatus = async (usuario: Usuario) => {
    if (usuario.id === authUser?.id) {
      toast.error('Você não pode desativar sua própria conta.');
      return;
    }
    const novoStatus = usuario.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      await api.patch(`/usuarios/${usuario.id}/status`, { status: novoStatus });
      toast.success(`Usuário ${novoStatus === 'ativo' ? 'ativado' : 'desativado'}.`);
      fetchUsuarios();
    } catch {
      toast.error('Erro ao alterar status.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/usuarios/${id}`);
      toast.success('Usuário excluído.');
      setConfirmDeleteId(null);
      fetchUsuarios();
    } catch {
      toast.error('Erro ao excluir usuário.');
    }
  };

  const perfilOptions: Perfil[] = isAdminGeral
    ? ['administrador_geral', 'administrador_empresa', 'operador_empresa']
    : ['operador_empresa'];

  const getEmpresaNome = (empresa_id: number | null) => {
    if (!empresa_id) return '—';
    const emp = empresas.find((e) => e.id === empresa_id);
    return emp ? (emp.nome_fantasia ?? emp.razao_social) : `#${empresa_id}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={28} className="text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        </div>
        {!showForm && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
          >
            <Plus size={16} />
            Novo Usuário
          </button>
        )}
      </div>

      {/* Formulário inline */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              {editingId !== null ? 'Editar Usuário' : 'Novo Usuário'}
            </h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome completo */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('nome_completo', {
                    required: 'Nome completo é obrigatório.',
                    minLength: { value: 2, message: 'Nome deve ter ao menos 2 caracteres.' },
                  })}
                  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    errors.nome_completo ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.nome_completo && (
                  <p className="text-red-500 text-xs mt-1">{errors.nome_completo.message}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...register('email', {
                    required: 'E-mail é obrigatório.',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Informe um e-mail válido (ex: nome@dominio.com).',
                    },
                  })}
                  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    errors.email ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha{editingId === null && <span className="text-red-500"> *</span>}
                  {editingId !== null && (
                    <span className="text-gray-400 text-xs ml-1">(deixe em branco para manter)</span>
                  )}
                </label>
                <input
                  type="password"
                  {...register('senha', {
                    required: editingId === null ? 'Senha é obrigatória.' : false,
                    validate: (value) => {
                      if (!value) return true;
                      if (value.length < 8) return 'Senha deve ter ao menos 8 caracteres.';
                      if (!SENHA_REGEX.test(value)) return 'Senha inválida. ' + SENHA_HINT;
                      return true;
                    },
                  })}
                  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    errors.senha ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.senha ? (
                  <p className="text-red-500 text-xs mt-1">{errors.senha.message}</p>
                ) : (
                  <p className="text-gray-400 text-xs mt-1">{SENHA_HINT}</p>
                )}
              </div>

              {/* Perfil */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Perfil <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('perfil', { required: 'Perfil é obrigatório.' })}
                  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white ${
                    errors.perfil ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                >
                  {perfilOptions.map((p) => (
                    <option key={p} value={p}>
                      {PERFIL_LABELS[p]}
                    </option>
                  ))}
                </select>
                {errors.perfil && (
                  <p className="text-red-500 text-xs mt-1">{errors.perfil.message}</p>
                )}
              </div>

              {/* Empresa */}
              {showEmpresaField && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                  <select
                    {...register('empresa_id')}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    <option value="">Selecione uma empresa</option>
                    {empresas.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nome_fantasia ?? emp.razao_social}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <span className="text-gray-500">Carregando...</span>
          </div>
        ) : usuarios.length === 0 ? (
          <div className="flex justify-center items-center py-12">
            <span className="text-gray-500">Nenhum usuário encontrado.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    E-mail
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Perfil
                  </th>
                  {isAdminGeral && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Empresa
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {usuarios.map((usr) => {
                  const isSelf = usr.id === authUser?.id;
                  return (
                    <tr key={usr.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {usr.nome_completo}
                        {isSelf && <span className="ml-2 text-xs text-gray-400">(você)</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{usr.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            PERFIL_BADGE[usr.perfil] ?? 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {PERFIL_LABELS[usr.perfil] ?? usr.perfil}
                        </span>
                      </td>
                      {isAdminGeral && (
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {getEmpresaNome(usr.empresa_id)}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            usr.status === 'ativo'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {usr.status === 'ativo' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewingUsuario(usr)}
                            title="Visualizar"
                            className="text-gray-500 hover:text-blue-600 p-1 rounded"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => openEdit(usr)}
                            title="Editar"
                            className="text-gray-500 hover:text-green-600 p-1 rounded"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => toggleStatus(usr)}
                            title={
                              isSelf
                                ? 'Você não pode desativar sua própria conta'
                                : usr.status === 'ativo'
                                ? 'Desativar'
                                : 'Ativar'
                            }
                            disabled={isSelf}
                            className={`p-1 rounded ${
                              isSelf
                                ? 'opacity-30 cursor-not-allowed'
                                : 'text-gray-500 hover:text-yellow-600'
                            }`}
                          >
                            {usr.status === 'ativo' ? (
                              <ToggleRight size={18} className="text-green-500" />
                            ) : (
                              <ToggleLeft size={18} className="text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(usr.id)}
                            title="Excluir"
                            disabled={isSelf}
                            className={`p-1 rounded ${
                              isSelf
                                ? 'opacity-30 cursor-not-allowed text-gray-400'
                                : 'text-gray-500 hover:text-red-600'
                            }`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de visualização */}
      {viewingUsuario && (
        <ViewModal
          usuario={viewingUsuario}
          empresaNome={getEmpresaNome(viewingUsuario.empresa_id)}
          onClose={() => setViewingUsuario(null)}
        />
      )}

      {/* Modal de confirmação de exclusão */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
