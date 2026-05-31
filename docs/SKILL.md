---
name: dxf-to-svg
description: >
  Converte arquivos DXF em SVG técnico usando ezdxf, aplicando escala, espessuras,
  cores e visibilidade de layers corretamente. Use esta skill sempre que o usuário
  pedir para gerar, exportar ou converter um DXF para SVG, ou quando mencionar
  ezdxf, desenho técnico, planta, painel, frente, vista ou qualquer arquivo .dxf.
  Inclui pós-processamento obrigatório do SVG gerado pelo ezdxf para corrigir
  width/height, stroke-width, cores e ocultação de layers de cota.
---

# DXF → SVG: Geração Correta com ezdxf

## Contexto do Problema

O ezdxf gera SVGs com três defeitos sistemáticos que tornam o arquivo inutilizável:

1. **`width`/`height` errados** — calculados com escala incorreta (ex: `1.3mm` em vez de `325mm`)
2. **`stroke-width` absurdo** — usa `62500` unidades (= 62,5mm) em vez de `250` (= 0,25mm)
3. **Cores DXF cruas** — amarelo `#ffff00` e vermelho `#ff0000` sobre fundo branco = invisível

Todo SVG gerado pelo ezdxf **deve obrigatoriamente** passar pelo pós-processamento descrito nesta skill.

---

## Escala do Documento

O ezdxf exporta em unidades DXF nativas dentro do `viewBox`. A relação é:

```
1 unidade SVG (viewBox) = 0,001 mm
```

Portanto, para um desenho de 325 × 1000 mm:
- `viewBox="0 0 325000 1000000"` ✅ (correto — gerado pelo ezdxf)
- `width="1.3mm" height="4mm"` ❌ (errado — gerado pelo ezdxf)
- `width="325mm" height="1000mm"` ✅ (correto — após pós-processamento)

**Fórmula para corrigir width/height:**
```python
# Extrair viewBox
vb_w, vb_h = (parsed do viewBox)
width_mm  = vb_w * 0.001
height_mm = vb_h * 0.001
# Aplicar no SVG:
# width="{width_mm}mm" height="{height_mm}mm"
```

---

## Mapeamento de Classes CSS → Layers DXF

O ezdxf nomeia as classes CSS automaticamente como `.C1`, `.C2`, etc., mapeadas
pela cor ACI (AutoCAD Color Index) de cada layer. O mapeamento observado é:

| Classe | Cor DXF original | Layer / Conteúdo              | Tipo de linha |
|--------|-----------------|-------------------------------|---------------|
| `.C1`  | `#939598` cinza  | Linhas de eixo / centro       | DASHDOT       |
| `.C2`  | `#ffff00` amarelo| **Geometria principal**       | CONTINUOUS    |
| `.C3`  | `#ff0000` vermelho | Linhas de cota (extensão + medida) | CONTINUOUS |
| `.C4`  | fill `#ffff00`   | **Textos de cota** (glifos vetorizados) | —      |
| `.C5`  | `#636466` cinza  | Linhas auxiliares             | CONTINUOUS    |
| `.C6`  | `#00ff00` verde  | **Símbolo gráfico de BARRAS** (borne estreito, ~1,2×7,3mm) | CONTINUOUS |
| `.C7`  | `#00ffff` ciano  | **Símbolo gráfico de SENSOR** (corpo quadrado, ~7,3×7,3mm) | CONTINUOUS |
| `.C8`  | fill `#ff0000`   | Setas e labels de cota        | —             |

> ⚠️ O mapeamento `.C1`→`.C8` pode variar entre arquivos DXF se as cores ACI
> dos layers forem diferentes. Sempre inspecione o `<defs>` do SVG gerado para
> confirmar qual cor está em cada classe antes de aplicar os estilos.

---

## Interactive-Overlay: O Que É e Por Que Remover

O SVG gerado pode conter um grupo `<g id="interactive-overlay">` com retângulos
coloridos que **não fazem parte do desenho técnico** — são áreas de clique (hit-areas)
geradas para uso em interface web interativa.

### Estrutura típica
```xml
<g id="interactive-overlay">
  <!-- BARRAS: azul #3b82f6, fill-opacity=0.6, cursor:pointer -->
  <path d="M 185492 268291 L 179426 268291 ..." fill="#3b82f6" fill-opacity="0.6"
        stroke="#1d4ed8" stroke-width="1300"
        data-handle="1709" data-layer="BARRAS" style="cursor:pointer"/>

  <!-- SENSOR: verde #22c55e, fill-opacity=0.6, cursor:pointer -->
  <path d="M 204903 206411 L 168507 206411 ..." fill="#22c55e" fill-opacity="0.6"
        stroke="#15803d" stroke-width="1300"
        data-handle="170D" data-layer="SENSOR" style="cursor:pointer"/>
</g>
```

### Relação com os símbolos C6/C7

Os retângulos do overlay são **maiores** que os símbolos gráficos para cobrir
toda a área do componente incluindo terminais. A correspondência é:

| Layer overlay | Cor overlay    | Símbolo gráfico | Classe CSS | Tamanho símbolo |
|---------------|----------------|-----------------|------------|-----------------|
| `BARRAS`      | azul `#3b82f6` | borne/barra     | `.C6`      | ~1,2 × 7,3 mm  |
| `SENSOR`      | verde `#22c55e`| módulo sensor   | `.C7`      | ~7,3 × 7,3 mm  |

> Os centros XY do overlay e dos símbolos C6/C7 coincidem com ~5mm de
> deslocamento em Y — o overlay cobre também os terminais/pinos do componente.

### Por que os "retângulos verdes" aparecem no SVG estático

O overlay SENSOR usa `fill="#22c55e"` (verde) com `fill-opacity="0.6"`.
Como é muito maior que o símbolo C7 abaixo, domina visualmente e parece
cobrir toda a região do componente. **Não é um bug do DXF** — é o overlay
que não deve existir num SVG de visualização estática.

### Remoção obrigatória

O passo 5 do `postprocess_dxf_svg()` já remove o overlay:
```python
svg = re.sub(
    r'<g id="interactive-overlay">.*?</g>',
    '',
    svg,
    flags=re.DOTALL
)
```

Se o código gerador do DXF/SVG for seu, o ideal é **não gerar o overlay**
quando o destino for visualização estática. Use um flag de contexto:

```python
MODO_INTERATIVO = False  # True = web com cliques, False = SVG estático

if MODO_INTERATIVO:
    svg += gerar_overlay(componentes)
```

---

## Estilos CSS Corretos

Substituir **todo o bloco `<defs>`** do SVG gerado pelo ezdxf pelo seguinte:

```css
/* Geometria principal — preto, linha normal */
.C1 {
  stroke: #777777;
  stroke-width: 180;          /* 0,18mm — linha de eixo */
  stroke-opacity: 1;
  fill: none;
  stroke-dasharray: 1500 500 100 500;  /* traço-ponto ISO */
}
.C2 {
  stroke: #000000;
  stroke-width: 250;          /* 0,25mm — linha principal */
  stroke-opacity: 1;
  fill: none;
}

/* Cotas — cinza discreto, nunca bloquear a geometria */
.C3 {
  stroke: #444444;
  stroke-width: 150;          /* 0,15mm — linha de cota */
  stroke-opacity: 1;
  fill: none;
}
.C4 {
  stroke: none;
  fill: #222222;              /* texto de cota — cinza escuro */
  fill-opacity: 1;
}
.C8 {
  stroke: none;
  fill: #222222;              /* setas/labels de cota */
  fill-opacity: 1;
}

/* Auxiliares */
.C5 {
  stroke: #888888;
  stroke-width: 130;          /* 0,13mm — linha auxiliar */
  stroke-opacity: 1;
  fill: none;
}

/* Símbolos de componentes — BARRAS e SENSOR */
.C6 {
  stroke: #007700;
  stroke-width: 180;          /* 0,18mm — símbolo de BARRAS (borne estreito) */
  stroke-opacity: 1;
  fill: none;
}
.C7 {
  stroke: #005588;
  stroke-width: 180;          /* 0,18mm — símbolo de SENSOR (corpo quadrado) */
  stroke-opacity: 1;
  fill: none;
}
```

### Tabela de stroke-width (referência rápida)

| Espessura ISO | mm    | Unidades SVG |
|---------------|-------|--------------|
| Grossa        | 0,50  | `500`        |
| Normal        | 0,25  | `250`        |
| Fina          | 0,18  | `180`        |
| Muito fina    | 0,13  | `130`        |
| Cota          | 0,15  | `150`        |

**Fórmula:** `unidades_SVG = espessura_mm / 0.001`

---

## Atributos do `<svg>` Raiz

```xml
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd"
  width="{vb_w * 0.001}mm"
  height="{vb_h * 0.001}mm"
  viewBox="0 0 {vb_w} {vb_h}"
  inkscape:document-units="mm">
  <sodipodi:namedview inkscape:document-units="mm" units="mm" />
  ...
</svg>
```

---

## Script de Pós-processamento (Obrigatório)

Aplicar **sempre** após gerar o SVG com ezdxf:

```python
import re

def postprocess_dxf_svg(input_path: str, output_path: str) -> None:
    """
    Corrige o SVG gerado pelo ezdxf para visualização técnica correta.
    Aplica: escala, stroke-widths, cores, namespaces Inkscape.
    Remove: interactive-overlay, cores DXF cruas.
    """
    with open(input_path, 'r', encoding='utf-8') as f:
        svg = f.read()

    # ── 1. Extrair viewBox ────────────────────────────────────────────────────
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
    if not m:
        raise ValueError("viewBox não encontrado no SVG")
    vb_w, vb_h = float(m.group(1)), float(m.group(2))
    width_mm  = vb_w * 0.001
    height_mm = vb_h * 0.001

    # ── 2. Corrigir width / height ────────────────────────────────────────────
    svg = re.sub(r'width="[^"]*"',  f'width="{width_mm}mm"',  svg, count=1)
    svg = re.sub(r'height="[^"]*"', f'height="{height_mm}mm"', svg, count=1)

    # ── 3. Adicionar namespaces Inkscape ──────────────────────────────────────
    svg = svg.replace(
        '<svg xmlns="http://www.w3.org/2000/svg"',
        '<svg xmlns="http://www.w3.org/2000/svg"\n'
        '     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"\n'
        '     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd"\n'
        '     inkscape:document-units="mm"'
    )

    # ── 4. Substituir bloco <defs> inteiro ────────────────────────────────────
    new_defs = '''<defs>
<sodipodi:namedview inkscape:document-units="mm" units="mm" />
<style>
  .C1 { stroke: #777777; stroke-width: 180;  fill: none; stroke-opacity: 1;
         stroke-dasharray: 1500 500 100 500; }  /* eixos/centro — tracejado */
  .C2 { stroke: #000000; stroke-width: 250;  fill: none; stroke-opacity: 1; }  /* geometria principal */
  .C3 { stroke: #444444; stroke-width: 150;  fill: none; stroke-opacity: 1; }  /* linhas de cota */
  .C4 { stroke: none; fill: #222222; fill-opacity: 1; }                         /* textos de cota */
  .C5 { stroke: #888888; stroke-width: 130;  fill: none; stroke-opacity: 1; }  /* auxiliares */
  .C6 { stroke: #007700; stroke-width: 180;  fill: none; stroke-opacity: 1; }  /* símbolo BARRAS */
  .C7 { stroke: #005588; stroke-width: 180;  fill: none; stroke-opacity: 1; }  /* símbolo SENSOR */
  .C8 { stroke: none; fill: #222222; fill-opacity: 1; }                         /* setas de cota */
</style>
</defs>'''
    svg = re.sub(r'<defs>.*?</defs>', new_defs, svg, flags=re.DOTALL)

    # ── 5. Remover interactive-overlay (retângulos interativos indesejados) ───
    svg = re.sub(
        r'<g id="interactive-overlay">.*?</g>',
        '',
        svg,
        flags=re.DOTALL
    )

    # ── 6. Fundo branco explícito ─────────────────────────────────────────────
    # Atenção: ezdxf usa fill="#212830" (escuro), não #ffffff — regex genérica
    svg = re.sub(
        r'<rect fill="[^"]+" x="0" y="0"[^/]*/>\s*',
        f'<rect fill="#ffffff" x="0" y="0" '
        f'width="{vb_w}" height="{vb_h}" fill-opacity="1.0" />\n',
        svg, count=1
    )

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(svg)

    print(f"SVG corrigido: {width_mm:.1f}mm × {height_mm:.1f}mm → {output_path}")
```

---

## Uso no Fluxo Completo

```python
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.svg import SVGBackend

def dxf_to_svg(dxf_path: str, svg_path: str) -> None:
    # 1. Carregar DXF
    doc  = ezdxf.readfile(dxf_path)
    msp  = doc.modelspace()

    # 2. Gerar SVG via ezdxf (produz SVG cru com defeitos)
    ctx     = RenderContext(doc)
    backend = SVGBackend()
    Frontend(ctx, backend).draw_layout(msp, finalize=True)

    svg_raw_path = svg_path.replace('.svg', '_raw.svg')
    with open(svg_raw_path, 'w', encoding='utf-8') as f:
        f.write(backend.get_xml_root())

    # 3. Pós-processar obrigatoriamente
    postprocess_dxf_svg(svg_raw_path, svg_path)

# Exemplo de uso:
dxf_to_svg("frente.dxf", "frente.svg")
```

---

## Verificação Pós-geração (Checklist)

Antes de entregar o SVG ao usuário, verificar:

- [ ] `width` e `height` em mm, proporcionais ao `viewBox`
- [ ] `stroke-width` dos elementos C2 = `250` (não `62500`)
- [ ] Nenhum elemento com `fill: #ffff00` ou `fill: #ff0000` visível
- [ ] Linhas de eixo C1 com `stroke-dasharray` (tracejado ponto)
- [ ] Textos de cota C4/C8 em cor escura (`#222222`)
- [ ] `interactive-overlay` ausente (sem retângulos coloridos semitransparentes)
- [ ] Símbolos C6 (BARRAS) e C7 (SENSOR) visíveis com stroke fino
- [ ] Arquivo abre corretamente no Inkscape com unidades em mm

---

## Notas sobre Layers e Cotas

### Símbolos de componentes C6 e C7

C6 e C7 são os **contornos gráficos** dos componentes físicos no painel:

- **C6** (`#00ff00` → verde escuro no output): símbolo da BARRA/BORNE
  — retângulo estreito de ~1,2 × 7,3 mm representando o borne de conexão
- **C7** (`#00ffff` → azul escuro no output): símbolo do SENSOR
  — quadrado de ~7,3 × 7,3 mm representando o corpo do módulo sensor

Esses elementos **não devem ser confundidos** com o `interactive-overlay`,
que usa as mesmas cores mas com `fill-opacity=0.6` e atributos `data-handle`,
`data-layer` e `cursor:pointer`. A distinção no SVG:

```xml
<!-- C6/C7: símbolo gráfico real — stroke only, sem fill, sem data-* -->
<path d="M 183060 265367 l -1214 0 ..." class="C6"/>

<!-- overlay: hit-area interativa — fill semitransparente, com data-* -->
<path d="M 185492 268291 L 179426 ..." fill="#22c55e" fill-opacity="0.6"
      data-layer="SENSOR" style="cursor:pointer"/>
```

### Ocultar cotas completamente
Se o usuário quiser o desenho **sem cotas**:
```css
.C3 { display: none; }
.C4 { display: none; }
.C8 { display: none; }
```

### Tamanho dos textos de cota (C4)
Os glifos vetorizados de C4 têm altura definida pelo `DIMTXT` do DXF.
O tamanho **não deve ser alterado via CSS** — já está na escala correta
(tipicamente ~6–9 mm, proporcional ao desenho).
Para ajustar, é necessário reeditar o `DIMTXT` no DXF de origem antes de exportar.

### Eixo Y
O ezdxf **já inverte o eixo Y** corretamente (DXF: Y↑ → SVG: Y↓).
Não aplicar nenhuma transformação de espelhamento vertical.

### Variação de mapeamento de classes
Se o DXF de origem usar cores ACI diferentes, as classes CSS mudam.
Sempre inspecionar o `<defs>` do SVG gerado e ajustar o mapeamento:
```python
# Inspecionar cores geradas pelo ezdxf:
import re
with open('arquivo_raw.svg') as f:
    svg = f.read()
styles = re.findall(r'\.(C\d+) \{([^}]*)\}', svg)
for name, props in styles:
    print(f"{name}: {props.strip()}")
```
