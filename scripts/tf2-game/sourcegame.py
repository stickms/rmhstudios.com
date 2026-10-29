"""What a single-player Source map asks of the sound system, read from the game files.

Shared by `sound-list.py --game hl2|portal` and `sounds.py`. Pure readers, no game-specific policy:

  * `read_bsp(raw)` — a BSP's entity lump, texture names, static prop models and pakfile
    (bspfile.h: VBSP v19-21, LZMA-compressed lumps as the engine stores them);
  * `material_surfaces(fs, names, pak)` — `$surfaceprop` of each material (VMT `include` patches
    followed), the surfaces whose footsteps and impacts the player hears;
  * `model_surfaceprop(raw)` — studiohdr_t's surface property of a prop;
  * `SceneImage(raw)` — `scenes/scenes.image` (SDK: SceneImageFile.h): the scene directory by
    CRC of `scenes\\…\\x.vcd`, each scene's summary (duration and the sounds it speaks) and its
    compiled VCD (choreoscene.cpp `RestoreFromBinaryBuffer`, `bvcd` v4) for the speak events'
    start times, actors and caption tokens;
  * `parse_soundscapes(text)` — `scripts/soundscapes_*.txt` as the client's soundscape system
    reads them (c_soundscape.cpp), with the waves each one plays;
  * `read_captions_txt(raw)` / `CaptionsDat(raw)` — `resource/closecaption_<lang>.txt` (UTF-16
    KeyValues) and its compiled `.dat` (captioncompiler.h: VCCD v1, CRC32 of the lowercase token),
    and `reduce_caption(text)`, which turns the HUD's markup into what the browser renders.
"""
import io
import lzma
import os
import re
import struct
import sys
import zipfile
import zlib

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sounds  # noqa: E402  (parse_kv, wave_path)

# ---------------------------------------------------------------------------------------------- LZMA

def valve_lzma(raw):
    """Valve's lzma_header_t (`LZMA`, actualSize, lzmaSize, props[5]) + raw stream -> bytes."""
    if raw[:4] != b"LZMA" or len(raw) < 17:
        return raw
    actual, _packed = struct.unpack_from("<II", raw, 4)
    alone = raw[12:17] + struct.pack("<Q", actual) + raw[17:]
    out = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE).decompress(alone)
    return out[:actual]


# ---------------------------------------------------------------------------------------------- BSP

LUMP_ENTITIES, LUMP_GAME_LUMP, LUMP_PAKFILE = 0, 35, 40
LUMP_TEXDATA_STRING_DATA, LUMP_TEXDATA_STRING_TABLE = 43, 44


def _lump(raw, i):
    ofs, length, _ver, ident = struct.unpack_from("<iiii", raw, 8 + i * 16)
    data = raw[ofs:ofs + length]
    return valve_lzma(data) if data[:4] == b"LZMA" else data


def parse_entities(text):
    """The entity lump: a flat list of `{ "key" "value" … }` blocks -> [{key: value}] (lowercase
    keys, the first value of a repeated key; `_pairs` keeps every pair in order — outputs repeat)."""
    ents = []
    for block in re.finditer(r"\{([^{}]*)\}", text):
        pairs = [(k.lower(), v) for k, v in re.findall(r'"([^"]*)"\s*"([^"]*)"', block.group(1))]
        ent = {}
        for k, v in pairs:
            ent.setdefault(k, v)
        ent["_pairs"] = pairs
        ents.append(ent)
    return ents


def read_bsp(raw):
    """-> {entities, textures, props, pak} of a VBSP (v19-21)."""
    if raw[:4] != b"VBSP":
        raise ValueError("not a VBSP file")
    ents = parse_entities(_lump(raw, LUMP_ENTITIES).decode("latin-1").rstrip("\0"))
    data = _lump(raw, LUMP_TEXDATA_STRING_DATA)
    table = _lump(raw, LUMP_TEXDATA_STRING_TABLE)
    textures = []
    for (off,) in struct.iter_unpack("<i", table[:len(table) // 4 * 4]):
        end = data.find(b"\0", off)
        textures.append(data[off:end if end >= 0 else len(data)].decode("latin-1").lower().replace("\\", "/"))
    props = set()
    game = _lump(raw, LUMP_GAME_LUMP)
    if len(game) >= 4:
        (count,) = struct.unpack_from("<i", game, 0)
        for i in range(count):
            gid, _flags, _ver, ofs, length = struct.unpack_from("<iHHii", game, 4 + i * 16)
            if gid != 0x73707270:  # 'sprp'
                continue
            body = raw[ofs:ofs + length]
            if body[:4] == b"LZMA":
                body = valve_lzma(body)
            (n,) = struct.unpack_from("<i", body, 0)
            for j in range(n):
                props.add(body[4 + j * 128:4 + (j + 1) * 128].split(b"\0", 1)[0].decode("latin-1").lower())
    pak = None
    pakraw = _lump(raw, LUMP_PAKFILE)
    if pakraw:
        try:
            pak = zipfile.ZipFile(io.BytesIO(pakraw))
        except zipfile.BadZipFile:
            pak = None
    return {"entities": ents, "textures": textures, "props": sorted(props), "pak": pak}


def pak_read(pak, name):
    if pak is None:
        return None
    try:
        return pak.read(name)
    except (KeyError, NotImplementedError, zipfile.BadZipFile, zlib.error, lzma.LZMAError):
        return None


# ---------------------------------------------------------------------------------- surfaces

_VMT_KEY = re.compile(r'"?(\$surfaceprop2?|include)"?\s+"?([^"\s}]+)"?', re.I)


def vmt_surfaces(fs, path, pak=None, depth=0):
    """The `$surfaceprop` (and `$surfaceprop2`) of one material, `patch` includes followed."""
    raw = pak_read(pak, path) or fs.read(path)
    if raw is None or depth > 4:
        return []
    found, include = [], None
    for key, val in _VMT_KEY.findall(raw.decode("latin-1")):
        if key.lower().startswith("$surfaceprop"):
            found.append(val.lower())
        else:
            include = val.replace("\\", "/").lower()
    if not found and include:
        return vmt_surfaces(fs, include, pak, depth + 1)
    return found


def material_surfaces(fs, textures, pak=None):
    out = set()
    for name in textures:
        out.update(vmt_surfaces(fs, "materials/%s.vmt" % name, pak))
    return out


def model_surfaceprop(raw):
    """studiohdr_t.surfacepropindex (offset 308 from the header), or ''."""
    if not raw or raw[:4] != b"IDST" or len(raw) < 312:
        return ""
    (off,) = struct.unpack_from("<i", raw, 308)
    if off <= 0 or off >= len(raw):
        return ""
    return raw[off:raw.index(b"\0", off)].decode("latin-1").lower()


def load_surfaces(fs):
    """scripts/surfaceproperties*.txt (manifest order, `base` inheritance) -> {name: {key: value}}."""
    paths = []
    manifest = fs.read("scripts/surfaceproperties_manifest.txt")
    if manifest:
        for _k, body in sounds.parse_kv(manifest.decode("latin-1")):
            if isinstance(body, list):
                paths += [v.replace("\\", "/").lower() for k, v in body if k.lower() == "file"]
    raw_props = {}
    for p in paths or ["scripts/surfaceproperties.txt"]:
        raw = fs.read(p)
        if not raw:
            continue
        for name, body in sounds.parse_kv(raw.decode("latin-1")):
            if isinstance(body, list):
                raw_props[name.lower()] = {k.lower(): v for k, v in body if isinstance(v, str)}

    def resolve(name, seen=()):
        props = raw_props.get(name, {})
        base = props.get("base", "default" if name != "default" else None)
        merged = dict(resolve(base.lower(), seen + (name,))) if base and base.lower() not in seen + (name,) else {}
        merged.update(props)
        return merged

    return {name: resolve(name) for name in raw_props}


SURFACE_SOUND_KEYS = ("stepleft", "stepright", "impacthard", "impactsoft", "scraperough",
                      "scrapesmooth", "bulletimpact", "break", "strain", "rolling")


# ------------------------------------------------------------------------------------- scenes

def scene_crc(path):
    """The directory key of a scene: CRC32 of `scenes\\…\\x.vcd`, lowercase, backslashes."""
    p = path.replace("/", "\\").lower()
    i = p.find("scenes\\")
    p = p[i:] if i >= 0 else "scenes\\" + p
    if not p.endswith(".vcd"):
        p = os.path.splitext(p)[0] + ".vcd"
    return zlib.crc32(p.encode("latin-1")) & 0xFFFFFFFF


# choreoevent.h EVENTTYPE
EV_SPEAK, EV_GESTURE, EV_LOOP = 5, 6, 12
NUM_ABS_TAG_TYPES = 2


class _Buf:
    def __init__(self, data):
        self.d, self.p = data, 0

    def u8(self):
        self.p += 1
        return self.d[self.p - 1]

    def i8(self):
        v = self.u8()
        return v - 256 if v > 127 else v

    def i16(self):
        self.p += 2
        return struct.unpack_from("<h", self.d, self.p - 2)[0]

    def u16(self):
        self.p += 2
        return struct.unpack_from("<H", self.d, self.p - 2)[0]

    def i32(self):
        self.p += 4
        return struct.unpack_from("<i", self.d, self.p - 4)[0]

    def f32(self):
        self.p += 4
        return struct.unpack_from("<f", self.d, self.p - 4)[0]


class SceneImage:
    """scenes/scenes.image: header {VSIF, version 2, numScenes, numStrings, sceneEntryOffset}, the
    string offset table and pool, the entries sorted by filename CRC, the summaries, the data."""

    def __init__(self, raw):
        ident, self.version, n, nstr, entry_at = struct.unpack_from("<4siiii", raw, 0)
        if ident != b"VSIF":
            raise ValueError("not a scene image")
        self.raw = raw
        self.offsets = struct.unpack_from("<%dI" % nstr, raw, 20)
        self.entries = {}
        for i in range(n):
            crc, data_at, data_len, summary_at = struct.unpack_from("<IiiI", raw, entry_at + i * 16)
            self.entries[crc] = (data_at, data_len, summary_at)

    def string(self, i):
        if i < 0 or i >= len(self.offsets):
            return ""
        off = self.offsets[i]
        return self.raw[off:self.raw.index(b"\0", off)].decode("latin-1")

    def has(self, path):
        return scene_crc(path) in self.entries

    def summary(self, path):
        """-> {duration (s), sounds: [names]} or None; the sounds are the scene's speak events'
        sounds and the caption tokens of its master captions, as the image compiler lists them."""
        hit = self.entries.get(scene_crc(path))
        if hit is None:
            return None
        msecs, count = struct.unpack_from("<Ii", self.raw, hit[2])
        ids = struct.unpack_from("<%di" % count, self.raw, hit[2] + 8)
        return {"duration": msecs / 1000.0, "sounds": [self.string(i) for i in ids]}

    def speak_events(self, path):
        """The scene's speak events in start order: [{actor, sound, start, end, cc, ccType}]."""
        hit = self.entries.get(scene_crc(path))
        if hit is None:
            return None
        data = valve_lzma(self.raw[hit[0]:hit[0] + hit[1]])
        if data[:4] != b"bvcd" or data[4] != 4:
            raise ValueError("%s: not a v4 compiled scene" % path)
        b = _Buf(data)
        b.p = 9  # tag, version, text CRC
        out = []
        for _ in range(b.u8()):
            self._event(b, "", out)
        for _ in range(b.u8()):
            actor = self.string(b.i16())
            for _c in range(b.u8()):
                b.i16()  # channel name
                for _e in range(b.u8()):
                    self._event(b, actor, out)
                b.u8()  # channel active
            b.u8()  # actor active
        return sorted(out, key=lambda e: (e["start"], e["sound"]))

    def _event(self, b, actor, out):
        etype = b.u8()
        b.i16()  # name
        start, end = b.f32(), b.f32()
        param1 = self.string(b.i16())
        b.i16()
        b.i16()
        for _ in range(b.u8()):  # ramp
            b.f32()
            b.u8()
        b.u8()  # flags
        b.f32()  # distance to target
        for _ in range(b.u8()):  # relative tags
            b.i16()
            b.u8()
        for _ in range(b.u8()):  # timing tags
            b.i16()
            b.u8()
        for _t in range(NUM_ABS_TAG_TYPES):
            for _ in range(b.u8()):
                b.i16()
                b.u16()
        if etype == EV_GESTURE:
            b.f32()
        if b.i8() == 1:  # relative tag reference
            b.i16()
            b.i16()
        for _ in range(b.u8()):  # flex animation tracks
            b.i16()
            flags = b.u8()
            b.f32()
            b.f32()
            for _s in range(b.i16()):
                b.f32()
                b.u8()
                b.u16()
            if flags & 2:
                for _s in range(b.u16()):
                    b.f32()
                    b.u8()
                    b.u16()
        if etype == EV_LOOP:
            b.i8()
        if etype == EV_SPEAK:
            cc_type = b.i8()
            cc = self.string(b.i16())
            b.i8()
            ev = {"actor": actor, "sound": param1, "start": round(start, 3), "end": round(end, 3)}
            if cc_type != 2 and cc and cc != param1:
                ev["cc"] = cc
            if cc_type:
                ev["ccType"] = cc_type
            out.append(ev)


# -------------------------------------------------------------------------------- soundscapes

def _interval(value, default=(0.0, 0.0)):
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?|-?\.\d+", str(value))]
    if not nums:
        return list(default)
    return [nums[0], nums[1] if len(nums) > 1 else nums[0]]


def _soundlevel_interval(value):
    v = str(value).strip()
    if v.upper().startswith("SNDLVL_"):
        lvl = sounds.soundlevel(v)
        return [lvl, lvl]
    return _interval(v)


def _attn_interval(value):
    a = _interval(value)
    return [round(50 + 20 / x, 2) if x else 0 for x in a]


def _wave(value):
    """A soundscape wave: a raw `sound/` path (prefix characters dropped) or a script entry name."""
    w = sounds.wave_path(value)
    return w[1] if w else value.strip()


def _rule(kind, body):
    rule = {"type": kind}
    for k, v in body:
        k = k.lower()
        if kind == "looping":
            if k == "volume":
                rule["volume"] = _interval(v)
            elif k == "pitch":
                rule["pitch"] = _interval(v)
            elif k == "wave" and isinstance(v, str):
                rule["wave"] = _wave(v)
            elif k == "position":
                rule["position"] = int(_interval(v)[0])
            elif k == "attenuation":
                rule["soundlevel"] = _attn_interval(v)
            elif k == "soundlevel":
                rule["soundlevel"] = _soundlevel_interval(v)
        elif kind == "random":
            if k == "volume":
                rule["volume"] = _interval(v)
            elif k == "pitch":
                rule["pitch"] = _interval(v)
            elif k == "time":
                rule["time"] = _interval(v)
            elif k == "rndwave" and isinstance(v, list):
                rule["waves"] = [_wave(w) for _wk, w in v if isinstance(w, str)]
            elif k == "position":
                rule["position"] = "random" if str(v).lower() == "random" else int(_interval(v)[0])
            elif k == "attenuation":
                rule["soundlevel"] = _attn_interval(v)
            elif k == "soundlevel":
                rule["soundlevel"] = _soundlevel_interval(v)
        elif kind == "soundscape":
            if k == "name":
                rule["name"] = v
            elif k == "volume":
                rule["volume"] = _interval(v)
            elif k in ("position", "positionoverride", "ambientpositionoverride"):
                rule[{"position": "position", "positionoverride": "positionOverride",
                      "ambientpositionoverride": "ambientPositionOverride"}[k]] = int(_interval(v)[0])
    return rule


def parse_soundscapes(text):
    """-> {name: {dsp?, rules: [...]}}: `playlooping` -> {type: looping, wave, volume, pitch,
    soundlevel?, position?}, `playrandom` -> {type: random, waves, time, volume, pitch, soundlevel?,
    position?}, `playsoundscape` -> {type: soundscape, name, volume?, position?, …}. Intervals are
    [min, max]; soundlevels dB (an `attenuation` converted with ATTN_TO_SNDLVL)."""
    out = {}
    for name, body in sounds.parse_kv(text):
        if not isinstance(body, list):
            continue
        sc = {"rules": []}
        for k, v in body:
            k = k.lower()
            if k == "dsp" and isinstance(v, str):
                sc["dsp"] = int(_interval(v)[0])
            elif k in ("playlooping", "playrandom", "playsoundscape") and isinstance(v, list):
                sc["rules"].append(_rule({"playlooping": "looping", "playrandom": "random",
                                          "playsoundscape": "soundscape"}[k], v))
        out[name] = sc
    return out


def load_soundscapes(fs):
    """Every soundscape of the game: scripts/soundscapes_manifest.txt's files in order (a later
    definition of a name does not replace the first, as FindSoundscapeByName finds the first)."""
    paths = []
    raw = fs.read("scripts/soundscapes_manifest.txt")
    if raw:
        for _k, body in sounds.parse_kv(raw.decode("latin-1")):
            if isinstance(body, list):
                paths += [v.replace("\\", "/").lower() for k, v in body if k.lower() == "file" and isinstance(v, str)]
    out, lower = {}, set()
    for p in paths:
        data = fs.read(p)
        if not data:
            continue
        for name, sc in parse_soundscapes(data.decode("latin-1")).items():
            if name.lower() not in lower:
                lower.add(name.lower())
                out[name] = sc
    return out


def soundscape_closure(all_scapes, names):
    """The named soundscapes and every soundscape they play (`playsoundscape`), recursively."""
    by_lower = {k.lower(): k for k in all_scapes}
    out, todo = {}, list(names)
    while todo:
        key = by_lower.get(str(todo.pop()).lower())
        if key is None or key in out:
            continue
        out[key] = all_scapes[key]
        todo += [r["name"] for r in all_scapes[key]["rules"] if r["type"] == "soundscape" and r.get("name")]
    return out


def soundscape_waves(scapes):
    waves = set()
    for sc in scapes.values():
        for r in sc["rules"]:
            if r.get("wave"):
                waves.add(r["wave"])
            waves.update(r.get("waves", []))
    return waves


# ----------------------------------------------------------------------------------- captions

def read_captions_txt(raw):
    """resource/closecaption_<lang>.txt (UTF-16 KeyValues "lang" { "Tokens" { token text } })
    -> {lowercase token: raw text}."""
    text = raw.decode("utf-16") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("utf-8", "replace")
    out = {}
    for _k, body in sounds.parse_kv(text):
        if not isinstance(body, list):
            continue
        for k, v in body:
            if k.lower() == "tokens" and isinstance(v, list):
                for tok, val in v:
                    if isinstance(val, str):
                        out.setdefault(tok.lower(), val)
    return out


class CaptionsDat:
    """The compiled captions (VCCD v1): a directory of {CRC32(lowercase token), block, offset,
    length} and UTF-16LE strings in fixed-size blocks."""

    def __init__(self, raw):
        magic, version, _blocks, self.blocksize, dirsize, self.dataoffset = struct.unpack_from("<4siiiii", raw, 0)
        if magic != b"VCCD" or version != 1:
            raise ValueError("not a compiled caption file")
        self.raw = raw
        self.lookup = {}
        for i in range(dirsize):
            h, block, off, length = struct.unpack_from("<IiHH", raw, 24 + i * 12)
            self.lookup[h] = (block, off, length)

    def get(self, token):
        hit = self.lookup.get(zlib.crc32(token.lower().encode("latin-1")) & 0xFFFFFFFF)
        if hit is None:
            return None
        start = self.dataoffset + hit[0] * self.blocksize + hit[1]
        return self.raw[start:start + hit[2]].decode("utf-16-le").split("\0", 1)[0]


_CC_CMD = re.compile(r"<(\w+)(?::([^>]*))?>")


def reduce_caption(text):
    """The HUD's caption markup (hud_closecaption.cpp) -> {text, color?, sfx?, len?, delay?,
    norepeat?}: `<clr:r,g,b>` / `<playerclr:p:n>` become `<color=#rrggbb>…</color>` runs (the
    first one, when it opens the caption, is lifted to `color`), the `<I>` / `<B>` toggles
    `<i>…</i>` / `<b>…</b>`, `<cr>` a newline; `<sfx>`, `<len:N>`, `<delay:N>`, `<norepeat:N>`
    become fields; anything else is dropped."""
    out = {}
    parts, italic, bold, color_open = [], False, False, False
    pos = 0
    lead_color = None
    for m in _CC_CMD.finditer(text):
        chunk = text[pos:m.start()]
        if chunk:
            parts.append(chunk.replace("<", "").replace(">", ""))
        pos = m.end()
        cmd, arg = m.group(1), (m.group(2) or "").strip()
        lc = cmd.lower()
        if lc in ("clr", "playerclr"):
            nums = re.findall(r"\d+", arg.split(":")[-1] if lc == "playerclr" else arg)
            if color_open:
                parts.append("</color>")
                color_open = False
            if len(nums) >= 3:
                hexc = "#%02x%02x%02x" % tuple(min(255, int(n)) for n in nums[:3])
                if not "".join(p for p in parts if not p.startswith("<")).strip() and lead_color is None:
                    lead_color = hexc
                else:
                    parts.append("<color=%s>" % hexc)
                    color_open = True
        elif cmd == "I":
            parts.append("</i>" if italic else "<i>")
            italic = not italic
        elif cmd == "B":
            parts.append("</b>" if bold else "<b>")
            bold = not bold
        elif lc == "cr":
            parts.append("\n")
        elif lc == "sfx":
            out["sfx"] = True
        elif lc in ("len", "delay", "norepeat"):
            try:
                out[lc] = float(arg)
            except ValueError:
                pass
            if lc == "delay" and "".join(p for p in parts if not p.startswith("<")).strip():
                parts.append("\n")
    tail = text[pos:]
    if tail:
        parts.append(tail.replace("<", "").replace(">", ""))
    if color_open:
        parts.append("</color>")
    if bold:
        parts.append("</b>")
    if italic:
        parts.append("</i>")
    body = re.sub(r"[ \t]+\n", "\n", "".join(parts)).strip()
    # Drop empty runs a trailing toggle left behind (`<i></i>`).
    body = re.sub(r"<(i|b)></\1>|<color=#[0-9a-f]{6}></color>", "", body)
    out["text"] = body
    if lead_color:
        out["color"] = lead_color
    return out
