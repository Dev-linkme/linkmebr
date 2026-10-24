import { useState, useEffect, useCallback } from 'react';
import { BrainCircuit, RefreshCw, PlusCircle, AlertCircle, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getStatus, solicitarTreino, getSilosIa } from '../services/ia';
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

interface Props { modo: 'bootstrap' | 'full' | 'inferencia'; }

const MODO_CONFIG = {
  bootstrap: {
    titulo:    'Treinamento Total',
    descricao: 'Apaga todos os dados de IA deste silo e reinicia a ingestão completa do histórico desde 2020. O modelo é treinado do zero com novos pesos. Use apenas na primeira implantação ou quando os parâmetros de sanitização ou filtros de barras foram alterados.',
    label:     'Total (bootstrap)',
    confirmaTexto: (siloNome: string) =>
      `⚠️ ATENÇÃO — Operação destrutiva!\n\nConfirmar TREINAMENTO TOTAL para o silo "${siloNome}"?\n\nTodos os dados de IA serão apagados e o histórico será reingerido do zero. Duração estimada: 20–60 minutos.`,
  },
  full: {
    titulo:    'Treinamento Adicional',
    descricao: 'Preserva os dados existentes. Ingesta apenas as leituras novas desde a última ingestão e retreina o modelo com todo o histórico acumulado. Use para manter o modelo atualizado periodicamente.',
    label:     'Adicional (full)',
    confirmaTexto: (siloNome: string) =>
      `Confirmar TREINAMENTO ADICIONAL para o silo "${siloNome}"?\n\nSerão ingestadas apenas as leituras novas e o modelo será retreinado. Duração estimada: 20–60 minutos.`,
  },
  inferencia: {
    titulo:    'Previsão 24 Horas',
    descricao: 'Ingesta as leituras das últimas 24 horas e gera a previsão para as próximas 24 horas usando o modelo já treinado. Não retreina o modelo nem altera os pesos.',
    label:     'Previsão (inferência)',
    confirmaTexto: (siloNome: string) =>
      `Confirmar geração de PREVISÃO 24 HORAS para o silo "${siloNome}"?\n\nO modelo atual será usado para gerar as projeções das próximas 24 horas. Nenhum dado de treino será alterado.`,
  },
};

export default function IaTreinamentoPage({ modo }: Props) {
  const { isAdminGeral, isAdminEmpresa } = useAuth();
  const isAdmin = isAdminGeral || isAdminEmpresa;

  const { titulo, descricao, label, confirmaTexto } = MODO_CONFIG[modo];

  const [silos,         setSilos]         = useState<Silo[]>([]);
  const [siloId,        setSiloId]        = useState('');
  const [status,        setStatus]        = useState<IaStatus | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [solicitando,   setSolicitando]   = useState(false);
  const [confirmando,   setConfirmando]   = useState(false);

  const siloNome = silos.find((s) => String(s.id) === siloId)?.nome ?? `Silo ${siloId}`;

  useEffect(() => {
    Promise.all([
      api.get<{ data: Silo[] }>('/silos?per_page=200'),
      getSilosIa(),
    ]).then(([silosRes, iaRes]) => {
      const idsComIa = new Set(iaRes.silos.map((s) => s.silo_id));
      const filtrados = (silosRes.data.data ?? []).filter(
        (s) => s.status === 'ativo' && idsComIa.has(s.id),
      );
      setSilos(filtrados);
      if (filtrados.length === 1) setSiloId(String(filtrados[0].id));
    }).catch(() => toast.error('Erro ao carregar silos'));
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
            <span className="font-semibold">Operação destrutiva.</span> Apaga todos os dados de IA e reinicia a ingestão completa do histórico desde 2020. Use somente quando as regras de sanitização ou filtros de barras foram alterados.
          </div>
        </div>
      )}
      {modo === 'inferencia' && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <TriangleAlert size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Sem retreino.</span> O modelo atual será usado para gerar as projeções. Nenhum dado de treino será alterado.
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
              className={`flex items-center gap-1.5 disabled:opacity-60 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                modo === 'bootstrap'
                  ? 'bg-red-600 hover:bg-red-700'
                  : modo === 'inferencia'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              <PlusCircle size={15} />
              {modo === 'inferencia' ? 'Gerar Previsão' : 'Solicitar Treino'}
            </button>
          )}

          {isAdmin && confirmando && (
            <div className={`flex flex-col gap-2 rounded-lg border px-4 py-3 ${
              modo === 'bootstrap'
                ? 'bg-red-50 border-red-300'
                : modo === 'inferencia'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className={`flex-shrink-0 mt-0.5 ${
                  modo === 'bootstrap' ? 'text-red-600' : modo === 'inferencia' ? 'text-blue-500' : 'text-amber-600'
                }`} />
                <p className={`text-sm whitespace-pre-line ${
                  modo === 'bootstrap' ? 'text-red-800 font-medium' : modo === 'inferencia' ? 'text-blue-800' : 'text-amber-800'
                }`}>
                  {confirmaTexto(siloNome)}
                </p>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setConfirmando(false)}
                  className="text-gray-600 hover:text-gray-800 px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSolicitar}
                  disabled={solicitando}
                  className={`text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60 ${
                    modo === 'bootstrap'
                      ? 'bg-red-600 hover:bg-red-700'
                      : modo === 'inferencia'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {solicitando ? 'Enviando...' : 'Sim, confirmar'}
                </button>
              </div>
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
