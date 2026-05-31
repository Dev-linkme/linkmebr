import * as fs from 'fs';

export interface DxfEntity {
  handle: string;
  layer: string;
  type: string;
  vertices: Array<{ x: number; y: number }>;
}

export interface DxfParseResult {
  entities: DxfEntity[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function parseDxf(filePath: string): DxfParseResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).map((l) => l.trim());

  const entities: DxfEntity[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i] === '0' && i + 1 < lines.length) {
      const type = lines[i + 1];
      if (type === 'LWPOLYLINE') {
        const entity = parseLwpolyline(lines, i);
        if (entity) {
          entities.push(entity);
          i += 2;
          continue;
        }
      }
    }
    i++;
  }

  const allX = entities.flatMap((e) => e.vertices.map((v) => v.x));
  const allY = entities.flatMap((e) => e.vertices.map((v) => v.y));
  const bounds = {
    minX: allX.length ? Math.min(...allX) : 0,
    minY: allY.length ? Math.min(...allY) : 0,
    maxX: allX.length ? Math.max(...allX) : 1,
    maxY: allY.length ? Math.max(...allY) : 1,
  };

  return { entities, bounds };
}

function parseLwpolyline(
  lines: string[],
  start: number,
): DxfEntity | null {
  let handle = '';
  let layer = '';
  const xs: number[] = [];
  const ys: number[] = [];

  let i = start + 2;
  while (i < lines.length) {
    const code = lines[i];
    const value = lines[i + 1] ?? '';

    if (code === '0') break; // next entity

    if (code === '5')  handle = value;
    if (code === '8')  layer  = value.toUpperCase();
    if (code === '10') xs.push(parseFloat(value));
    if (code === '20') ys.push(parseFloat(value));

    i += 2;
  }

  if (!handle || !layer || xs.length === 0) return null;

  const vertices = xs.map((x, idx) => ({ x, y: ys[idx] ?? 0 }));
  return { handle, layer, type: 'LWPOLYLINE', vertices };
}

export function entitiesToSvg(result: DxfParseResult, layers: string[]): string {
  const { entities, bounds } = result;
  const W = bounds.maxX - bounds.minX || 1;
  const H = bounds.maxY - bounds.minY || 1;
  const padding = Math.max(W, H) * 0.05;

  const vx = bounds.minX - padding;
  const vy = bounds.minY - padding;
  const vw = W + padding * 2;
  const vh = H + padding * 2;

  const layerStyles: Record<string, string> = {
    SILO:   'fill:#e5e7eb stroke:#6b7280 stroke-width:0.002',
    BARRAS: 'fill:#bfdbfe stroke:#2563eb stroke-width:0.003',
    SENSOR: 'fill:#bbf7d0 stroke:#16a34a stroke-width:0.003',
    COTAS:  'fill:none stroke:#9ca3af stroke-width:0.001',
  };

  const filtered = entities.filter((e) => layers.includes(e.layer));

  const paths = filtered.map((e) => {
    const d = e.vertices
      .map((v, idx) => `${idx === 0 ? 'M' : 'L'} ${v.x} ${-v.y}`)
      .join(' ') + ' Z';

    const style = layerStyles[e.layer] ?? 'fill:#f3f4f6 stroke:#374151 stroke-width:0.002';
    const [fill, ...rest] = style.split(' ');
    const fillVal = fill.replace('fill:', '');
    const strokeAtts = rest.join(' ').replace('stroke:', 'stroke="').replace(' stroke-width:', '" stroke-width="') + '"';

    return `<path d="${d}" fill="${fillVal}" ${strokeAtts} data-handle="${e.handle}" data-layer="${e.layer}" />`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${-bounds.maxY - padding} ${vw} ${vh}" style="width:100%;height:100%">\n${paths.join('\n')}\n</svg>`;
}
