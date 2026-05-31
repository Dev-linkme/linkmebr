import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Save, Upload, ZoomIn, ZoomOut, Maximize2, Loader2, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { Silo } from '../types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

type Vista = 'frente' | 'lateral_esquerda' | 'lateral_direita';
interface VB { x: number; y: number; w: number; h: number; }

interface DxfEntidade { handle: string; layer: string; centroide: { x: number; y: number }; }
interface EntidadesResponse { barras: DxfEntidade[]; sensores: DxfEntidade[]; }

interface BarraMapeamento { id: number; identificacao: string; dxf_handle: string | null; }
interface SensorMapeamento {
  id: number; identificacao: string; altura_solo_m: number;
  tipo_grandeza: string; dxf_handle: string | null;
  barra: { id: number; identificacao: string };
}

type TooltipData =
  | { layer: 'BARRAS'; data: { id: number; identificacao: string; local: string; status: string } | null }
  | { layer: 'SENSOR'; data: Array<{ id: number; identificacao: string; altura_solo_m: number; tipo_grandeza: string; unidade_medida: string; status: string; barra: { id: number; identificacao: string } }> | null }
  | null;

const VISTAS: { value: Vista; label: string }[] = [
  { value: 'frente',           label: 'Vista De Frente'  },
  { value: 'lateral_esquerda', label: 'Lateral Esquerda' },
  { value: 'lateral_direita',  label: 'Lateral Direita'  },
];

// ─── SVG viewer with pan/zoom ─────────────────────────────────────────────────

function SvgViewer({
  siloId, vista, annotate = false,
}: { siloId: number; vista: Vista; annotate?: boolean }) {
  const svgRef   = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const tooltipCache = useRef<Map<string, TooltipData>>(new Map());

  const [svgInner,   setSvgInner]   = useState('');
  const [initVB,     setInitVB]     = useState<VB | null>(null);
  const [viewBox,    setViewBox]    = useState<VB | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [tooltip,    setTooltip]    = useState<TooltipData>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [labelData,  setLabelData]  = useState<Array<{ handle: string; layer: string; cx: number; cy: number }>>([]);

  // Load SVG
  useEffect(() => {
    setLoading(true); setSvgInner(''); setViewBox(null); setInitVB(null);
    const token   = localStorage.getItem('auth_token') ?? '';
    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';
    fetch(`${baseUrl}/silos/${siloId}/esquematicos/${vista}/svg`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.text())
      .then((svg) => {
        const vbMatch = svg.match(/viewBox="([^"]+)"/);
        if (vbMatch) {
          const [x, y, w, h] = vbMatch[1].split(' ').map(Number);
          const vb = { x, y, w, h };
          setInitVB(vb); setViewBox(vb);
        }
        const inner = svg
          .replace(/<\?xml[^>]*\?>/g, '')
          .replace(/<svg[^>]*>/,       '')
          .replace(/<\/svg>\s*$/,      '');
        setSvgInner(inner);
      })
      .catch(() => toast.error('Erro ao carregar esquemático'))
      .finally(() => setLoading(false));
  }, [siloId, vista]);

  // Extract label positions from rendered SVG using getBBox (annotation mode)
  useLayoutEffect(() => {
    if (!annotate || !svgRef.current || !svgInner) return;
    const labels: Array<{ handle: string; layer: string; cx: number; cy: number }> = [];
    const els = svgRef.current.querySelectorAll('[data-handle]');
    els.forEach((el) => {
      try {
        const bbox = (el as SVGGraphicsElement).getBBox();
        const handle = el.getAttribute('data-handle') ?? '';
        const layer  = el.getAttribute('data-layer')  ?? '';
        labels.push({ handle, layer, cx: bbox.x + bbox.width / 2, cy: bbox.y + bbox.height / 2 });
      } catch { /* element not in DOM yet */ }
    });
    setLabelData(labels);
  }, [svgInner, annotate, viewBox]);

  // Wheel zoom (non-passive)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.15 : 0.87;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top)  / rect.height;
      setViewBox((v) => {
        if (!v) return v;
        const mx = v.x + px * v.w;
        const my = v.y + py * v.h;
        const nw = v.w * factor;
        const nh = v.h * factor;
        return { x: mx - px * nw, y: my - py * nh, w: nw, h: nh };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [svgInner]); // re-attach when SVG loads

  // Tooltip on hover (viewer mode only)
  const fetchTooltip = useCallback(async (handle: string, layer: string, cx: number, cy: number) => {
    const key = `${handle}:${layer}`;
    if (tooltipCache.current.has(key)) {
      setTooltip(tooltipCache.current.get(key)!);
      setTooltipPos({ x: cx, y: cy });
      return;
    }
    try {
      const r = await api.get<TooltipData>(`/silos/${siloId}/esquematicos/tooltip`, {
        params: { handle, layer },
      });
      tooltipCache.current.set(key, r.data);
      setTooltip(r.data);
      setTooltipPos({ x: cx, y: cy });
    } catch { /* silent */ }
  }, [siloId]);

  // Pan handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current || !viewBox || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = (e.clientX - lastMouse.current.x) / rect.width  * viewBox.w;
    const dy = (e.clientY - lastMouse.current.y) / rect.height * viewBox.h;
    setViewBox((v) => v ? { ...v, x: v.x - dx, y: v.y - dy } : v);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { dragging.current = false; };

  // Hover for tooltip
  const onSvgMouseOver = (e: React.MouseEvent<SVGSVGElement>) => {
    if (annotate) return;
    const target = (e.target as SVGElement).closest('[data-handle]') as SVGElement | null;
    if (!target) { setTooltip(null); return; }
    const handle = target.getAttribute('data-handle') ?? '';
    const layer  = target.getAttribute('data-layer')  ?? '';
    if (!['BARRAS', 'SENSOR'].includes(layer)) { setTooltip(null); return; }
    const rect = svgRef.current!.getBoundingClientRect();
    fetchTooltip(handle, layer, e.clientX - rect.left, e.clientY - rect.top);
  };
  const onSvgMouseOut = (e: React.MouseEvent<SVGSVGElement>) => {
    const rel = e.relatedTarget as Element | null;
    if (!rel?.closest('[data-handle]')) setTooltip(null);
  };

  const resetZoom = () => initVB && setViewBox(initVB);
  const zoomIn    = () => setViewBox((v) => v ? { x: v.x + v.w*0.1, y: v.y + v.h*0.1, w: v.w*0.8, h: v.h*0.8 } : v);
  const zoomOut   = () => setViewBox((v) => v ? { x: v.x - v.w*0.1, y: v.y - v.h*0.1, w: v.w*1.25, h: v.h*1.25 } : v);

  if (loading) return (
    <div className="flex items-center justify-center h-96 text-gray-400 text-sm gap-2">
      <Loader2 size={16} className="animate-spin" /> Carregando esquemático...
    </div>
  );

  if (!svgInner) return (
    <div className="flex items-center justify-center h-64 text-amber-600 text-sm bg-amber-50 rounded-lg border border-amber-200 p-4">
      DXF não encontrado para esta vista. Use a opção Mapeamento para fazer o upload.
    </div>
  );

  // Annotation font size: ~5% of viewBox width
  const fontSize = viewBox ? viewBox.w * 0.04 : 0.01;

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button onClick={zoomIn}   className="bg-white border border-gray-300 rounded p-1 hover:bg-gray-50 shadow-sm" title="Zoom in">
          <ZoomIn  size={14} />
        </button>
        <button onClick={zoomOut}  className="bg-white border border-gray-300 rounded p-1 hover:bg-gray-50 shadow-sm" title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <button onClick={resetZoom} className="bg-white border border-gray-300 rounded p-1 hover:bg-gray-50 shadow-sm" title="Resetar zoom">
          <Maximize2 size={14} />
        </button>
      </div>

      {/* SVG canvas */}
      <div className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden" style={{ minHeight: 480 }}>
        {viewBox && (
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            style={{ width: '100%', height: '100%', minHeight: 480, cursor: dragging.current ? 'grabbing' : 'grab', display: 'block' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseOver={onSvgMouseOver}
            onMouseOut={onSvgMouseOut}
          >
            {/* DXF entities */}
            <g dangerouslySetInnerHTML={{ __html: svgInner }} />

            {/* Handle annotations (mapping mode) — positioned via getBBox() */}
            {annotate && labelData.length > 0 && (
              <g>
                {labelData.map((lbl) => (
                  <text
                    key={lbl.handle}
                    x={lbl.cx}
                    y={lbl.cy}
                    fontSize={fontSize}
                    fill={lbl.layer === 'BARRAS' ? '#1d4ed8' : '#15803d'}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ userSelect: 'none', fontFamily: 'monospace', fontWeight: 'bold' }}
                  >
                    {lbl.handle}
                  </text>
                ))}
              </g>
            )}
          </svg>
        )}
      </div>

      {/* Tooltip (viewer mode) */}
      {!annotate && tooltip && tooltip.data !== null && (
        <div
          className="absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs max-w-xs pointer-events-none"
          style={{ left: tooltipPos.x + 14, top: Math.max(4, tooltipPos.y - 8) }}
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

      <p className="text-xs text-gray-400 mt-1">
        Scroll para zoom · Arrastar para pan
        {annotate && ' · Handles destacados nos elementos'}
      </p>
    </div>
  );
}

// ─── Silo + Vista selector (shared) ──────────────────────────────────────────

function SiloVistaSelector({
  silos, siloId, vista, onSiloChange, onVistaChange,
}: {
  silos: Silo[];
  siloId: number | null;
  vista: Vista;
  onSiloChange: (id: number | null) => void;
  onVistaChange: (v: Vista) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Silo</label>
        <select
          value={siloId ?? ''}
          onChange={(e) => onSiloChange(e.target.value ? Number(e.target.value) : null)}
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
                onClick={() => onVistaChange(v.value)}
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
  );
}

// ─── Mapping panel ────────────────────────────────────────────────────────────

function MapeamentoPanel({ siloId, vista }: { siloId: number; vista: Vista }) {
  const [entidades,  setEntidades]  = useState<EntidadesResponse | null>(null);
  const [mapeamento, setMapeamento] = useState<{ barras: BarraMapeamento[]; sensores: SensorMapeamento[] } | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const load = useCallback(() => {
    api.get<EntidadesResponse>(`/silos/${siloId}/esquematicos/${vista}/entidades`)
      .then((r) => setEntidades(r.data))
      .catch(() => setEntidades(null));
    api.get<{ barras: BarraMapeamento[]; sensores: SensorMapeamento[] }>(`/silos/${siloId}/esquematicos/mapeamento`)
      .then((r) => setMapeamento(r.data))
      .catch(() => {});
  }, [siloId, vista]);

  useEffect(() => { load(); }, [load]);

  const setBarraHandle  = (id: number, h: string | null) =>
    setMapeamento((p) => p ? { ...p, barras:   p.barras.map((b)  => b.id  === id ? { ...b,  dxf_handle: h } : b)  } : p);
  const setSensorHandle = (id: number, h: string | null) =>
    setMapeamento((p) => p ? { ...p, sensores: p.sensores.map((s) => s.id === id ? { ...s, dxf_handle: h } : s) } : p);

  const handleSave = async () => {
    if (!mapeamento) return;
    setSaving(true);
    try {
      await api.put(`/silos/${siloId}/esquematicos/mapeamento`, {
        barras:   mapeamento.barras.map((b) => ({ id: b.id,  dxf_handle: b.dxf_handle })),
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
      toast.success('DXF enviado');
      setUploadFile(null);
      load();
    } catch { toast.error('Erro ao enviar DXF'); }
    finally { setUploading(false); }
  };

  const barraHandles  = entidades?.barras.map((e) => e.handle)  ?? [];
  const sensorHandles = entidades?.sensores.map((e) => e.handle) ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: annotated SVG preview */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Visualização Com Handles</p>
        <SvgViewer siloId={siloId} vista={vista} annotate />
      </div>

      {/* Right: mapping form */}
      <div className="space-y-5">
        {/* Upload */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Upload size={13} /> Upload DXF — {VISTAS.find((v) => v.value === vista)?.label}
          </p>
          <div className="flex items-center gap-3">
            <input type="file" accept=".dxf" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} className="text-sm text-gray-600" />
            <button onClick={handleUpload} disabled={!uploadFile || uploading}
              className="px-4 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {uploading ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>

        {mapeamento && (
          <>
            {/* Barras */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Barras Internas</p>
              <div className="space-y-2">
                {mapeamento.barras.map((b) => (
                  <div key={b.id} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 w-36 truncate">{b.identificacao}</span>
                    <select value={b.dxf_handle ?? ''}
                      onChange={(e) => setBarraHandle(b.id, e.target.value || null)}
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value="">— não associada —</option>
                      {barraHandles.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Sensores */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Sensores</p>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {mapeamento.sensores.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-700 w-44 truncate">
                      {s.barra.identificacao} / {s.identificacao} ({s.altura_solo_m}m)
                    </span>
                    <select value={s.dxf_handle ?? ''}
                      onChange={(e) => setSensorHandle(s.id, e.target.value || null)}
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value="">— não associado —</option>
                      {sensorHandles.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm">
              <Save size={14} />
              {saving ? 'Salvando...' : 'Salvar Mapeamento'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EsquematicoPage() {
  const location = useLocation();
  const isMapeamento = location.pathname.includes('/mapeamento');

  const [silos,  setSilos]  = useState<Silo[]>([]);
  const [siloId, setSiloId] = useState<number | null>(null);
  const [vista,  setVista]  = useState<Vista>('frente');

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?limit=100')
      .then((r) => setSilos(r.data.data))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Layers size={26} className="text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">
          Esquemáticos — {isMapeamento ? 'Mapeamento' : 'Visualizador'}
        </h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        <SiloVistaSelector
          silos={silos}
          siloId={siloId}
          vista={vista}
          onSiloChange={setSiloId}
          onVistaChange={setVista}
        />

        {siloId && !isMapeamento && <SvgViewer siloId={siloId} vista={vista} />}
        {siloId && isMapeamento  && <MapeamentoPanel siloId={siloId} vista={vista} />}

        {!siloId && (
          <p className="text-center text-gray-400 text-sm py-12">Selecione um silo para começar.</p>
        )}
      </div>
    </div>
  );
}
