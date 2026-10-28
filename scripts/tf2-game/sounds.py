#!/usr/bin/env python3
"""Export the game's sounds for the browser: sound-script entries and their audio.

    sounds.py --root <install> --list <sound list json> --out <dir> [--state state.json]

Reads every sound script (`scripts/game_sounds_manifest.txt` order, then any other
`scripts/game_sounds*.txt`; a later definition of a name overrides an earlier one),
resolves each listed entry's `wave` / `rndwave` files under `sound/` (Source's prefix
characters such as `)`, `^`, `#`, `*` stripped and kept as `flags`), reads them through
GameFS and transcodes each to MP3 with ffmpeg/libmp3lame:

  * mono, unless the source is stereo AND is used as a stereo sound (`)` spatial
    stereo, `^` near/far distance variant) or is music — those stay stereo;
  * 64 kbps mono / 96 kbps stereo at 32 kHz and up, less at lower sample rates;
  * an MP3 source already at or under that bitrate (and the right channel count) is
    copied untouched, so nothing is re-encoded for no gain.

Loop points from the WAV `cue ` chunk (start; the `ltxt` label gives the length) or the
`smpl` chunk (start/end) are recorded in the index, in seconds of the source.

Output (all files content-addressed by what they were built from, so an unchanged
sound is neither transcoded nor uploaded again):

  <out>/<sha>.mp3
  <out>/index.json   {v, entries: {name: {waves: [sha...], volume: [min,max],
                        pitch: [min,max], soundlevel, channel, flags?}},
                      files: {"sound/path.wav": "<sha>.mp3"},
                      loops: {"<sha>.mp3": {start, end}}}   (seconds; end null = file end)
  <out>/wanted.json, errors.json, failed.json   for publish.ts push
                     (--index index.json --preserve-index entries,files)

The list is JSON: {"entries": [...], "paths": [...]} or a flat array in which a string
starting with `sound/` or ending in .wav/.mp3 is a raw path and anything else an entry.
`scripts/tf2-game/sound-list.py` writes the default one.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

# Bump when the output for the same source changes (bitrates, channel rules, index
# shape). Mirrors GAME_SOUNDS_BUILDER in lib/tf2-game/assets/versions.ts.
VERSION = 1

# Source's sound-character prefixes (SDK: soundchars.h).
PREFIX_CHARS = "*#@><^)}$!?&~`+%"

CHANNELS = {"chan_replace": -1, "chan_auto": 0, "chan_weapon": 1, "chan_voice": 2, "chan_item": 3,
            "chan_body": 4, "chan_stream": 5, "chan_static": 6, "chan_voice2": 7,
            "chan_voice_base": 8, "chan_user_base": 136}
VOLUMES = {"vol_norm": 1.0}
PITCHES = {"pitch_norm": 100.0, "pitch_low": 95.0, "pitch_high": 120.0}
SNDLVLS = {"sndlvl_none": 0, "sndlvl_idle": 60, "sndlvl_talking": 60, "sndlvl_static": 66,
           "sndlvl_norm": 75, "sndlvl_gunfire": 140}
# SDK: ATTN_TO_SNDLVL(a) = a ? 50 + 20 / a : 0
ATTNS = {"attn_none": 0.0, "attn_norm": 0.8, "attn_idle": 2.0, "attn_static": 1.25,
         "attn_ricochet": 1.5, "attn_gunfire": 0.27}

MP3_RATES = (8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000)


# ---------------------------------------------------------------------------
# Sound scripts (KeyValues with platform conditionals)
# ---------------------------------------------------------------------------

_TOKEN = re.compile(r'"([^"]*)"|//[^\n]*|(\[[^\]\n]*\])|([{}])|([^\s{}"\[]+)')


def condition(cond):
    """Evaluate a `[$WIN32]`-style conditional as the Windows desktop game would."""
    if not cond:
        return True
    expr = cond.strip("[] \t").upper()

    def term(t):
        t = t.strip()
        neg = t.startswith("!")
        t = t.lstrip("!").strip()
        val = t in ("$WIN32", "$WINDOWS")
        return not val if neg else val

    return any(all(term(t) for t in alt.split("&&")) for alt in expr.split("||"))


def parse_kv(text):
    """-> ordered [(key, value)] where value is a string or a nested list; entries whose
    conditional is false on Windows desktop are dropped."""
    toks = []
    for m in _TOKEN.finditer(text):
        if m.group(1) is not None:
            toks.append(("s", m.group(1)))
        elif m.group(2):
            toks.append(("c", m.group(2)))
        elif m.group(3):
            toks.append((m.group(3), m.group(3)))
        elif m.group(4):
            toks.append(("s", m.group(4)))
    pos = 0

    def cond_here():
        nonlocal pos
        if pos < len(toks) and toks[pos][0] == "c":
            pos += 1
            return toks[pos - 1][1]
        return None

    def block():
        nonlocal pos
        out = []
        while pos < len(toks):
            kind, key = toks[pos]
            pos += 1
            if kind == "}":
                return out
            if kind != "s":
                continue
            pre = cond_here()
            if pos >= len(toks):
                break
            kind, val = toks[pos]
            pos += 1
            if kind == "{":
                val = block()
            elif kind != "s":
                continue
            post = cond_here()
            if condition(pre) and condition(post):
                out.append((key, val))
        return out

    return block()


def script_paths(fs):
    """Sound scripts in the order the game loads them."""
    paths = []
    raw = fs.read("scripts/game_sounds_manifest.txt")
    if raw:
        for _k, body in parse_kv(raw.decode("utf8", "replace")):
            if isinstance(body, list):
                for key, val in body:
                    if key.lower() in ("precache_file", "preload_file") and isinstance(val, str):
                        p = val.replace("\\", "/").lower()
                        if p not in paths:
                            paths.append(p)
    # Scripts the game ships but its manifest does not list (never another game's).
    names = fs.own_names("scripts/", ".txt") if hasattr(fs, "own_names") else []
    paths += [p for p in names if p.startswith("scripts/game_sounds") and p not in paths
              and not p.endswith("_manifest.txt")]
    return paths


def load_scripts(fs):
    """{entry name: body pairs}; names are case-insensitive in Source, the first spelling is kept."""
    entries, spelling = {}, {}
    for path in script_paths(fs):
        try:
            raw = fs.read(path)
        except FileNotFoundError:
            raw = None
        if raw is None:
            continue
        for name, body in parse_kv(raw.decode("utf8", "replace")):
            if isinstance(body, list):
                key = spelling.setdefault(name.lower(), name)
                entries[key] = body
    return entries


def wave_path(wave):
    """`)weapons\\foo.wav` -> (')', 'sound/weapons/foo.wav'); None for sentences / non-files."""
    w = wave.strip()
    flags = ""
    while w and w[0] in PREFIX_CHARS:
        flags += w[0]
        w = w[1:]
    if "!" in flags or "?" in flags:
        return None  # sentence / user voice: not a file
    w = re.sub(r"/+", "/", w.replace("\\", "/")).lower().lstrip("/")
    if not re.fullmatch(r"[a-z0-9_ ./'()&,+-]+\.(wav|mp3)", w) or ".." in w:
        return None
    return flags, "sound/" + w


def _numbers(value, consts):
    out = []
    for part in str(value).split(","):
        p = part.strip().lower()
        if not p:
            continue
        if p in consts:
            out.append(float(consts[p]))
            continue
        m = re.match(r"-?\d+(?:\.\d+)?|-?\.\d+", p)
        if m:
            out.append(float(m.group(0)))
    return out


def _range(value, consts, default):
    nums = _numbers(value, consts) if value is not None else []
    if not nums:
        return [default, default]
    return [min(nums[0], nums[-1]), max(nums[0], nums[-1])]


def soundlevel(value):
    if value is None:
        return 75
    nums = []
    for part in str(value).split(","):
        p = part.strip().lower()
        if p in SNDLVLS:
            nums.append(SNDLVLS[p])
        elif p in ATTNS:
            a = ATTNS[p]
            nums.append(50 + 20 / a if a else 0)
        elif re.fullmatch(r"sndlvl_\d+db", p):
            nums.append(int(p[7:-2]))
        elif re.fullmatch(r"\d+(\.\d+)?", p):
            nums.append(float(p))
    if not nums:
        return 75
    return round(sum(nums) / len(nums), 2)


def channel(value):
    if value is None:
        return 0
    v = str(value).strip().lower()
    if v in CHANNELS:
        return CHANNELS[v]
    return int(v) if re.fullmatch(r"-?\d+", v) else 0


def entry_info(body):
    """Playback parameters and (flags, path) of every wave of one script entry."""
    get = {}
    waves = []
    for key, val in body:
        k = key.lower()
        if k == "wave" and isinstance(val, str):
            waves.append(val)
        elif k == "rndwave" and isinstance(val, list):
            waves += [v for kk, v in val if kk.lower() == "wave" and isinstance(v, str)]
        elif isinstance(val, str):
            get.setdefault(k, val)
    resolved = [w for w in (wave_path(w) for w in waves) if w]
    return {
        "waves": resolved,
        "volume": _range(get.get("volume"), VOLUMES, 1.0),
        "pitch": _range(get.get("pitch"), PITCHES, 100.0),
        "soundlevel": soundlevel(get.get("soundlevel")),
        "channel": channel(get.get("channel")),
    }


# ---------------------------------------------------------------------------
# Audio files
# ---------------------------------------------------------------------------

def parse_wav(raw):
    """Format and loop points of a RIFF WAVE: {channels, rate, bits, format, samples, loop}."""
    if raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError("not a RIFF WAVE file")
    info = {"channels": 1, "rate": 0, "bits": 16, "format": 1, "samples": None, "loop": None}
    cue_start, cue_name, ltxt, smpl, data_len, block_align, fact = None, None, {}, None, None, None, None
    pos = 12
    while pos + 8 <= len(raw):
        cid, size = raw[pos:pos + 4], struct.unpack_from("<I", raw, pos + 4)[0]
        body = raw[pos + 8:pos + 8 + size]
        if cid == b"fmt " and len(body) >= 16:
            fmt, ch, rate, _bps, align, bits = struct.unpack_from("<HHIIHH", body, 0)
            info.update(format=fmt, channels=ch, rate=rate, bits=bits)
            block_align = align
        elif cid == b"data":
            data_len = min(size, len(raw) - pos - 8)
        elif cid == b"fact" and len(body) >= 4:
            fact = struct.unpack_from("<I", body, 0)[0]
        elif cid == b"cue " and len(body) >= 4:
            count = struct.unpack_from("<I", body, 0)[0]
            if count and len(body) >= 28:
                cue_name = struct.unpack_from("<I", body, 4)[0]
                cue_start = struct.unpack_from("<I", body, 4 + 20)[0]
        elif cid == b"LIST" and body[:4] == b"adtl":
            p = 4
            while p + 8 <= len(body):
                sid, ssize = body[p:p + 4], struct.unpack_from("<I", body, p + 4)[0]
                if sid == b"ltxt" and ssize >= 8:
                    name, length = struct.unpack_from("<II", body, p + 8)
                    ltxt[name] = length
                p += 8 + ssize + (ssize & 1)
        elif cid == b"smpl" and len(body) >= 36:
            loops = struct.unpack_from("<I", body, 28)[0]
            if loops and len(body) >= 36 + 24:
                _id, _type, start, end = struct.unpack_from("<IIII", body, 36)
                smpl = (start, end)
        pos += 8 + size + (size & 1)
    if info["format"] == 1 and data_len is not None and block_align:
        info["samples"] = data_len // block_align
    elif fact is not None:
        info["samples"] = fact
    # SDK: CAudioSourceWave::ParseCueChunk / ParseSampleChunk — a cue point starts the
    # loop (an ltxt label with the cue's name gives its length); otherwise smpl loops.
    if cue_start is not None:
        length = ltxt.get(cue_name)
        info["loop"] = (cue_start, cue_start + length if length else None)
    elif smpl is not None:
        info["loop"] = (smpl[0], smpl[1] + 1 if smpl[1] > smpl[0] else None)
    return info


_MP3_BITRATES = {
    (1, 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    (2, 3): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
_MP3_RATES = {3: (44100, 48000, 32000), 2: (22050, 24000, 16000), 0: (11025, 12000, 8000)}


def mp3_info(raw):
    """{rate, channels, bitrate (kbps)} of the first MPEG layer III frame."""
    pos = 0
    if raw[:3] == b"ID3" and len(raw) >= 10:
        size = (raw[6] << 21) | (raw[7] << 14) | (raw[8] << 7) | raw[9]
        pos = 10 + size
    end = min(len(raw) - 4, pos + 65536)
    while pos < end:
        if raw[pos] == 0xFF and (raw[pos + 1] & 0xE0) == 0xE0:
            ver = (raw[pos + 1] >> 3) & 3
            layer = (raw[pos + 1] >> 1) & 3
            bidx = raw[pos + 2] >> 4
            ridx = (raw[pos + 2] >> 2) & 3
            mode = raw[pos + 3] >> 6
            if ver != 1 and layer == 1 and 0 < bidx < 15 and ridx < 3:
                table = _MP3_BITRATES[(1, 3) if ver == 3 else (2, 3)]
                return {"rate": _MP3_RATES[ver][ridx], "channels": 1 if mode == 3 else 2,
                        "bitrate": table[bidx]}
        pos += 1
    raise ValueError("no MPEG layer III frame")


def target_bitrate(rate, channels):
    """kbps for VO / effects: plenty for game audio and small in storage."""
    if rate >= 32000:
        return 96 if channels == 2 else 64
    if rate >= 16000:
        return 64 if channels == 2 else 48
    return 48 if channels == 2 else 32


def mp3_rate(rate):
    return min(MP3_RATES, key=lambda r: (abs(r - rate), -r)) if rate else 44100


def plan(raw, ext, keep_stereo):
    """How one source becomes MP3: {mode: copy|encode, channels, rate, bitrate, loop}."""
    if ext == ".mp3":
        info = mp3_info(raw)
        channels = 2 if keep_stereo and info["channels"] == 2 else 1
        bitrate = target_bitrate(info["rate"], channels)
        copy = info["channels"] == channels and info["bitrate"] <= bitrate + 16
        return {"mode": "copy" if copy else "encode", "channels": channels, "rate": info["rate"],
                "bitrate": bitrate, "loop": None}
    info = parse_wav(raw)
    channels = 2 if keep_stereo and info["channels"] >= 2 else 1
    rate = mp3_rate(info["rate"])
    loop = None
    if info["loop"] and info["rate"]:
        start, end = info["loop"]
        loop = {"start": round(start / info["rate"], 6),
                "end": round(end / info["rate"], 6) if end else None}
    return {"mode": "encode", "channels": channels, "rate": rate,
            "bitrate": target_bitrate(rate, channels), "loop": loop}


def transcode(raw, ext, p, ffmpeg="ffmpeg"):
    """Encode with libmp3lame; metadata stripped so identical input gives identical output."""
    if p["mode"] == "copy":
        return raw
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "in" + ext)
        dst = os.path.join(tmp, "out.mp3")
        with open(src, "wb") as fh:
            fh.write(raw)
        cmd = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", src,
               "-map_metadata", "-1", "-vn", "-ac", str(p["channels"]), "-ar", str(p["rate"]),
               "-c:a", "libmp3lame", "-b:a", "%dk" % p["bitrate"],
               "-id3v2_version", "0", "-write_id3v1", "0", "-f", "mp3", dst]
        res = subprocess.run(cmd, capture_output=True)
        if res.returncode != 0 or not os.path.exists(dst):
            raise RuntimeError("ffmpeg failed: " + res.stderr.decode("utf8", "replace").strip()[-300:])
        with open(dst, "rb") as fh:
            return fh.read()


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def read_list(path):
    with open(path) as fh:
        data = json.load(fh)
    if isinstance(data, dict):
        return list(data.get("entries", [])), list(data.get("paths", []))
    entries, paths = [], []
    for item in data:
        s = str(item)
        (paths if s.lower().startswith("sound/") or s.lower().endswith((".wav", ".mp3")) else entries).append(s)
    return entries, paths


def raw_path(p):
    p = p.replace("\\", "/").lower().lstrip("/")
    return p if p.startswith("sound/") else "sound/" + p


def json_bytes(data):
    return json.dumps(data, separators=(",", ":"), sort_keys=True, allow_nan=False).encode()


def build(fs, out, entry_names, paths, state=None, ffmpeg="ffmpeg", scripts=None):
    published = (state or {}).get("models", {})
    os.makedirs(out, exist_ok=True)
    scripts = load_scripts(fs) if scripts is None else scripts
    by_lower = {k.lower(): k for k in scripts}
    wanted, errors = {}, []
    entries, files, loops = {}, {}, {}

    # Every file to export and whether some use of it is stereo by design.
    infos, need = {}, {}
    for name in entry_names:
        key = by_lower.get(name.lower())
        if key is None:
            errors.append({"id": name, "error": "no such sound script entry"})
            continue
        info = entry_info(scripts[key])
        if not info["waves"]:
            errors.append({"id": key, "error": "entry has no playable waves"})
            continue
        infos[key] = info
        for flags, path in info["waves"]:
            stereo = ")" in flags or "^" in flags or path.startswith("sound/music/")
            need[path] = need.get(path, False) or stereo
    for p in paths:
        path = raw_path(p)
        need[path] = need.get(path, False) or path.startswith("sound/music/")

    failed_files = set()
    stats = {"encoded": 0, "copied": 0, "reused": 0}
    for path in sorted(need):
        ext = os.path.splitext(path)[1]
        try:
            raw = fs.read(path)
        except (FileNotFoundError, OSError) as exc:
            raw, why = None, str(exc)
        else:
            why = "not in the install"
        if raw is None:
            failed_files.add(path)
            errors.append({"id": path, "error": why})
            continue
        try:
            p = plan(raw, ext, need[path])
            mode = "copy" if p["mode"] == "copy" else "%s-%dch-%dhz-%dk" % (
                ext[1:], p["channels"], p["rate"], p["bitrate"])
            sha = hashlib.sha256(b"tf2-game-snd-v%d|%s|" % (VERSION, mode.encode())
                                 + hashlib.sha256(raw).digest()).hexdigest()
            name = sha + ".mp3"
            wanted[name] = {"src": sha}
            if published.get(name, {}).get("src") != sha or os.environ.get("FORCE") == "1":
                data = transcode(raw, ext, p, ffmpeg)
                with open(os.path.join(out, name), "wb") as fh:
                    fh.write(data)
                stats["copied" if p["mode"] == "copy" else "encoded"] += 1
            else:
                stats["reused"] += 1
        except (ValueError, RuntimeError, struct.error) as exc:
            failed_files.add(path)
            errors.append({"id": path, "error": str(exc)})
            continue
        files[path] = name
        if p["loop"]:
            loops[name] = p["loop"]

    for key, info in sorted(infos.items()):
        shas = [files[path][:-4] for _f, path in info["waves"] if path in files]
        if not shas:
            # Absent from this index; --preserve-index keeps the last published version.
            errors.append({"id": key, "error": "no wave could be exported"})
            continue
        entry = {"waves": shas, "volume": info["volume"], "pitch": info["pitch"],
                 "soundlevel": info["soundlevel"], "channel": info["channel"]}
        flags = "".join(sorted({c for f, path in info["waves"] if path in files for c in f}))
        if flags:
            entry["flags"] = flags
        entries[key] = entry

    if not files:
        raise ValueError("no sounds were exported")
    index = {"v": VERSION, "entries": entries, "files": files, "loops": loops}
    data = json_bytes(index)
    wanted["index.json"] = {"src": hashlib.sha256(data).hexdigest()}
    with open(os.path.join(out, "index.json"), "wb") as fh:
        fh.write(data)
    with open(os.path.join(out, "wanted.json"), "w") as fh:
        json.dump(wanted, fh)
    with open(os.path.join(out, "errors.json"), "w") as fh:
        json.dump(errors, fh, indent=1)
    # A file that failed this run is not gone from the game: never prune what was published.
    with open(os.path.join(out, "failed.json"), "w") as fh:
        json.dump(list(published) if errors else [], fh)
    print("sounds: %d entries, %d files (%d encoded, %d copied, %d unchanged), %d loops; %d errors" % (
        len(entries), len(files), stats["encoded"], stats["copied"], stats["reused"], len(loops), len(errors)))
    return index


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True, help="game install (the folder holding tf/ and hl2/)")
    ap.add_argument("--list", required=True, help="sound list JSON (sound-list.py writes the default)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--state", help="the channel's published state (publish.ts state)")
    ap.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "ffmpeg")
    args = ap.parse_args()
    from gamefs import GameFirst
    from vpkfs import GameFS

    state = None
    if args.state and os.path.exists(args.state):
        with open(args.state) as fh:
            state = json.load(fh)
    entries, paths = read_list(args.list)
    build(GameFirst(GameFS(args.root)), args.out, entries, paths, state, args.ffmpeg)


if __name__ == "__main__":
    main()
