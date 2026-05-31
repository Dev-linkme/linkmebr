import { Request, Response, NextFunction } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { parseDxf, entitiesToSvg } from './dxf.parser';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';

const VISTAS = ['frente', 'lateral_esquerda', 'lateral_direita'] as const;
type Vista = typeof VISTAS[number];

const VISTA_FILES: Record<Vista, string> = {
  frente:            'frente.dxf',
  lateral_esquerda:  'lateral_esquerda.dxf',
  lateral_direita:   'lateral_direita.dxf',
};

function dxfPath(siloId: number, vista: Vista): string {
  return path.join(process.cwd(), 'uploads', 'silos', String(siloId), 'dxf', VISTA_FILES[vista]);
}

function svgPath(siloId: number, vista: Vista): string {
  return path.join(process.cwd(), 'uploads', 'silos', String(siloId), 'svg', VISTA_FILES[vista].replace('.dxf', '.svg'));
}

function assertVista(v: string): asserts v is Vista {
  if (!VISTAS.includes(v as Vista)) throw new AppError(400, `Vista inválida. Valores aceitos: ${VISTAS.join(', ')}`);
}

export async function getSvg(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.params.id);
    const vista  = req.params.vista as string;
    assertVista(vista);

    // Serve pre-generated SVG (from ezdxf) when available — full fidelity
    const preGenPath = svgPath(siloId, vista);
    if (fs.existsSync(preGenPath)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(fs.readFileSync(preGenPath, 'utf-8'));
      return;
    }

    // Fallback: generate from TypeScript DXF parser
    const filePath = dxfPath(siloId, vista);
    if (!fs.existsSync(filePath)) throw new AppError(404, 'DXF não encontrado para este silo/vista');

    const result = parseDxf(filePath);
    const svg = entitiesToSvg(result, ['SILO', 'BARRAS', 'SENSOR', 'COTAS']);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) { next(err); }
}

export async function getEntidades(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.params.id);
    const vista  = req.params.vista as string;
    assertVista(vista);

    const filePath = dxfPath(siloId, vista);
    if (!fs.existsSync(filePath)) throw new AppError(404, 'DXF não encontrado para este silo/vista');

    const result = parseDxf(filePath);

    const barras = result.entities.filter((e) => e.layer === 'BARRAS').map((e) => ({
      handle:    e.handle,
      layer:     e.layer,
      centroide: centroide(e.vertices),
    }));

    const sensores = result.entities.filter((e) => e.layer === 'SENSOR').map((e) => ({
      handle:    e.handle,
      layer:     e.layer,
      centroide: centroide(e.vertices),
    }));

    res.json({ barras, sensores });
  } catch (err) { next(err); }
}

export async function getMapeamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.params.id);

    const [barras, sensores] = await Promise.all([
      prisma.barra.findMany({
        where: { silo_id: siloId, local: 'interno ao silo' },
        select: { id: true, identificacao: true, dxf_handle: true },
        orderBy: { id: 'asc' },
      }),
      prisma.sensor.findMany({
        where: { barra: { silo_id: siloId } },
        select: {
          id: true, identificacao: true, altura_solo_m: true,
          tipo_grandeza: true, dxf_handle: true,
          barra: { select: { id: true, identificacao: true } },
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    res.json({ barras, sensores });
  } catch (err) { next(err); }
}

export async function salvarMapeamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.params.id);
    if (isNaN(siloId)) throw new AppError(400, 'silo_id inválido');

    const { barras, sensores } = req.body as {
      barras:  Array<{ id: number; dxf_handle: string | null }>;
      sensores: Array<{ id: number; dxf_handle: string | null }>;
    };

    await Promise.all([
      ...(barras ?? []).map((b) =>
        prisma.barra.updateMany({
          where: { id: b.id, silo_id: siloId },
          data:  { dxf_handle: b.dxf_handle ?? null },
        }),
      ),
      ...(sensores ?? []).map((s) =>
        prisma.sensor.updateMany({
          where: { id: s.id, barra: { silo_id: siloId } },
          data:  { dxf_handle: s.dxf_handle ?? null },
        }),
      ),
    ]);

    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function getTooltip(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.params.id);
    const { handle, layer, entity_type, entity_id } = req.query as Record<string, string>;

    // Novo caminho: lookup por entity_type + entity_id (overlays desenhados)
    if (entity_type && entity_id) {
      const eid = Number(entity_id);
      if (entity_type === 'barra') {
        const barra = await prisma.barra.findFirst({
          where: { id: eid, silo_id: siloId },
          select: { id: true, identificacao: true, local: true, status: true },
        });
        res.json({ entity_type: 'barra', data: barra ?? null });
        return;
      }
      if (entity_type === 'sensor') {
        const sensor = await prisma.sensor.findFirst({
          where: { id: eid, barra: { silo_id: siloId } },
          select: {
            id: true, identificacao: true, altura_solo_m: true,
            tipo_grandeza: true, unidade_medida: true, status: true,
            barra: { select: { id: true, identificacao: true } },
          },
        });
        res.json({ entity_type: 'sensor', data: sensor ?? null });
        return;
      }
      res.json({ entity_type, data: null });
      return;
    }

    // Caminho legado: lookup por dxf_handle
    if (!handle || !layer) throw new AppError(400, 'handle e layer (ou entity_type e entity_id) são obrigatórios');

    if (layer.toUpperCase() === 'BARRAS') {
      const barra = await prisma.barra.findFirst({
        where: { dxf_handle: handle, silo_id: siloId },
        select: { id: true, identificacao: true, local: true, status: true, id_labrador: true },
      });
      if (!barra) { res.json({ layer: 'BARRAS', data: null }); return; }
      res.json({ layer: 'BARRAS', data: barra });
      return;
    }

    if (layer.toUpperCase() === 'SENSOR') {
      const sensores = await prisma.sensor.findMany({
        where: { dxf_handle: handle, barra: { silo_id: siloId } },
        select: {
          id: true, identificacao: true, altura_solo_m: true,
          tipo_grandeza: true, unidade_medida: true, status: true,
          barra: { select: { id: true, identificacao: true } },
        },
        orderBy: { altura_solo_m: 'asc' },
      });
      res.json({ layer: 'SENSOR', data: sensores });
      return;
    }

    res.json({ layer, data: null });
  } catch (err) { next(err); }
}

export async function getOverlays(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.params.id);
    const vista  = req.params.vista as string;
    assertVista(vista);
    const overlays = await prisma.esquematicoOverlay.findMany({
      where: { silo_id: siloId, vista },
    });
    res.json(overlays);
  } catch (err) { next(err); }
}

export async function salvarOverlay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.params.id);
    const vista  = req.params.vista as string;
    assertVista(vista);

    const { entity_type, entity_id, x1, y1, x2, y2 } = req.body as {
      entity_type: string; entity_id: number;
      x1: number; y1: number; x2: number; y2: number;
    };

    if (!entity_type || !entity_id) throw new AppError(400, 'entity_type e entity_id são obrigatórios');

    const overlay = await prisma.esquematicoOverlay.upsert({
      where: {
        silo_id_vista_entity_type_entity_id: {
          silo_id: siloId, vista, entity_type, entity_id: Number(entity_id),
        },
      },
      create: { silo_id: siloId, vista, entity_type, entity_id: Number(entity_id), x1, y1, x2, y2 },
      update: { x1, y1, x2, y2 },
    });
    res.json(overlay);
  } catch (err) { next(err); }
}

export async function deletarOverlay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId   = Number(req.params.id);
    const vista    = req.params.vista as string;
    const overlayId = Number(req.params.overlayId);
    assertVista(vista);
    await prisma.esquematicoOverlay.deleteMany({
      where: { id: overlayId, silo_id: siloId, vista },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function uploadDxf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const siloId = Number(req.params.id);
    const vista  = req.params.vista as string;
    assertVista(vista);

    if (!req.file) throw new AppError(400, 'Arquivo DXF não enviado');

    const dir = path.join(process.cwd(), 'uploads', 'silos', String(siloId), 'dxf');
    fs.mkdirSync(dir, { recursive: true });

    const dest = path.join(dir, VISTA_FILES[vista]);
    fs.renameSync(req.file.path, dest);

    res.json({ ok: true, vista, arquivo: VISTA_FILES[vista] });
  } catch (err) { next(err); }
}

function centroide(vertices: Array<{ x: number; y: number }>): { x: number; y: number } {
  const x = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
  const y = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
  return { x, y };
}
