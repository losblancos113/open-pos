"""
Renders the high-resolution Canvas Presentation Artwork (PNG + PDF)
and generates all production raster icons (PNGs, ICO, touch-icon).
Using super-sampling (4x / 2x LANCZOS) for pristine edge quality.
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

FONTS_DIR = ".agents/skills/canvas-design/canvas-fonts"
OUTPUT_DIR = "docs/design"
PUBLIC_DIR = "public"
ASSETS_DIR = "src/assets"

for d in [OUTPUT_DIR, PUBLIC_DIR, ASSETS_DIR]:
    os.makedirs(d, exist_ok=True)

# Colors from tokens.ts & design philosophy
COLOR_TERRACOTTA = (194, 65, 12)       # #c2410c
COLOR_TERRACOTTA_LIGHT = (207, 68, 16) # #cf4410
COLOR_TERRACOTTA_DARK = (176, 54, 7)   # #b03607
COLOR_BASALT = (26, 26, 30)            # #1a1a1e
COLOR_BASALT_DEEP = (18, 18, 21)       # #121215
COLOR_BASALT_LIGHT = (38, 38, 44)      # #26262c
COLOR_MORTAR = (247, 247, 248)         # #f7f7f8
COLOR_BORDER = (226, 232, 240)         # #e2e8f0
COLOR_WHITE = (255, 255, 255)
COLOR_CREAM = (255, 237, 213)          # #ffedd5
COLOR_MUTED = (107, 114, 128)          # #6b7280

def get_font(name, size):
    path = os.path.join(FONTS_DIR, name)
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def draw_squircle(draw, bounds, radius, fill):
    x0, y0, x1, y1 = bounds
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)

def create_super_sampled_icon(size=512, background="terracotta"):
    scale = 4
    canvas_size = size * scale
    im = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)

    pad = 32 * (size / 512.0) * scale
    radius = 104 * (size / 512.0) * scale

    if background == "terracotta":
        bg_color = COLOR_TERRACOTTA
        draw_squircle(draw, [pad, pad, canvas_size - pad, canvas_size - pad], radius, bg_color)
        glyph_color = COLOR_WHITE
        counter_color = COLOR_TERRACOTTA
        pip_color = COLOR_CREAM
    elif background == "dark":
        draw_squircle(draw, [pad, pad, canvas_size - pad, canvas_size - pad], radius, COLOR_BASALT)
        glyph_color = COLOR_TERRACOTTA
        counter_color = COLOR_BASALT
        pip_color = (249, 115, 22)
    elif background == "light":
        draw_squircle(draw, [pad, pad, canvas_size - pad, canvas_size - pad], radius, COLOR_WHITE)
        draw.rounded_rectangle([pad, pad, canvas_size - pad, canvas_size - pad], radius=radius, outline=COLOR_BORDER, width=int(8 * scale * size / 512.0))
        glyph_color = COLOR_TERRACOTTA
        counter_color = COLOR_WHITE
        pip_color = COLOR_BASALT
    else: # transparent
        glyph_color = COLOR_TERRACOTTA
        counter_color = (0, 0, 0, 0)
        pip_color = (234, 88, 12)

    c = canvas_size / 2.0
    s = (size / 512.0) * scale
    ox = c - 256 * s
    oy = c - 256 * s

    cx_o = ox + 210 * s
    cy_o = oy + 256 * s
    r_outer_o = 116 * s
    r_inner_o = 62 * s

    cx_p = ox + 284 * s
    cy_p = oy + 206 * s
    r_outer_p = 68 * s
    r_inner_p = 26 * s

    sx0 = ox + 246 * s
    sx1 = ox + 284 * s
    sy0 = oy + 136 * s
    sy1 = oy + 376 * s

    draw.ellipse([cx_o - r_outer_o, cy_o - r_outer_o, cx_o + r_outer_o, cy_o + r_outer_o], fill=glyph_color)
    draw.rectangle([sx0, sy0, sx1, sy1], fill=glyph_color)
    draw.ellipse([cx_p - r_outer_p, cy_p - r_outer_p, cx_p + r_outer_p, cy_p + r_outer_p], fill=glyph_color)
    draw.rectangle([sx0, cy_p - r_outer_p, cx_p, cy_p + r_outer_p], fill=glyph_color)

    if counter_color == (0, 0, 0, 0):
        mask = Image.new("L", (canvas_size, canvas_size), 255)
        m_draw = ImageDraw.Draw(mask)
        m_draw.ellipse([cx_o - r_inner_o, cy_o - r_inner_o, cx_o + r_inner_o, cy_o + r_inner_o], fill=0)
        m_draw.ellipse([cx_p - r_inner_p, cy_p - r_inner_p, cx_p + r_inner_p, cy_p + r_inner_p], fill=0)
        im.putalpha(mask)
    else:
        draw.ellipse([cx_o - r_inner_o, cy_o - r_inner_o, cx_o + r_inner_o, cy_o + r_inner_o], fill=counter_color)
        draw.ellipse([cx_p - r_inner_p, cy_p - r_inner_p, cx_p + r_inner_p, cy_p + r_inner_p], fill=counter_color)

    px = ox + 338 * s
    py = oy + 342 * s
    pr = 22 * s
    draw.ellipse([px - pr, py - pr, px + pr, py + pr], fill=pip_color)

    final_im = im.resize((size, size), Image.Resampling.LANCZOS)
    return final_im

# ---------------------------------------------------------------------------
# Generate all standard icons
# ---------------------------------------------------------------------------
icon_512 = create_super_sampled_icon(512, "terracotta")
icon_512.save(os.path.join(PUBLIC_DIR, "logo-512x512.png"))
icon_512.save(os.path.join(OUTPUT_DIR, "logo-512x512.png"))

icon_192 = create_super_sampled_icon(192, "terracotta")
icon_192.save(os.path.join(PUBLIC_DIR, "logo-192x192.png"))

icon_180 = create_super_sampled_icon(180, "terracotta")
icon_180.save(os.path.join(PUBLIC_DIR, "apple-touch-icon.png"))
icon_180.save(os.path.join(OUTPUT_DIR, "apple-touch-icon.png"))

icon_48 = create_super_sampled_icon(48, "terracotta")
icon_48.save(os.path.join(PUBLIC_DIR, "favicon-48x48.png"))

icon_32 = create_super_sampled_icon(32, "terracotta")
icon_32.save(os.path.join(PUBLIC_DIR, "favicon-32x32.png"))
icon_32.save(os.path.join(OUTPUT_DIR, "favicon-32x32.png"))

icon_16 = create_super_sampled_icon(16, "terracotta")
icon_16.save(os.path.join(PUBLIC_DIR, "favicon-16x16.png"))
icon_16.save(os.path.join(OUTPUT_DIR, "favicon-16x16.png"))

icon_512.save(
    os.path.join(PUBLIC_DIR, "favicon.ico"),
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
icon_512.save(
    os.path.join(OUTPUT_DIR, "favicon.ico"),
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)

# ---------------------------------------------------------------------------
# High-Resolution Canvas Artwork (2400 x 1350, 16:9)
# ---------------------------------------------------------------------------
def render_canvas_presentation():
    W, H = 2400, 1350
    canvas = Image.new("RGB", (W, H), COLOR_BASALT_DEEP)
    draw = ImageDraw.Draw(canvas)

    # Fonts
    font_hero = get_font("BricolageGrotesque-Bold.ttf", 64)
    font_h2 = get_font("BricolageGrotesque-Bold.ttf", 36)
    font_h3 = get_font("BricolageGrotesque-Bold.ttf", 26)
    font_mono = get_font("GeistMono-Bold.ttf", 20)
    font_mono_sm = get_font("GeistMono-Regular.ttf", 15)
    font_serif_italic = get_font("CrimsonPro-Italic.ttf", 28)

    # Split: Left side = Basalt Charcoal (x=0..1320), Right side = Light Mortar (x=1320..2400)
    draw.rectangle([1320, 0, W, H], fill=COLOR_MORTAR)
    draw.line([1320, 0, 1320, H], fill=COLOR_BORDER, width=2)

    # Architectural Grid lines on left (fine dark grey)
    for gy in range(100, H, 150):
        draw.line([60, gy, 1260, gy], fill=(30, 30, 36), width=1)
    for gx in range(160, 1320, 200):
        draw.line([gx, 60, gx, H - 60], fill=(30, 30, 36), width=1)

    # --- LEFT SIDE: HERO EMBLEM & GEOMETRIC SYSTEM ---
    # Header
    draw.text((100, 80), "TERRACOTTA PRECISION // AESTHETIC SYSTEM", fill=COLOR_TERRACOTTA, font=font_mono)
    draw.text((100, 115), "Open POS Visual Identity & Monogram Architecture", fill=(160, 160, 175), font=font_mono_sm)

    # Hero Icon Mark (560x560)
    hero_size = 560
    hero_icon = create_super_sampled_icon(hero_size, "terracotta")
    canvas.paste(hero_icon, (100, 220), hero_icon)

    # Architectural annotations next to hero
    ann_x = 720
    draw.text((ann_x, 240), "THE OPEN NEXUS", fill=COLOR_WHITE, font=font_h2)
    draw.text((ann_x, 290), "O + P Geometric Synthesis", fill=COLOR_TERRACOTTA_LIGHT, font=font_mono)
    
    notes = [
        "· 240° Hospitality Loop (The 'O' Arc)",
        "· Rock-Solid Ledger Pillar (Stem x=246..284)",
        "· Point-of-Sale Head (The 'P' Bowl)",
        "· Open-mesh negative space aperture",
        "· 22px Kinetic Ledger Pip (Active Sync)"
    ]
    ny = 340
    for note in notes:
        draw.text((ann_x, ny), note, fill=(200, 200, 215), font=font_mono_sm)
        ny += 34

    # Geometric Coordinate Box
    draw_squircle(draw, [ann_x, 540, 1240, 740], 16, COLOR_BASALT)
    draw.rounded_rectangle([ann_x, 540, 1240, 740], radius=16, outline=(48, 48, 56), width=1)
    draw.text((ann_x + 30, 565), "GEOMETRIC SPECIFICATIONS", fill=(140, 140, 155), font=font_mono_sm)
    draw.text((ann_x + 30, 600), "BASE GRID: 512 × 512 px  |  SQUIRCLE RADIUS: 104 px (20.3%)", fill=COLOR_WHITE, font=font_mono_sm)
    draw.text((ann_x + 30, 635), "PRIMARY HUE: #C2410C (L* 48%, C* 76, H 38°)", fill=COLOR_TERRACOTTA_LIGHT, font=font_mono_sm)
    draw.text((ann_x + 30, 670), "COUNTER APERTURE: 45° DIAGONAL CUTOUT RATIO 1:1.618", fill=(210, 210, 220), font=font_mono_sm)

    # Micro-scale verification row (bottom left)
    draw.line([100, 840, 1240, 840], fill=(45, 45, 55), width=1)
    draw.text((100, 870), "OPTICAL SCALE VERIFICATION (128px / 64px / 32px / 16px)", fill=(140, 140, 155), font=font_mono_sm)
    
    # 128px
    i128 = create_super_sampled_icon(128, "terracotta")
    canvas.paste(i128, (100, 930), i128)
    draw.text((135, 1075), "128px", fill=(120, 120, 135), font=font_mono_sm)

    # 64px
    i64 = create_super_sampled_icon(64, "terracotta")
    canvas.paste(i64, (280, 962), i64)
    draw.text((295, 1075), "64px", fill=(120, 120, 135), font=font_mono_sm)

    # 48px
    i48 = create_super_sampled_icon(48, "terracotta")
    canvas.paste(i48, (400, 978), i48)
    draw.text((410, 1075), "48px", fill=(120, 120, 135), font=font_mono_sm)

    # 32px (Favicon standard)
    i32 = create_super_sampled_icon(32, "terracotta")
    canvas.paste(i32, (510, 994), i32)
    draw.text((515, 1075), "32px", fill=(120, 120, 135), font=font_mono_sm)

    # 16px (Micro tab)
    i16 = create_super_sampled_icon(16, "terracotta")
    canvas.paste(i16, (600, 1010), i16)
    draw.text((600, 1075), "16px", fill=(120, 120, 135), font=font_mono_sm)

    # Dark variant comparison at 64px
    i64_dark = create_super_sampled_icon(64, "dark")
    canvas.paste(i64_dark, (720, 962), i64_dark)
    draw.text((720, 1075), "64px Dark", fill=(120, 120, 135), font=font_mono_sm)

    # Light variant comparison at 64px
    i64_light = create_super_sampled_icon(64, "light")
    canvas.paste(i64_light, (840, 962), i64_light)
    draw.text((835, 1075), "64px Light", fill=(120, 120, 135), font=font_mono_sm)

    # --- RIGHT SIDE: APPLICATION LOCKUPS & MATERIAL PALETTE ---
    # Section Header
    draw.text((1420, 80), "APPLICATION SYSTEMS // PRODUCTION DELIVERABLES", fill=COLOR_TERRACOTTA, font=font_mono)
    draw.text((1420, 115), "Header Lockups, Favicon Assets & Material Swatches", fill=COLOR_MUTED, font=font_mono_sm)

    # 1. Primary Light Mode Website Lockup Card
    card_w = 880
    draw_squircle(draw, [1420, 180, 1420 + card_w, 360], 16, COLOR_WHITE)
    draw.rounded_rectangle([1420, 180, 1420 + card_w, 360], radius=16, outline=COLOR_BORDER, width=2)
    
    # Mark in light card (72x72)
    mark_72 = create_super_sampled_icon(72, "terracotta")
    canvas.paste(mark_72, (1460, 234), mark_72)
    
    # Text "OPEN" + "POS"
    draw.text((1560, 225), "OPEN", fill=COLOR_BASALT, font=font_hero)
    
    # POS Pill Badge
    draw_squircle(draw, [1780, 235, 1890, 295], 10, COLOR_TERRACOTTA)
    draw.text((1805, 246), "POS", fill=COLOR_WHITE, font=font_h2)
    draw.text((1565, 305), "OFFLINE-FIRST RETAIL & HOSPITALITY", fill=COLOR_MUTED, font=font_mono_sm)

    # 2. Dark Mode Website Lockup Card
    draw_squircle(draw, [1420, 400, 1420 + card_w, 580], 16, COLOR_BASALT)
    draw.rounded_rectangle([1420, 400, 1420 + card_w, 580], radius=16, outline=(48, 48, 56), width=1)
    
    mark_72_dark = create_super_sampled_icon(72, "terracotta")
    canvas.paste(mark_72_dark, (1460, 454), mark_72_dark)
    draw.text((1560, 445), "OPEN", fill=COLOR_WHITE, font=font_hero)
    draw_squircle(draw, [1780, 455, 1890, 515], 10, COLOR_TERRACOTTA)
    draw.text((1805, 466), "POS", fill=COLOR_WHITE, font=font_h2)
    draw.text((1565, 525), "OFFLINE-FIRST RETAIL & HOSPITALITY", fill=(160, 160, 175), font=font_mono_sm)

    # 3. Material Swatches (5 color columns)
    draw.text((1420, 630), "ELEMENTAL PALETTE // 5 MATERIAL TONES", fill=COLOR_BASALT, font=font_mono)
    
    swatches = [
        ("Terracotta", COLOR_TERRACOTTA, "#C2410C", "Fired Clay / Core Brand"),
        ("Basalt", COLOR_BASALT, "#1A1A1E", "Espresso / Structural Dark"),
        ("Ember Cream", COLOR_CREAM, "#FFEDD5", "Active Pulse / Accent"),
        ("Mortar Mist", (230, 230, 235), "#F7F7F8", "Background Tone"),
        ("Chalk White", COLOR_WHITE, "#FFFFFF", "Surface / Glyph Face")
    ]
    sw_w = 160
    sw_h = 100
    sx = 1420
    for title, col, hex_val, desc in swatches:
        draw_squircle(draw, [sx, 670, sx + sw_w, 670 + sw_h], 12, col)
        draw.rounded_rectangle([sx, 670, sx + sw_w, 670 + sw_h], radius=12, outline=COLOR_BORDER, width=1)
        draw.text((sx, 785), title, fill=COLOR_BASALT, font=font_mono_sm)
        draw.text((sx, 810), hex_val, fill=COLOR_TERRACOTTA, font=font_mono_sm)
        sx += 180

    # 4. Philosophy Manifesto Fragment
    draw.line([1420, 870, 2300, 870], fill=COLOR_BORDER, width=1)
    draw.text((1420, 900), "AESTHETIC WORLDVIEW", fill=COLOR_TERRACOTTA, font=font_mono)
    
    manifesto_lines = [
        "\"Software is not an ethereal cloud that falters when the wire is severed.",
        "It is a digital brick laid with mortar—anchored in the sensory warmth",
        "of Saigon coffee houses, baked clay tiles, and unyielding offline autonomy.\""
    ]
    my = 940
    for line in manifesto_lines:
        draw.text((1420, my), line, fill=COLOR_BASALT, font=font_serif_italic)
        my += 40

    # 5. Production Specifications Footer
    draw.text((1420, 1100), "CORE ASSETS DEPLOYED:", fill=COLOR_MUTED, font=font_mono_sm)
    draw.text((1420, 1130), "· public/favicon.svg, favicon.ico (16/32/48/64/128/256), apple-touch-icon.png", fill=COLOR_BASALT, font=font_mono_sm)
    draw.text((1420, 1160), "· src/assets/logo-horizontal.svg, logo-mark.svg, docs/design/open-pos-canvas-design.png/.pdf", fill=COLOR_BASALT, font=font_mono_sm)

    # Save PNG and PDF
    png_path = os.path.join(OUTPUT_DIR, "open-pos-canvas-design.png")
    pdf_path = os.path.join(OUTPUT_DIR, "open-pos-canvas-design.pdf")
    
    canvas.save(png_path, "PNG", quality=95)
    canvas.save(pdf_path, "PDF", resolution=300.0)
    print(f"Canvas Artwork generated successfully at:\n  {png_path}\n  {pdf_path}")

render_canvas_presentation()
