#!/usr/bin/env python3
"""
Corrige o alinhamento dos overlays interativos nos SVGs de esquemáticos.

Problema: os retângulos overlay (data-handle) estavam deslocados em Y em relação
aos símbolos gráficos C6 (BARRAS) e C7 (SENSOR).

Solução: para cada overlay, encontra o símbolo C6/C7 mais próximo em 2D e
recentra o overlay no centro Y desse símbolo, mantendo as dimensões originais.

Threshold: se o símbolo mais próximo estiver a mais de MAX_DIST_MM, o overlay
é mantido sem alteração (pode não ter símbolo visível nessa vista).
"""

import re
import sys
import math
from pathlib import Path

MAX_DIST_MM = 20.0      # distância máxima aceitável para correspondência
SVG_UNIT_MM = 0.001     # 1 unidade SVG = 0,001 mm


def parse_path_bbox(d: str):
    """Bounding box de um path SVG com comandos M, m, L, l, Z."""
    tokens = re.findall(r'[MmLlZz]|[-\d.]+', d)
    x, y = 0.0, 0.0
    xs: list[float] = []
    ys: list[float] = []
    cmd = None
    nums: list[float] = []

    for t in tokens:
        if t in 'MmLlZz':
            cmd = t
            nums = []
        else:
            nums.append(float(t))
            if cmd == 'M' and len(nums) == 2:
                x, y = nums[0], nums[1]
                xs.append(x); ys.append(y)
                nums = []; cmd = 'L'
            elif cmd == 'm' and len(nums) == 2:
                x += nums[0]; y += nums[1]
                xs.append(x); ys.append(y)
                nums = []; cmd = 'l'
            elif cmd == 'L' and len(nums) == 2:
                x, y = nums[0], nums[1]
                xs.append(x); ys.append(y)
                nums = []
            elif cmd == 'l' and len(nums) == 2:
                x += nums[0]; y += nums[1]
                xs.append(x); ys.append(y)
                nums = []

    if not xs:
        return None
    return (min(xs), max(xs), min(ys), max(ys))


def center(bb):
    return ((bb[0] + bb[1]) / 2, (bb[2] + bb[3]) / 2)


def dist2d(ax, ay, bx, by):
    return math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)


def fix_svg_overlays(svg_path: Path) -> bool:
    svg = svg_path.read_text(encoding='utf-8')

    c6_bboxes = [
        parse_path_bbox(m.group(1))
        for m in re.finditer(r'<path d="([^"]+)" class="C6" />', svg)
        if parse_path_bbox(m.group(1))
    ]
    c7_bboxes = [
        parse_path_bbox(m.group(1))
        for m in re.finditer(r'<path d="([^"]+)" class="C7" />', svg)
        if parse_path_bbox(m.group(1))
    ]

    if not c6_bboxes and not c7_bboxes:
        print(f"  [skip] nenhum símbolo C6/C7 em {svg_path.name}")
        return False

    print(f"  símbolos: {len(c6_bboxes)} C6 (BARRAS), {len(c7_bboxes)} C7 (SENSOR)")

    changed = 0
    max_dist_units = MAX_DIST_MM / SVG_UNIT_MM

    def replace_overlay(m: re.Match) -> str:
        nonlocal changed
        path_d = m.group(1)
        fill   = m.group(2)
        stroke = m.group(3)
        sw     = m.group(4)
        handle = m.group(5)
        layer  = m.group(6)

        bb = parse_path_bbox(path_d)
        if not bb:
            return m.group(0)

        cur_x1, cur_x2, cur_y1, cur_y2 = bb
        cur_cx, cur_cy = center(bb)
        half_h = (cur_y2 - cur_y1) / 2

        candidates = c6_bboxes if layer == 'BARRAS' else c7_bboxes
        if not candidates:
            return m.group(0)

        # Símbolo mais próximo em distância 2D
        def sym_dist(sym_bb):
            sx, sy = center(sym_bb)
            return dist2d(cur_cx, cur_cy, sx, sy)

        best = min(candidates, key=sym_dist)
        d = sym_dist(best)

        if d > max_dist_units:
            print(f"    {layer:6s} {handle}: [ignorado] símbolo mais próximo a {d * SVG_UNIT_MM:.1f} mm > {MAX_DIST_MM} mm")
            return m.group(0)

        _, sym_cy = center(best)
        new_y1 = sym_cy - half_h
        new_y2 = sym_cy + half_h
        delta  = sym_cy - cur_cy

        if abs(delta) < 1:
            return m.group(0)

        print(f"    {layer:6s} {handle}: Y {cur_cy:.0f} → {sym_cy:.0f}  (Δ {delta * SVG_UNIT_MM:+.2f} mm, dist {d * SVG_UNIT_MM:.2f} mm)")

        new_d = (
            f"M {cur_x1:.1f} {new_y2:.1f} "
            f"L {cur_x2:.1f} {new_y2:.1f} "
            f"L {cur_x2:.1f} {new_y1:.1f} "
            f"L {cur_x1:.1f} {new_y1:.1f} Z"
        )
        changed += 1
        return (
            f'<path d="{new_d}" '
            f'fill="{fill}" fill-opacity="0.25" '
            f'stroke="{stroke}" stroke-width="{sw}" '
            f'data-handle="{handle}" data-layer="{layer}" style="cursor:pointer"/>'
        )

    OVERLAY_RE = re.compile(
        r'<path d="([^"]+)" '
        r'fill="(#3b82f6|#22c55e)" fill-opacity="[^"]+" '
        r'stroke="(#1d4ed8|#15803d)" stroke-width="([^"]+)" '
        r'data-handle="([^"]+)" data-layer="([^"]+)" style="cursor:pointer"/>'
    )

    new_svg = OVERLAY_RE.sub(replace_overlay, svg)

    if changed == 0:
        print(f"  [ok] nenhuma correção necessária")
        return False

    svg_path.write_text(new_svg, encoding='utf-8')
    print(f"  ✓ {changed} overlay(s) corrigido(s)")
    return True


def main():
    base = Path(__file__).resolve().parent.parent / 'backend' / 'uploads' / 'silos'

    if not base.exists():
        print(f"Diretório não encontrado: {base}", file=sys.stderr)
        sys.exit(1)

    svgs = sorted(base.glob('*/svg/*.svg'))
    if not svgs:
        print("Nenhum arquivo SVG encontrado.")
        sys.exit(0)

    print(f"Processando {len(svgs)} SVG(s)...\n")
    total = 0
    for p in svgs:
        print(f"{p.relative_to(base.parent.parent)}:")
        if fix_svg_overlays(p):
            total += 1
        print()

    print(f"Concluído — {total}/{len(svgs)} arquivo(s) atualizado(s).")


if __name__ == '__main__':
    main()
