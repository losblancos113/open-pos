"""
Builds the complete suite of Open POS logo concepts, website lockups, and an interactive HTML visualization.
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

VIS_DIR = r"C:\Users\hmtma\.zcode\v2\visualizations\09cc9547538cb744007b7ed87ce65bacf860d6c774deb80bd014687efe3c2803"
OUTPUT_DIR = "docs/design"
PUBLIC_DIR = "public"
ASSETS_DIR = "src/assets"

for d in [VIS_DIR, OUTPUT_DIR, PUBLIC_DIR, ASSETS_DIR]:
    os.makedirs(d, exist_ok=True)

# -------------------------------------------------------------
# 1. Master Icon Glyph Definitions
# -------------------------------------------------------------
def get_open_nexus_glyph(fill_color="#ffffff", pip_color="#ffedd5"):
    """
    The Open Nexus: Monogram OP with mathematical golden proportions.
    """
    return f'''
    <g fill="{fill_color}" fill-rule="evenodd">
      <!-- Main Monogram Silhouette -->
      <path d="
        M 276,136
        C 342,136 388,168 388,206
        C 388,244 342,274 276,274
        L 276,324
        C 276,350 252,376 210,376
        C 144,376 94,322 94,256
        C 94,190 144,136 210,136
        Z
        M 210,188
        C 174,188 146,218 146,256
        C 146,294 174,324 210,324
        C 226,324 238,312 238,296
        L 238,216
        C 238,200 226,188 210,188
        Z
        M 276,184
        L 306,184
        C 328,184 342,192 342,206
        C 342,220 328,228 306,228
        L 276,228
        Z
      "/>
    </g>
    <!-- Kinetic Pulse Node (Offline Sync / Transaction Anchor) -->
    <circle cx="338" cy="342" r="22" fill="{pip_color}" />
    '''

def create_app_icon_svg(path, background="terracotta"):
    if background == "terracotta":
        bg = '''
    <defs>
      <linearGradient id="terracottaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#d04a15"/>
        <stop offset="100%" stop-color="#b03607"/>
      </linearGradient>
      <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#terracottaGrad)"/>
    <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#shine)"/>
        '''
        glyph = get_open_nexus_glyph(fill_color="#ffffff", pip_color="#ffedd5")
    elif background == "dark":
        bg = '''
    <defs>
      <linearGradient id="darkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#222227"/>
        <stop offset="100%" stop-color="#121215"/>
      </linearGradient>
    </defs>
    <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#darkGrad)"/>
        '''
        glyph = get_open_nexus_glyph(fill_color="#c2410c", pip_color="#f97316")
    elif background == "light":
        bg = '''
    <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="#ffffff" stroke="#e2e8f0" stroke-width="8"/>
        '''
        glyph = get_open_nexus_glyph(fill_color="#c2410c", pip_color="#1a1a1e")
    else: # transparent
        bg = ""
        glyph = get_open_nexus_glyph(fill_color="#c2410c", pip_color="#ea580c")

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  {bg}
  {glyph}
</svg>'''
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)

# -------------------------------------------------------------
# 2. Website Header Logo (Horizontal Lockup)
# -------------------------------------------------------------
def create_website_logo_horizontal(path, theme="light"):
    text_color = "#1a1a1e" if theme == "light" else "#ffffff"
    tagline_color = "#6b7280" if theme == "light" else "#9ca3af"
    badge_bg = "#c2410c"
    badge_fg = "#ffffff"

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 100" width="460" height="100">
  <defs>
    <linearGradient id="hGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d04a15"/>
      <stop offset="100%" stop-color="#b03607"/>
    </linearGradient>
  </defs>

  <!-- Logo Mark (Left, 72x72) -->
  <g transform="translate(10, 14)">
    <rect width="72" height="72" rx="18" fill="url(#hGrad)"/>
    <!-- Scaled Glyph -->
    <g transform="translate(-5, -5) scale(0.16)">
      {get_open_nexus_glyph(fill_color="#ffffff", pip_color="#ffedd5")}
    </g>
  </g>

  <!-- Typography: OPEN POS -->
  <g transform="translate(98, 52)">
    <!-- OPEN -->
    <text x="0" y="0" font-family="'Inter', 'Bricolage Grotesque', system-ui, -apple-system, sans-serif" 
          font-size="34" font-weight="900" letter-spacing="-0.5" fill="{text_color}">OPEN</text>
    
    <!-- POS Pill Badge -->
    <rect x="108" y="-30" width="76" height="36" rx="8" fill="{badge_bg}" />
    <text x="146" y="-5" font-family="'Inter', system-ui, sans-serif" 
          font-size="22" font-weight="800" letter-spacing="1" fill="{badge_fg}" text-anchor="middle">POS</text>
  </g>

  <!-- Tagline: OFFLINE-FIRST RETAIL & HOSPITALITY -->
  <text x="100" y="74" font-family="'Inter', system-ui, sans-serif" 
        font-size="10.5" font-weight="600" letter-spacing="2" fill="{tagline_color}">OFFLINE-FIRST RETAIL &amp; HOSPITALITY</text>
</svg>'''
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)

# -------------------------------------------------------------
# 3. Favicon Vector (Optimized for small sizes)
# -------------------------------------------------------------
def create_favicon_svg(path):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="favGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d04a15"/>
      <stop offset="100%" stop-color="#b03607"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#favGrad)" />
  <g transform="translate(-16, -16) scale(0.3125)">
    {get_open_nexus_glyph(fill_color="#ffffff", pip_color="#ffedd5")}
  </g>
</svg>'''
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)

# Generate SVGs in project and docs
create_app_icon_svg(os.path.join(PUBLIC_DIR, "logo-mark.svg"), background="terracotta")
create_app_icon_svg(os.path.join(PUBLIC_DIR, "logo-mark-dark.svg"), background="dark")
create_app_icon_svg(os.path.join(PUBLIC_DIR, "logo-mark-light.svg"), background="light")
create_app_icon_svg(os.path.join(PUBLIC_DIR, "logo-mark-transparent.svg"), background="transparent")

create_app_icon_svg(os.path.join(ASSETS_DIR, "logo-mark.svg"), background="terracotta")
create_app_icon_svg(os.path.join(OUTPUT_DIR, "logo-mark.svg"), background="terracotta")

create_favicon_svg(os.path.join(PUBLIC_DIR, "favicon.svg"))
create_favicon_svg(os.path.join(OUTPUT_DIR, "favicon.svg"))

create_website_logo_horizontal(os.path.join(PUBLIC_DIR, "logo-horizontal.svg"), theme="light")
create_website_logo_horizontal(os.path.join(PUBLIC_DIR, "logo-horizontal-dark.svg"), theme="dark")
create_website_logo_horizontal(os.path.join(ASSETS_DIR, "logo-horizontal.svg"), theme="light")
create_website_logo_horizontal(os.path.join(OUTPUT_DIR, "logo-horizontal.svg"), theme="light")

print("Generated core SVG files.")
