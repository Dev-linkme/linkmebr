import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageSquare, ChevronDown, ChevronUp, Save } from 'lucide-react';
import api from '../services/api';
import type { SolicitacaoContato } from '../types/index.ts';

type StatusFiltro = 'todos' | 'novo' | 'em_atendimento' | 'concluido';
type StatusContato = 'novo' | 'em_atendimento' | 'concluido';

const STATUS_BADGE: Record<StatusContato, string> = {
  novo: 'bg-blue-100 text-blue-800',
  em_atendimento: 'bg-yellow-100 text-yellow-800',
  concluido: 'bg-green-100 text-green-800',
};

const STATUS_LABEL: Record<StatusContato, string> = {
  novo: 'Novo',
  em_atendimento: 'Em Atendimento',
  concluido: 'Concluído',
};

const FILTROS: { key: StatusFiltro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'novo', label: 'Novo' },
  { key: 'em_atendimento', label: 'Em Atendimento' },
  { key: 'concluido', label: 'Concluído' },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Expanded Row Detail ─────────────────────────────────────────────────────

interface RowDetailProps {
  contato: SolicitacaoContato;
  onUpdated: () => void;
}

function RowDetail({ contato, onUpdated }: RowDetailProps) {
  const [obs, setObs] = useState(contato.observacoes_internas ?? '');
  const [status, setStatus] = useState<StatusContato>(contato.status as StatusContato);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/contatos/${contato.id}/status`, {
        status,
        observacoes_internas: obs,
      });
      toast.success('Contato atualizado.');
      onUpdated();
    } catch {
      toast.error('Erro ao atualizar contato.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-blue-50">
      <td colSpan={7} className="px-6 py-4">
        <div className="space-y-4">
          {/* Mensagem */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Mensagem</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap bg-white rounded border border-gray-200 p-3">
              {contato.mensagem}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            {/* Observações internas */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Observações Internas
              </label>
              <textarea
                rows={3}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Notas internas sobre este contato..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
              />
            </div>

            {/* Status + save */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StatusContato)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="novo">Novo</option>
                  <option value="em_atendimento">Em Atendimento</option>
                  <option value="concluido">Concluído</option>
                </select>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60"
              >
                <Save size={14} />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ContatosPage() {
  const [contatos, setContatos] = useState<SolicitacaoContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<StatusFiltro>('todos');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchContatos = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: SolicitacaoContato[] }>('/admin/contatos');
      setContatos(res.data.data ?? []);
    } catch {
      toast.error('Erro ao carregar contatos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContatos();
  }, []);

  const contatosFiltrados =
    filtro === 'todos'
      ? contatos
      : contatos.filter((c) => c.status === filtro);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const contadoresPorStatus = (key: StatusFiltro) => {
    if (key === 'todos') return contatos.length;
    return contatos.filter((c) => c.status === key).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare size={28} className="text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Contatos</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {FILTROS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setFiltro(key);
              setExpandedId(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filtro === key
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            <span
              className={`ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs ${
                filtro === key
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {contadoresPorStatus(key)}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <span className="text-gray-500">Carregando...</span>
          </div>
        ) : contatosFiltrados.length === 0 ? (
          <div className="flex justify-center items-center py-12">
            <span className="text-gray-500">Nenhuma solicitação encontrada.</span>
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
                    Empresa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    E-mail
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Telefone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {contatosFiltrados.map((contato) => {
                  const isExpanded = expandedId === contato.id;
                  return (
                    <>
                      <tr
                        key={contato.id}
                        onClick={() => toggleExpand(contato.id)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {contato.nome}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {contato.empresa ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{contato.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {contato.telefone ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {formatDate(contato.data_hora)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              STATUS_BADGE[contato.status as StatusContato] ??
                              'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {STATUS_LABEL[contato.status as StatusContato] ?? contato.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                      </tr>
                      {isExpanded && (
                        <RowDetail
                          key={`detail-${contato.id}`}
                          contato={contato}
                          onUpdated={() => {
                            fetchContatos();
                            setExpandedId(null);
                          }}
                        />
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
