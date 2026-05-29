import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Building2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Eye } from 'lucide-react';
import api from '../services/api';
import type { Empresa } from '../types/index.ts';

interface EmpresaFormData {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  email: string;
}

interface EmpresaFull extends Empresa {
  logradouro?: string;
  bairro?: string;
  cep?: string;
  telefone?: string;
  email?: string;
}

// ─── Modal de Visualização ────────────────────────────────────────────────────

function ViewModal({ empresa, onClose }: { empresa: EmpresaFull; onClose: () => void }) {
  const formatCnpj = (cnpj: string) =>
    cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

  const campos = [
    { label: 'ID', value: String(empresa.id) },
    { label: 'Razão Social', value: empresa.razao_social },
    { label: 'Nome Fantasia', value: empresa.nome_fantasia ?? '—' },
    { label: 'CNPJ', value: formatCnpj(empresa.cnpj) },
    { label: 'Logradouro', value: empresa.logradouro ?? '—' },
    { label: 'Bairro', value: empresa.bairro ?? '—' },
    { label: 'CEP', value: empresa.cep ?? '—' },
    { label: 'Cidade', value: empresa.cidade ?? '—' },
    { label: 'Estado', value: empresa.estado ?? '—' },
    { label: 'Telefone', value: empresa.telefone ?? '—' },
    { label: 'E-mail', value: empresa.email ?? '—' },
    {
      label: 'Status',
      value: empresa.status === 'ativa' ? 'Ativa' : 'Inativa',
      badge: empresa.status === 'ativa' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Detalhes da Empresa</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <dl className="space-y-3">
          {campos.map(({ label, value, badge }) => (
            <div key={label} className="flex items-start gap-2">
              <dt className="w-36 shrink-0 text-xs font-semibold text-gray-500 uppercase pt-0.5">{label}</dt>
              <dd className="text-sm text-gray-800">
                {badge ? (
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>{value}</span>
                ) : value}
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

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<EmpresaFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [viewingEmpresa, setViewingEmpresa] = useState<EmpresaFull | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmpresaFormData>();

  const fetchEmpresas = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: EmpresaFull[] }>('/empresas');
      setEmpresas(res.data.data ?? []);
    } catch {
      toast.error('Erro ao carregar empresas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmpresas(); }, []);

  const openNew = () => {
    setEditingId(null);
    reset({ razao_social: '', nome_fantasia: '', cnpj: '', logradouro: '', bairro: '', cidade: '', estado: '', cep: '', telefone: '', email: '' });
    setShowForm(true);
  };

  const openEdit = (empresa: EmpresaFull) => {
    setEditingId(empresa.id);
    reset({
      razao_social: empresa.razao_social,
      nome_fantasia: empresa.nome_fantasia ?? '',
      cnpj: empresa.cnpj,
      logradouro: empresa.logradouro ?? '',
      bairro: empresa.bairro ?? '',
      cidade: empresa.cidade ?? '',
      estado: empresa.estado ?? '',
      cep: empresa.cep ?? '',
      telefone: empresa.telefone ?? '',
      email: empresa.email ?? '',
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); reset(); };

  const onSubmit = async (data: EmpresaFormData) => {
    try {
      if (editingId !== null) {
        await api.put(`/empresas/${editingId}`, data);
        toast.success('Empresa atualizada com sucesso.');
      } else {
        await api.post('/empresas', data);
        toast.success('Empresa criada com sucesso.');
      }
      closeForm();
      fetchEmpresas();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao salvar empresa.';
      toast.error(msg);
    }
  };

  const toggleStatus = async (empresa: EmpresaFull) => {
    const novoStatus = empresa.status === 'ativa' ? 'inativa' : 'ativa';
    try {
      await api.patch(`/empresas/${empresa.id}/status`, { status: novoStatus });
      toast.success(`Empresa ${novoStatus === 'ativa' ? 'ativada' : 'desativada'}.`);
      fetchEmpresas();
    } catch {
      toast.error('Erro ao alterar status.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/empresas/${id}`);
      toast.success('Empresa excluída.');
      setConfirmDeleteId(null);
      fetchEmpresas();
    } catch {
      toast.error('Erro ao excluir empresa.');
    }
  };

  const formatCnpj = (cnpj: string) =>
    cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

  const cls = (hasError: boolean) =>
    `w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 size={28} className="text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
        </div>
        {!showForm && (
          <button onClick={openNew} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">
            <Plus size={16} /> Nova Empresa
          </button>
        )}
      </div>

      {/* Formulário inline */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">{editingId !== null ? 'Editar Empresa' : 'Nova Empresa'}</h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social <span className="text-red-500">*</span></label>
                <input type="text" {...register('razao_social', { required: 'Razão social é obrigatória.' })} className={cls(!!errors.razao_social)} />
                {errors.razao_social && <p className="text-red-500 text-xs mt-1">{errors.razao_social.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Fantasia</label>
                <input type="text" {...register('nome_fantasia')} className={cls(false)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ <span className="text-red-500">*</span></label>
                <input type="text" placeholder="00.000.000/0000-00"
                  {...register('cnpj', {
                    required: 'CNPJ é obrigatório.',
                    pattern: { value: /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, message: 'CNPJ inválido. Use o formato 00.000.000/0000-00.' },
                  })}
                  className={cls(!!errors.cnpj)}
                />
                {errors.cnpj && <p className="text-red-500 text-xs mt-1">{errors.cnpj.message}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Logradouro</label>
                <input type="text" {...register('logradouro')} className={cls(false)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                <input type="text" {...register('bairro')} className={cls(false)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                <input type="text" placeholder="00000-000" {...register('cep')} className={cls(false)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                <input type="text" {...register('cidade')} className={cls(false)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF)</label>
                <input type="text" maxLength={2} placeholder="SP" {...register('estado')} className={cls(false)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input type="text" {...register('telefone')} className={cls(false)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="text"
                  {...register('email', {
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'E-mail inválido. Use o formato nome@dominio.com.' },
                  })}
                  className={cls(!!errors.email)}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
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
        ) : empresas.length === 0 ? (
          <div className="flex justify-center items-center py-12"><span className="text-gray-500">Nenhuma empresa cadastrada.</span></div>
        ) : (
          <div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Razão Social</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome Fantasia</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CNPJ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cidade/UF</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {empresas.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{emp.razao_social}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{emp.nome_fantasia ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatCnpj(emp.cnpj)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {emp.cidade && emp.estado ? `${emp.cidade}/${emp.estado}` : emp.cidade ?? emp.estado ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${emp.status === 'ativa' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {emp.status === 'ativa' ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setViewingEmpresa(emp)} title="Visualizar" className="text-gray-500 hover:text-blue-600 p-1 rounded">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => openEdit(emp)} title="Editar" className="text-gray-500 hover:text-green-600 p-1 rounded">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => toggleStatus(emp)} title={emp.status === 'ativa' ? 'Desativar' : 'Ativar'} className="text-gray-500 hover:text-yellow-600 p-1 rounded">
                          {emp.status === 'ativa' ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} className="text-gray-400" />}
                        </button>
                        <button onClick={() => setConfirmDeleteId(emp.id)} title="Excluir" className="text-gray-500 hover:text-red-600 p-1 rounded">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingEmpresa && <ViewModal empresa={viewingEmpresa} onClose={() => setViewingEmpresa(null)} />}

      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-600 mb-6">Tem certeza que deseja excluir esta empresa? Esta ação não pode ser desfeita.</p>
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
