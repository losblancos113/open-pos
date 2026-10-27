"""
Render vector SVG files and PNG previews for Open POS logo concepts.
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

def create_svg_concept_1(path):
    """
    Concept 1: The 'Open Nexus' Monogram (Unified O-P ligature in Terracotta squircle)
    Left: Full-height O arc (hospitality circle, coin, open loop)
    Center: Vertical spine / pillar (rock-solid offline ledger)
    Right: Upper P-bowl (point of sale, precision, payment)
    Lower-right: Deliberate negative space opening (Openness)
    """
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="terracottaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d04a15"/>
      <stop offset="100%" stop-color="#b33808"/>
    </linearGradient>
    <linearGradient id="innerShine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Squircle Base -->
  <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#terracottaGrad)" />
  <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#innerShine)" />

  <!-- Monogram Glyph (Chalk White #FFFFFF) -->
  <!--
    Geometric Construction:
    - Center spine x = 232..284 (width 52)
    - Left 'O' lobe: sweeps from (256, 116) left to x=116, down to (256, 396)
    - Right 'P' bowl: sweeps from (256, 116) right to x=396, down to (256, 256)
    - Inner counters cut cleanly
  -->
  <g fill="#ffffff" fill-rule="evenodd">
    <!-- Outer boundary combining O and P -->
    <path d="
      M 256,116
      C 178.68,116 116,178.68 116,256
      C 116,333.32 178.68,396 256,396
      C 272.57,396 284,384.57 284,368
      L 284,308
      C 346.03,308 396,258.03 396,196
      C 396,151.82 360.18,116 316,116
      Z
      M 232,172
      L 232,340
      C 185.61,340 148,302.39 148,256
      C 148,209.61 185.61,172 232,172
      Z
      M 284,172
      L 316,172
      C 329.25,172 340,182.75 340,196
      C 340,209.25 329.25,220 316,220
      L 284,220
      Z
    " />
  </g>

  <!-- Accent pip: Golden ratio dot at lower right (Active ledger / transaction pulse) -->
  <circle cx="340" cy="352" r="24" fill="#ffedd5" />
</svg>'''
    with open(path, 'w', encoding='utf-8') as f:
        f.write(svg)

def create_svg_concept_2(path):
    """
    Concept 2: The 'Open Aperture & Receipt Terminal'
    - An outer heavy ring (The 'O') with a dynamic 45° gateway cut.
    - An integrated diagonal/vertical tab that forms the 'P' and an upward transaction leap.
    """
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c2410c"/>
      <stop offset="100%" stop-color="#9a3412"/>
    </linearGradient>
  </defs>

  <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#bgGrad)" />

  <!-- Clean, high-impact vector glyph -->
  <!-- Outer Open Ring with 45° aperture -->
  <g fill="none" stroke="#ffffff" stroke-width="52" stroke-linecap="round" stroke-linejoin="round">
    <!-- 270-degree arc from 135 deg around to 45 deg -->
    <path d="M 330,182 A 140 140 0 1 0 354,256" />
    <!-- Vertical stem of P passing through center -->
    <line x1="256" y1="130" x2="256" y2="370" />
    <!-- P bowl -->
    <path d="M 256,130 L 320,130 C 352,130 368,154 368,185 C 368,216 352,240 320,240 L 256,240" />
  </g>
  <!-- Accent terminal dot -->
  <circle cx="256" cy="370" r="16" fill="#ffffff" />
</svg>'''
    with open(path, 'w', encoding='utf-8') as f:
        f.write(svg)

def create_svg_concept_3(path):
    """
    Concept 3: 'Minimalist Kinetic Hex/Ring OP'
    Clean, bold geometric monoline with perfect optical weights.
    Extremely readable at 16x16.
    """
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="tGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d04a15"/>
      <stop offset="100%" stop-color="#b33808"/>
    </linearGradient>
  </defs>

  <!-- Squircle Base -->
  <rect x="32" y="32" width="448" height="448" rx="112" ry="112" fill="url(#tGrad3)"/>

  <!-- Bold Geometric Glyphs: O and P intertwining -->
  <g fill="#ffffff">
    <!-- The Left Circle (O): Center (196, 256), Radius 112, Hole 58 -->
    <!-- The Right Loop & Stem (P): Stem x=(260..314), y=(144..368), Bowl x=(314..380), y=(144..256) -->
    <!-- United as an iconic silhouette -->
    <!-- Circle O -->
    <path fill-rule="evenodd" d="
      M 200,144
      C 138.14,144 88,194.14 88,256
      C 88,317.86 138.14,368 200,368
      C 238.2,368 271.6,348.88 291.6,319.8
      L 291.6,368
      L 343.6,368
      L 343.6,144
      L 291.6,144
      L 291.6,192.2
      C 271.6,163.12 238.2,144 200,144
      Z
      M 200,200
      C 230.93,200 256,225.07 256,256
      C 256,286.93 230.93,312 200,312
      C 169.07,312 144,286.93 144,256
      C 144,225.07 169.07,200 200,200
      Z
      M 343.6,144
      L 368,144
      C 398.93,144 424,169.07 424,200
      C 424,230.93 398.93,256 368,256
      L 343.6,256
      Z
      M 343.6,196
      L 364,196
      C 366.2,196 368,197.8 368,200
      C 368,202.2 366.2,204 364,204
      L 343.6,204
      Z
    "/>
  </g>
</svg>'''
    with open(path, 'w', encoding='utf-8') as f:
        f.write(svg)

create_svg_concept_1('docs/design/concept-1.svg')
create_svg_concept_2('docs/design/concept-2.svg')
create_svg_concept_3('docs/design/concept-3.svg')
print("Generated concepts 1, 2, 3 SVG.")
