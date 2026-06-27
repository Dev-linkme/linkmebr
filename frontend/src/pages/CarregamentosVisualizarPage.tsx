import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import toast from 'react-hot-toast';
import { BarChart2 } from 'lucide-react';
import api from '../services/api';
import type { Silo, Carregamento } from '../types/index';

type PeriodoPreset = '30d' | '90d' | 'tudo';
const PERIODO_LABELS: Record<PeriodoPreset, string> = {
  '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', tudo: 'Tudo',
};

const BRT = 'America/Sao_Paulo';

function formatData(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: BRT, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).replace(', ', ' ');
}

export default function CarregamentosVisualizarPage() {
  const [silos, setSilos] = useState<Silo[]>([]);
  const [siloId, setSiloId] = useState('');
  const [periodo, setPeriodo] = useState<PeriodoPreset>('90d');

  const [registros, setRegistros] = useState<Carregamento[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?per_page=200')
      .then((res) => {
        const ativos = (res.data.data ?? []).filter((s) => s.status === 'ativo');
        setSilos(ativos);
        if (ativos.length === 1) setSiloId(String(ativos[0].id));
      })
      .catch(() => toast.error('Erro ao carregar silos'));
  }, []);

  const fetchRegistros = useCallback(async (sid: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Carregamento[] }>('/carregamentos', {
        params: { silo_id: sid, limit: 500 },
      });
      setRegistros((res.data.data ?? []).slice().reverse()); // backend retorna desc; gráfico precisa de ordem cronológica
    } catch {
      toast.error('Erro ao carregar registros de carregamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRegistros([]);
    if (!siloId) return;
    fetchRegistros(siloId);
  }, [siloId, fetchRegistros]);

  const limiteMs = periodo === '30d' ? 30 * 24 * 3_600_000 : periodo === '90d' ? 90 * 24 * 3_600_000 : null;
  const registrosFiltrados = limiteMs == null
    ? registros
    : registros.filter((r) => Date.now() - new Date(r.hora_referencia).getTime() <= limiteMs);

  const chartData = registrosFiltrados.map((r) => ({
    hora_referencia: r.hora_referencia,
    nivel_m: Number(r.nivel_m),
    volume_sacos: Number(r.volume_sacos),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart2 size={28} className="text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Carregamento — Visualizar</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Silo *</label>
          <select
            value={siloId}
            onChange={(e) => setSiloId(e.target.value)}
            className="w-full sm:w-64 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Selecione um silo...</option>
            {silos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {(['30d', '90d', 'tudo'] as PeriodoPreset[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                periodo === p ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {PERIODO_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {!siloId ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-10 text-center text-gray-400 text-sm">
          Selecione um silo para ver o gráfico.
        </div>
      ) : loading ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-10 text-center text-gray-400 text-sm">
          Nenhum registro de carregamento encontrado para este período.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Nível da soja (m) ao longo do tempo</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hora_referencia" tickFormatter={formatData} tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: 'm', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const p = payload[0].payload as { nivel_m: number; volume_sacos: number };
                  return (
                    <div className="bg-white border border-gray-200 rounded shadow-lg px-3 py-2 text-xs">
                      <p className="font-medium text-gray-700 mb-1">{formatData(String(label))}</p>
                      <p className="text-gray-600">Nível: <span className="font-semibold">{p.nivel_m.toFixed(2)} m</span></p>
                      <p className="text-gray-600">Volume: <span className="font-semibold">{p.volume_sacos.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} sc</span></p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="nivel_m" fill="#16a34a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
