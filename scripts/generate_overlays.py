#!/usr/bin/env python3
"""
Gera ou atualiza os overlays interativos nos SVGs de esquemáticos.

Para cada vista (frente/lateral_esquerda/lateral_direita):
  1. Lê o DXF correspondente com ezdxf
  2. Localiza o INSERT do bloco 'pl' e aplica sua transformação (translação + rotação)
  3. Converte cada entidade BARRAS/SENSOR do bloco para coordenadas SVG
  4. Substitui os overlays existentes (data-handle) pelos retângulos corretos

Padding: 25% do lado menor do símbolo em todas as direções,
         ajustado pela escala de cada vista.

Uso:
    python3 scripts/generate_overlays.py
    python3 scripts/generate_overlays.py --dry-run   (mostra sem salvar)
"""

import re
import sys
import math
import argparse
from pathlib import Path


try:
    import ezdxf
except ImportError:
    print("Erro: ezdxf não instalado. Execute: pip install ezdxf", file=sys.stderr)
    sys.exit(1)


# ─── Configuração ────────────────────────────────────────────────────────────

BLOCK_NAME  = 'pl'           # bloco que contém os componentes interativos
UPLOADS_DIR = Path(__file__).resolve().parent.parent / 'backend' / 'uploads' / 'silos'

# Cores dos overlays por layer
STYLE = {
    'BARRAS': {'fill': '#3b82f6', 'stroke': '#1d4ed8'},
    'SENSOR': {'fill': '#22c55e', 'stroke': '#15803d'},
}

FILL_OPACITY = '0.25'
STROKE_WIDTH = '162'


# ─── Geometria ────────────────────────────────────────────────────────────────

def world_to_svg(wx, wy, ext_min, ext_max, vb_w, vb_h):
    """Converte coordenadas world-space DXF para pixels SVG."""
    dxf_w = ext_max[0] - ext_min[0]
    dxf_h = ext_max[1] - ext_min[1]
    scale  = min(vb_w / dxf_w, vb_h / dxf_h)
    x_off  = (vb_w - dxf_w * scale) / 2
    y_off  = (vb_h - dxf_h * scale) / 2
    svg_x  = (wx - ext_min[0]) * scale + x_off
    svg_y  = (ext_max[1] - wy) * scale + y_off   # Y invertido
    return svg_x, svg_y, scale


def svg_bbox_for_entity(be, insert, rot_rad, ext_min, ext_max, vb_w, vb_h):
    """
    Retorna (x1, x2, y1, y2, scale) da entidade 'be' do bloco,
    após aplicar translação + rotação do INSERT.
    """
    cos_r = math.cos(rot_rad)
    sin_r = math.sin(rot_rad)

    pts = list(be.get_points('xy'))
    if not pts:
        return None

    svg_pts = []
    for lx, ly in pts:
        # Rotacionar + transladar para world space
        wx = insert.x + lx * cos_r - ly * sin_r
        wy = insert.y + lx * sin_r + ly * cos_r
        svg_x, svg_y, scale = world_to_svg(wx, wy, ext_min, ext_max, vb_w, vb_h)
        svg_pts.append((svg_x, svg_y, scale))

    xs   = [p[0] for p in svg_pts]
    ys   = [p[1] for p in svg_pts]
    scl  = svg_pts[0][2]
    return min(xs), max(xs), min(ys), max(ys), scl


# ─── SVG helpers ─────────────────────────────────────────────────────────────

def get_viewbox(svg: str):
    m = re.search(r'viewBox="([^"]+)"', svg)
    if not m:
        raise ValueError("viewBox não encontrado no SVG")
    nums = list(map(float, m.group(1).split()))
    return int(nums[2]), int(nums[3])   # (width, height)


OVERLAY_RE = re.compile(
    r'<path d="[^"]+" '
    r'fill="(?:#3b82f6|#22c55e)" fill-opacity="[^"]+" '
    r'stroke="(?:#1d4ed8|#15803d)" stroke-width="[^"]+" '
    r'data-handle="[^"]+" data-layer="[^"]+" style="cursor:pointer"/>'
)


def build_overlay_element(handle: str, layer: str,
                          x1: float, x2: float,
                          y1: float, y2: float) -> str:
    style = STYLE[layer]
    d = f"M {x1:.1f} {y2:.1f} L {x2:.1f} {y2:.1f} L {x2:.1f} {y1:.1f} L {x1:.1f} {y1:.1f} Z"
    return (
        f'<path d="{d}" '
        f'fill="{style["fill"]}" fill-opacity="{FILL_OPACITY}" '
        f'stroke="{style["stroke"]}" stroke-width="{STROKE_WIDTH}" '
        f'data-handle="{handle}" data-layer="{layer}" style="cursor:pointer"/>'
    )


def inject_overlays(svg: str, overlays: list[str]) -> str:
    """Remove overlays existentes e injeta os novos antes de </svg>."""
    svg = OVERLAY_RE.sub('', svg)
    # Limpar espaços extras deixados pela remoção
    svg = re.sub(r'\n\s*\n\s*\n', '\n\n', svg)
    block = '\n'.join(overlays)
    svg = svg.rstrip()
    if svg.endswith('</svg>'):
        svg = svg[:-6].rstrip() + '\n' + block + '\n</svg>\n'
    else:
        svg += '\n' + block + '\n'
    return svg


# ─── Lógica principal ────────────────────────────────────────────────────────

def generate_overlays_for_svg(svg_path: Path, dxf_path: Path, dry_run: bool = False) -> bool:
    if not dxf_path.exists():
        print(f"  [skip] DXF não encontrado: {dxf_path}")
        return False

    svg = svg_path.read_text(encoding='utf-8')
    vb_w, vb_h = get_viewbox(svg)

    doc = ezdxf.readfile(str(dxf_path))
    hdr = doc.header
    ext_min = tuple(hdr.get('$EXTMIN', (0.0, 0.0, 0.0)))[:2]
    ext_max = tuple(hdr.get('$EXTMAX', (1.0, 1.0, 0.0)))[:2]

    msp = doc.modelspace()

    overlays_html: list[str] = []

    for insert in msp.query('INSERT'):
        if insert.dxf.name != BLOCK_NAME:
            continue

        ins      = insert.dxf.insert
        rot_deg  = insert.dxf.rotation if insert.dxf.hasattr('rotation') else 0.0
        rot_rad  = math.radians(rot_deg)

        block = doc.blocks.get(BLOCK_NAME)
        if block is None:
            print(f"  [skip] bloco '{BLOCK_NAME}' não encontrado no DXF")
            return False

        for be in block:
            if be.dxftype() != 'LWPOLYLINE':
                continue
            layer = be.dxf.layer.upper()
            if layer not in STYLE:
                continue

            result = svg_bbox_for_entity(be, ins, rot_rad, ext_min, ext_max, vb_w, vb_h)
            if result is None:
                continue

            x1, x2, y1, y2, scale = result
            w = x2 - x1
            h = y2 - y1

            # Padding proporcional: 25% de cada dimensão do símbolo
            pad_x = w * 0.25
            pad_y = h * 0.25
            # Garantir mínimo de 0.3mm de padding
            min_pad = scale * 0.0003
            pad_x = max(pad_x, min_pad)
            pad_y = max(pad_y, min_pad)

            ox1 = x1 - pad_x
            ox2 = x2 + pad_x
            oy1 = y1 - pad_y
            oy2 = y2 + pad_y

            handle = be.dxf.handle
            el = build_overlay_element(handle, layer, ox1, ox2, oy1, oy2)
            overlays_html.append(el)

            cx = (ox1 + ox2) / 2
            cy = (oy1 + oy2) / 2
            print(f"    {layer:6s} {handle}: center=({cx:.0f},{cy:.0f}) "
                  f"size={ox2-ox1:.0f}x{oy2-oy1:.0f}  ({(ox2-ox1)*0.001:.2f}mm x {(oy2-oy1)*0.001:.2f}mm)")

    if not overlays_html:
        print(f"  [skip] nenhuma entidade gerada")
        return False

    new_svg = inject_overlays(svg, overlays_html)

    if dry_run:
        print(f"  [dry-run] {len(overlays_html)} overlay(s) calculado(s) — não salvo")
        return True

    svg_path.write_text(new_svg, encoding='utf-8')
    print(f"  ✓ {len(overlays_html)} overlay(s) → {svg_path.name}")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='Calcula mas não salva')
    parser.add_argument('--silo-id', type=int, default=None, help='Processar apenas este silo ID')
    args = parser.parse_args()

    if not UPLOADS_DIR.exists():
        print(f"Diretório não encontrado: {UPLOADS_DIR}", file=sys.stderr)
        sys.exit(1)

    silo_dirs = sorted(UPLOADS_DIR.glob('*/'))
    if args.silo_id:
        silo_dirs = [d for d in silo_dirs if d.name == str(args.silo_id)]

    total_silos = total_svgs = updated = 0

    for silo_dir in silo_dirs:
        svg_dir = silo_dir / 'svg'
        dxf_dir = silo_dir / 'dxf'
        if not svg_dir.exists():
            continue

        total_silos += 1
        print(f"\nSilo {silo_dir.name}:")

        for svg_path in sorted(svg_dir.glob('*.svg')):
            stem = svg_path.stem
            dxf_path = dxf_dir / f'{stem}.dxf'
            print(f"  {stem}.svg:")
            total_svgs += 1
            if generate_overlays_for_svg(svg_path, dxf_path, dry_run=args.dry_run):
                updated += 1

    print(f"\nConcluído — {updated}/{total_svgs} SVG(s) atualizado(s) em {total_silos} silo(s).")


if __name__ == '__main__':
    main()
