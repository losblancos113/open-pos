"""
Renders the continuous OP Monogram with exact mathematical curves.
"""
import math

def generate_op_nexus_svg(filename, size=512, background='terracotta', show_grid=False):
    """
    Constructs the OP Nexus glyph.
    Center = (256, 256).
    Total width = 300px (x from 90 to 390).
    Total height = 240px (y from 136 to 376).
    
    Left 'O':
      Center of O = (195, 256)
      Radius_outer = 105
      Leftmost = 195 - 105 = 90
      Topmost = 256 - 105 = 151 (or let's align y with stem)
    
    Let's align vertical bounds:
      y_top = 136
      y_bottom = 376
      height = 240
      radius_outer = 120
      center_y = 256
      center_x_o = 210
      leftmost = 210 - 120 = 90
      right_edge_stem = 210 + 70 = 280
      stem_width = 50 -> stem_x_left = 230, stem_x_right = 280
      
      P-bowl:
        y_top = 136
        y_mid = 256
        height = 120
        radius_p = 60
        center_y_p = 196
        center_x_p = 280
        rightmost = 280 + 105 = 385
        total width = 385 - 90 = 295, perfectly centered! (256 - 295/2 = 108.5, 256 + 295/2 = 403.5 -> offset x by +18px)
    """
    ox = 18 # optical centering shift
    
    # Let's define the path
    # Outer contour:
    # 1. Start at top of stem: (280+ox, 136)
    # 2. P-bowl curve right: to (385+ox, 196) and back to (280+ox, 256)
    # 3. Stem straight down: to (280+ox, 376)
    # 4. Bottom of stem rounded or arc into O:
    #    Arc from (280+ox, 376) curving left and up around O to (90+ox, 256) and up to (210+ox, 136), straight into (280+ox, 136)
    
    bg_svg = ""
    if background == 'terracotta':
        bg_svg = '''
  <defs>
    <linearGradient id="tg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#cf4410"/>
      <stop offset="100%" stop-color="#b03607"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.15"/>
    </filter>
  </defs>
  <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#tg)"/>
'''
        glyph_fill = "#ffffff"
    elif background == 'dark':
        bg_svg = '''
  <defs>
    <linearGradient id="dg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#242429"/>
      <stop offset="100%" stop-color="#141417"/>
    </linearGradient>
  </defs>
  <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#dg)"/>
'''
        glyph_fill = "#c2410c"
    elif background == 'transparent':
        bg_svg = ""
        glyph_fill = "#c2410c"
    else: # white
        bg_svg = '<rect width="512" height="512" fill="#ffffff"/>'
        glyph_fill = "#c2410c"

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}">
{bg_svg}
  <g fill="{glyph_fill}" fill-rule="evenodd">
    <!-- OP Unified Glyph -->
    <path d="
      M {276+ox},{136}
      C {340+ox},{136} {386+ox},{164} {386+ox},{202}
      C {386+ox},{240} {340+ox},{268} {276+ox},{268}
      L {276+ox},{324}
      C {276+ox},{348} {256+ox},{376} {210+ox},{376}
      C {144+ox},{376} {92+ox},{322} {92+ox},{256}
      C {92+ox},{190} {144+ox},{136} {210+ox},{136}
      Z
      M {210+ox},{188}
      C {172+ox},{188} {144+ox},{218} {144+ox},{256}
      C {144+ox},{294} {172+ox},{324} {210+ox},{324}
      C {228+ox},{324} {238+ox},{312} {238+ox},{296}
      L {238+ox},{216}
      C {238+ox},{200} {228+ox},{188} {210+ox},{188}
      Z
      M {276+ox},{182}
      L {298+ox},{182}
      C {322+ox},{182} {338+ox},{190} {338+ox},{202}
      C {338+ox},{214} {322+ox},{222} {298+ox},{222}
      L {276+ox},{222}
      Z
    "/>
  </g>
</svg>'''
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(svg_content)

generate_op_nexus_svg('docs/design/op-nexus-terracotta.svg', background='terracotta')
generate_op_nexus_svg('docs/design/op-nexus-dark.svg', background='dark')
generate_op_nexus_svg('docs/design/op-nexus-transparent.svg', background='transparent')
print("Rendered op-nexus variants.")
