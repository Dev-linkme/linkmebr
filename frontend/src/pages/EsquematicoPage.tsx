import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Upload, ZoomIn, ZoomOut, Maximize2, Loader2, Layers,
  Pencil, Trash2, Eye, EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { Silo } from '../types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

type Vista = 'frente' | 'lateral_esquerda' | 'lateral_direita';
interface VB { x: number; y: number; w: number; h: number; }

interface DbOverlay {
  id: number;
  entity_type: 'barra' | 'sensor';
  entity_id: number;
  x1: number; y1: number; x2: number; y2: number;
}

interface DrawTarget {
  entity_type: 'barra' | 'sensor';
  entity_id: number;
  label: string;
}

type TooltipData =
  | { entity_type: 'barra'; data: { id: number; identificacao: string; local: string; status: string } | null }
  | { entity_type: 'sensor'; data: { id: number; identificacao: string; altura_solo_m: number; tipo_grandeza: string; unidade_medida: string; status: string; barra: { id: number; identificacao: string } } | null }
  | null;

interface BarraMapeamento   { id: number; identificacao: string; dxf_handle: string | null; }
interface SensorMapeamento  {
  id: number; identificacao: string; altura_solo_m: number;
  tipo_grandeza: string; dxf_handle: string | null;
  barra: { id: number; identificacao: string };
}

const VISTAS: { value: Vista; label: string }[] = [
  { value: 'frente',           label: 'Vista De Frente'  },
  { value: 'lateral_esquerda', label: 'Lateral Esquerda' },
  { value: 'lateral_direita',  label: 'Lateral Direita'  },
];

// Cores dos overlays
const OVERLAY_COLOR: Record<string, { fill: string; stroke: string }> = {
  barra:  { fill: '#3b82f6', stroke: '#1d4ed8' },
  sensor: { fill: '#22c55e', stroke: '#15803d' },
};

// ─── CSS injetado no SVG ──────────────────────────────────────────────────────

function buildSvgCss(showCotas: boolean): string {
  return `
    .C2 { stroke-width: 400 !important; }
    .C6 { stroke-width: 300 !important; fill: none !important; }
    .C7 { stroke-width: 300 !important; fill: none !important; }
    ${showCotas ? '' : '.C3, .C4, .C8 { display: none !important; }'}
  `.trim();
}

// ─── SVG viewer ──────────────────────────────────────────────────────────────

function SvgViewer({
  siloId, vista,
  overlays = [],
  showCotas,
  highlightId,
  drawTarget,
  onDraw,
}: {
  siloId: number;
  vista: Vista;
  overlays?: DbOverlay[];
  showCotas: boolean;
  highlightId?: { entity_type: string; entity_id: number } | null;
  drawTarget?: DrawTarget | null;
  onDraw?: (entity_type: string, entity_id: number, x1: number, y1: number, x2: number, y2: number) => void;
}) {
  const svgRef    = useRef<SVGSVGElement>(null);
  const dragging  = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const tooltipCache = useRef<Map<string, TooltipData>>(new Map());

  const [svgInner,    setSvgInner]    = useState('');
  const [initVB,      setInitVB]      = useState<VB | null>(null);
  const [viewBox,     setViewBox]     = useState<VB | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [tooltip,     setTooltip]     = useState<TooltipData>(null);
  const [tooltipPos,  setTooltipPos]  = useState({ x: 0, y: 0 });
  const [rubberBand,  setRubberBand]  = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Carrega SVG
  useEffect(() => {
    setLoading(true); setSvgInner(''); setViewBox(null); setInitVB(null);
    const token   = localStorage.getItem('auth_token') ?? '';
    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';
    fetch(`${baseUrl}/silos/${siloId}/esquematicos/${vista}/svg`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.text())
      .then(svg => {
        const vbMatch = svg.match(/viewBox="([^"]+)"/);
        if (vbMatch) {
          const [x, y, w, h] = vbMatch[1].split(' ').map(Number);
          const vb = { x, y, w, h };
          setInitVB(vb); setViewBox(vb);
        }
        const inner = svg
          .replace(/<\?xml[^>]*\?>/g, '')
          .replace(/<svg[^>]*>/, '')
          .replace(/<\/svg>\s*$/, '');
        setSvgInner(inner);
      })
      .catch(() => toast.error('Erro ao carregar esquemático'))
      .finally(() => setLoading(false));
  }, [siloId, vista]);

  // Coordenadas SVG a partir do evento de mouse
  const toSvgCoords = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    if (!svgRef.current || !viewBox) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: viewBox.x + ((e.clientX - rect.left) / rect.width)  * viewBox.w,
      y: viewBox.y + ((e.clientY - rect.top)  / rect.height) * viewBox.h,
    };
  }, [viewBox]);

  // Wheel zoom
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.15 : 0.87;
      const rect   = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top)  / rect.height;
      setViewBox(v => {
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
  }, [svgInner]);

  // Tooltip (modo viewer)
  const fetchTooltip = useCallback(async (entity_type: string, entity_id: number, cx: number, cy: number) => {
    const key = `${entity_type}:${entity_id}`;
    if (tooltipCache.current.has(key)) {
      setTooltip(tooltipCache.current.get(key)!);
      setTooltipPos({ x: cx, y: cy });
      return;
    }
    try {
      const r = await api.get<TooltipData>(`/silos/${siloId}/esquematicos/tooltip`, {
        params: { entity_type, entity_id },
      });
      tooltipCache.current.set(key, r.data);
      setTooltip(r.data);
      setTooltipPos({ x: cx, y: cy });
    } catch { /* silent */ }
  }, [siloId]);

  // Handlers de mouse
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const pt = toSvgCoords(e);
    if (drawTarget && pt) {
      drawStart.current = pt;
      setRubberBand({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    } else {
      dragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const pt = toSvgCoords(e);
    if (drawTarget && drawStart.current && pt) {
      setRubberBand({ x1: drawStart.current.x, y1: drawStart.current.y, x2: pt.x, y2: pt.y });
      return;
    }
    if (!dragging.current || !viewBox || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = (e.clientX - lastMouse.current.x) / rect.width  * viewBox.w;
    const dy = (e.clientY - lastMouse.current.y) / rect.height * viewBox.h;
    setViewBox(v => v ? { ...v, x: v.x - dx, y: v.y - dy } : v);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (drawTarget && drawStart.current) {
      const pt = toSvgCoords(e);
      if (pt && onDraw) {
        const x1 = Math.min(drawStart.current.x, pt.x);
        const x2 = Math.max(drawStart.current.x, pt.x);
        const y1 = Math.min(drawStart.current.y, pt.y);
        const y2 = Math.max(drawStart.current.y, pt.y);
        // Só salva se tiver tamanho mínimo
        if ((x2 - x1) > 100 && (y2 - y1) > 100) {
          onDraw(drawTarget.entity_type, drawTarget.entity_id, x1, y1, x2, y2);
        }
      }
      drawStart.current = null;
      setRubberBand(null);
      return;
    }
    dragging.current = false;
  };

  // Hover tooltip (modo viewer, sem drawTarget)
  const onSvgMouseOver = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawTarget) return;
    const target = (e.target as SVGElement).closest('[data-entity-id]') as SVGElement | null;
    if (!target) { setTooltip(null); return; }
    const entity_type = target.getAttribute('data-entity-type') ?? '';
    const entity_id   = Number(target.getAttribute('data-entity-id'));
    if (!entity_type || !entity_id) { setTooltip(null); return; }
    const rect = svgRef.current!.getBoundingClientRect();
    fetchTooltip(entity_type, entity_id, e.clientX - rect.left, e.clientY - rect.top);
  };
  const onSvgMouseOut = (e: React.MouseEvent<SVGSVGElement>) => {
    const rel = e.relatedTarget as Element | null;
    if (!rel?.closest('[data-entity-id]')) setTooltip(null);
  };

  const resetZoom = () => initVB && setViewBox(initVB);
  const zoomIn    = () => setViewBox(v => v ? { x: v.x + v.w*0.1, y: v.y + v.h*0.1, w: v.w*0.8,  h: v.h*0.8  } : v);
  const zoomOut   = () => setViewBox(v => v ? { x: v.x - v.w*0.1, y: v.y - v.h*0.1, w: v.w*1.25, h: v.h*1.25 } : v);

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

  const cursor = drawTarget ? 'crosshair' : (dragging.current ? 'grabbing' : 'grab');

  return (
    <div className="relative">
      {/* Controles de zoom */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button onClick={zoomIn}    className="bg-white border border-gray-300 rounded p-1 hover:bg-gray-50 shadow-sm" title="Zoom in"><ZoomIn  size={14} /></button>
        <button onClick={zoomOut}   className="bg-white border border-gray-300 rounded p-1 hover:bg-gray-50 shadow-sm" title="Zoom out"><ZoomOut size={14} /></button>
        <button onClick={resetZoom} className="bg-white border border-gray-300 rounded p-1 hover:bg-gray-50 shadow-sm" title="Resetar zoom"><Maximize2 size={14} /></button>
      </div>

      {drawTarget && (
        <div className="absolute top-2 left-2 z-10 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg shadow">
          Desenhando: <strong>{drawTarget.label}</strong> — clique e arraste para definir a área
        </div>
      )}

      <div className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden" style={{ minHeight: 480 }}>
        {viewBox && (
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            style={{ width: '100%', height: '100%', minHeight: 480, cursor, display: 'block' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseOver={onSvgMouseOver}
            onMouseOut={onSvgMouseOut}
          >
            {/* CSS overrides injetados */}
            <style>{buildSvgCss(showCotas)}</style>

            {/* Conteúdo DXF */}
            <g dangerouslySetInnerHTML={{ __html: svgInner }} />

            {/* Overlays do banco */}
            {overlays.map(ov => {
              const col = OVERLAY_COLOR[ov.entity_type] ?? OVERLAY_COLOR.barra;
              const highlighted = highlightId?.entity_type === ov.entity_type && highlightId?.entity_id === ov.entity_id;
              return (
                <rect
                  key={ov.id}
                  x={ov.x1} y={ov.y1}
                  width={ov.x2 - ov.x1} height={ov.y2 - ov.y1}
                  fill={col.fill}
                  fillOpacity={highlighted ? 0.6 : 0.2}
                  stroke={col.stroke}
                  strokeWidth={highlighted ? 600 : 200}
                  data-entity-type={ov.entity_type}
                  data-entity-id={ov.entity_id}
                  style={{ cursor: drawTarget ? 'crosshair' : 'pointer' }}
                />
              );
            })}

            {/* Rubber-band durante desenho */}
            {rubberBand && drawTarget && (() => {
              const col = OVERLAY_COLOR[drawTarget.entity_type];
              const x = Math.min(rubberBand.x1, rubberBand.x2);
              const y = Math.min(rubberBand.y1, rubberBand.y2);
              const w = Math.abs(rubberBand.x2 - rubberBand.x1);
              const h = Math.abs(rubberBand.y2 - rubberBand.y1);
              return (
                <rect x={x} y={y} width={w} height={h}
                  fill={col.fill} fillOpacity={0.35}
                  stroke={col.stroke} strokeWidth={300}
                  strokeDasharray="1000 500"
                  style={{ pointerEvents: 'none' }}
                />
              );
            })()}
          </svg>
        )}
      </div>

      {/* Tooltip (modo viewer) */}
      {!drawTarget && tooltip && (
        <div
          className="absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs max-w-xs pointer-events-none"
          style={{ left: tooltipPos.x + 14, top: Math.max(4, tooltipPos.y - 8) }}
        >
          {tooltip.entity_type === 'barra' && tooltip.data && (
            <>
              <p className="font-semibold text-blue-700 mb-1">Barra</p>
              <p><span className="text-gray-500">ID:</span> {tooltip.data.id}</p>
              <p><span className="text-gray-500">Identificação:</span> {tooltip.data.identificacao}</p>
              <p><span className="text-gray-500">Local:</span> {tooltip.data.local}</p>
              <p><span className="text-gray-500">Status:</span> {tooltip.data.status}</p>
            </>
          )}
          {tooltip.entity_type === 'sensor' && tooltip.data && (
            <>
              <p className="font-semibold text-green-700 mb-1">Sensor</p>
              <p className="font-medium">{tooltip.data.barra.identificacao} — {tooltip.data.identificacao}</p>
              <p className="text-gray-500">{tooltip.data.altura_solo_m}m · {tooltip.data.tipo_grandeza} · {tooltip.data.unidade_medida}</p>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-1">
        Scroll para zoom · Arrastar para pan
        {drawTarget ? ' · Clique e arraste para desenhar a área' : ''}
      </p>
    </div>
  );
}

// ─── Silo + Vista selector ────────────────────────────────────────────────────

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
          onChange={e => onSiloChange(e.target.value ? Number(e.target.value) : null)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Selecione um silo...</option>
          {silos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>
      {siloId && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Vista</label>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {VISTAS.map(v => (
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
  const [mapeamento,   setMapeamento]   = useState<{ barras: BarraMapeamento[]; sensores: SensorMapeamento[] } | null>(null);
  const [overlays,     setOverlays]     = useState<DbOverlay[]>([]);
  const [uploading,    setUploading]    = useState(false);
  const [uploadFile,   setUploadFile]   = useState<File | null>(null);
  const [showCotas,    setShowCotas]    = useState(true);
  const [drawTarget,   setDrawTarget]   = useState<DrawTarget | null>(null);
  const [highlightId,  setHighlightId]  = useState<{ entity_type: string; entity_id: number } | null>(null);

  const loadData = useCallback(() => {
    api.get<{ barras: BarraMapeamento[]; sensores: SensorMapeamento[] }>(`/silos/${siloId}/esquematicos/mapeamento`)
      .then(r => setMapeamento(r.data))
      .catch(() => {});
    api.get<DbOverlay[]>(`/silos/${siloId}/esquematicos/${vista}/overlays`)
      .then(r => setOverlays(r.data))
      .catch(() => {});
  }, [siloId, vista]);

  useEffect(() => { loadData(); }, [loadData]);

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
    } catch { toast.error('Erro ao enviar DXF'); }
    finally { setUploading(false); }
  };

  const handleDraw = async (entity_type: string, entity_id: number, x1: number, y1: number, x2: number, y2: number) => {
    try {
      const r = await api.post<DbOverlay>(`/silos/${siloId}/esquematicos/${vista}/overlays`, {
        entity_type, entity_id, x1, y1, x2, y2,
      });
      setOverlays(prev => {
        const filtered = prev.filter(o => !(o.entity_type === entity_type && o.entity_id === entity_id));
        return [...filtered, r.data];
      });
      toast.success('Área salva');
      setDrawTarget(null);
    } catch { toast.error('Erro ao salvar área'); }
  };

  const handleDeleteOverlay = async (ov: DbOverlay) => {
    try {
      await api.delete(`/silos/${siloId}/esquematicos/${vista}/overlays/${ov.id}`);
      setOverlays(prev => prev.filter(o => o.id !== ov.id));
      toast.success('Área removida');
    } catch { toast.error('Erro ao remover área'); }
  };

  const overlayFor = (entity_type: 'barra' | 'sensor', entity_id: number) =>
    overlays.find(o => o.entity_type === entity_type && o.entity_id === entity_id);

  const isDrawing = (entity_type: 'barra' | 'sensor', entity_id: number) =>
    drawTarget?.entity_type === entity_type && drawTarget?.entity_id === entity_id;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* SVG */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-sm font-semibold text-gray-700">
            {drawTarget
              ? `Desenhando área para: ${drawTarget.label}`
              : 'Clique em "Desenhar" e arraste sobre o SVG para definir a área de cada componente'}
          </p>
          <button
            onClick={() => setShowCotas(s => !s)}
            title={showCotas ? 'Ocultar cotas' : 'Mostrar cotas'}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {showCotas ? <EyeOff size={12} /> : <Eye size={12} />}
            Cotas
          </button>
          {drawTarget && (
            <button onClick={() => setDrawTarget(null)} className="text-xs text-gray-500 hover:text-red-500">
              Cancelar
            </button>
          )}
        </div>
        <SvgViewer
          siloId={siloId}
          vista={vista}
          overlays={overlays}
          showCotas={showCotas}
          highlightId={highlightId}
          drawTarget={drawTarget}
          onDraw={handleDraw}
        />
      </div>

      {/* Painel direito */}
      <div className="space-y-5">
        {/* Upload DXF */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Upload size={13} /> Upload DXF — {VISTAS.find(v => v.value === vista)?.label}
          </p>
          <div className="flex items-center gap-3">
            <input type="file" accept=".dxf" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} className="text-sm text-gray-600" />
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
              <div className="space-y-1">
                {mapeamento.barras.map(b => {
                  const ov  = overlayFor('barra', b.id);
                  const drawing = isDrawing('barra', b.id);
                  return (
                    <div
                      key={b.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors ${
                        drawing ? 'border-blue-400 bg-blue-50' :
                        ov      ? 'border-blue-200 bg-blue-50/40' :
                                  'border-transparent hover:bg-gray-50'
                      }`}
                      onMouseEnter={() => ov && setHighlightId({ entity_type: 'barra', entity_id: b.id })}
                      onMouseLeave={() => setHighlightId(null)}
                    >
                      <span className="text-sm text-gray-700 flex-1 truncate">{b.identificacao}</span>
                      {ov && (
                        <span className="text-xs text-blue-600 font-medium">✓ mapeada</span>
                      )}
                      <button
                        onClick={() => setDrawTarget({ entity_type: 'barra', entity_id: b.id, label: b.identificacao })}
                        title="Desenhar área"
                        className={`p-1 rounded hover:bg-blue-100 ${drawing ? 'text-blue-600' : 'text-gray-400'}`}
                      >
                        <Pencil size={13} />
                      </button>
                      {ov && (
                        <button
                          onClick={() => handleDeleteOverlay(ov)}
                          title="Remover área"
                          className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sensores */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Sensores</p>
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {mapeamento.sensores.map(s => {
                  const ov  = overlayFor('sensor', s.id);
                  const drawing = isDrawing('sensor', s.id);
                  const label = `${s.barra.identificacao} / ${s.identificacao} (${s.altura_solo_m}m)`;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors ${
                        drawing ? 'border-green-400 bg-green-50' :
                        ov      ? 'border-green-200 bg-green-50/40' :
                                  'border-transparent hover:bg-gray-50'
                      }`}
                      onMouseEnter={() => ov && setHighlightId({ entity_type: 'sensor', entity_id: s.id })}
                      onMouseLeave={() => setHighlightId(null)}
                    >
                      <span className="text-xs text-gray-700 flex-1 truncate">{label}</span>
                      {ov && <span className="text-xs text-green-600 font-medium">✓ mapeado</span>}
                      <button
                        onClick={() => setDrawTarget({ entity_type: 'sensor', entity_id: s.id, label })}
                        title="Desenhar área"
                        className={`p-1 rounded hover:bg-green-100 ${drawing ? 'text-green-600' : 'text-gray-400'}`}
                      >
                        <Pencil size={13} />
                      </button>
                      {ov && (
                        <button
                          onClick={() => handleDeleteOverlay(ov)}
                          title="Remover área"
                          className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Viewer panel (somente visualização) ─────────────────────────────────────

function ViewerPanel({ siloId, vista }: { siloId: number; vista: Vista }) {
  const [overlays,   setOverlays]   = useState<DbOverlay[]>([]);
  const [showCotas,  setShowCotas]  = useState(true);

  useEffect(() => {
    api.get<DbOverlay[]>(`/silos/${siloId}/esquematicos/${vista}/overlays`)
      .then(r => setOverlays(r.data))
      .catch(() => {});
  }, [siloId, vista]);

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setShowCotas(s => !s)}
          className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
        >
          {showCotas ? <EyeOff size={12} /> : <Eye size={12} />}
          {showCotas ? 'Ocultar cotas' : 'Mostrar cotas'}
        </button>
      </div>
      <SvgViewer siloId={siloId} vista={vista} overlays={overlays} showCotas={showCotas} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EsquematicoPage() {
  const location     = useLocation();
  const isMapeamento = location.pathname.includes('/mapeamento');

  const [silos,  setSilos]  = useState<Silo[]>([]);
  const [siloId, setSiloId] = useState<number | null>(null);
  const [vista,  setVista]  = useState<Vista>('frente');

  useEffect(() => {
    api.get<{ data: Silo[] }>('/silos?limit=100')
      .then(r => setSilos(r.data.data))
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
          silos={silos} siloId={siloId} vista={vista}
          onSiloChange={setSiloId} onVistaChange={setVista}
        />

        {siloId && !isMapeamento && <ViewerPanel siloId={siloId} vista={vista} />}
        {siloId &&  isMapeamento && <MapeamentoPanel siloId={siloId} vista={vista} />}

        {!siloId && (
          <p className="text-center text-gray-400 text-sm py-12">Selecione um silo para começar.</p>
        )}
      </div>
    </div>
  );
}
