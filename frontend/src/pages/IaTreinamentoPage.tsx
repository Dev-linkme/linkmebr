import { useState, useEffect, useCallback } from 'react';
import { BrainCircuit, RefreshCw, PlusCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getJobs, solicitarTreino } from '../services/ia';
import { useAuth } from '../context/AuthContext';
import type { Silo, IaJob } from '../types/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRT = 'America/Sao_Paulo';

function fmt(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}

function duracao(job: IaJob): string {
  if (!job.concluido_em) return '—';
  const ms = new Date(job.concluido_em).getTime() - new Date(job.solicitado_em).getTime();
  const min = Math.round(ms / 60_000);
  return min < 1 ? '< 1 min' : `${min} min`;
}

function origemLabel(origem: IaJob['origem']): string {
  return origem === 'web' ? 'Usuário' : 'Automático';
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: IaJob['status'] }) {
  const cfg = {
    pendente:   { cls: 'bg-yellow-100 text-yellow-700', label: 'Aguardando' },
    executando: { cls: 'bg-blue-100 text-blue-700',    label: 'Treinando...' },
    concluido:  { cls: 'bg-green-100 text-green-700',  label: 'Concluído' },
    erro:       { cls: 'bg-red-100 text-red-700',      label: 'Erro' },
  }[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── MaeCell ─────────────────────────────────────────────────────────────────

function MaeCell({ value, unit }: { value: number | null; unit: string }) {
  if (value == null) return <span className="text-gray-300">—</span>;
  return <span className="font-mono text-xs">±{value.toFixed(2)} {unit}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Props { modo: 'full' | 'incremental'; }

export default function IaTreinamentoPage({ modo }: Props) {
  const { isAdminGeral, isAdminEmpresa } = useAuth();
  const isAdmin = isAdminGeral || isAdminEmpresa;

  const titulo  = modo === 'full' ? 'Treinamento Global' : 'Treinamento Diário';
  const descricao = modo === 'full'
    ? 'Retreino completo do modelo com todo o histórico disponível.'
    : 'Atualização incremental — equivalente ao treino automático diário das 00:30 UTC.';

  const [silos,         setSilos]         = useState<Silo[]>([]);
  const [siloId,        setSiloId]        = useState('');
  const [jobs,          setJobs]          = useState<IaJob[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [solicitando,   setSolicitando]   = useState(false);
  const [confirmando,   setConfirmando]   = useState(false);
  const [erroDetalhe,   setErroDetalhe]   = useState<{ id: number; msg: string } | null>(null);

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => {
        const ativos = (res.data.data ?? []).filter((s) => s.status === 'ativo');
        setSilos(ativos);
        if (ativos.length === 1) setSiloId(String(ativos[0].id));
      })
      .catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  const fetchJobs = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await getJobs(id, 100);
      const filtrados = data.jobs
        .filter((j) => j.modo === modo || (modo === 'full' && j.modo === 'bootstrap'))
        .slice(0, 10);
      setJobs(filtrados);
    } catch {
      toast.error('Erro ao carregar histórico de treinamentos');
    } finally {
      setLoading(false);
    }
  }, [modo]);

  useEffect(() => {
    if (!siloId) { setJobs([]); return; }
    fetchJobs(siloId);
  }, [siloId, fetchJobs]);

  // Polling: atualiza a cada 30s se há jobs ativos
  useEffect(() => {
    const hasAtivo = jobs.some((j) => j.status === 'pendente' || j.status === 'executando');
    if (!hasAtivo || !siloId) return;
    const interval = setInterval(() => fetchJobs(siloId), 30_000);
    return () => clearInterval(interval);
  }, [jobs, siloId, fetchJobs]);

  const handleSolicitar = async () => {
    if (!siloId) { toast.error('Selecione um silo'); return; }
    setSolicitando(true);
    setConfirmando(false);
    try {
      await solicitarTreino(siloId, modo);
      toast.success('Treino enfileirado com sucesso. Acompanhe o status abaixo.');
      await fetchJobs(siloId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Erro ao solicitar treinamento');
    } finally {
      setSolicitando(false);
    }
  };

  const jobsAtivos = jobs.filter((j) => j.status === 'pendente' || j.status === 'executando');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BrainCircuit size={28} className="text-primary-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{descricao}</p>
        </div>
      </div>

      {/* Controles */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-700 mb-1">Silo *</label>
          <select
            value={siloId}
            onChange={(e) => setSiloId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Selecione um silo...</option>
            {silos.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => siloId && fetchJobs(siloId)}
            disabled={!siloId || loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>

          {isAdmin && !confirmando && (
            <button
              onClick={() => setConfirmando(true)}
              disabled={!siloId || solicitando}
              className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <PlusCircle size={15} />
              Solicitar Treino
            </button>
          )}

          {isAdmin && confirmando && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800">Confirmar {modo === 'full' ? 'retreino completo' : 'treino incremental'}?</span>
              <button
                onClick={handleSolicitar}
                disabled={solicitando}
                className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-60"
              >
                {solicitando ? 'Enviando...' : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmando(false)}
                className="text-gray-500 hover:text-gray-700 px-2 py-1 text-xs transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Aviso de jobs ativos */}
      {jobsAtivos.length > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-700">
          <RefreshCw size={14} className="animate-spin flex-shrink-0" />
          Há {jobsAtivos.length} treino(s) em andamento. Atualizando automaticamente a cada 30s...
        </div>
      )}

      {/* Tabela */}
      {!siloId ? (
        <div className="bg-white rounded-lg shadow p-10 text-center text-gray-400 text-sm">
          Selecione um silo para ver o histórico de treinamentos.
        </div>
      ) : loading && jobs.length === 0 ? (
        <div className="bg-white rounded-lg shadow flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-10 text-center text-gray-400 text-sm">
          Nenhum treinamento encontrado para este silo.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Últimos {jobs.length} treinamentos — {silos.find((s) => String(s.id) === siloId)?.nome ?? `Silo ${siloId}`}
            </h2>
            <span className="text-xs text-gray-400">{modo === 'full' ? 'Modo: Global (full)' : 'Modo: Diário (incremental)'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Solicitado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Origem</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Duração</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">T° MAE</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">UR MAE</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">CO₂ MAE</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-xs">{job.id}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmt(job.solicitado_em)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{origemLabel(job.origem)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{duracao(job)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700"><MaeCell value={job.mae_temperatura} unit="°C" /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700"><MaeCell value={job.mae_umidade} unit="%" /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700"><MaeCell value={job.mae_co2} unit="ppm" /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="space-y-1">
                        <StatusBadge status={job.status} />
                        {job.status === 'erro' && job.erro && (
                          <div>
                            {erroDetalhe?.id === job.id ? (
                              <div className="mt-1 text-xs text-red-600 max-w-xs">
                                {job.erro}
                                <button
                                  onClick={() => setErroDetalhe(null)}
                                  className="ml-2 underline text-gray-500"
                                >
                                  fechar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setErroDetalhe({ id: job.id, msg: job.erro! })}
                                className="text-xs text-red-500 underline"
                              >
                                ver detalhe
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
