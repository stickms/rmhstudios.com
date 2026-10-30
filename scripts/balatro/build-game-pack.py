#!/usr/bin/env python3
"""Builds the Balatro game pack that /balatro downloads, from data/balatro.

    pip install fonttools pyoxipng
    python3 -I scripts/balatro/build-game-pack.py

Output (committed; zip names are content-addressed, so they can be cached
forever). The packs are NOT under public/: /balatro is signed-in only, so they
are served by app/routes/api/balatro/pack.$file.ts behind the session check.
    data/balatro-pack/core-<sha12>.zip      everything but the audio
    data/balatro-pack/audio-<sha12>.zip     resources/sounds
    lib/balatro/game-pack.json              {version, core: {file, bytes, sha256}, audio: {…}}

The game boots on the core pack alone. The audio pack follows in the background,
and lib/balatro/lua/rmh_web.lua starts Balatro's sound thread once it lands, so
the first-play download is the core, not all of it.

Everything is lossless for what the game can display. data/balatro is 96 MB;
the pack is about a fifth of that:

* The Windows DLLs (dlls/) are dropped. The browser runs LÖVE compiled to
  WebAssembly (public/balatro/engine/), never x86 code.
* Fonts are 61 MB, almost all CJK. The game loads every font at startup but
  only draws text from its own Lua sources (localization files, UI strings,
  numbers, seeds), so each font is subset to every character that appears in
  any .lua file, plus printable ASCII, Latin-1/Latin Extended-A and the common
  punctuation blocks. Layout features and hinting are kept, so every glyph
  rasterises exactly as before. The two GoNoto fonts only ever draw a console
  username (G.F_DISP_USERNAME, nil on PC and web) and keep the Latin core so
  they still load.
* PNGs are recompressed losslessly (oxipng, max level; pixels unchanged).
* Audio is already 128 kb/s Vorbis and is stored as is: re-encoding would lose
  quality.
* The zip is deterministic (fixed timestamps, sorted entries): text and fonts
  deflated at level 9, already-compressed OGG and PNG stored.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import zipfile
from pathlib import Path

from fontTools import subset
import oxipng

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'data' / 'balatro'
OUT_DIR = ROOT / 'data' / 'balatro-pack'
MANIFEST = ROOT / 'lib' / 'balatro' / 'game-pack.json'

EXCLUDE_DIRS = {'dlls'}
STORED = {'.ogg', '.png'}
AUDIO_DIR = 'resources/sounds/'
# Only ever draw G.F_DISP_USERNAME, which is nil off consoles.
USERNAME_ONLY_FONTS = {'GoNotoCurrent-Bold.ttf', 'GoNotoCJKCore.ttf'}

BASE_RANGES = [
    (0x20, 0x7E),  # ASCII
    (0xA0, 0x17F),  # Latin-1 Supplement, Latin Extended-A
    (0x2000, 0x206F),  # General Punctuation
    (0x20A0, 0x20BF),  # Currency
    (0x2190, 0x21FF),  # Arrows
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0xFF00, 0xFFEF),  # Halfwidth and Fullwidth Forms
]


def base_codepoints() -> set[int]:
    cps: set[int] = set()
    for lo, hi in BASE_RANGES:
        cps.update(range(lo, hi + 1))
    return cps


def lua_codepoints() -> set[int]:
    """Every character in every Lua file: all the text the game can draw."""
    cps: set[int] = set()
    for path in SRC.rglob('*.lua'):
        text = path.read_bytes().decode('utf-8', errors='ignore')
        cps.update(ord(c) for c in text if ord(c) >= 0x20)
    return cps


def subset_font(data: bytes, codepoints: set[int]) -> bytes:
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.glyph_names = False
    options.hinting = True
    options.legacy_kern = True
    options.symbol_cmap = True
    options.recalc_bounds = False
    options.recalc_timestamp = False
    font = subset.load_font(io.BytesIO(data), options, dontLoadGlyphNames=True)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    out = io.BytesIO()
    subset.save_font(font, out, options)
    return out.getvalue()


def build_zip(files: list[tuple[str, bytes]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as zf:
        for name, data in files:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.external_attr = 0o644 << 16
            if Path(name).suffix in STORED:
                info.compress_type = zipfile.ZIP_STORED
                zf.writestr(info, data)
            else:
                info.compress_type = zipfile.ZIP_DEFLATED
                zf.writestr(info, data, compresslevel=9)
    return buf.getvalue()


def main() -> int:
    text_cps = base_codepoints() | lua_codepoints()
    latin_cps = base_codepoints()
    files: list[tuple[str, bytes]] = []
    raw_total = 0
    for path in sorted(SRC.rglob('*')):
        if not path.is_file():
            continue
        rel = path.relative_to(SRC)
        if rel.parts[0] in EXCLUDE_DIRS:
            continue
        data = path.read_bytes()
        raw_total += len(data)
        name = rel.as_posix()
        if path.suffix == '.ttf' and path.name != 'm6x11plus.ttf':
            cps = latin_cps if path.name in USERNAME_ONLY_FONTS else text_cps
            data = subset_font(data, cps)
        elif path.suffix == '.png':
            data = oxipng.optimize_from_memory(data, level=6, strip=oxipng.StripChunks.safe())
        files.append((name, data))
        print(f'{name:60s} {len(path.read_bytes()) // 1024:>7} KB -> {len(data) // 1024:>7} KB', file=sys.stderr)

    version = (SRC / 'version.jkr').read_text(encoding='utf-8').splitlines()[0].strip()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob('*.zip'):
        old.unlink()
    manifest: dict = {'version': version}
    for pack_name, members in (
        ('core', [f for f in files if not f[0].startswith(AUDIO_DIR)]),
        ('audio', [f for f in files if f[0].startswith(AUDIO_DIR)]),
    ):
        pack = build_zip(members)
        sha = hashlib.sha256(pack).hexdigest()
        file = f'{pack_name}-{sha[:12]}.zip'
        (OUT_DIR / file).write_bytes(pack)
        manifest[pack_name] = {'file': file, 'bytes': len(pack), 'sha256': sha}
        print(f'{pack_name}: {len(pack) / 1e6:.1f} MB data/balatro-pack/{file}', file=sys.stderr)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'{raw_total / 1e6:.1f} MB source', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
