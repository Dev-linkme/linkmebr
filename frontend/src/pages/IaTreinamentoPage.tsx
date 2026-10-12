import { useState, useEffect, useCallback } from 'react';
import { BrainCircuit, RefreshCw, PlusCircle, AlertCircle, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getStatus, solicitarTreino } from '../services/ia';
import { useAuth } from '../context/AuthContext';
import type { Silo, IaStatus } from '../types/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRT = 'America/Sao_Paulo';

function fmt(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: IaStatus['status'] }) {
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

interface Props { modo: 'full' | 'incremental' | 'bootstrap'; }

const MODO_CONFIG = {
  full: {
    titulo:   'Treinamento Global',
    descricao: 'Preserva dados existentes, ingesta o delta a partir da última leitura registrada e retreina o modelo com todo o histórico acumulado.',
    label:    'Global (full)',
    confirma: 'retreino completo',
  },
  incremental: {
    titulo:   'Treinamento Diário',
    descricao: 'Preserva dados existentes, ingesta apenas as últimas 25h e aplica fine-tuning sobre o modelo ativo. Equivalente ao treino automático diário (00:30 UTC).',
    label:    'Diário (incremental)',
    confirma: 'treino incremental',
  },
  bootstrap: {
    titulo:   'Bootstrap do Modelo',
    descricao: 'Trunca todos os dados de IA e reingestão completa do histórico desde 2020. Use apenas quando as regras de sanitização ou filtros de barras foram alterados.',
    label:    'Bootstrap',
    confirma: 'BOOTSTRAP (operação destrutiva)',
  },
};

export default function IaTreinamentoPage({ modo }: Props) {
  const { isAdminGeral, isAdminEmpresa } = useAuth();
  const isAdmin = isAdminGeral || isAdminEmpresa;

  const { titulo, descricao, label, confirma } = MODO_CONFIG[modo];

  const [silos,         setSilos]         = useState<Silo[]>([]);
  const [siloId,        setSiloId]        = useState('');
  const [status,        setStatus]        = useState<IaStatus | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [solicitando,   setSolicitando]   = useState(false);
  const [confirmando,   setConfirmando]   = useState(false);

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => {
        const ativos = (res.data.data ?? []).filter((s) => s.status === 'ativo');
        setSilos(ativos);
        if (ativos.length === 1) setSiloId(String(ativos[0].id));
      })
      .catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  const fetchStatus = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await getStatus(id);
      setStatus(data);
    } catch {
      toast.error('Erro ao carregar status do modelo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!siloId) { setStatus(null); return; }
    fetchStatus(siloId);
  }, [siloId, fetchStatus]);

  // Polling a cada 30s se há job em andamento
  useEffect(() => {
    const emAndamento = status?.status === 'pendente' || status?.status === 'executando';
    if (!emAndamento || !siloId) return;
    const interval = setInterval(() => fetchStatus(siloId), 30_000);
    return () => clearInterval(interval);
  }, [status, siloId, fetchStatus]);

  const handleSolicitar = async () => {
    if (!siloId) { toast.error('Selecione um silo'); return; }
    setSolicitando(true);
    setConfirmando(false);
    try {
      await solicitarTreino(siloId, modo);
      toast.success('Treino enfileirado com sucesso. Acompanhe o status abaixo.');
      await fetchStatus(siloId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Erro ao solicitar treinamento');
    } finally {
      setSolicitando(false);
    }
  };

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
      {modo === 'bootstrap' && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-sm text-red-800">
          <TriangleAlert size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Operação destrutiva.</span> O bootstrap trunca toda a tabela de leituras de IA e reingestão completa do histórico desde 2020. Use somente quando as regras de sanitização ou filtros de barras foram alterados.
          </div>
        </div>
      )}

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
            onClick={() => siloId && fetchStatus(siloId)}
            disabled={!siloId || loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Atualizar status"
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
              <span className="text-sm text-amber-800">Confirmar {confirma}?</span>
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

      {/* Aviso de job em andamento */}
      {(status?.status === 'pendente' || status?.status === 'executando') && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-700">
          <RefreshCw size={14} className="animate-spin flex-shrink-0" />
          Treinamento em andamento. Atualizando automaticamente a cada 30s...
        </div>
      )}

      {/* Painel de status */}
      {!siloId ? (
        <div className="bg-white rounded-lg shadow p-10 text-center text-gray-400 text-sm">
          Selecione um silo para ver o status do modelo.
        </div>
      ) : loading && !status ? (
        <div className="bg-white rounded-lg shadow flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : status ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Status do modelo — {silos.find((s) => String(s.id) === siloId)?.nome ?? `Silo ${siloId}`}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">Modo: {label}</span>
              <StatusBadge status={status.status} />
            </div>
          </div>
          {status.modelo ? (
            <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Versão do modelo</p>
                <p className="text-sm font-medium text-gray-800">{fmt(status.modelo.versao)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Épocas treinadas</p>
                <p className="text-sm font-medium text-gray-800">{status.modelo.epochs_treinados}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Amostras de treino</p>
                <p className="text-sm font-medium text-gray-800">{status.modelo.amostras_treino.toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">MAE Temperatura</p>
                <MaeCell value={status.modelo.mae_temperatura} unit="°C" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">MAE Umidade</p>
                <MaeCell value={status.modelo.mae_umidade} unit="%" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">MAE CO₂</p>
                <MaeCell value={status.modelo.mae_co2} unit="ppm" />
              </div>
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Nenhum modelo treinado para este silo.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
