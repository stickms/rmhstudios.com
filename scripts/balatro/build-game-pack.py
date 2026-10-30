#!/usr/bin/env python3
"""Builds the Balatro game packs that /balatro downloads, from data/balatro (and
the multiplayer pack from lib/balatro/lua/mp + data/balatro-mp).

    pip install fonttools pyoxipng
    python3 -I scripts/balatro/build-game-pack.py            # rebuild every pack + the manifest
    python3 -I scripts/balatro/build-game-pack.py --mp-only  # rebuild only the mp pack (pnpm balatro:mp-pack)
    python3 -I scripts/balatro/build-game-pack.py --check    # freshness: rebuild in memory, compare, write nothing
    python3 -I scripts/balatro/build-game-pack.py --check --mp-only
    python3 -I scripts/balatro/build-game-pack.py --out DIR  # write the zips + game-pack.json to DIR instead

Output (committed; zip names are content-addressed, so they can be cached
forever). The packs are NOT under public/: /balatro is signed-in only, so they
are served by app/routes/api/balatro/pack.$file.ts behind the session check.
    data/balatro-pack/core-<sha12>.zip      everything but the audio
    data/balatro-pack/audio-<sha12>.zip     resources/sounds
    data/balatro-pack/mp-<sha12>.zip        the multiplayer pack (rmh_mp/**), loaded lazily
    lib/balatro/game-pack.json              {version, core: {file, bytes, sha256}, audio: {…}, mp: {…}}

The game boots on the core pack alone. The audio pack follows in the background,
and lib/balatro/lua/rmh_web.lua starts Balatro's sound thread once it lands, so
the first-play download is the core, not all of it. The mp pack is fetched only
when multiplayer is opened (docs/balatro-mp.md).

Everything is lossless for what the game can display. data/balatro is 96 MB;
the pack is about a fifth of that:

* The Windows DLLs (dlls/) are dropped. The browser runs LÖVE compiled to
  WebAssembly (public/balatro/engine/), never x86 code.
* Fonts are 61 MB, almost all CJK. The game loads every font at startup but
  only draws text from its own Lua sources (localization files, UI strings,
  numbers, seeds), so each font is subset to every character that appears in
  any .lua file, plus printable ASCII, Latin-1/Latin Extended-A and the common
  punctuation blocks, plus every character of the multiplayer localization that
  ships in the mp pack (so MP text never draws as tofu once the pack loads; the
  core changes when that text does). Layout features and hinting are kept, so
  every glyph rasterises exactly as before. The two GoNoto fonts only ever draw a
  console username (G.F_DISP_USERNAME, nil on PC and web) and keep the Latin core
  so they still load.
* PNGs are recompressed losslessly (oxipng, max level; pixels unchanged). The MP
  PNGs were optimised once by scripts/balatro/import-mp-assets.py and are copied.
* Audio is already 128 kb/s Vorbis and is stored as is: re-encoding would lose
  quality.
* The zip is deterministic (fixed timestamps, sorted entries): text and fonts
  deflated at level 9, already-compressed OGG and PNG stored.

The mp pack (all under rmh_mp/, extracted to /Balatro/rmh_mp/):
    rmh_mp/**.lua                 lib/balatro/lua/mp/rmh_mp/** (no *_spec.lua)
    rmh_mp/assets/{1x,2x}/*.png   data/balatro-mp/{1x,2x}/
    rmh_mp/data/atlases.lua       data/balatro-mp/atlases.json as a Lua table
    rmh_mp/loc/<lang>.lua         generated Lua tables (see build_loc)
    rmh_mp/glyphs.bin             per-font codepoint bitmap (see glyph_bitmap)

Budgets (data/balatro-mp/pack-budget.json) fail the build and --check.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import struct
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'data' / 'balatro'
OUT_DIR = ROOT / 'data' / 'balatro-pack'
MANIFEST = ROOT / 'lib' / 'balatro' / 'game-pack.json'
MP_DATA = ROOT / 'data' / 'balatro-mp'
MP_LUA = ROOT / 'lib' / 'balatro' / 'lua' / 'mp' / 'rmh_mp'
BUDGET = MP_DATA / 'pack-budget.json'

EXCLUDE_DIRS = {'dlls'}
STORED = {'.ogg', '.png'}
AUDIO_DIR = 'resources/sounds/'
# Only ever draw G.F_DISP_USERNAME, which is nil off consoles.
USERNAME_ONLY_FONTS = {'GoNotoCurrent-Bold.ttf', 'GoNotoCJKCore.ttf'}
# Never subset (the pixel font; it is small and covers what it covers).
UNSUBSET_FONTS = {'m6x11plus.ttf'}

BASE_RANGES = [
    (0x20, 0x7E),  # ASCII
    (0xA0, 0x17F),  # Latin-1 Supplement, Latin Extended-A
    (0x2000, 0x206F),  # General Punctuation
    (0x20A0, 0x20BF),  # Currency
    (0x2190, 0x21FF),  # Arrows
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0xFF00, 0xFFEF),  # Halfwidth and Fullwidth Forms
]

# Anchored source patches applied to data/balatro Lua as it goes into the core
# pack: (path, anchor, replacement). Each anchor must occur exactly once, or the
# build fails, as does a patch whose file is not in the source. Streams request
# entries through WS2 (PLAN WS6).
CORE_PATCHES: list[tuple[str, str, str]] = [
    # WS6: the round-eval row label for MP rows (the comeback bonus). The hook is
    # nil outside multiplayer, so single player takes the vanilla branches. Same
    # line, so line numbers in error traces are unchanged.
    (
        'functions/common_events.lua',
        "elseif config.name == 'hands' then",
        'elseif RMH_MP and RMH_MP.eval_row_label and RMH_MP.eval_row_label(config, left_text, scale, num_dollars) then'
        " elseif config.name == 'hands' then",
    ),
]

GLYPHS_MAGIC = b'RMHG'
GLYPHS_VERSION = 1


# ─── Text and fonts ──────────────────────────────────────────────────────────


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


def text_codepoints(values) -> set[int]:
    cps: set[int] = set()
    for s in values:
        cps.update(ord(c) for c in s if ord(c) >= 0x20)
    return cps


def game_fonts() -> tuple[list[str], dict[str, int]]:
    """G.FONTS file order and each selectable language's font index (0-based), read
    from game.lua so a game update cannot silently desynchronise them."""
    src = (SRC / 'game.lua').read_text(encoding='utf-8')
    block = src[src.index('self.FONTS = {') :]
    block = block[: block.index('\n        }')]
    files = re.findall(r'\{file = "(resources/fonts/[^"]+)"', block)
    langs: dict[str, int] = {}
    for key, font, rest in re.findall(r"\['([\w-]+)'\] = \{font = (\d+),([^\n]*)", src):
        if 'omit = true' in rest:
            continue
        langs[key] = int(font) - 1
    if not files or 'en-us' not in langs or max(langs.values()) >= len(files):
        raise SystemExit('could not read G.FONTS / G.LANGUAGES from data/balatro/game.lua')
    return files, langs


def font_cmap(path: Path) -> set[int]:
    from fontTools.ttLib import TTFont

    font = TTFont(str(path), lazy=True)
    try:
        return set(font.getBestCmap().keys())
    finally:
        font.close()


def font_plan(font_files: list[str], game_langs: dict[str, int]) -> dict[str, set[int] | None]:
    """{font file name: the codepoints it is subset to, or None = kept whole}.

    Every text font gets the vanilla set (base ranges + every character of every
    vanilla .lua file) plus the English MP text, which every language falls back to.
    A language's own MP text goes only into that language's font: the MP Japanese
    lands in NotoSansJP, not in the Korean or Chinese fonts as well, which keeps the
    core pack's growth small (folding all MP text into every font added ~108 KB)."""
    vanilla = base_codepoints() | lua_codepoints()
    tables = build_loc(sorted(game_langs), [])
    english = text_codepoints(strings_of(tables['en-us']))
    own: dict[str, set[int]] = {}
    for lang, table in tables.items():
        if lang != 'en-us':
            own.setdefault(Path(font_files[game_langs[lang]]).name, set()).update(text_codepoints(strings_of(table)))
    plan: dict[str, set[int] | None] = {}
    for path in sorted((SRC / 'resources' / 'fonts').glob('*.ttf')):
        if path.name in UNSUBSET_FONTS:
            plan[path.name] = None
        elif path.name in USERNAME_ONLY_FONTS:
            plan[path.name] = base_codepoints()
        else:
            plan[path.name] = vanilla | english | own.get(path.name, set())
    return plan


def subset_font(data: bytes, codepoints: set[int]) -> bytes:
    from fontTools import subset

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


# ─── Zips ────────────────────────────────────────────────────────────────────


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


def apply_patches(name: str, data: bytes, patches=None) -> bytes:
    for path, anchor, replacement in CORE_PATCHES if patches is None else patches:
        if path != name:
            continue
        text = data.decode('utf-8')
        if text.count(anchor) != 1:
            raise SystemExit(f'core patch anchor for {path} found {text.count(anchor)} times, expected once')
        data = text.replace(anchor, replacement).encode('utf-8')
    return data


# ─── MP localization ─────────────────────────────────────────────────────────

ENTRY_KEYS = {'name', 'text', 'unlock'}
PLACEHOLDER = re.compile(r'#(\d+)#')


def strings_of(v) -> list[str]:
    if isinstance(v, str):
        return [v]
    if isinstance(v, list):
        return [s for x in v for s in strings_of(x)]
    if isinstance(v, dict):
        return [s for k in sorted(v) for s in strings_of(v[k])]
    return []


def is_entry(v) -> bool:
    """A loc entry is replaced whole, never merged: a description {name, text}, a
    string, or a list of lines."""
    return not isinstance(v, dict) or (bool(v) and set(v) <= ENTRY_KEYS)


def placeholders(v) -> set[str]:
    return {m for s in strings_of(v) for m in PLACEHOLDER.findall(s)}


def same_shape(a, b) -> bool:
    if isinstance(a, dict) and isinstance(b, dict):
        return set(b) <= set(a) and all(same_shape(a[k], b[k]) for k in b)
    if isinstance(a, list) and isinstance(b, list):
        return all(isinstance(x, (str, list)) for x in b)
    return isinstance(a, str) and isinstance(b, str)


def prune_translation(en: dict, tr: dict, where: str, report: list[str]) -> dict:
    """The part of a translation the game can use: keys English has, the same shape,
    and no #n# placeholder English does not fill. Everything else falls back to
    English (the runtime merges the language over en-us per entry)."""
    out: dict = {}
    for k in sorted(tr):
        here = f'{where}.{k}'
        if k not in en:
            report.append(f'unused {here}')
            continue
        a, b = en[k], tr[k]
        if is_entry(a):
            if not same_shape(a, b) or (isinstance(a, dict) != isinstance(b, dict)):
                report.append(f'shape {here}')
            elif not placeholders(b) <= placeholders(a):
                report.append(f'placeholder {here}')
            elif strings_of(b):
                out[k] = b
        elif isinstance(b, dict):
            sub = prune_translation(a, b, here, report)
            if sub:
                out[k] = sub
        else:
            report.append(f'shape {here}')
    return out


def merge_extras(base: dict, extra: dict, where: str = '') -> dict:
    out = dict(base)
    for k, v in extra.items():
        if k.startswith('$'):
            continue
        if k in out:
            if is_entry(v) or is_entry(out[k]):
                raise SystemExit(f'extra-strings key {where}.{k} collides with the mod localization')
            out[k] = merge_extras(out[k], v, f'{where}.{k}')
        else:
            out[k] = v
    return out


# ASCII stand-ins for typographic punctuation, used only where the font lacks the glyph.
GLYPH_FALLBACK = {
    '\u2018': "'", '\u2019': "'", '\u201a': ',', '\u201c': '"', '\u201d': '"', '\u201e': '"',
    '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u00a0': ' ', '\u202f': ' ', '\u2009': ' ',
}  # fmt: skip


def with_fallback_glyphs(v, covered: set[int]):
    if isinstance(v, str):
        return ''.join(GLYPH_FALLBACK.get(c, c) if ord(c) not in covered else c for c in v)
    if isinstance(v, list):
        return [with_fallback_glyphs(x, covered) for x in v]
    if isinstance(v, dict):
        return {k: with_fallback_glyphs(x, covered) for k, x in v.items()}
    return v


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


# Mod localization for content this port does not ship (PLAN §2.13), dropped from every
# language so it neither ships nor pulls glyphs into the core fonts: the Release ruleset
# (EX-14), Baron/Mime/White Deck (EX-15), alt stakes (EX-16), and entries A2 §14 found
# no live object for (j_broken, j_mp_idol, j_to_the_moon_mp, the m_gold balanced note).
DEAD_LOC = re.compile(
    r'_release$'
    r'|^(j_mp_baron|j_mp_mime|j_mp_idol|j_broken|j_to_the_moon_mp|b_mp_white)$'
    r'|^mp_sticker_balanced_(m_gold|j_mp_baron|j_mp_mime)$'
    r'|^stake_mp_(plastic|pebble|ferrite|pyrite|crystal|jade|antimatter)$'
)


def drop_dead(t: dict) -> dict:
    return {k: v if is_entry(v) else drop_dead(v) for k, v in t.items() if not DEAD_LOC.search(k)}


def build_loc(game_langs: list[str], report: list[str]) -> dict[str, dict]:
    """{lang: table} for every game language with MP text. en-us is complete (the
    mod's en-us + extra-strings.en-us.json). Every other language holds only the
    entries it translates; the runtime lays it over en-us (per entry), so a missing
    key reads English. mi and vi are imported but not shipped: the game has no such
    language setting."""
    loc_dir = MP_DATA / 'localization'
    en = merge_extras(drop_dead(read_json(loc_dir / 'en-us.json')), read_json(MP_DATA / 'extra-strings.en-us.json'))
    tables = {'en-us': en}
    for lang in game_langs:
        if lang == 'en-us':
            continue
        tr: dict = {}
        if (loc_dir / f'{lang}.json').exists():
            tr = read_json(loc_dir / f'{lang}.json')
        extra = MP_DATA / f'extra-strings.{lang}.json'
        if extra.exists():
            tr = merge_extras(tr, read_json(extra))
        pruned = prune_translation(en, tr, lang, report)
        if pruned:
            tables[lang] = pruned
    return tables


LUA_IDENT = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')
LUA_KEYWORDS = {
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in',
    'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
}  # fmt: skip


def lua_str(s: str) -> str:
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == '\\':
            out.append('\\\\')
        elif ch == '\n':
            out.append('\\n')
        elif o < 0x20 or o == 0x7F:
            out.append(f'\\{o:03d}')
        else:
            out.append(ch)
    out.append('"')
    return ''.join(out)


def lua_value(v) -> str:
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if v is None:
        raise ValueError('nil has no place in a Lua table literal')
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if v != v or v in (float('inf'), float('-inf')):
            raise ValueError('non-finite number')
        return repr(v)
    if isinstance(v, str):
        return lua_str(v)
    if isinstance(v, list):
        return '{' + ','.join(lua_value(x) for x in v) + '}'
    if isinstance(v, dict):
        parts = []
        for k in sorted(v):
            key = k if LUA_IDENT.match(k) and k not in LUA_KEYWORDS else '[' + lua_str(k) + ']'
            parts.append(f'{key}={lua_value(v[k])}')
        return '{' + ','.join(parts) + '}'
    raise ValueError(f'unsupported value {v!r}')


def lua_module(comment: str, v) -> bytes:
    return f'-- {comment}\nreturn {lua_value(v)}\n'.encode('utf-8')


# ─── Glyph bitmap ────────────────────────────────────────────────────────────


def glyph_bitmap(fonts: list[tuple[str, set[int]]], langs: dict[str, int]) -> bytes:
    """rmh_mp/glyphs.bin, little-endian:
        'RMHG'  u8 version=1  u8 fontCount  u8 langCount  u8 0
        fontCount × { u8 nameLen, name (UTF-8: the G.FONTS file, e.g. resources/fonts/m6x11plus.ttf),
                      u32 byteLen, bitmap }   bit (cp & 7) of byte (cp >> 3) set ⇔ the shipped font draws cp
        langCount × { u8 keyLen, key (the G.LANGUAGES key, e.g. en-us), u8 fontIndex }
    The bitmap covers exactly what the core pack's (subset) font maps, so TypeScript can
    replace anything a player name or chat line uses that would draw as tofu."""
    out = bytearray(GLYPHS_MAGIC)
    out += struct.pack('<BBBB', GLYPHS_VERSION, len(fonts), len(langs), 0)
    for name, cps in fonts:
        nb = name.encode('utf-8')
        bits = bytearray((max(cps) >> 3) + 1 if cps else 0)
        for cp in cps:
            bits[cp >> 3] |= 1 << (cp & 7)
        out += struct.pack('<B', len(nb)) + nb + struct.pack('<I', len(bits)) + bits
    for key in sorted(langs):
        kb = key.encode('utf-8')
        out += struct.pack('<B', len(kb)) + kb + struct.pack('<B', langs[key])
    return bytes(out)


# ─── MP pack ─────────────────────────────────────────────────────────────────

GENERATED = ('rmh_mp/assets/', 'rmh_mp/loc/', 'rmh_mp/data/', 'rmh_mp/glyphs.bin')


def mp_lua_files() -> list[tuple[str, bytes]]:
    files = []
    if not MP_LUA.is_dir():
        return files
    for path in sorted(MP_LUA.rglob('*.lua')):
        if path.name.endswith('_spec.lua'):
            continue
        name = 'rmh_mp/' + path.relative_to(MP_LUA).as_posix()
        if name.startswith(GENERATED):
            raise SystemExit(f'{name} collides with a generated mp pack path')
        files.append((name, path.read_bytes()))
    return files


def mp_assets() -> tuple[dict, list[tuple[str, bytes]]]:
    registry = read_json(MP_DATA / 'atlases.json')
    if registry.get('stub'):
        raise SystemExit('data/balatro-mp/atlases.json is still the stub; run scripts/balatro/import-mp-assets.py')
    files = []
    for scale in ('1x', '2x'):
        for path in sorted((MP_DATA / scale).glob('*.png')):
            files.append((f'rmh_mp/assets/{scale}/{path.name}', path.read_bytes()))
    shipped = {n for n, _ in files}
    for key, entry in registry['atlases'].items():
        for file in [entry['file'], *entry.get('variants', {}).values()]:
            for scale in ('1x', '2x'):
                if f'rmh_mp/assets/{scale}/{file}' not in shipped:
                    raise SystemExit(f'atlas {key}: {scale}/{file} is missing from data/balatro-mp')
    return registry, files


def build_mp(game_langs: dict[str, int], font_files: list[str], plan: dict[str, set[int] | None]):
    """Returns (zip bytes, extracted bytes, report lines)."""
    report: list[str] = []
    registry, assets = mp_assets()
    tables = build_loc(sorted(game_langs), report)
    files = mp_lua_files() + assets
    atl = {k: {f: v for f, v in e.items() if v is not None} for k, e in registry['atlases'].items()}
    files.append(('rmh_mp/data/atlases.lua', lua_module('Generated from data/balatro-mp/atlases.json by build-game-pack.py.', atl)))

    # Glyph bitmap: what each shipped font actually maps.
    unique: list[str] = []
    for f in font_files:
        if f not in unique:
            unique.append(f)
    fonts = []
    for f in unique:
        cmap = font_cmap(SRC / f)
        cps = plan[Path(f).name]
        fonts.append((f, cmap if cps is None else cmap & cps))
    lang_font = {lang: unique.index(font_files[i]) for lang, i in game_langs.items()}
    files.append(('rmh_mp/glyphs.bin', glyph_bitmap(fonts, lang_font)))

    # Typographic punctuation a language's font lacks becomes its ASCII form, in that
    # language's own table (the mod's French uses U+2019, which m6x11plus has no glyph for).
    for lang in sorted(tables):
        if lang != 'en-us':
            tables[lang] = with_fallback_glyphs(tables[lang], fonts[lang_font[lang]][1])
    for lang in sorted(tables):
        comment = f'MP localization ({lang}), generated by build-game-pack.py from data/balatro-mp.'
        if lang != 'en-us':
            comment += ' Partial: lay it over en-us per entry.'
        files.append((f'rmh_mp/loc/{lang}.lua', lua_module(comment, tables[lang])))

    # Coverage: every MP string a language can show, in that language's font.
    for lang in sorted(game_langs):
        covered = fonts[lang_font[lang]][1]
        shown = set(text_codepoints(strings_of(tables['en-us']))) | text_codepoints(strings_of(tables.get(lang, {})))
        missing = sorted(shown - covered)
        if missing:
            report.append(f'glyphs {lang}: {"".join(chr(c) for c in missing)!r} not in {unique[lang_font[lang]]}')

    files.sort(key=lambda f: f[0])
    names = [n for n, _ in files]
    if len(names) != len(set(names)):
        raise SystemExit('duplicate path in the mp pack')
    return build_zip(files), sum(len(d) for _, d in files), report


# ─── Main ────────────────────────────────────────────────────────────────────


def build_core_and_audio(plan: dict[str, set[int] | None]) -> tuple[dict[str, bytes], int]:
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
        if path.suffix == '.ttf':
            cps = plan[path.name]
            if cps is not None:
                data = subset_font(data, cps)
        elif path.suffix == '.png':
            import oxipng

            data = oxipng.optimize_from_memory(data, level=6, strip=oxipng.StripChunks.safe())
        elif path.suffix == '.lua':
            data = apply_patches(name, data)
        files.append((name, data))
        print(f'{name:60s} {len(path.read_bytes()) // 1024:>7} KB -> {len(data) // 1024:>7} KB', file=sys.stderr)
    missing = sorted({p for p, _, _ in CORE_PATCHES} - {n for n, _ in files})
    if missing:
        raise SystemExit(f'core patches name files not in data/balatro: {missing}')
    packs = {
        'core': build_zip([f for f in files if not f[0].startswith(AUDIO_DIR)]),
        'audio': build_zip([f for f in files if f[0].startswith(AUDIO_DIR)]),
    }
    return packs, raw_total


def entry(kind: str, data: bytes) -> dict:
    sha = hashlib.sha256(data).hexdigest()
    return {'file': f'{kind}-{sha[:12]}.zip', 'bytes': len(data), 'sha256': sha}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description='Build the /balatro game packs.')
    ap.add_argument('--check', action='store_true', help='rebuild in memory; exit 1 if the committed packs are stale')
    ap.add_argument('--mp-only', action='store_true', help='only the mp pack (core and audio left as they are)')
    ap.add_argument('--out', type=Path, help='write zips and game-pack.json here instead of the repo')
    ap.add_argument('--verbose', action='store_true', help='list every translation entry dropped to English')
    args = ap.parse_args(argv)

    budget = read_json(BUDGET)
    font_files, game_langs = game_fonts()
    plan = font_plan(font_files, game_langs)

    old_manifest = read_json(MANIFEST)
    built: dict[str, bytes] = {}
    if not args.mp_only:
        packs, raw_total = build_core_and_audio(plan)
        built.update(packs)
        print(f'{raw_total / 1e6:.1f} MB source', file=sys.stderr)
    mp_zip, mp_extracted, report = build_mp(game_langs, font_files, plan)
    built['mp'] = mp_zip
    summary: dict[str, int] = {}
    for line in report:
        if args.verbose or line.startswith('glyphs '):
            print(f'mp: {line}', file=sys.stderr)
        else:
            what, where = line.split(' ', 1)
            tag = f'{where.split(".")[0]} {what}'
            summary[tag] = summary.get(tag, 0) + 1
    if summary:
        print('mp: translation entries falling back to English (--verbose lists them): '
              + ', '.join(f'{k} {v}' for k, v in sorted(summary.items())), file=sys.stderr)

    errors = []
    glyph_gaps = [r for r in report if r.startswith('glyphs ')]
    if glyph_gaps:
        errors.append('MP text the fonts cannot draw: ' + '; '.join(glyph_gaps))
    core_max = budget['coreBaselineBytes'] + budget['coreGrowthMaxBytes']
    if 'core' in built and len(built['core']) > core_max:
        errors.append(f'core pack {len(built["core"])} B is over its budget {core_max} B')
    if len(mp_zip) > budget['mpMaxBytes']:
        errors.append(f'mp pack {len(mp_zip)} B is over its budget {budget["mpMaxBytes"]} B')
    if mp_extracted > budget['mpMaxExtractedBytes']:
        errors.append(f'mp pack extracts to {mp_extracted} B, over {budget["mpMaxExtractedBytes"]} B')

    manifest: dict = {'version': (SRC / 'version.jkr').read_text(encoding='utf-8').splitlines()[0].strip()}
    for kind in ('core', 'audio', 'mp'):
        if kind in built:
            manifest[kind] = entry(kind, built[kind])
        elif kind in old_manifest:
            manifest[kind] = old_manifest[kind]
    for kind, data in built.items():
        print(f'{kind}: {len(data):,} B ({manifest[kind]["file"]})', file=sys.stderr)
    print(f'mp: {mp_extracted:,} B extracted', file=sys.stderr)

    if args.check:
        stale = []
        for kind in built:
            if old_manifest.get(kind) != manifest[kind]:
                stale.append(f'{kind} ({old_manifest.get(kind, {}).get("file")} -> {manifest[kind]["file"]})')
            elif not (OUT_DIR / manifest[kind]['file']).is_file():
                stale.append(f'{kind} (data/balatro-pack/{manifest[kind]["file"]} missing)')
        if old_manifest.get('version') != manifest['version']:
            stale.append('version')
        if not args.mp_only:
            expected = {manifest[k]['file'] for k in ('core', 'audio', 'mp')}
            extra = sorted(p.name for p in OUT_DIR.glob('*.zip') if p.name not in expected)
            if extra:
                stale.append(f'unreferenced zips in data/balatro-pack: {extra}')
        if stale:
            errors.append('stale packs: ' + ', '.join(stale) + '. Rebuild: python3 -I scripts/balatro/build-game-pack.py')
        for e in errors:
            print(f'error: {e}', file=sys.stderr)
        if not errors:
            print('packs are fresh', file=sys.stderr)
        return 1 if errors else 0

    if errors:
        for e in errors:
            print(f'error: {e}', file=sys.stderr)
        return 1
    out_dir = args.out if args.out else OUT_DIR
    out_manifest = (args.out / 'game-pack.json') if args.out else MANIFEST
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('*.zip'):
        if args.mp_only and not old.name.startswith('mp-'):
            continue
        old.unlink()
    for kind, data in built.items():
        (out_dir / manifest[kind]['file']).write_bytes(data)
    out_manifest.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
