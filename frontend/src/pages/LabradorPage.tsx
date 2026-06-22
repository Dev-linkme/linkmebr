import { useState, useEffect, useCallback } from 'react';
import {
  Radio, RefreshCw, PlusCircle, AlertCircle, RotateCcw, HardDrive,
  Database, Power, PowerOff, UploadCloud, Cpu, Eye, X, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import {
  dispararComando, listarComandos, uploadFirmware, listarFirmwares,
  listarComandosDisponiveis, deletarComando,
} from '../services/labrador';
import type { Silo, ComandoResponse, FirmwareInfo, FirmwareCategoria, LabradorComandoStatus } from '../types/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRT = 'America/Sao_Paulo';

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).replace(', ', ' ');
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extractErro(err: unknown): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro inesperado';
}

const NODE_IDS = [101, 102, 103, 104, 201];
const NODE_LABELS: Record<number, string> = {
  101: 'DTG01', 102: 'DTG02', 103: 'DTG03', 104: 'DTG04', 201: 'DTG05',
};

interface ComandoCfg {
  label: string;
  tipo: 'sistema' | 'banco' | 'lora';
  icon: React.ReactNode;
  precisaNode: boolean;
  nodeFixo?: number;
  ota?: boolean;
}

const COMANDO_CFG: Record<number, ComandoCfg> = {
  1: { label: 'Liberar Espaço em Disco', tipo: 'sistema', icon: <HardDrive size={16} />, precisaNode: false },
  2: { label: 'Contagem de Registros', tipo: 'banco', icon: <Database size={16} />, precisaNode: false },
  3: { label: 'STATUS', tipo: 'lora', icon: <Radio size={16} />, precisaNode: true },
  4: { label: 'REBOOT', tipo: 'lora', icon: <RotateCcw size={16} />, precisaNode: true },
  5: { label: 'Ligar Relé', tipo: 'lora', icon: <Power size={16} />, precisaNode: true, nodeFixo: 201 },
  6: { label: 'Desligar Relé', tipo: 'lora', icon: <PowerOff size={16} />, precisaNode: true, nodeFixo: 201 },
  7: { label: 'Atualização OTA', tipo: 'lora', icon: <UploadCloud size={16} />, precisaNode: true, ota: true },
};

const STATUS_CFG: Record<LabradorComandoStatus, { cls: string; label: string }> = {
  pendente: { cls: 'bg-yellow-100 text-yellow-700', label: 'Executando...' },
  ok: { cls: 'bg-green-100 text-green-700', label: 'Concluído' },
  falha_validacao: { cls: 'bg-red-100 text-red-700', label: 'Comando inválido' },
  falha_execucao: { cls: 'bg-red-100 text-red-700', label: 'Falha na execução' },
  comando_id_desconhecido: { cls: 'bg-red-100 text-red-700', label: 'Comando não suportado' },
  node_desconhecido: { cls: 'bg-red-100 text-red-700', label: 'Node inválido' },
  timeout: { cls: 'bg-red-100 text-red-700', label: 'Sem resposta' },
};

function StatusBadge({ status }: { status: LabradorComandoStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function resultadoPreview(c: ComandoResponse): string {
  if (c.resultado == null) return '—';
  if (typeof c.resultado === 'string') return c.resultado;
  return JSON.stringify(c.resultado);
}

// ─── Modal de Visualização ────────────────────────────────────────────────────

function ComandoDetalheModal({ comando, onClose }: { comando: ComandoResponse; onClose: () => void }) {
  const cfg = COMANDO_CFG[comando.comando_id];
  const resultadoTexto = comando.resultado == null
    ? '—'
    : typeof comando.resultado === 'string'
      ? comando.resultado
      : JSON.stringify(comando.resultado, null, 2);

  const campos = [
    { label: 'Request ID', value: comando.request_id, mono: true },
    { label: 'Comando', value: `${cfg?.label ?? `Comando ${comando.comando_id}`} (id ${comando.comando_id})` },
    { label: 'Tipo', value: comando.tipo ?? cfg?.tipo ?? '—' },
    { label: 'Node / Parâmetro', value: comando.parametro != null ? `${NODE_LABELS[comando.parametro] ?? ''} (${comando.parametro})`.trim() : '—' },
    ...(comando.parametro_extra ? [{ label: 'Firmware (OTA)', value: comando.parametro_extra, mono: true }] : []),
    { label: 'Status', value: STATUS_CFG[comando.status].label, badge: STATUS_CFG[comando.status].cls },
    { label: 'Solicitado em', value: fmt(comando.solicitado_em) },
    { label: 'Concluído em', value: fmt(comando.concluido_em) },
    ...(comando.returncode != null ? [{ label: 'Returncode', value: String(comando.returncode), mono: true }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Detalhes do Comando</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <dl className="space-y-3">
          {campos.map(({ label, value, badge, mono }) => (
            <div key={label} className="flex items-start gap-2">
              <dt className="w-32 shrink-0 text-xs font-semibold text-gray-500 uppercase pt-0.5">{label}</dt>
              <dd className={`text-sm text-gray-800 ${mono ? 'font-mono text-xs break-all' : ''}`}>
                {badge ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>{value}</span> : value}
              </dd>
            </div>
          ))}
          <div className="flex items-start gap-2">
            <dt className="w-32 shrink-0 text-xs font-semibold text-gray-500 uppercase pt-0.5">Resultado</dt>
            <dd className="text-sm text-gray-800 whitespace-pre-wrap font-mono text-xs bg-gray-50 rounded p-3 flex-1 break-all">{resultadoTexto}</dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LabradorPage() {
  const [aba, setAba] = useState<'comandos' | 'firmwares'>('comandos');

  const [silos, setSilos] = useState<Silo[]>([]);
  const [siloIdLabrador, setSiloIdLabrador] = useState('');

  // ── Aba Comandos ──
  const [historico, setHistorico] = useState<ComandoResponse[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [comandoDetalhe, setComandoDetalhe] = useState<ComandoResponse | null>(null);

  const [comandosDisponiveis, setComandosDisponiveis] = useState<number[] | null>(null);

  const [comandoAtivo, setComandoAtivo] = useState<number | null>(null);
  const [nodeId, setNodeId] = useState<number | null>(null);
  const [firmwareEscolhido, setFirmwareEscolhido] = useState<string | null>(null);
  const [firmwaresParaOta, setFirmwaresParaOta] = useState<FirmwareInfo[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [disparando, setDisparando] = useState(false);

  // ── Aba Firmwares ──
  const [firmwares, setFirmwares] = useState<FirmwareInfo[]>([]);
  const [loadingFirmwares, setLoadingFirmwares] = useState(false);
  const [fwFile, setFwFile] = useState<File | null>(null);
  const [fwCategoria, setFwCategoria] = useState<FirmwareCategoria>('DTG01-04');
  const [fwDescricao, setFwDescricao] = useState('');
  const [enviandoFw, setEnviandoFw] = useState(false);

  // Lista de silos — cross-tenant (feature é administrador_geral-only), filtrando
  // os que possuem id_labrador (silo_id usado pelo contrato do Labrador, não o PK local).
  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => {
        const disponiveis = (res.data.data ?? []).filter((s) => s.status === 'ativo' && s.id_labrador != null);
        setSilos(disponiveis);
        if (disponiveis.length === 1) setSiloIdLabrador(String(disponiveis[0].id_labrador));
      })
      .catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  const fetchHistorico = useCallback(async (sid: string) => {
    setLoadingHistorico(true);
    try {
      const data = await listarComandos(sid, 20);
      setHistorico(data);
    } catch {
      toast.error('Erro ao carregar histórico de comandos');
    } finally {
      setLoadingHistorico(false);
    }
  }, []);

  useEffect(() => {
    if (!siloIdLabrador) { setHistorico([]); return; }
    fetchHistorico(siloIdLabrador);
  }, [siloIdLabrador, fetchHistorico]);

  // Catálogo de comandos é por silo — nem todo silo tem os mesmos controles físicos.
  useEffect(() => {
    if (!siloIdLabrador) { setComandosDisponiveis(null); return; }
    setComandosDisponiveis(null);
    listarComandosDisponiveis(siloIdLabrador)
      .then(setComandosDisponiveis)
      .catch(() => {
        toast.error('Erro ao carregar comandos disponíveis para este silo');
        setComandosDisponiveis([]);
      });
  }, [siloIdLabrador]);

  // Polling: enquanto houver comando pendente, atualiza a cada 1.5s (servidor
  // garante status terminal em ~15s — sem necessidade de timeout no cliente).
  useEffect(() => {
    const hasPendente = historico.some((c) => c.status === 'pendente');
    if (!hasPendente || !siloIdLabrador) return;
    const interval = setInterval(() => fetchHistorico(siloIdLabrador), 1500);
    return () => clearInterval(interval);
  }, [historico, siloIdLabrador, fetchHistorico]);

  // Busca firmwares disponíveis para o fluxo OTA, filtrados pela categoria do node escolhido
  useEffect(() => {
    if (comandoAtivo !== 7 || nodeId == null) { setFirmwaresParaOta([]); return; }
    const categoria: FirmwareCategoria = nodeId === 201 ? 'DTG05' : 'DTG01-04';
    listarFirmwares(categoria)
      .then((r) => setFirmwaresParaOta(r.firmwares))
      .catch(() => toast.error('Erro ao carregar firmwares disponíveis'));
  }, [comandoAtivo, nodeId]);

  const handleSelecionarComando = (id: number) => {
    const cfg = COMANDO_CFG[id];
    setComandoAtivo(id);
    setConfirmando(false);
    setFirmwareEscolhido(null);
    setNodeId(cfg.nodeFixo ?? null);
  };

  const handleCancelar = () => {
    setComandoAtivo(null);
    setConfirmando(false);
    setNodeId(null);
    setFirmwareEscolhido(null);
  };

  const cfgAtivo = comandoAtivo != null ? COMANDO_CFG[comandoAtivo] : null;
  const prontoParaConfirmar = !!cfgAtivo
    && (!cfgAtivo.precisaNode || nodeId != null)
    && (!cfgAtivo.ota || firmwareEscolhido != null);

  const handleDisparar = async () => {
    if (!siloIdLabrador || comandoAtivo == null) return;
    setDisparando(true);
    try {
      await dispararComando(
        Number(siloIdLabrador),
        comandoAtivo,
        nodeId,
        comandoAtivo === 7 ? firmwareEscolhido : null,
      );
      toast.success('Comando enviado. Acompanhe o status no histórico abaixo.');
      handleCancelar();
      await fetchHistorico(siloIdLabrador);
    } catch (err) {
      toast.error(extractErro(err));
    } finally {
      setDisparando(false);
    }
  };

  const handleExcluir = async (c: ComandoResponse) => {
    const label = COMANDO_CFG[c.comando_id]?.label ?? `Comando ${c.comando_id}`;
    if (!confirm(`Excluir o registro "${label}" (${c.request_id.slice(0, 8)}…)? Esta ação não pode ser desfeita.`)) return;
    try {
      await deletarComando(c.request_id);
      toast.success('Registro excluído.');
      if (siloIdLabrador) await fetchHistorico(siloIdLabrador);
    } catch (err) {
      toast.error(extractErro(err));
    }
  };

  const fetchFirmwares = useCallback(async () => {
    setLoadingFirmwares(true);
    try {
      const data = await listarFirmwares();
      setFirmwares(data.firmwares);
    } catch {
      toast.error('Erro ao carregar firmwares');
    } finally {
      setLoadingFirmwares(false);
    }
  }, []);

  useEffect(() => {
    if (aba === 'firmwares') fetchFirmwares();
  }, [aba, fetchFirmwares]);

  const handleUploadFirmware = async () => {
    if (!fwFile) { toast.error('Selecione um arquivo .bin'); return; }
    setEnviandoFw(true);
    try {
      await uploadFirmware(fwFile, fwCategoria, fwDescricao || undefined);
      toast.success('Firmware enviado com sucesso');
      setFwFile(null);
      setFwDescricao('');
      await fetchFirmwares();
    } catch (err) {
      toast.error(extractErro(err));
    } finally {
      setEnviandoFw(false);
    }
  };

  const siloSelecionado = silos.find((s) => String(s.id_labrador) === siloIdLabrador);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Radio size={28} className="text-primary-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comando Remoto</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Disparo de comandos LoRa/sistema/banco e gestão de firmwares OTA do Labrador. Acesso restrito a administradores do sistema.
          </p>
        </div>
      </div>

      {/* Seletor de silo */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-700 mb-1">Silo *</label>
          <select
            value={siloIdLabrador}
            onChange={(e) => { setSiloIdLabrador(e.target.value); handleCancelar(); }}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Selecione um silo...</option>
            {silos.map((s) => (
              <option key={s.id} value={s.id_labrador ?? ''}>
                {s.nome}{s.empresa?.razao_social ? ` — ${s.empresa.razao_social}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setAba('comandos')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            aba === 'comandos' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Comandos
        </button>
        <button
          onClick={() => setAba('firmwares')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            aba === 'firmwares' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Firmwares
        </button>
      </div>

      {!siloIdLabrador ? (
        <div className="bg-white rounded-lg shadow p-10 text-center text-gray-400 text-sm">
          Selecione um silo para continuar.
        </div>
      ) : aba === 'comandos' ? (
        <>
          {/* Catálogo de comandos */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Catálogo de Comandos — {siloSelecionado?.nome}</h2>
            {comandosDisponiveis === null ? (
              <p className="text-sm text-gray-400">Carregando comandos disponíveis...</p>
            ) : comandosDisponiveis.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum comando habilitado para este silo.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.entries(COMANDO_CFG)
                  .filter(([idStr]) => comandosDisponiveis.includes(Number(idStr)))
                  .map(([idStr, cfg]) => {
                    const id = Number(idStr);
                    const ativo = comandoAtivo === id;
                    return (
                      <button
                        key={id}
                        onClick={() => handleSelecionarComando(id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium border transition-colors ${
                          ativo
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Painel de configuração do comando selecionado */}
            {cfgAtivo && (
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-md p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  {cfgAtivo.icon} {cfgAtivo.label}
                </div>

                {cfgAtivo.precisaNode && !cfgAtivo.nodeFixo && (
                  <div className="max-w-xs">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Node (DTG) *</label>
                    <select
                      value={nodeId ?? ''}
                      onChange={(e) => setNodeId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Selecione...</option>
                      {NODE_IDS.map((n) => (
                        <option key={n} value={n}>{NODE_LABELS[n]} ({n})</option>
                      ))}
                    </select>
                  </div>
                )}

                {cfgAtivo.nodeFixo && (
                  <p className="text-xs text-gray-500">
                    Node fixo: <span className="font-mono">{NODE_LABELS[cfgAtivo.nodeFixo]} ({cfgAtivo.nodeFixo})</span> — comando exclusivo deste node.
                  </p>
                )}

                {cfgAtivo.ota && nodeId != null && (
                  <div className="max-w-xs">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Firmware *</label>
                    <select
                      value={firmwareEscolhido ?? ''}
                      onChange={(e) => setFirmwareEscolhido(e.target.value || null)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Selecione um firmware...</option>
                      {firmwaresParaOta.map((fw) => (
                        <option key={fw.file_name} value={fw.file_name}>{fw.file_name}</option>
                      ))}
                    </select>
                    {firmwaresParaOta.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">Nenhum firmware disponível para esta categoria. Envie um na aba Firmwares.</p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  {!confirmando ? (
                    <button
                      onClick={() => setConfirmando(true)}
                      disabled={!prontoParaConfirmar}
                      className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      <PlusCircle size={15} />
                      Disparar
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
                      <span className="text-sm text-amber-800">Confirmar disparo de "{cfgAtivo.label}"?</span>
                      <button
                        onClick={handleDisparar}
                        disabled={disparando}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-60"
                      >
                        {disparando ? 'Enviando...' : 'Confirmar'}
                      </button>
                    </div>
                  )}
                  <button onClick={handleCancelar} className="text-gray-500 hover:text-gray-700 px-2 py-1 text-xs transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Histórico */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Histórico de Comandos</h2>
              <button
                onClick={() => fetchHistorico(siloIdLabrador)}
                disabled={loadingHistorico}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={13} className={loadingHistorico ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>
            {historico.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">Nenhum comando registrado para este silo.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Request ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Comando</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Node</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Solicitado</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Concluído</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Resultado</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historico.map((c) => (
                      <tr key={c.request_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-xs">{c.request_id.slice(0, 8)}…</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{COMANDO_CFG[c.comando_id]?.label ?? `Comando ${c.comando_id}`}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 font-mono text-xs">{c.parametro ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmt(c.solicitado_em)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmt(c.concluido_em)}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-3 text-gray-700 text-xs max-w-xs truncate" title={resultadoPreview(c)}>{resultadoPreview(c)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setComandoDetalhe(c)}
                              className="flex items-center gap-1 text-primary-600 hover:text-primary-800 text-xs font-medium"
                              title="Ver detalhes"
                            >
                              <Eye size={14} />
                              Visualizar
                            </button>
                            <button
                              onClick={() => handleExcluir(c)}
                              className="flex items-center gap-1 text-red-600 hover:text-red-800 text-xs font-medium"
                              title="Excluir registro"
                            >
                              <Trash2 size={14} />
                              Excluir
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
        </>
      ) : (
        <>
          {/* Upload de firmware */}
          <div className="bg-white rounded-lg shadow p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><UploadCloud size={16} /> Enviar Firmware</h2>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Arquivo (.bin) *</label>
                <input
                  type="file"
                  accept=".bin"
                  onChange={(e) => setFwFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Categoria *</label>
                <select
                  value={fwCategoria}
                  onChange={(e) => setFwCategoria(e.target.value as FirmwareCategoria)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="DTG01-04">DTG01-04</option>
                  <option value="DTG05">DTG05</option>
                </select>
              </div>
              <div className="flex-1 min-w-48">
                <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={fwDescricao}
                  onChange={(e) => setFwDescricao(e.target.value)}
                  placeholder="Ex.: Correção de leitura SHT31"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={handleUploadFirmware}
                disabled={!fwFile || enviandoFw}
                className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <UploadCloud size={15} />
                {enviandoFw ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>

          {/* Lista de firmwares */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Cpu size={16} /> Firmwares Disponíveis</h2>
              <button
                onClick={fetchFirmwares}
                disabled={loadingFirmwares}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={13} className={loadingFirmwares ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>
            {firmwares.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">Nenhum firmware enviado ainda.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Arquivo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Categoria</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Tamanho</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">SHA-256</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Descrição</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Enviado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {firmwares.map((fw) => (
                      <tr key={fw.file_name} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 font-mono text-xs">{fw.file_name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fw.categoria}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtBytes(fw.tamanho_bytes)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-xs" title={fw.sha256}>{fw.sha256.slice(0, 12)}…</td>
                        <td className="px-4 py-3 text-gray-700 text-xs max-w-xs truncate">{fw.descricao ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmt(fw.uploaded_em)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {comandoDetalhe && (
        <ComandoDetalheModal comando={comandoDetalhe} onClose={() => setComandoDetalhe(null)} />
      )}
    </div>
  );
}
