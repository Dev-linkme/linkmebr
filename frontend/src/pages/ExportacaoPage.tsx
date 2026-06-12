import { useState, useEffect } from 'react';
import { Download, Loader2, CalendarRange, Archive } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

type ModoExportacao = 'individualizada' | 'agrupada';
type Grandeza = 'temperatura' | 'umidade' | 'co2';
type Formato = 'csv' | 'json';

interface Silo { id: number; nome: string; }
interface Barra { id: number; identificacao: string; }
interface Sensor {
  id: number;
  identificacao: string;
  tipo_grandeza: string;
  altura_solo_m: number;
  barra: { id: number; identificacao: string };
}
interface PeriodoDisponivel { inicio: string | null; fim: string | null; }

const GRANDEZAS: { value: Grandeza; label: string }[] = [
  { value: 'temperatura', label: 'Temperatura' },
  { value: 'umidade', label: 'Umidade' },
  { value: 'co2', label: 'CO₂' },
];

function formatDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);
}

function formatDisplay(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';
const getToken = () => localStorage.getItem('auth_token') ?? '';

export default function ExportacaoPage() {
  const [modo, setModo] = useState<ModoExportacao>('individualizada');

  // Estado compartilhado
  const [siloId, setSiloId] = useState<number | null>(null);
  const [formato, setFormato] = useState<Formato>('csv');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [exporting, setExporting] = useState(false);
  const [periodo, setPeriodo] = useState<PeriodoDisponivel | null>(null);
  const [loadingPeriodo, setLoadingPeriodo] = useState(false);

  // Estado exclusivo do modo individualizado
  const [grandezas, setGrandezas] = useState<Grandeza[]>([]);
  const [barrasSelecionadas, setBarrasSelecionadas] = useState<number[]>([]);
  const [sensoresSelecionados, setSensoresSelecionados] = useState<number[]>([]);

  // Dados carregados
  const [silos, setSilos] = useState<Silo[]>([]);
  const [barras, setBarras] = useState<Barra[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);
  const [loadingSensores, setLoadingSensores] = useState(false);

  // Carrega silos uma vez
  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?limit=100').then((r) => setSilos(r.data.data)).catch(() => {});
  }, []);

  // Carrega período disponível ao trocar silo ou modo
  useEffect(() => {
    if (!siloId) { setPeriodo(null); return; }
    setLoadingPeriodo(true);
    api.get<PeriodoDisponivel>(`/export/periodo?silo_id=${siloId}&tipo=leitura_interna`)
      .then((r) => setPeriodo(r.data))
      .catch(() => setPeriodo(null))
      .finally(() => setLoadingPeriodo(false));
  }, [siloId, modo]);

  // Carrega barras ao trocar silo (só no modo individualizado)
  useEffect(() => {
    if (!siloId || modo !== 'individualizada') {
      setBarras([]);
      setBarrasSelecionadas([]);
      setSensores([]);
      setSensoresSelecionados([]);
      return;
    }
    api.get<{ data: Barra[] }>(`/silos/${siloId}/barras?limit=100`)
      .then((r) => setBarras(r.data.data))
      .catch(() => {});
    setBarrasSelecionadas([]);
    setSensores([]);
    setSensoresSelecionados([]);
  }, [siloId, modo]);

  // Carrega sensores ao trocar barras ou grandezas (só no modo individualizado)
  useEffect(() => {
    if (modo !== 'individualizada' || !siloId || grandezas.length === 0 || barras.length === 0) {
      setSensores([]);
      setSensoresSelecionados([]);
      return;
    }
    const barrasAlvo = barrasSelecionadas.length > 0 ? barrasSelecionadas : barras.map((b) => b.id);
    setLoadingSensores(true);
    Promise.all(barrasAlvo.map((bId) => api.get<{ data: Sensor[] }>(`/barras/${bId}/sensores?limit=200`)))
      .then((results) => {
        const todos = results.flatMap((r) => r.data.data);
        setSensores(todos.filter((s) => grandezas.includes(s.tipo_grandeza as Grandeza)));
        setSensoresSelecionados([]);
      })
      .catch(() => {})
      .finally(() => setLoadingSensores(false));
  }, [siloId, modo, barras, barrasSelecionadas, grandezas]);

  const handleSetModo = (m: ModoExportacao) => {
    setModo(m);
    setGrandezas([]);
    setBarrasSelecionadas([]);
    setSensoresSelecionados([]);
  };

  const toggleGrandeza = (g: Grandeza) => {
    setGrandezas((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
    setSensoresSelecionados([]);
  };

  const toggleBarra = (id: number) => {
    setBarrasSelecionadas((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    setSensoresSelecionados([]);
  };

  const toggleSensor = (id: number) => {
    setSensoresSelecionados((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const downloadBlob = (blob: Blob, fallbackName: string, fetchRes: Response) => {
    const disposition = fetchRes.headers.get('Content-Disposition');
    const filename = disposition?.match(/filename=(.+)/)?.[1] ?? fallbackName;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleExportIndividualizada = async () => {
    if (!siloId) { toast.error('Selecione um silo'); return; }
    if (grandezas.length === 0) { toast.error('Selecione ao menos uma grandeza'); return; }
    if (sensores.length === 0) { toast.error('Nenhum sensor encontrado para os filtros selecionados'); return; }

    const sensorIds = sensoresSelecionados.length > 0 ? sensoresSelecionados : sensores.map((s) => s.id);
    const params = new URLSearchParams();
    params.set('silo_id', String(siloId));
    params.set('formato', formato);
    sensorIds.forEach((id) => params.append('sensor', String(id)));
    if (inicio) params.set('start', new Date(inicio).toISOString());
    if (fim) params.set('end', new Date(fim).toISOString());

    setExporting(true);
    try {
      const fetchRes = await fetch(`${BASE_URL}/export/leitura_interna?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!fetchRes.ok) {
        const err = await fetchRes.json().catch(() => ({ message: 'Erro na exportação' })) as { message?: string };
        throw new Error(err.message ?? 'Erro na exportação');
      }
      const blob = await fetchRes.blob();
      downloadBlob(blob, `leitura_interna_${Date.now()}.${formato}`, fetchRes);
      toast.success('Exportação concluída');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar');
    } finally {
      setExporting(false);
    }
  };

  const handleExportAgrupada = async () => {
    if (!siloId) { toast.error('Selecione um silo'); return; }

    const params = new URLSearchParams();
    params.set('silo_id', String(siloId));
    params.set('formato', formato);
    if (inicio) params.set('start', new Date(inicio).toISOString());
    if (fim) params.set('end', new Date(fim).toISOString());

    setExporting(true);
    try {
      const fetchRes = await fetch(`${BASE_URL}/export/agrupada?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!fetchRes.ok) {
        const err = await fetchRes.json().catch(() => ({ message: 'Erro na exportação' })) as { message?: string };
        throw new Error(err.message ?? 'Erro na exportação');
      }
      const blob = await fetchRes.blob();
      downloadBlob(blob, `agrupada_${Date.now()}.zip`, fetchRes);
      toast.success('Exportação concluída — verifique o arquivo ZIP');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar');
    } finally {
      setExporting(false);
    }
  };

  const canExportIndividualizada = siloId !== null && grandezas.length > 0 && sensores.length > 0;
  const canExportAgrupada = siloId !== null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Exportação De Dados</h1>

      {/* Seletor de modo */}
      <div className="bg-white rounded-xl border border-gray-200 p-1 flex gap-1">
        {([
          { value: 'individualizada' as ModoExportacao, label: 'Individualizada' },
          { value: 'agrupada'        as ModoExportacao, label: 'Agrupada por Cabo' },
        ]).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleSetModo(value)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-colors ${
              modo === value
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">

        {/* Silo (compartilhado) */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Silo <span className="text-red-500">*</span>
          </label>
          <select
            value={siloId ?? ''}
            onChange={(e) => setSiloId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Selecione um silo...</option>
            {silos.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>

          {siloId !== null && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <CalendarRange size={13} />
              {loadingPeriodo ? (
                <span className="flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Verificando dados...
                </span>
              ) : periodo?.inicio && periodo?.fim ? (
                <span>
                  Dados disponíveis de{' '}
                  <span className="font-medium text-gray-700">{formatDisplay(periodo.inicio)}</span>
                  {' '}até{' '}
                  <span className="font-medium text-gray-700">{formatDisplay(periodo.fim)}</span>
                </span>
              ) : (
                <span className="text-amber-600">Nenhum dado encontrado para este silo</span>
              )}
            </div>
          )}
        </div>

        {/* Grandeza, Barras, Sensores (só modo individualizado) */}
        {modo === 'individualizada' && (
          <>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Grandeza <span className="text-red-500">*</span>
              </p>
              <div className="flex gap-6">
                {GRANDEZAS.map((g) => (
                  <label key={g.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={grandezas.includes(g.value)}
                      onChange={() => toggleGrandeza(g.value)}
                      className="accent-primary-600"
                    />
                    <span className="text-sm text-gray-700">{g.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {siloId !== null && barras.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Cabo Pêndulo{' '}
                  <span className="text-gray-400 font-normal text-xs">
                    (opcional — todos se nenhum selecionado)
                  </span>
                </p>
                <div className="flex flex-wrap gap-4">
                  {barras.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={barrasSelecionadas.includes(b.id)}
                        onChange={() => toggleBarra(b.id)}
                        className="accent-primary-600"
                      />
                      <span className="text-sm text-gray-700">{b.identificacao}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {siloId !== null && grandezas.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Sensor{' '}
                  <span className="text-gray-400 font-normal text-xs">
                    (opcional — todos se nenhum selecionado)
                  </span>
                </p>
                {loadingSensores ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 size={14} className="animate-spin" /> Carregando sensores...
                  </div>
                ) : sensores.length === 0 ? (
                  <p className="text-sm text-amber-600">
                    Nenhum sensor encontrado para as grandezas selecionadas.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto border border-gray-100 rounded-lg p-3">
                      {sensores.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sensoresSelecionados.includes(s.id)}
                            onChange={() => toggleSensor(s.id)}
                            className="accent-primary-600 flex-shrink-0"
                          />
                          <span className="text-xs text-gray-700 leading-tight">
                            {s.barra.identificacao} — {s.identificacao} ({s.altura_solo_m}m)
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {sensores.length} sensor(es) encontrado(s)
                      {sensoresSelecionados.length > 0 && ` — ${sensoresSelecionados.length} selecionado(s)`}
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Nota informativa (só modo agrupado) */}
        {modo === 'agrupada' && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <Archive size={15} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              Será gerado <strong>um arquivo por cabo pêndulo</strong>, empacotados em um único ZIP.
              Cada arquivo contém uma linha por timestamp com os dados de todas as alturas
              (fundo / meio / topo) e grandezas (temperatura, umidade, CO₂) pivotados em colunas
              — campos: <code className="font-mono">sum, max, min, n, sum2</code>.
            </p>
          </div>
        )}

        {/* Formato (compartilhado) */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Formato</p>
          <div className="flex gap-6">
            {(['csv', 'json'] as Formato[]).map((f) => (
              <label key={f} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={formato === f}
                  onChange={() => setFormato(f)}
                  className="accent-primary-600"
                />
                <span className="text-sm text-gray-700 uppercase">{f}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Período (compartilhado) */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Período</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data/Hora Início</label>
              <input
                type="datetime-local"
                value={inicio}
                min={periodo?.inicio ? formatDatetimeLocal(periodo.inicio) : undefined}
                max={periodo?.fim    ? formatDatetimeLocal(periodo.fim)    : undefined}
                onChange={(e) => setInicio(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data/Hora Fim</label>
              <input
                type="datetime-local"
                value={fim}
                min={periodo?.inicio ? formatDatetimeLocal(periodo.inicio) : undefined}
                max={periodo?.fim    ? formatDatetimeLocal(periodo.fim)    : undefined}
                onChange={(e) => setFim(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          {periodo?.inicio && periodo?.fim && (
            <p className="text-xs text-gray-400 mt-1.5">
              Deixe em branco para exportar todo o período disponível
            </p>
          )}
        </div>

        {/* Botão exportar */}
        <div className="pt-2">
          <button
            onClick={modo === 'individualizada' ? handleExportIndividualizada : handleExportAgrupada}
            disabled={(modo === 'individualizada' ? !canExportIndividualizada : !canExportAgrupada) || exporting}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
          >
            {exporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : modo === 'agrupada' ? (
              <Archive size={16} />
            ) : (
              <Download size={16} />
            )}
            {exporting ? 'Exportando...' : modo === 'agrupada' ? 'Exportar ZIP' : 'Exportar'}
          </button>
        </div>
      </div>
    </div>
  );
}
