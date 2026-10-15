import { useState, useEffect, useCallback } from 'react';
import { HeartPulse, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { Silo } from '../types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModeloInfo {
  n_camadas: number;
  hidden_size: number;
  horizonte: number;
  n_features: number;
  n_features_alvo: number;
}

interface Heartbeat {
  silo_id: number;
  recebido_em: string;
  timestamp: string;
  versao_modelo: string | null;
  modelo_hash: string | null;
  modelo_info: ModeloInfo | null;
  ciclo_ok: boolean;
  n_emergencias: number | null;
  risco_max: number | null;
  cat_max: string | null;
  silencio_h: number;
  status: 'ok' | 'alerta';
}

type EstadoCard =
  | { kind: 'loading' }
  | { kind: 'ok'; data: Heartbeat }
  | { kind: 'sem_heartbeat' }
  | { kind: 'erro' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRT = 'America/Sao_Paulo';

function formatDateTime(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}

function formatSilencio(silencio_h: number): string {
  const totalMin = Math.round(silencio_h * 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function catMaxColor(cat: string | null): string {
  if (!cat) return 'text-gray-500';
  if (cat === 'Emergência') return 'text-red-600 font-semibold';
  if (cat === 'Atenção') return 'text-yellow-600 font-semibold';
  return 'text-green-700';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status, ciclo_ok, silencio_h }: {
  status: 'ok' | 'alerta';
  ciclo_ok: boolean;
  silencio_h: number;
}) {
  if (status === 'alerta') {
    return (
      <span className="flex items-center gap-1.5 text-sm font-semibold text-red-600">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
        Sem comunicação há {formatSilencio(silencio_h)}
      </span>
    );
  }
  if (!ciclo_ok) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-semibold text-yellow-600">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 flex-shrink-0" />
        Online — ciclo abortado
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
      <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
      Online
    </span>
  );
}

function HeartbeatCard({ silo, estado }: { silo: Silo; estado: EstadoCard }) {
  if (estado.kind === 'loading') {
    return (
      <div className="bg-white rounded-lg shadow flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (estado.kind === 'sem_heartbeat') {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3">
          <span className="font-semibold text-gray-800 truncate">IA — {silo.nome}</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 flex-shrink-0">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300" />
            Aguardando
          </span>
        </div>
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          Nenhum heartbeat recebido ainda para este silo.
        </div>
      </div>
    );
  }

  if (estado.kind === 'erro') {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="font-semibold text-gray-800">IA — {silo.nome}</span>
        </div>
        <div className="px-4 py-8 text-center text-sm text-red-400">
          Erro ao consultar heartbeat.
        </div>
      </div>
    );
  }

  const hb = estado.data;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3">
        <span className="font-semibold text-gray-800 truncate">IA — {silo.nome}</span>
        <StatusBadge status={hb.status} ciclo_ok={hb.ciclo_ok} silencio_h={hb.silencio_h} />
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3 text-sm">
        {/* Timing */}
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <span className="text-gray-500">Último ciclo</span>
          <span className="text-gray-800">{formatDateTime(hb.timestamp)}</span>
          <span className="text-gray-500">Recebido há</span>
          <span className="text-gray-800">{formatSilencio(hb.silencio_h)}</span>
        </div>

        {/* Model info */}
        {hb.versao_modelo ? (
          <div className="border-t border-gray-100 pt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <span className="text-gray-500">Modelo</span>
            <span className="text-gray-800">{formatDateTime(hb.versao_modelo)}</span>
            {hb.modelo_hash && (
              <>
                <span className="text-gray-500">Hash</span>
                <span className="text-gray-800 font-mono text-xs break-all">{hb.modelo_hash}</span>
              </>
            )}
            {hb.modelo_info && (
              <>
                <span className="text-gray-500">Arquitetura</span>
                <span className="text-gray-800">
                  {hb.modelo_info.n_camadas} camadas · h={hb.modelo_info.hidden_size} · {hb.modelo_info.horizonte}h
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="border-t border-gray-100 pt-3 text-gray-400 italic text-xs">
            Modelo ainda não baixado pelo Labrador.
          </div>
        )}

        {/* Cycle results */}
        <div className="border-t border-gray-100 pt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <span className="text-gray-500">Ciclo</span>
          <span className={hb.ciclo_ok ? 'text-green-700 font-semibold' : 'text-yellow-600 font-semibold'}>
            {hb.ciclo_ok ? '✔ OK' : '✗ Abortado'}
          </span>
          <span className="text-gray-500">Emergências</span>
          <span className={(hb.n_emergencias ?? 0) > 0 ? 'text-red-600 font-semibold' : 'text-gray-800'}>
            {hb.n_emergencias ?? '—'}
          </span>
          {hb.risco_max != null && (
            <>
              <span className="text-gray-500">Risco máx.</span>
              <span className="text-gray-800">{hb.risco_max.toFixed(1)}</span>
              <span className="text-gray-500">Categoria</span>
              <span className={catMaxColor(hb.cat_max)}>{hb.cat_max ?? '—'}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SaudeIaPage() {
  const [silos, setSilos] = useState<Silo[]>([]);
  const [silosCarregando, setSilosCarregando] = useState(true);
  const [estados, setEstados] = useState<Record<number, EstadoCard>>({});
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => setSilos((res.data.data ?? []).filter((s) => s.status === 'ativo')))
      .catch(() => toast.error('Erro ao carregar silos'))
      .finally(() => setSilosCarregando(false));
  }, []);

  const fetchHeartbeats = useCallback(async (silosLista: Silo[]) => {
    if (silosLista.length === 0) return;
    setAtualizando(true);
    setEstados((prev) => {
      const next = { ...prev };
      silosLista.forEach((s) => {
        if (!(s.id in next)) next[s.id] = { kind: 'loading' };
      });
      return next;
    });

    await Promise.all(
      silosLista.map(async (silo) => {
        try {
          const res = await api.get<Heartbeat>(`/ia/heartbeat/${silo.id}`);
          setEstados((prev) => ({ ...prev, [silo.id]: { kind: 'ok', data: res.data } }));
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 404) {
            setEstados((prev) => ({ ...prev, [silo.id]: { kind: 'sem_heartbeat' } }));
          } else {
            setEstados((prev) => ({ ...prev, [silo.id]: { kind: 'erro' } }));
          }
        }
      })
    );
    setUltimaAtualizacao(new Date());
    setAtualizando(false);
  }, []);

  useEffect(() => {
    if (silos.length > 0) fetchHeartbeats(silos);
  }, [silos, fetchHeartbeats]);

  // Auto-refresh a cada 5 minutos
  useEffect(() => {
    if (silos.length === 0) return;
    const id = setInterval(() => fetchHeartbeats(silos), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [silos, fetchHeartbeats]);

  const formatUltimaAtualizacao = () => {
    if (!ultimaAtualizacao) return '';
    return ultimaAtualizacao.toLocaleTimeString('pt-BR', {
      timeZone: BRT, hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <HeartPulse size={28} className="text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Saúde da IA</h1>
        </div>
        <div className="flex items-center gap-3">
          {ultimaAtualizacao && (
            <span className="text-xs text-gray-400">Atualizado às {formatUltimaAtualizacao()}</span>
          )}
          <button
            onClick={() => fetchHeartbeats(silos)}
            disabled={atualizando || silos.length === 0}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 disabled:opacity-50 transition-colors"
            title="Atualizar agora"
          >
            <RefreshCw size={15} className={atualizando ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {silosCarregando ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : silos.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400 text-sm">
          Nenhum silo ativo encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {silos.map((silo) => (
            <HeartbeatCard
              key={silo.id}
              silo={silo}
              estado={estados[silo.id] ?? { kind: 'loading' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
