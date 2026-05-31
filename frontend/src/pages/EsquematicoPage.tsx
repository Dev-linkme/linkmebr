import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Upload, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { Silo } from '../types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

type Vista = 'frente' | 'lateral_esquerda' | 'lateral_direita';

interface DxfEntidade { handle: string; layer: string; centroide: { x: number; y: number }; }

interface BarraMapeamento { id: number; identificacao: string; dxf_handle: string | null; }
interface SensorMapeamento {
  id: number; identificacao: string; altura_solo_m: number;
  tipo_grandeza: string; dxf_handle: string | null;
  barra: { id: number; identificacao: string };
}

interface TooltipBarra  { layer: 'BARRAS'; data: { id: number; identificacao: string; local: string; status: string } | null; }
interface TooltipSensor {
  layer: 'SENSOR';
  data: Array<{ id: number; identificacao: string; altura_solo_m: number; tipo_grandeza: string; unidade_medida: string; status: string; barra: { id: number; identificacao: string } }> | null;
}
type TooltipData = TooltipBarra | TooltipSensor | null;

const VISTAS: { value: Vista; label: string }[] = [
  { value: 'frente',           label: 'Vista De Frente'       },
  { value: 'lateral_esquerda', label: 'Lateral Esquerda'      },
  { value: 'lateral_direita',  label: 'Lateral Direita'       },
];

// ─── Viewer ───────────────────────────────────────────────────────────────────

function SvgViewer({ siloId, vista }: { siloId: number; vista: Vista }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent]   = useState<string>('');
  const [tooltip, setTooltip]         = useState<TooltipData>(null);
  const [tooltipPos, setTooltipPos]   = useState({ x: 0, y: 0 });
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    setLoading(true);
    setSvgContent('');
    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';
    const token   = localStorage.getItem('auth_token') ?? '';
    fetch(`${baseUrl}/silos/${siloId}/esquematicos/${vista}/svg`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.text())
      .then(setSvgContent)
      .catch(() => toast.error('Erro ao carregar esquemático'))
      .finally(() => setLoading(false));
  }, [siloId, vista]);

  const fetchTooltip = useCallback(async (handle: string, layer: string, x: number, y: number) => {
    try {
      const r = await api.get<TooltipData>(`/silos/${siloId}/esquematicos/tooltip`, {
        params: { handle, layer },
      });
      setTooltip(r.data);
      setTooltipPos({ x, y });
    } catch { /* silent */ }
  }, [siloId]);

  useEffect(() => {
    if (!svgContent || !containerRef.current) return;
    const el = containerRef.current;

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as SVGElement).closest('[data-handle]') as SVGElement | null;
      if (!target) { setTooltip(null); return; }
      const handle = target.getAttribute('data-handle') ?? '';
      const layer  = target.getAttribute('data-layer')  ?? '';
      if (!['BARRAS', 'SENSOR'].includes(layer)) { setTooltip(null); return; }
      const rect = el.getBoundingClientRect();
      fetchTooltip(handle, layer, e.clientX - rect.left, e.clientY - rect.top);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as Element | null;
      if (!related?.closest('[data-handle]')) setTooltip(null);
    };

    el.addEventListener('mouseover', handleMouseOver);
    el.addEventListener('mouseout',  handleMouseOut);
    return () => {
      el.removeEventListener('mouseover', handleMouseOver);
      el.removeEventListener('mouseout',  handleMouseOut);
    };
  }, [svgContent, fetchTooltip]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Carregando esquemático...</div>
  );

  if (!svgContent) return (
    <div className="flex items-center justify-center h-64 text-amber-600 text-sm">
      DXF não encontrado para esta vista. Faça o upload do arquivo.
    </div>
  );

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="w-full border border-gray-200 rounded-lg bg-gray-50"
        style={{ minHeight: 400 }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

      {tooltip && tooltip.data !== null && (
        <div
          className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs max-w-xs pointer-events-none"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 8 }}
        >
          {tooltip.layer === 'BARRAS' && tooltip.data && (
            <>
              <p className="font-semibold text-blue-700 mb-1">Barra</p>
              <p><span className="text-gray-500">ID:</span> {tooltip.data.id}</p>
              <p><span className="text-gray-500">Identificação:</span> {tooltip.data.identificacao}</p>
              <p><span className="text-gray-500">Local:</span> {tooltip.data.local}</p>
              <p><span className="text-gray-500">Status:</span> {tooltip.data.status}</p>
            </>
          )}
          {tooltip.layer === 'SENSOR' && Array.isArray(tooltip.data) && (
            <>
              <p className="font-semibold text-green-700 mb-1">Sensores ({tooltip.data.length})</p>
              {tooltip.data.map((s) => (
                <div key={s.id} className="mb-1 pb-1 border-b border-gray-100 last:border-0">
                  <p className="font-medium">{s.barra.identificacao} — {s.identificacao}</p>
                  <p className="text-gray-500">{s.altura_solo_m}m · {s.tipo_grandeza} · {s.unidade_medida}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mapping panel ────────────────────────────────────────────────────────────

function MapeamentoPanel({ siloId, vista }: { siloId: number; vista: Vista }) {
  const [entidades, setEntidades] = useState<{ barras: DxfEntidade[]; sensores: DxfEntidade[] } | null>(null);
  const [mapeamento, setMapeamento] = useState<{ barras: BarraMapeamento[]; sensores: SensorMapeamento[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading]   = useState(false);

  const load = useCallback(() => {
    api.get(`/silos/${siloId}/esquematicos/${vista}/entidades`)
      .then((r) => setEntidades(r.data as { barras: DxfEntidade[]; sensores: DxfEntidade[] }))
      .catch(() => setEntidades(null));
    api.get(`/silos/${siloId}/esquematicos/mapeamento`)
      .then((r) => setMapeamento(r.data as { barras: BarraMapeamento[]; sensores: SensorMapeamento[] }))
      .catch(() => {});
  }, [siloId, vista]);

  useEffect(() => { load(); }, [load]);

  const setBarraHandle = (barraId: number, handle: string | null) => {
    setMapeamento((prev) => prev ? {
      ...prev,
      barras: prev.barras.map((b) => b.id === barraId ? { ...b, dxf_handle: handle } : b),
    } : prev);
  };

  const setSensorHandle = (sensorId: number, handle: string | null) => {
    setMapeamento((prev) => prev ? {
      ...prev,
      sensores: prev.sensores.map((s) => s.id === sensorId ? { ...s, dxf_handle: handle } : s),
    } : prev);
  };

  const handleSave = async () => {
    if (!mapeamento) return;
    setSaving(true);
    try {
      await api.put(`/silos/${siloId}/esquematicos/mapeamento`, {
        barras:  mapeamento.barras.map((b)  => ({ id: b.id,  dxf_handle: b.dxf_handle })),
        sensores: mapeamento.sensores.map((s) => ({ id: s.id, dxf_handle: s.dxf_handle })),
      });
      toast.success('Mapeamento salvo');
    } catch { toast.error('Erro ao salvar mapeamento'); }
    finally { setSaving(false); }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    const form = new FormData();
    form.append('dxf', uploadFile);
    try {
      await api.post(`/silos/${siloId}/esquematicos/${vista}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('DXF enviado com sucesso');
      setUploadFile(null);
      load();
    } catch { toast.error('Erro ao enviar DXF'); }
    finally { setUploading(false); }
  };

  const handleOptions = entidades?.barras.map((e) => e.handle) ?? [];
  const sensorOptions = entidades?.sensores.map((e) => e.handle) ?? [];

  return (
    <div className="space-y-6">
      {/* Upload DXF */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <Upload size={14} /> Upload DXF — {VISTAS.find((v) => v.value === vista)?.label}
        </p>
        <div className="flex items-center gap-3">
          <input
            type="file" accept=".dxf"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="text-sm text-gray-600"
          />
          <button
            onClick={handleUpload}
            disabled={!uploadFile || uploading}
            className="px-4 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {uploading ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>

      {mapeamento && (
        <>
          {/* Barras */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Associação — Barras Internas</p>
            <div className="space-y-2">
              {mapeamento.barras.map((b) => (
                <div key={b.id} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-40 truncate">{b.identificacao}</span>
                  <select
                    value={b.dxf_handle ?? ''}
                    onChange={(e) => setBarraHandle(b.id, e.target.value || null)}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">— não associada —</option>
                    {handleOptions.map((h) => (
                      <option key={h} value={h}>Handle {h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Sensores */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Associação — Sensores</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {mapeamento.sensores.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 w-52 truncate">
                    {s.barra.identificacao} — {s.identificacao} ({s.altura_solo_m}m)
                  </span>
                  <select
                    value={s.dxf_handle ?? ''}
                    onChange={(e) => setSensorHandle(s.id, e.target.value || null)}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">— não associado —</option>
                    {sensorOptions.map((h) => (
                      <option key={h} value={h}>Handle {h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
          >
            <Save size={14} />
            {saving ? 'Salvando...' : 'Salvar Mapeamento'}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EsquematicoPage() {
  const [silos, setSilos]   = useState<Silo[]>([]);
  const [siloId, setSiloId] = useState<number | null>(null);
  const [vista, setVista]   = useState<Vista>('frente');
  const [aba, setAba]       = useState<'viewer' | 'mapeamento'>('viewer');

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?limit=100')
      .then((r) => setSilos(r.data.data))
      .catch(() => {});
  }, []);

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      active ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Layers size={26} className="text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Esquemáticos</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        {/* Silo selector */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Silo</label>
            <select
              value={siloId ?? ''}
              onChange={(e) => setSiloId(e.target.value ? Number(e.target.value) : null)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Selecione um silo...</option>
              {silos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>

          {siloId && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Vista</label>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {VISTAS.map((v) => (
                  <button
                    key={v.value}
                    onClick={() => setVista(v.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      vista === v.value ? 'bg-white shadow text-primary-700' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {siloId && (
          <>
            {/* Aba viewer / mapeamento */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              <button onClick={() => setAba('viewer')}     className={tabCls(aba === 'viewer')}>Visualizador</button>
              <button onClick={() => setAba('mapeamento')} className={tabCls(aba === 'mapeamento')}>Mapeamento</button>
            </div>

            {aba === 'viewer' && <SvgViewer siloId={siloId} vista={vista} />}
            {aba === 'mapeamento' && <MapeamentoPanel siloId={siloId} vista={vista} />}
          </>
        )}
      </div>
    </div>
  );
}
