#!/usr/bin/env python3
"""One-shot importer for the multiplayer (PvP) content's art and strings.

    pip install pyoxipng            # lua5.1 must be on PATH (or LUA51=/path)
    python3 -I scripts/balatro/import-mp-assets.py --mod /path/to/BalatroMultiplayerPvP

Run offline; the output is committed under data/balatro-mp/ and is DATA:
nothing from the mod is executed at runtime, and no mod code is copied. The
owner has permission to reuse the mod's PNGs and localization strings
(docs/balatro-mp.md, PLAN D-25..D-27, EX-20).

What it writes:
    data/balatro-mp/1x/*.png, 2x/*.png     the used sprite sheets, oxipng-optimised
    data/balatro-mp/localization/<lang>.json   the mod's 16 localization tables
    data/balatro-mp/atlases.json           the atlas registry (format: docs/balatro-mp.md §4)
    data/balatro-mp/import-sources.json    provenance: mod version and source hashes

Assets:
* Every PNG in the mod's assets/1x and assets/2x is either KEPT, DROPPED (EX-20:
  unreferenced, the Release ruleset, the Malverk texture pack, alt stakes, mod
  icons) or COMPOSED. An unclassified file is an error, so a mod update cannot
  slip a new sheet past the prune list.
* ec_other_sandbox.png is a 10×10 sheet of which only two cells are used: the
  Echo Deck (2,0) and the Extra Credit sticker (1,1). They are cropped into
  mp_misc.png as cells (0,0) and (1,0) (D-27).
* tag_gambling_sandbox.png is 32×32; vanilla tag cells are 34×34 with the art at
  (1,1)-(33,33), so the sprite is padded by one transparent pixel per side (two at
  2x) to drop into a vanilla-sized tag cell.
* PNGs are recompressed losslessly with oxipng here, once, so the pack builder only
  copies bytes (its output does not depend on the oxipng version installed).

Localization: each mod file is a Lua chunk that returns a table literal. It is
loaded by PUC Lua 5.1 with an EMPTY environment (no globals, no require, no io),
a bytecode refusal and an instruction budget, then dumped as JSON. Only data
survives: a function, a non-string key or a mixed table is an error.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data' / 'balatro-mp'

CARD = (71, 95)
CHIP = (34, 34)

# file name in the mod → registry entry. Keys are `mp_<file stem>`, except the four
# blind-chip animation sheets, which keep the mod's atlas key (`*_blind_chip`,
# `player_blind_col`) because that is what the blind code calls them.
# placeholder = the vanilla atlas to draw from while the file is not in the pack.
KEEP: dict[str, dict] = {
    'Trap.png': {'key': 'mp_Trap', 'size': CARD, 'kind': 'card', 'placeholder': 'Tarot'},
    'trap_pack.png': {'key': 'mp_trap_pack', 'size': CARD, 'kind': 'card', 'placeholder': 'Booster'},
    'standard_giga.png': {'key': 'mp_standard_giga', 'size': CARD, 'kind': 'card', 'placeholder': 'Booster'},
    'decks.png': {'key': 'mp_decks', 'size': CARD, 'kind': 'card', 'placeholder': 'centers'},
    'deck_stickers.png': {'key': 'mp_deck_stickers', 'size': CARD, 'kind': 'card', 'placeholder': 'stickers'},
    'b_heidelberg.png': {'key': 'mp_b_heidelberg', 'size': CARD, 'kind': 'card', 'placeholder': 'centers'},
    'ec_jokers_sandbox.png': {'key': 'mp_ec_jokers_sandbox', 'size': CARD, 'kind': 'card', 'placeholder': 'Joker'},
    'c_asteroid.png': {
        'key': 'mp_c_asteroid',
        'size': CARD,
        'kind': 'card',
        'placeholder': 'Tarot',
        'variants': {'ru': 'c_asteroid_ru.png'},
    },
    'c_ouija_2.png': {'key': 'mp_c_ouija_2', 'size': CARD, 'kind': 'card', 'placeholder': 'Tarot'},
    'player_blind_row.png': {
        'key': 'mp_player_blind_chip',
        'size': CHIP,
        'kind': 'animation',
        'frames': 21,
        'placeholder': 'blind_chips',
    },
    'blind_col.png': {
        'key': 'mp_player_blind_col',
        'size': CHIP,
        'kind': 'animation',
        'frames': 21,
        'placeholder': 'blind_chips',
    },
    'manhunt_hunter_blind_row.png': {
        'key': 'mp_manhunt_hunter_blind_chip',
        'size': CHIP,
        'kind': 'animation',
        'frames': 21,
        'placeholder': 'blind_chips',
    },
    'manhunt_runner_blind_row.png': {
        'key': 'mp_manhunt_runner_blind_chip',
        'size': CHIP,
        'kind': 'animation',
        'frames': 21,
        'placeholder': 'blind_chips',
    },
    'stakes-chips.png': {'key': 'mp_stakes_chips', 'size': (29, 29), 'kind': 'asset', 'placeholder': 'chips'},
    'alt_stickers.png': {'key': 'mp_alt_stickers', 'size': CARD, 'kind': 'card', 'placeholder': 'stickers'},
    'sticker_balanced.png': {'key': 'mp_sticker_balanced', 'size': CARD, 'kind': 'card', 'placeholder': 'stickers'},
    'pvp_title.png': {'key': 'mp_pvp_title', 'size': (333, 216), 'kind': 'asset', 'placeholder': 'balatro'},
}
# Every j_*.png but the unreferenced j_copycat is a one-sprite joker sheet.
JOKER_PLACEHOLDER = 'Joker'

# Variant files (another language's art for an entry above), copied but not entries.
VARIANT_FILES = {v for spec in KEEP.values() for v in spec.get('variants', {}).values()}

# EX-20: unreferenced or dead. The ec_other_sandbox sheet is replaced by mp_misc.png.
DROP = {
    'release_jokers.png',  # only the commented-out Release ruleset (EX-14)
    'j_copycat.png',  # unreferenced
    'stickers.png',  # unreferenced (1x only)
    'pvp_title_base_left.png',  # unreferenced (1x only)
    'pvp_title_base_right.png',
    'sticker_nemesis.png',  # EX-17: registered, never applied
    'alt_mp_stakes.png',  # EX-16: alt stakes
    'modicon.png',  # Steamodded mod badge
}
DROP_PREFIXES = ('alt_t_',)  # the Malverk alternate trap textures
COMPOSED_FROM = {'ec_other_sandbox.png', 'tag_gambling_sandbox.png'}

# D-27: (source cell) → (mp_misc cell). Echo Deck, Extra Credit sticker.
MISC_CELLS = [((2, 0), (0, 0)), ((1, 1), (1, 0))]
MISC_GRID = (2, 1)
TAG_PAD = 1  # 1x pixels of transparent border: 32 → 34


# ─── PNG (8-bit, non-interlaced) ────────────────────────────────────────────


class Image:
    """RGBA8 pixels, row-major."""

    def __init__(self, w: int, h: int, px: bytearray | None = None):
        self.w, self.h = w, h
        self.px = px if px is not None else bytearray(w * h * 4)
        assert len(self.px) == w * h * 4

    def crop(self, x: int, y: int, w: int, h: int) -> 'Image':
        if x < 0 or y < 0 or x + w > self.w or y + h > self.h:
            raise ValueError(f'crop {x},{y} {w}x{h} outside {self.w}x{self.h}')
        out = Image(w, h)
        for row in range(h):
            s = ((y + row) * self.w + x) * 4
            out.px[row * w * 4 : (row + 1) * w * 4] = self.px[s : s + w * 4]
        return out

    def paste(self, src: 'Image', x: int, y: int) -> None:
        if x < 0 or y < 0 or x + src.w > self.w or y + src.h > self.h:
            raise ValueError(f'paste {src.w}x{src.h} at {x},{y} outside {self.w}x{self.h}')
        for row in range(src.h):
            d = ((y + row) * self.w + x) * 4
            self.px[d : d + src.w * 4] = src.px[row * src.w * 4 : (row + 1) * src.w * 4]


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise ValueError('not a PNG')
    return struct.unpack('>II', data[16:24])


def png_decode(data: bytes) -> Image:
    """Decodes 8-bit greyscale, grey+alpha, RGB, RGBA and palette PNGs to RGBA."""
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG')
    pos = 8
    idat = bytearray()
    palette = b''
    trns = b''
    ihdr = None
    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b'IHDR':
            ihdr = struct.unpack('>IIBBBBB', body)
        elif ctype == b'PLTE':
            palette = body
        elif ctype == b'tRNS':
            trns = body
        elif ctype == b'IDAT':
            idat += body
        elif ctype == b'IEND':
            break
    if ihdr is None:
        raise ValueError('PNG without IHDR')
    w, h, depth, color, _comp, _filt, interlace = ihdr
    if depth != 8 or interlace != 0:
        raise ValueError(f'unsupported PNG: depth {depth}, interlace {interlace}')
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(color)
    if channels is None:
        raise ValueError(f'unsupported PNG colour type {color}')
    raw = zlib.decompress(bytes(idat))
    stride = w * channels
    if len(raw) != h * (stride + 1):
        raise ValueError('PNG data length mismatch')
    prev = bytearray(stride)
    out = Image(w, h)
    for y in range(h):
        ftype = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1 : (y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if ftype == 1:
                line[i] = (line[i] + a) & 0xFF
            elif ftype == 2:
                line[i] = (line[i] + b) & 0xFF
            elif ftype == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 0xFF
            elif ftype == 4:
                line[i] = (line[i] + _paeth(a, b, c)) & 0xFF
            elif ftype != 0:
                raise ValueError(f'bad PNG filter {ftype}')
        prev = line
        for x in range(w):
            d = (y * w + x) * 4
            if color == 6:
                out.px[d : d + 4] = line[x * 4 : x * 4 + 4]
            elif color == 2:
                out.px[d : d + 3] = line[x * 3 : x * 3 + 3]
                out.px[d + 3] = 255
            elif color == 0:
                out.px[d : d + 3] = bytes([line[x]] * 3)
                out.px[d + 3] = 255
            elif color == 4:
                out.px[d : d + 3] = bytes([line[x * 2]] * 3)
                out.px[d + 3] = line[x * 2 + 1]
            else:
                idx = line[x]
                if idx * 3 + 3 > len(palette):
                    raise ValueError('palette index out of range')
                out.px[d : d + 3] = palette[idx * 3 : idx * 3 + 3]
                out.px[d + 3] = trns[idx] if idx < len(trns) else 255
    return out


def png_encode(img: Image) -> bytes:
    """RGBA8, filter 0, zlib 9. oxipng picks the real encoding afterwards."""
    stride = img.w * 4
    raw = b''.join(b'\x00' + bytes(img.px[y * stride : (y + 1) * stride]) for y in range(img.h))

    def chunk(ctype: bytes, body: bytes) -> bytes:
        return struct.pack('>I', len(body)) + ctype + body + struct.pack('>I', zlib.crc32(ctype + body) & 0xFFFFFFFF)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', img.w, img.h, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


# ─── Composition (D-27 and the tag cell) ─────────────────────────────────────


def compose_misc(sheet: Image, scale: int) -> Image:
    """Crops the used ec_other_sandbox cells into a 2×1 mp_misc sheet."""
    cw, ch = CARD[0] * scale, CARD[1] * scale
    out = Image(cw * MISC_GRID[0], ch * MISC_GRID[1])
    for (sx, sy), (dx, dy) in MISC_CELLS:
        out.paste(sheet.crop(sx * cw, sy * ch, cw, ch), dx * cw, dy * ch)
    return out


def pad_tag(tag: Image, scale: int) -> Image:
    pad = TAG_PAD * scale
    if (tag.w, tag.h) != ((CHIP[0] - 2 * TAG_PAD) * scale, (CHIP[1] - 2 * TAG_PAD) * scale):
        raise ValueError(f'tag sprite is {tag.w}x{tag.h}, expected {32 * scale}x{32 * scale}')
    out = Image(tag.w + 2 * pad, tag.h + 2 * pad)
    out.paste(tag, pad, pad)
    return out


# ─── Localization (Lua table literal → JSON, sandboxed) ───────────────────────

# Runs under lua5.1. Reads the chunk at arg[1], runs it with an empty environment
# and an instruction budget, and prints the returned table as JSON (sorted keys).
LUA_DUMP = r"""
local path = arg[1]
local fh = assert(io.open(path, 'rb'))
local src = fh:read('*a')
fh:close()
if src:sub(1, 1) == '\27' then error('refusing precompiled bytecode: ' .. path) end
local chunk, err = loadstring(src, '@' .. path)
if not chunk then error(err) end
setfenv(chunk, {})
debug.sethook(function() error('instruction budget exceeded') end, '', 50000000)
local ok, t = pcall(chunk)
debug.sethook()
if not ok then error(t) end
if type(t) ~= 'table' then error('chunk returned ' .. type(t) .. ', not a table') end

local esc = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
local function str(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    return esc[c] or string.format('\\u%04x', c:byte())
  end) .. '"'
end

local out = {}
local function enc(v, where, depth)
  if depth > 32 then error('nesting too deep at ' .. where) end
  local tv = type(v)
  if tv == 'string' then
    out[#out + 1] = str(v)
  elseif tv == 'number' then
    if v ~= v or v == math.huge or v == -math.huge then error('non-finite number at ' .. where) end
    if v == math.floor(v) and math.abs(v) < 2^53 then
      out[#out + 1] = string.format('%d', v)
    else
      out[#out + 1] = string.format('%.17g', v)
    end
  elseif tv == 'boolean' then
    out[#out + 1] = tostring(v)
  elseif tv == 'table' then
    local n, count, strkeys = #v, 0, {}
    for k in pairs(v) do
      count = count + 1
      if type(k) == 'string' then
        strkeys[#strkeys + 1] = k
      elseif type(k) ~= 'number' or k ~= math.floor(k) or k < 1 or k > n then
        error('unsupported key ' .. tostring(k) .. ' at ' .. where)
      end
    end
    if #strkeys == 0 and count == n and n > 0 then
      out[#out + 1] = '['
      for i = 1, n do
        if i > 1 then out[#out + 1] = ',' end
        enc(v[i], where .. '[' .. i .. ']', depth + 1)
      end
      out[#out + 1] = ']'
    elseif #strkeys == count then
      table.sort(strkeys)
      out[#out + 1] = '{'
      for i, k in ipairs(strkeys) do
        if i > 1 then out[#out + 1] = ',' end
        out[#out + 1] = str(k) .. ':'
        enc(v[k], where .. '.' .. k, depth + 1)
      end
      out[#out + 1] = '}'
    else
      error('mixed array/map table at ' .. where)
    end
  else
    error('unsupported value of type ' .. tv .. ' at ' .. where)
  end
end
enc(t, '<root>', 0)
io.write(table.concat(out))
"""


def lua51() -> str:
    return os.environ.get('LUA51') or 'lua5.1'


def run_lua_dump(path: Path) -> dict:
    """Loads a Lua data chunk in an empty sandbox and returns the table it returns.

    The dumper runs as a temp script (lua5.1 sets `arg` only for a script file).
    """

    with tempfile.TemporaryDirectory() as tmp:
        script = Path(tmp) / 'dump.lua'
        script.write_text(LUA_DUMP, encoding='utf-8')
        res = subprocess.run(
            [lua51(), str(script), str(path)],
            capture_output=True,
            timeout=60,
            cwd=tmp,
            env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LUA_PATH': '', 'LUA_CPATH': ''},
        )
    if res.returncode != 0:
        raise ValueError(f'{path.name}: {res.stderr.decode("utf-8", "replace").strip()}')
    return json.loads(res.stdout.decode('utf-8'))


def dump_json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + '\n'


# ─── Import ──────────────────────────────────────────────────────────────────


def classify(name: str) -> str:
    if name in DROP or name.startswith(DROP_PREFIXES):
        return 'drop'
    if name in COMPOSED_FROM:
        return 'compose'
    if name in KEEP or name in VARIANT_FILES:
        return 'keep'
    if name.startswith('j_') and name.endswith('.png'):
        return 'keep'
    return 'unknown'


def registry_entry(name: str) -> tuple[str, dict]:
    if name in KEEP:
        spec = KEEP[name]
    else:  # a one-sprite joker
        spec = {'key': 'mp_' + name[:-4], 'size': CARD, 'kind': 'card', 'placeholder': JOKER_PLACEHOLDER}
    entry = {
        'file': name,
        'px': spec['size'][0],
        'py': spec['size'][1],
        'kind': spec['kind'],
        'frames': spec.get('frames'),
        'placeholder': spec['placeholder'],
    }
    if 'variants' in spec:
        entry['variants'] = dict(sorted(spec['variants'].items()))
    return spec['key'], entry


def optimise(data: bytes) -> bytes:
    import oxipng

    return oxipng.optimize_from_memory(data, level=6, strip=oxipng.StripChunks.safe())


def import_assets(mod: Path, out: Path, sources: dict) -> dict:
    src1, src2 = mod / 'assets' / '1x', mod / 'assets' / '2x'
    names = sorted({p.name for p in src1.glob('*.png')} | {p.name for p in src2.glob('*.png')})
    unknown = [n for n in names if classify(n) == 'unknown']
    if unknown:
        raise SystemExit(f'unclassified mod assets (add to KEEP or DROP): {unknown}')
    for scale in ('1x', '2x'):
        d = out / scale
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob('*.png'):
            old.unlink()

    atlases: dict[str, dict] = {}

    def write(name: str, png1: bytes, png2: bytes) -> None:
        (w1, h1), (w2, h2) = png_size(png1), png_size(png2)
        if (w2, h2) != (2 * w1, 2 * h1):
            raise SystemExit(f'{name}: 2x is {w2}x{h2}, expected {2 * w1}x{2 * h1}')
        (out / '1x' / name).write_bytes(optimise(png1))
        (out / '2x' / name).write_bytes(optimise(png2))

    for name in names:
        kind = classify(name)
        if kind != 'keep':
            continue
        p1, p2 = src1 / name, src2 / name
        if not p1.exists() or not p2.exists():
            raise SystemExit(f'{name}: missing at {"1x" if not p1.exists() else "2x"}')
        b1, b2 = p1.read_bytes(), p2.read_bytes()
        sources[f'1x/{name}'] = hashlib.sha256(b1).hexdigest()
        sources[f'2x/{name}'] = hashlib.sha256(b2).hexdigest()
        write(name, b1, b2)
        if name not in VARIANT_FILES:
            key, entry = registry_entry(name)
            atlases[key] = entry

    # D-27: mp_misc.png from the two used ec_other_sandbox cells.
    misc = []
    for scale, d in ((1, src1), (2, src2)):
        b = (d / 'ec_other_sandbox.png').read_bytes()
        sources[f'{scale}x/ec_other_sandbox.png'] = hashlib.sha256(b).hexdigest()
        misc.append(png_encode(compose_misc(png_decode(b), scale)))
    write('mp_misc.png', misc[0], misc[1])
    atlases['mp_misc'] = {
        'file': 'mp_misc.png',
        'px': CARD[0],
        'py': CARD[1],
        'kind': 'card',
        'frames': None,
        'placeholder': 'centers',
    }

    # The Gambling Tag padded into a vanilla 34×34 tag cell.
    tags = []
    for scale, d in ((1, src1), (2, src2)):
        b = (d / 'tag_gambling_sandbox.png').read_bytes()
        sources[f'{scale}x/tag_gambling_sandbox.png'] = hashlib.sha256(b).hexdigest()
        tags.append(png_encode(pad_tag(png_decode(b), scale)))
    write('tag_gambling_sandbox.png', tags[0], tags[1])
    atlases['mp_tag_gambling_sandbox'] = {
        'file': 'tag_gambling_sandbox.png',
        'px': CHIP[0],
        'py': CHIP[1],
        'kind': 'tag',
        'frames': None,
        'placeholder': 'tags',
    }
    return dict(sorted(atlases.items()))


def import_localization(mod: Path, out: Path, sources: dict) -> list[str]:
    d = out / 'localization'
    d.mkdir(parents=True, exist_ok=True)
    for old in d.glob('*.json'):
        old.unlink()
    langs = []
    for path in sorted((mod / 'localization').glob('*.lua')):
        data = run_lua_dump(path)
        sources[f'localization/{path.name}'] = hashlib.sha256(path.read_bytes()).hexdigest()
        (d / f'{path.stem}.json').write_text(dump_json(data), encoding='utf-8')
        langs.append(path.stem)
    return langs


ATLAS_COMMENT = (
    'MP atlas registry, generated by scripts/balatro/import-mp-assets.py (do not edit by hand; '
    'change the importer and re-run it). Format: docs/balatro-mp.md section "Atlas registry". '
    'Files live in data/balatro-mp/{1x,2x}/ and ship in the mp pack at rmh_mp/assets/{1x,2x}/; '
    'the builder also emits this registry as the Lua table rmh_mp/data/atlases.lua.'
)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--mod', required=True, type=Path, help='the BalatroMultiplayerPvP checkout')
    ap.add_argument('--out', type=Path, default=OUT)
    args = ap.parse_args(argv)
    mod: Path = args.mod.resolve()
    out: Path = args.out.resolve()
    if not (mod / 'assets' / '1x').is_dir() or not (mod / 'localization').is_dir():
        raise SystemExit(f'{mod} does not look like the PvP mod (assets/1x, localization/)')
    sources: dict[str, str] = {}
    atlases = import_assets(mod, out, sources)
    langs = import_localization(mod, out, sources)
    registry = {'$comment': ATLAS_COMMENT, 'version': 1, 'stub': False, 'atlases': atlases}
    (out / 'atlases.json').write_text(json.dumps(registry, indent=2) + '\n', encoding='utf-8')
    version = None
    manifest = mod / 'manifest.json'
    if manifest.exists():
        version = json.loads(manifest.read_text(encoding='utf-8')).get('version_number')
    provenance = {
        '$comment': 'Where data/balatro-mp came from (written by scripts/balatro/import-mp-assets.py).',
        'mod': 'BalatroMultiplayerPvP',
        'modVersion': version,
        'languages': langs,
        'sha256': dict(sorted(sources.items())),
    }
    (out / 'import-sources.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    print(f'{len(atlases)} atlases, {len(langs)} languages -> {out}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
