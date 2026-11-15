#!/usr/bin/env python3
"""
Builds the static Geist / Geist Mono TTFs that the satori image generators load
(lib/og/shared.server.ts, lib/discord-activity-image.tsx, scripts/gen-pwa-icons.tsx).

satori reads TTF / OTF / WOFF only, and @fontsource-variable ships WOFF2 variable
files, so this decodes the installed package's latin subset and pins one static
instance per weight. The output is committed to public/fonts/og/ so OG rendering
has no network dependency and no build-time step.

Run (needs `pip install fonttools brotli`):  python3 scripts/gen-og-fonts.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
PKG = ROOT / "node_modules" / "@fontsource-variable"
OUT = ROOT / "public" / "fonts" / "og"

JOBS = [
    ("geist", "Geist", [400, 700, 800]),
    ("geist-mono", "GeistMono", [400, 700]),
]

OUT.mkdir(parents=True, exist_ok=True)
for pkg, stem, weights in JOBS:
    src = PKG / pkg / "files" / f"{pkg}-latin-wght-normal.woff2"
    for w in weights:
        font = TTFont(src)
        font.flavor = None
        inst = instantiateVariableFont(font, {"wght": w}, inplace=False)
        dest = OUT / f"{stem}-{w}.ttf"
        inst.save(dest)
        print(dest.relative_to(ROOT), dest.stat().st_size)
