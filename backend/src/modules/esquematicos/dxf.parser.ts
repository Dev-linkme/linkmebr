import * as fs from 'fs';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DxfEntity {
  handle: string;
  layer:  string;
  type:   string;
  /** For LWPOLYLINE: vertices in order */
  vertices: Array<{ x: number; y: number; bulge: number }>;
  /** For LINE */
  line?: { x1: number; y1: number; x2: number; y2: number };
  /** For CIRCLE */
  circle?: { cx: number; cy: number; r: number };
  /** For ARC */
  arc?: { cx: number; cy: number; r: number; startAngle: number; endAngle: number };
}

export interface DxfParseResult {
  entities: DxfEntity[];
  bounds:   { minX: number; minY: number; maxX: number; maxY: number };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseDxf(filePath: string): DxfParseResult {
  const raw   = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).map((l) => l.trim());

  const entities: DxfEntity[] = [];
  let i = 0;

  while (i < lines.length - 1) {
    if (lines[i] !== '0') { i++; continue; }

    const type = lines[i + 1];
    i += 2;

    let result: [DxfEntity | null, number] | null = null;

    if (type === 'LWPOLYLINE') result = parseLwpolyline(lines, i);
    else if (type === 'LINE')   result = parseLine(lines, i);
    else if (type === 'CIRCLE') result = parseCircle(lines, i);
    else if (type === 'ARC')    result = parseArc(lines, i);

    if (result) {
      const [entity, nextI] = result;
      if (entity) entities.push(entity);
      i = nextI;
    }
  }

  // Bounding box (DXF Y coords, not flipped yet)
  const pts: Array<{ x: number; y: number }> = [];
  for (const e of entities) {
    if (e.circle) { pts.push({ x: e.circle.cx - e.circle.r, y: e.circle.cy - e.circle.r }); pts.push({ x: e.circle.cx + e.circle.r, y: e.circle.cy + e.circle.r }); }
    if (e.arc)    { pts.push({ x: e.arc.cx - e.arc.r, y: e.arc.cy - e.arc.r }); pts.push({ x: e.arc.cx + e.arc.r, y: e.arc.cy + e.arc.r }); }
    if (e.line)   { pts.push({ x: e.line.x1, y: e.line.y1 }); pts.push({ x: e.line.x2, y: e.line.y2 }); }
    for (const v of e.vertices) pts.push({ x: v.x, y: v.y });
  }

  const minX = pts.length ? Math.min(...pts.map((p) => p.x)) : 0;
  const minY = pts.length ? Math.min(...pts.map((p) => p.y)) : 0;
  const maxX = pts.length ? Math.max(...pts.map((p) => p.x)) : 1;
  const maxY = pts.length ? Math.max(...pts.map((p) => p.y)) : 1;

  return { entities, bounds: { minX, minY, maxX, maxY } };
}

// ─── Entity parsers ───────────────────────────────────────────────────────────

function readProps(lines: string[], start: number): [Record<string, string[]>, number] {
  const props: Record<string, string[]> = {};
  let i = start;
  while (i < lines.length - 1 && lines[i] !== '0') {
    const code = lines[i];
    const val  = lines[i + 1];
    (props[code] = props[code] ?? []).push(val);
    i += 2;
  }
  return [props, i];
}

function parseLwpolyline(lines: string[], start: number): [DxfEntity | null, number] {
  const vertices: Array<{ x: number; y: number; bulge: number }> = [];
  let handle = '';
  let layer  = '';
  let currentX: number | null = null;
  let currentY: number | null = null;
  let currentBulge = 0;

  let i = start;
  while (i < lines.length - 1 && lines[i] !== '0') {
    const code = lines[i];
    const val  = lines[i + 1];

    if (code === '5') { handle = val; }
    else if (code === '8') { layer = val.toUpperCase(); }
    else if (code === '10') {
      if (currentX !== null && currentY !== null) {
        vertices.push({ x: currentX, y: currentY, bulge: currentBulge });
        currentBulge = 0;
      }
      currentX = parseFloat(val);
    } else if (code === '20') {
      currentY = parseFloat(val);
    } else if (code === '42') {
      currentBulge = parseFloat(val);
    }
    i += 2;
  }
  if (currentX !== null && currentY !== null) {
    vertices.push({ x: currentX, y: currentY, bulge: currentBulge });
  }

  if (!handle || vertices.length === 0) return [null, i];
  return [{ handle, layer, type: 'LWPOLYLINE', vertices }, i];
}

function parseLine(lines: string[], start: number): [DxfEntity | null, number] {
  const [props, end] = readProps(lines, start);
  const handle = props['5']?.[0] ?? '';
  const layer  = (props['8']?.[0] ?? '').toUpperCase();
  const x1 = parseFloat(props['10']?.[0] ?? '0');
  const y1 = parseFloat(props['20']?.[0] ?? '0');
  const x2 = parseFloat(props['11']?.[0] ?? '0');
  const y2 = parseFloat(props['21']?.[0] ?? '0');
  if (!handle) return [null, end];
  return [{ handle, layer, type: 'LINE', vertices: [], line: { x1, y1, x2, y2 } }, end];
}

function parseCircle(lines: string[], start: number): [DxfEntity | null, number] {
  const [props, end] = readProps(lines, start);
  const handle = props['5']?.[0] ?? '';
  const layer  = (props['8']?.[0] ?? '').toUpperCase();
  const cx = parseFloat(props['10']?.[0] ?? '0');
  const cy = parseFloat(props['20']?.[0] ?? '0');
  const r  = parseFloat(props['40']?.[0] ?? '0');
  if (!handle || r === 0) return [null, end];
  return [{ handle, layer, type: 'CIRCLE', vertices: [], circle: { cx, cy, r } }, end];
}

function parseArc(lines: string[], start: number): [DxfEntity | null, number] {
  const [props, end] = readProps(lines, start);
  const handle     = props['5']?.[0] ?? '';
  const layer      = (props['8']?.[0] ?? '').toUpperCase();
  const cx         = parseFloat(props['10']?.[0] ?? '0');
  const cy         = parseFloat(props['20']?.[0] ?? '0');
  const r          = parseFloat(props['40']?.[0] ?? '0');
  const startAngle = parseFloat(props['50']?.[0] ?? '0');
  const endAngle   = parseFloat(props['51']?.[0] ?? '360');
  if (!handle || r === 0) return [null, end];
  return [{ handle, layer, type: 'ARC', vertices: [], arc: { cx, cy, r, startAngle, endAngle } }, end];
}

// ─── SVG generation ───────────────────────────────────────────────────────────

const LAYER_STYLE: Record<string, { fill: string; stroke: string; strokeWidth: number; opacity: number }> = {
  SILO:   { fill: '#e5e7eb', stroke: '#6b7280', strokeWidth: 0.003, opacity: 1 },
  BARRAS: { fill: '#bfdbfe', stroke: '#1d4ed8', strokeWidth: 0.004, opacity: 0.8 },
  SENSOR: { fill: '#bbf7d0', stroke: '#15803d', strokeWidth: 0.004, opacity: 0.8 },
  COTAS:  { fill: 'none',    stroke: '#9ca3af', strokeWidth: 0.002, opacity: 0.6 },
};

export function entitiesToSvg(result: DxfParseResult, layers: string[]): string {
  const { entities, bounds } = result;
  const W = bounds.maxX - bounds.minX || 1;
  const H = bounds.maxY - bounds.minY || 1;
  const pad = Math.max(W, H) * 0.04;

  // SVG viewBox: flip Y axis (DXF Y-up → SVG Y-down)
  const vx = bounds.minX - pad;
  const vy = -(bounds.maxY + pad);
  const vw =  W + pad * 2;
  const vh =  H + pad * 2;

  const svgEls: string[] = [];

  for (const layer of layers) {
    const style = LAYER_STYLE[layer] ?? LAYER_STYLE['SILO'];
    const layerEntities = entities.filter((e) => e.layer === layer);

    for (const e of layerEntities) {
      const attrs = `fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" opacity="${style.opacity}"` +
        (e.layer !== 'SILO' ? ` data-handle="${e.handle}" data-layer="${e.layer}" style="cursor:pointer"` : '');

      if (e.type === 'CIRCLE' && e.circle) {
        svgEls.push(`<circle cx="${e.circle.cx}" cy="${-e.circle.cy}" r="${e.circle.r}" ${attrs}/>`);
      } else if (e.type === 'ARC' && e.arc) {
        svgEls.push(arcToPath(e.arc, attrs));
      } else if (e.type === 'LINE' && e.line) {
        svgEls.push(`<line x1="${e.line.x1}" y1="${-e.line.y1}" x2="${e.line.x2}" y2="${-e.line.y2}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" opacity="${style.opacity}"/>`);
      } else if (e.type === 'LWPOLYLINE' && e.vertices.length > 0) {
        svgEls.push(lwpolylineToPath(e.vertices, attrs));
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" style="width:100%;height:100%">\n${svgEls.join('\n')}\n</svg>`;
}

function arcToPath(
  arc: { cx: number; cy: number; r: number; startAngle: number; endAngle: number },
  attrs: string,
): string {
  const { cx, cy, r, startAngle, endAngle } = arc;
  const a1 = (startAngle * Math.PI) / 180;
  const a2 = (endAngle   * Math.PI) / 180;

  // SVG coords: flip Y
  const sx = cx + r * Math.cos(a1);
  const sy = -(cy + r * Math.sin(a1));
  const ex = cx + r * Math.cos(a2);
  const ey = -(cy + r * Math.sin(a2));

  // DXF arc is CCW (Y-up); after Y-flip it is CW in screen → sweep-flag=1
  const sweep = 1;
  // CCW angle diff from start to end
  let diff = ((endAngle - startAngle) + 360) % 360;
  if (diff === 0) diff = 360;
  const large = diff > 180 ? 1 : 0;

  if (diff >= 359.9) {
    // Full circle
    const mx = cx + r; const my = -(cy);
    return `<path d="M ${mx} ${my} A ${r} ${r} 0 1 ${sweep} ${mx - 0.0001} ${my} Z" ${attrs}/>`;
  }

  return `<path d="M ${sx} ${sy} A ${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}" ${attrs}/>`;
}

function lwpolylineToPath(
  vertices: Array<{ x: number; y: number; bulge: number }>,
  attrs: string,
): string {
  if (vertices.length === 0) return '';

  const parts: string[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const cur  = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const svgX = cur.x;
    const svgY = -cur.y;

    if (i === 0) parts.push(`M ${svgX} ${svgY}`);

    const nx = next.x;
    const ny = -next.y;

    if (Math.abs(cur.bulge) < 1e-9) {
      parts.push(`L ${nx} ${ny}`);
    } else {
      // Convert bulge to SVG arc
      const b = cur.bulge;
      const dx = nx - svgX;
      const dy = ny - svgY;
      const d  = Math.sqrt(dx * dx + dy * dy);
      const r  = (d * (b * b + 1)) / (4 * Math.abs(b));
      const large  = Math.abs(b) > 1 ? 1 : 0;
      // Positive bulge = CCW in DXF (Y-up) = CW on screen (Y-down) = sweep=1
      // Negative bulge = CW in DXF (Y-up) = CCW on screen (Y-down) = sweep=0
      const sweep = b > 0 ? 1 : 0;
      parts.push(`A ${r} ${r} 0 ${large} ${sweep} ${nx} ${ny}`);
    }
  }

  parts.push('Z');
  return `<path d="${parts.join(' ')}" ${attrs}/>`;
}
