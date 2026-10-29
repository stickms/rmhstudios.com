#!/usr/bin/env python3
"""
Extract the TF2 browser game's data tables (lib/tf2-game/data/*.ts) from a
TF2 install's game scripts, checked against the Source SDK 2013 headers.

    pip install vpk
    python3 -I scripts/tf2-game/extract-data.py [--tf2 /path/to/tf2ds] [--sdk /path/to/source-sdk-2013]

Reads, without extracting the archives:
  tf/tf2_misc_dir.vpk  scripts/playerclasses/*.ctx, scripts/tf_weapon_*.ctx
                         (ICE-encrypted; key from tf_shareddefs.cpp GetEncryptionKey)
                       scripts/objects.txt, scripts/game_sounds*.txt,
                       scripts/surfaceproperties_tf.txt, resource/tf_english.txt (UTF-16)
  tf/scripts/items/items_game.txt (loose on disk in current installs)
  hl2/hl2_misc_dir.vpk scripts/surfaceproperties.txt, scripts/surfaceproperties_hl2.txt
  SDK: ETFWeaponType, ETFDmgCustom, DMG_* bits, g_szProjectileNames, g_aWeaponDamageTypes

Writes classes.ts, items.ts, weapons.ts, buildings.ts, damage.ts, sounds.ts and index.ts,
then formats them with the repo's prettier. classes/weapons/buildings/damage end with a
HAND-MAINTAINED block (behaviour constants transcribed from the SDK's .cpp files) that a
re-run preserves verbatim. A few per-C++-class facts the scripts lack (reloads one at a time,
random-crit mode, per-class entity translation) are tables in this script, each citing
its SDK source.

--dump DIR writes the decrypted .ctx scripts there for inspection and exits.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any

# ---------------------------------------------------------------------------
# ICE decryption (public-domain ICE by Matthew Kwan, as in the SDK's
# mathlib/IceKey.cpp; UTIL_DecodeICE decrypts whole 8-byte blocks and leaves
# a trailing partial block as-is).
# ---------------------------------------------------------------------------

ICE_KEY = b"E2NcUkG2"  # SDK: tf_shareddefs.cpp CTFGameRules::GetEncryptionKey

_SMOD = [[333, 313, 505, 369], [379, 375, 319, 391], [361, 445, 451, 397], [397, 425, 395, 505]]
_SXOR = [[0x83, 0x85, 0x9B, 0xCD], [0xCC, 0xA7, 0xAD, 0x41], [0x4B, 0x2E, 0xD4, 0x33], [0xEA, 0xCB, 0x2E, 0x04]]
_PBOX = [
    0x00000001, 0x00000080, 0x00000400, 0x00002000, 0x00080000, 0x00200000, 0x01000000, 0x40000000,
    0x00000008, 0x00000020, 0x00000100, 0x00004000, 0x00010000, 0x00800000, 0x04000000, 0x20000000,
    0x00000004, 0x00000010, 0x00000200, 0x00008000, 0x00020000, 0x00400000, 0x08000000, 0x10000000,
    0x00000002, 0x00000040, 0x00000800, 0x00001000, 0x00040000, 0x00100000, 0x02000000, 0x80000000,
]
_KEYROT = [0, 1, 2, 3, 2, 1, 3, 0, 1, 3, 2, 0, 3, 1, 0, 2]


def _gf_mult(a: int, b: int, m: int) -> int:
    res = 0
    while b:
        if b & 1:
            res ^= a
        a <<= 1
        b >>= 1
        if a >= 256:
            a ^= m
    return res


def _gf_exp7(b: int, m: int) -> int:
    if b == 0:
        return 0
    x = _gf_mult(b, b, m)
    x = _gf_mult(b, x, m)
    x = _gf_mult(x, x, m)
    return _gf_mult(b, x, m)


def _perm32(x: int) -> int:
    res = 0
    i = 0
    while x:
        if x & 1:
            res |= _PBOX[i]
        i += 1
        x >>= 1
    return res


_SBOX: list[list[int]] = [[0] * 1024 for _ in range(4)]
for _i in range(1024):
    _col = (_i >> 1) & 0xFF
    _row = (_i & 1) | ((_i & 0x200) >> 8)
    _SBOX[0][_i] = _perm32(_gf_exp7(_col ^ _SXOR[0][_row], _SMOD[0][_row]) << 24)
    _SBOX[1][_i] = _perm32(_gf_exp7(_col ^ _SXOR[1][_row], _SMOD[1][_row]) << 16)
    _SBOX[2][_i] = _perm32(_gf_exp7(_col ^ _SXOR[2][_row], _SMOD[2][_row]) << 8)
    _SBOX[3][_i] = _perm32(_gf_exp7(_col ^ _SXOR[3][_row], _SMOD[3][_row]))


def _ice_schedule(key: bytes) -> list[list[int]]:
    kb = [0] * 4
    for i in range(4):
        kb[3 - i] = (key[i * 2] << 8) | key[i * 2 + 1]
    sched = []
    for i in range(8):
        kr = _KEYROT[i]
        sk = [0, 0, 0]
        for j in range(15):
            for k in range(4):
                idx = (kr + k) & 3
                bit = kb[idx] & 1
                sk[j % 3] = (sk[j % 3] << 1) | bit
                kb[idx] = (kb[idx] >> 1) | ((bit ^ 1) << 15)
        sched.append(sk)
    return sched


def _ice_f(p: int, sk: list[int]) -> int:
    tl = ((p >> 16) & 0x3FF) | ((((p >> 14) | (p << 18)) & 0xFFFFFFFF) & 0xFFC00)
    tr = (p & 0x3FF) | ((p << 2) & 0xFFC00)
    al = sk[2] & (tl ^ tr)
    ar = al ^ tr
    al ^= tl
    al ^= sk[0]
    ar ^= sk[1]
    return _SBOX[0][al >> 10] | _SBOX[1][al & 0x3FF] | _SBOX[2][ar >> 10] | _SBOX[3][ar & 0x3FF]


def ice_decode(data: bytes, key: bytes = ICE_KEY) -> bytes:
    """SDK: util_shared.cpp UTIL_DecodeICE with an 8-round (level 0) key."""
    sched = _ice_schedule(key)
    out = bytearray()
    n = len(data) - len(data) % 8
    for o in range(0, n, 8):
        l = int.from_bytes(data[o : o + 4], "big")
        r = int.from_bytes(data[o + 4 : o + 8], "big")
        for i in range(7, 0, -2):
            l ^= _ice_f(r, sched[i])
            r ^= _ice_f(l, sched[i - 1])
        out += r.to_bytes(4, "big") + l.to_bytes(4, "big")
    out += data[n:]
    return bytes(out)


# ---------------------------------------------------------------------------
# KeyValues text parser. Duplicate keys are kept (a node is a list of
# (key, value) pairs); [$CONDITIONAL] tags are dropped (we want the PC
# values, which come first or unconditioned).
# ---------------------------------------------------------------------------

_TOKEN = re.compile(r'"((?:[^"\\]|\\.)*)"|(\{)|(\})|(\[[^\]]*\])|([^\s{}"]+)')


def _strip_comments(text: str) -> str:
    out = []
    for line in text.splitlines():
        # remove // comments outside quotes
        res, inq, i = [], False, 0
        while i < len(line):
            c = line[i]
            if c == '"':
                inq = not inq
            if not inq and line.startswith("//", i):
                break
            res.append(c)
            i += 1
        out.append("".join(res))
    return "\n".join(out)


class KV:
    """An ordered multimap of KeyValues children."""

    def __init__(self) -> None:
        self.items: list[tuple[str, Any]] = []

    def get(self, key: str, default: Any = None) -> Any:
        kl = key.lower()
        for k, v in self.items:
            if k.lower() == kl:
                return v
        return default

    def all(self, key: str) -> list[Any]:
        kl = key.lower()
        return [v for k, v in self.items if k.lower() == kl]

    def keys(self) -> list[str]:
        return [k for k, _ in self.items]

    def __iter__(self):
        return iter(self.items)

    def to_py(self) -> Any:
        d: dict[str, Any] = {}
        for k, v in self.items:
            d[k] = v.to_py() if isinstance(v, KV) else v
        return d


def parse_kv(text: str) -> KV:
    text = _strip_comments(text)
    toks: list[tuple[str, str]] = []
    for m in _TOKEN.finditer(text):
        if m.group(1) is not None:
            toks.append(("s", m.group(1)))
        elif m.group(2):
            toks.append(("{", "{"))
        elif m.group(3):
            toks.append(("}", "}"))
        elif m.group(4):
            toks.append(("c", m.group(4)))
        else:
            toks.append(("s", m.group(5)))
    pos = 0

    def parse_block() -> KV:
        nonlocal pos
        node = KV()
        while pos < len(toks):
            t, v = toks[pos]
            if t == "}":
                pos += 1
                return node
            if t == "c":
                pos += 1
                continue
            if t != "s":
                pos += 1
                continue
            key = v
            pos += 1
            if pos >= len(toks):
                break
            t2, v2 = toks[pos]
            if t2 == "{":
                pos += 1
                child = parse_block()
                cond = None
                if pos < len(toks) and toks[pos][0] == "c":
                    cond = toks[pos][1]
                    pos += 1
                if not _cond_skip(cond):
                    node.items.append((key, child))
            elif t2 == "s":
                pos += 1
                cond = None
                if pos < len(toks) and toks[pos][0] == "c":
                    cond = toks[pos][1]
                    pos += 1
                if not _cond_skip(cond):
                    node.items.append((key, v2))
            else:
                pos += 1
        return node

    return parse_block()


def _cond_skip(cond: str | None) -> bool:
    """Keep PC values: drop entries conditioned on consoles / !WIN32 etc."""
    if not cond:
        return False
    c = cond.strip("[]").upper()
    if c in ("$X360", "$PS3", "$OSX", "$LINUX", "$POSIX", "!$WIN32", "!$WINDOWS", "$GAMECONSOLE"):
        return True
    return False


# ---------------------------------------------------------------------------
# File access
# ---------------------------------------------------------------------------


class GameFiles:
    def __init__(self, tf2_root: str) -> None:
        import vpk  # type: ignore

        self.root = tf2_root
        self.pak = vpk.open(os.path.join(tf2_root, "tf", "tf2_misc_dir.vpk"))

    def raw(self, path: str) -> bytes:
        disk = os.path.join(self.root, "tf", path)
        if os.path.isfile(disk):
            with open(disk, "rb") as f:
                return f.read()
        return self.pak.get_file(path).read()

    def text(self, path: str) -> str:
        data = self.raw(path)
        if path.endswith(".ctx"):
            data = ice_decode(data)
        if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
            return data.decode("utf-16")
        return data.decode("utf-8", errors="replace").rstrip("\x00")

    def kv(self, path: str) -> KV:
        root = parse_kv(self.text(path))
        return root

    def listing(self, prefix: str) -> list[str]:
        return sorted(p for p in self.pak if p.startswith(prefix))


def first_block(root: KV) -> KV:
    for _, v in root:
        if isinstance(v, KV):
            return v
    raise ValueError("no root block")


# ---------------------------------------------------------------------------
# SDK tables (parsed from the Source SDK 2013 headers so enum orders and the
# per-weapon damage-type table can never drift from the reference).
# ---------------------------------------------------------------------------


class Sdk:
    def __init__(self, root: str) -> None:
        self.root = root
        self.shared = os.path.join(root, "src", "game", "shared")

    def read(self, rel: str) -> str:
        with open(os.path.join(self.root, "src", rel), encoding="latin-1") as f:
            return f.read()

    @staticmethod
    def _strip_c_comments(text: str) -> str:
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        return re.sub(r"//[^\n]*", "", text)

    def enum(self, rel: str, name: str) -> list[tuple[str, int]]:
        """Members of `enum <name> { ... }` with their values."""
        text = self._strip_c_comments(self.read(rel))
        m = re.search(r"enum\s+" + re.escape(name) + r"\s*\{(.*?)\};", text, re.S)
        if not m:
            raise ValueError(f"enum {name} not found in {rel}")
        out: list[tuple[str, int]] = []
        value = -1
        known: dict[str, int] = {}
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            if "=" in part:
                key, expr = (s.strip() for s in part.split("=", 1))
                expr = expr.strip()
                if re.fullmatch(r"-?\d+", expr):
                    value = int(expr)
                elif expr in known:
                    value = known[expr]
                else:
                    value = int(eval(expr, {}, dict(known)))  # simple arithmetic only
            else:
                key = part
                value += 1
            known[key] = value
            out.append((key, value))
        return out

    def string_array(self, rel: str, name: str) -> list[str]:
        text = self._strip_c_comments(self.read(rel))
        m = re.search(re.escape(name) + r"\s*\[\s*\]\s*=\s*\{(.*?)\};", text, re.S)
        if not m:
            raise ValueError(f"array {name} not found in {rel}")
        return re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))

    def defines(self, rel: str) -> dict[str, str]:
        out: dict[str, str] = {}
        for line in self.read(rel).splitlines():
            m = re.match(r"\s*#define\s+(\w+)\s+(.+?)\s*(//.*)?$", line)
            if m:
                out[m.group(1)] = m.group(2).strip()
        return out

    def dmg_bits(self) -> dict[str, int]:
        """DMG_* bits: shareddefs.h plus the TF aliases in tf_shareddefs.h."""
        bits: dict[str, int] = {}
        for rel in ("game/shared/shareddefs.h", "game/shared/tf/tf_shareddefs.h"):
            for line in self._strip_c_comments(self.read(rel)).splitlines():
                m = re.match(r"\s*#define\s+(DMG_\w+)\s+(.+)$", line)
                if not m:
                    continue
                expr = m.group(2).strip()
                try:
                    bits[m.group(1)] = int(eval(expr, {}, dict(bits)))
                except Exception:
                    pass
        return bits

    def weapon_damage_types(self, weapon_ids: list[str], bits: dict[str, int]) -> dict[str, tuple[int, str]]:
        """g_aWeaponDamageTypes (indexed by ETFWeaponType): name -> (bits, source expression)."""
        text = self.read("game/shared/tf/tf_shareddefs.cpp")
        m = re.search(r"g_aWeaponDamageTypes\[\]\s*=\s*\{(.*?)\};", text, re.S)
        if not m:
            raise ValueError("g_aWeaponDamageTypes not found")
        out: dict[str, tuple[int, str]] = {}
        entries = []
        for line in m.group(1).splitlines():
            code = line.split("//")[0].strip().rstrip(",")
            if not code:
                continue
            entries.append(code)
        for idx, code in enumerate(entries):
            if idx >= len(weapon_ids):
                break
            val = 0
            toks = []
            for tok in code.split("|"):
                tok = tok.strip()
                val |= bits[tok] if tok in bits else int(tok, 0)
                if tok not in toks:
                    toks.append(tok)
            out[weapon_ids[idx]] = (val, " | ".join(toks))
        return out


# ---------------------------------------------------------------------------
# TypeScript emission
# ---------------------------------------------------------------------------

_IDENT = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def ts(v: Any, indent: int = 0) -> str:
    pad = "  " * indent
    pad1 = "  " * (indent + 1)
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if v == int(v) and abs(v) < 1e15:
            return str(int(v))
        r = repr(v)
        return r
    if isinstance(v, str):
        return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"
    if isinstance(v, (list, tuple)):
        if not v:
            return "[]"
        inner = [ts(x, indent + 1) for x in v]
        one = "[" + ", ".join(inner) + "]"
        if len(one) + len(pad) < 96 and "\n" not in one:
            return one
        return "[\n" + "".join(f"{pad1}{x},\n" for x in inner) + pad + "]"
    if isinstance(v, Raw):
        return v.text
    if isinstance(v, dict):
        if not v:
            return "{}"
        if not any(isinstance(x, Commented) for x in v.values()):
            inline = []
            for k, x in v.items():
                key = str(k) if (isinstance(k, int) or re.fullmatch(r"\d+", str(k)) or _IDENT.match(str(k))) else ts(k)
                inline.append(f"{key}: {ts(x, indent + 1)}")
            one = "{ " + ", ".join(inline) + " }"
            if len(one) + len(pad) < 90 and "\n" not in one:
                return one
        parts = []
        for k, x in v.items():
            if isinstance(k, int) or (isinstance(k, str) and re.fullmatch(r"\d+", k)):
                key = str(k)
            elif _IDENT.match(k):
                key = k
            else:
                key = ts(k)
            comment = ""
            if isinstance(x, Commented):
                comment = f"{pad1}// {x.comment}\n"
                x = x.value
            parts.append(f"{comment}{pad1}{key}: {ts(x, indent + 1)},\n")
        return "{\n" + "".join(parts) + pad + "}"
    raise TypeError(type(v))


class Raw:
    def __init__(self, text: str) -> None:
        self.text = text


class Commented:
    def __init__(self, value: Any, comment: str) -> None:
        self.value = value
        self.comment = comment


HAND_BEGIN = "// ---- BEGIN HAND-MAINTAINED (extract-data.py preserves this block) ----"
HAND_END = "// ---- END HAND-MAINTAINED ----"


def write_module(path: str, generated: str, default_hand: str | None = "") -> None:
    """Write a module: generated text, then the preserved hand-maintained block
    (none when default_hand is None)."""
    hand = default_hand
    if os.path.exists(path) and default_hand is not None:
        with open(path, encoding="utf-8") as f:
            old = f.read()
        i = old.find(HAND_BEGIN)
        j = old.find(HAND_END)
        if i >= 0 and j > i:
            hand = old[i + len(HAND_BEGIN) : j].strip("\n")
    body = generated.rstrip() + "\n"
    if hand is not None:
        body += f"\n{HAND_BEGIN}\n{hand}\n{HAND_END}\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    print(f"wrote {path}")


def num(s: Any, default: float = 0.0) -> float:
    if s is None:
        return default
    if isinstance(s, (int, float)):
        return s
    m = re.match(r"\s*(-?\d+(?:\.\d*)?|-?\.\d+)", str(s))
    return float(m.group(1)) if m else default


def as_num(x: float) -> int | float:
    return int(x) if float(x).is_integer() else float(x)


# ---------------------------------------------------------------------------
# Readers mirroring the SDK parsers
# ---------------------------------------------------------------------------

CLASS_FILES = [  # SDK: tf_classdata.cpp s_aPlayerClassFiles, in ETFClass order
    None,
    "scout",
    "sniper",
    "soldier",
    "demoman",
    "medic",
    "heavyweapons",
    "pyro",
    "spy",
    "engineer",
]
CLASS_NAMES = [None, "scout", "sniper", "soldier", "demoman", "medic", "heavy", "pyro", "spy", "engineer"]
# items_game used_by_classes keys, and the game_sounds voice prefix, per ETFClass.
ITEM_CLASS_KEYS = [None, "scout", "sniper", "soldier", "demoman", "medic", "heavy", "pyro", "spy", "engineer"]
VOICE_PREFIX = [None, "Scout", "Sniper", "Soldier", "Demoman", "Medic", "Heavy", "Pyro", "Spy", "Engineer"]
# SDK: tf_gamerules.cpp g_TFClassViewVectors (eye height above the origin, units).
CLASS_VIEW_Z = [72, 65, 75, 68, 68, 75, 75, 68, 75, 68]

AMMO_KEYS = ["primary", "secondary", "metal", "grenades1", "grenades2", "grenades3"]
LOADOUT_SLOTS = ["primary", "secondary", "melee", "utility", "building", "pda", "pda2"]
WEAPON_TYPES = [  # SDK: g_szWeaponTypeSubstrings / TF_WPN_TYPE_* order
    "PRIMARY", "SECONDARY", "MELEE", "GRENADE", "BUILDING", "PDA", "ITEM1", "ITEM2", "HEAD", "MISC",
    "MELEE_ALLCLASS", "SECONDARY2", "PRIMARY2", "ITEM3", "ITEM4", "PASSTIME_BALL",
]
SOUND_CATEGORIES = [  # SDK: weapon_parse.cpp pWeaponSoundCategories (WeaponSound_t order)
    "empty", "single_shot", "single_shot_npc", "double_shot", "double_shot_npc", "burst", "reload",
    "reload_npc", "melee_miss", "melee_hit", "melee_hit_world", "special1", "special2", "special3",
    "taunt", "deploy",
]


def kv_int(kv: KV, key: str, default: int) -> int:
    """KeyValues::GetInt: atoi of the string (so '0.8' reads as 0)."""
    v = kv.get(key)
    if v is None or isinstance(v, KV):
        return default
    m = re.match(r"\s*([-+]?\d+)", v)
    return int(m.group(1)) if m else 0


def kv_float(kv: KV, key: str, default: float) -> float:
    v = kv.get(key)
    if v is None or isinstance(v, KV):
        return default
    return num(v, 0.0)


def kv_str(kv: KV, key: str, default: str | None = None) -> str | None:
    v = kv.get(key)
    if v is None or isinstance(v, KV):
        return default
    return v


def parse_weapon_script(name: str, kv: KV, projectile_names: list[str]) -> dict[str, Any]:
    """SDK: FileWeaponInfo_t::Parse + CTFWeaponInfo::Parse (tf_weapon_parse.cpp)."""

    def proj(key: str, inherit: int | None) -> int:
        s = kv_str(kv, key, "projectile_none")
        for i, pn in enumerate(projectile_names):
            if s == pn and i > 0:
                return i
        return 0 if inherit is None else inherit

    p: dict[str, Any] = {
        "damage": kv_int(kv, "Damage", 0),
        "range": kv_float(kv, "Range", 8192.0),
        "bulletsPerShot": kv_int(kv, "BulletsPerShot", 0),
        "spread": kv_float(kv, "Spread", 0.0),
        "punchAngle": kv_float(kv, "PunchAngle", 0.0),
        "timeFireDelay": kv_float(kv, "TimeFireDelay", 0.0),
        "timeIdle": kv_float(kv, "TimeIdle", 0.0),
        # The SDK reads "TimeIdleEmpy" (sic), so the scripts' "TimeIdleEmpty" is never read.
        "timeIdleEmpty": kv_float(kv, "TimeIdleEmpy", 0.0),
        "timeReloadStart": kv_float(kv, "TimeReloadStart", 0.0),
        "timeReload": kv_float(kv, "TimeReload", 0.0),
        "drawCrosshair": kv_int(kv, "DrawCrosshair", 1) > 0,
        "ammoPerShot": kv_int(kv, "AmmoPerShot", 1),
        "useRapidFireCrits": kv_int(kv, "UseRapidFireCrits", 0) != 0,
        "projectile": proj("ProjectileType", None),
        "projectileSpeed": kv_float(kv, "ProjectileSpeed", 0.0),
        "smackDelay": kv_float(kv, "SmackDelay", 0.2),
    }
    s = {
        "damage": kv_int(kv, "Secondary_Damage", p["damage"]),
        "range": kv_float(kv, "Secondary_Range", p["range"]),
        "bulletsPerShot": kv_int(kv, "Secondary_BulletsPerShot", p["bulletsPerShot"]),
        "spread": kv_float(kv, "Secondary_Spread", p["spread"]),
        "punchAngle": kv_float(kv, "Secondary_PunchAngle", p["punchAngle"]),
        "timeFireDelay": kv_float(kv, "Secondary_TimeFireDelay", p["timeFireDelay"]),
        "timeIdle": kv_float(kv, "Secondary_TimeIdle", p["timeIdle"]),
        "timeIdleEmpty": kv_float(kv, "Secondary_TimeIdleEmpy", p["timeIdleEmpty"]),
        "timeReloadStart": kv_float(kv, "Secondary_TimeReloadStart", p["timeReloadStart"]),
        "timeReload": kv_float(kv, "Secondary_TimeReload", p["timeReload"]),
        "drawCrosshair": kv_int(kv, "Secondary_DrawCrosshair", int(p["drawCrosshair"])) > 0,
        "ammoPerShot": kv_int(kv, "Secondary_AmmoPerShot", p["ammoPerShot"]),
        "useRapidFireCrits": kv_int(kv, "Secondary_UseRapidFireCrits", 0) != 0,
        "projectile": proj("Secondary_ProjectileType", p["projectile"]),
        # m_flProjectileSpeed is never read for the secondary mode (stays 0 from Init()).
        "projectileSpeed": 0.0,
        "smackDelay": kv_float(kv, "Secondary_SmackDelay", 0.2),
    }
    for mode in (p, s):
        mode["projectile"] = projectile_names[mode["projectile"]] or "none"
        for k, v in list(mode.items()):
            if isinstance(v, float):
                mode[k] = as_num(v)

    def ammo(key: str) -> str | None:
        v = kv_str(kv, key, "None")
        if v == "None" or not v:
            return None
        return v.lower().replace("tf_ammo_", "")

    clip = kv_int(kv, "clip_size", -1)
    sounds = {}
    sd = kv.get("SoundData")
    if isinstance(sd, KV):
        for cat in SOUND_CATEGORIES:
            v = kv_str(sd, cat)
            if v:
                sounds[cat] = v
    wt = (kv_str(kv, "WeaponType", "") or "").upper()
    out: dict[str, Any] = {
        "scriptName": name,
        "printName": kv_str(kv, "printname", "!! Missing printname on weapon"),
        "weaponType": wt if wt in WEAPON_TYPES else "PRIMARY",
        "bucket": kv_int(kv, "bucket", 0),
        "bucketPosition": kv_int(kv, "bucket_position", 0),
        "clipSize": clip,
        "defaultClip": kv_int(kv, "default_clip", clip),
        "primaryAmmo": ammo("primary_ammo"),
        "secondaryAmmo": ammo("secondary_ammo"),
        "meleeWeapon": kv_int(kv, "MeleeWeapon", 0) != 0,
        "builtRightHanded": kv_int(kv, "BuiltRightHanded", 1) != 0,
        "animPrefix": kv_str(kv, "anim_prefix", ""),
        "primary": p,
        "secondary": s,
        "damageRadius": as_num(kv_float(kv, "DamageRadius", 0.0)),
        "lowerMainWeapon": kv_int(kv, "LowerMainWeapon", 0) != 0,
        "hasTeamSkinsViewmodel": kv_int(kv, "HasTeamSkins_Viewmodel", 0) != 0,
        "hasTeamSkinsWorldmodel": kv_int(kv, "HasTeamSkins_Worldmodel", 0) != 0,
        "doInstantEjectBrass": kv_int(kv, "DoInstantEjectBrass", 1) != 0,
        "sounds": sounds,
    }
    for key, field in (
        ("viewmodel", "scriptViewModel"),
        ("playermodel", "scriptPlayerModel"),
        ("MuzzleFlashModel", "muzzleFlashModel"),
        ("MuzzleFlashParticleEffect", "muzzleFlashParticle"),
        ("TracerEffect", "tracerEffect"),
        ("BrassModel", "brassModel"),
        ("ExplosionSound", "explosionSound"),
        ("ExplosionEffect", "explosionEffect"),
        ("ExplosionPlayerEffect", "explosionPlayerEffect"),
        ("ExplosionWaterEffect", "explosionWaterEffect"),
    ):
        v = kv_str(kv, key)
        if v:
            out[field] = v
    if kv_str(kv, "MuzzleFlashModel"):
        out["muzzleFlashModelDuration"] = as_num(kv_float(kv, "MuzzleFlashModelDuration", 0.2))
    return out


def parse_class_script(kv: KV, weapon_ids: list[str]) -> dict[str, Any]:
    """SDK: TFPlayerClassData_t::ParseData (tf_classdata.cpp)."""
    ammo_kv = kv.get("AmmoMax")
    ammo = {}
    for a in AMMO_KEYS:
        ammo[a] = kv_int(ammo_kv, "tf_ammo_" + a, 0) if isinstance(ammo_kv, KV) else 0
    weapons = []
    for i in range(1, 7):
        w = kv_str(kv, f"weapon{i}")
        if w and w.upper() in weapon_ids:
            weapons.append(w.upper())
    buildables = []
    for i in range(1, 7):
        b = kv_str(kv, f"buildable{i}")
        if b:
            buildables.append(b)
    return {
        "scriptName": kv_str(kv, "name", ""),
        "model": kv_str(kv, "model", ""),
        "modelHwm": kv_str(kv, "model_hwm", ""),
        "handsModel": kv_str(kv, "model_hands", ""),
        "localizeName": kv_str(kv, "localize_name", ""),
        "maxSpeed": as_num(kv_float(kv, "speed_max", 0)),
        "maxHealth": kv_int(kv, "health_max", 0),
        "maxArmor": kv_int(kv, "armor_max", 0),
        "maxAmmo": ammo,
        "scriptWeapons": weapons,
        "grenades": [g for g in (kv_str(kv, "grenade1"), kv_str(kv, "grenade2")) if g],
        "buildables": buildables,
        "thirdPersonCameraOffset": {
            "forward": as_num(kv_float(kv, "cameraoffset_forward", 0)),
            "right": as_num(kv_float(kv, "cameraoffset_right", 0)),
            "up": as_num(kv_float(kv, "cameraoffset_up", 0)),
        },
        "deathSounds": {
            "generic": kv_str(kv, "sound_death", "Player.Death"),
            "crit": kv_str(kv, "sound_crit_death", "TFPlayer.CritDeath"),
            "melee": kv_str(kv, "sound_melee_death", "Player.MeleeDeath"),
            "explosion": kv_str(kv, "sound_explosion_death", "Player.ExplosionDeath"),
        },
    }


class ItemSchema:
    """items_game.txt with prefab inheritance (SDK: econ_item_schema.cpp MergeDefinitionPrefab)."""

    def __init__(self, root: KV) -> None:
        self.prefabs = root.get("prefabs")
        self.items = root.get("items")
        self.attributes: dict[str, dict[str, Any]] = {}
        attrs = root.get("attributes")
        if isinstance(attrs, KV):
            for idx, a in attrs:
                if isinstance(a, KV):
                    nm = kv_str(a, "name")
                    if nm:
                        self.attributes[nm.lower()] = {
                            "defindex": int(idx) if idx.isdigit() else None,
                            "class": kv_str(a, "attribute_class"),
                            "descriptionFormat": kv_str(a, "description_format"),
                        }

    @staticmethod
    def _merge(dst: dict, src: dict) -> dict:
        for k, v in src.items():
            if isinstance(v, dict) and isinstance(dst.get(k), dict):
                ItemSchema._merge(dst[k], v)
            elif isinstance(v, dict):
                dst[k] = ItemSchema._merge({}, v)
            else:
                dst[k] = v
        return dst

    def resolve_kv(self, kv: KV) -> dict:
        out: dict = {}
        pf = kv_str(kv, "prefab")
        if pf:
            # Iterate backwards so adjectives apply over the noun prefab.
            for name in reversed(pf.split()):
                p = self.prefabs.get(name)
                if isinstance(p, KV):
                    self._merge(out, self.resolve_kv(p))
        self._merge(out, kv.to_py())
        return out

    def item(self, defindex: int) -> dict | None:
        kv = self.items.get(str(defindex))
        return self.resolve_kv(kv) if isinstance(kv, KV) else None

    def all_defindices(self) -> list[int]:
        return sorted(int(k) for k in self.items.keys() if k.isdigit())


def parse_sound_entry(kv: KV) -> dict[str, Any]:
    """One game_sounds entry (SDK: soundemittersystem's CSoundParametersInternal)."""

    def interval(v: str | None, named: dict[str, float], default: float) -> Any:
        if v is None:
            return default
        parts = [p.strip() for p in v.split(",")]
        vals = []
        for p in parts:
            if p.upper() in named:
                vals.append(named[p.upper()])
            else:
                vals.append(num(p, default))
        if len(vals) == 1 or vals[0] == vals[1]:
            return as_num(vals[0])
        return [as_num(vals[0]), as_num(vals[1])]

    level_names = {
        "SNDLVL_NONE": 0, "SNDLVL_IDLE": 60, "SNDLVL_STATIC": 66, "SNDLVL_NORM": 75,
        "SNDLVL_TALKING": 80, "SNDLVL_GUNFIRE": 140,
    }
    soundlevel: Any = 75
    sl = kv_str(kv, "soundlevel")
    if sl is not None:
        vals = []
        for p in sl.split(","):
            p = p.strip().upper()
            m = re.match(r"SNDLVL_(\d+)DB", p)
            if m:
                vals.append(int(m.group(1)))
            elif p in level_names:
                vals.append(level_names[p])
            else:
                vals.append(int(num(p, 75)))
        soundlevel = vals[0] if len(vals) == 1 or vals[0] == vals[1] else vals
    else:
        at = kv_str(kv, "attenuation")
        if at is not None:
            attn_names = {"ATTN_NONE": 0, "ATTN_NORM": 0.8, "ATTN_IDLE": 2.0, "ATTN_STATIC": 1.25,
                          "ATTN_RICOCHET": 1.5, "ATTN_GUNFIRE": 0.27}
            a = attn_names.get(at.strip().upper(), num(at, 0.8))
            soundlevel = int(50 + 20 / a) if a else 0  # SDK: ATTN_TO_SNDLVL
    waves: list[str] = []
    w = kv.get("wave")
    if isinstance(w, str):
        waves.append(w)
    rw = kv.get("rndwave")
    if isinstance(rw, KV):
        waves.extend(v for k, v in rw if k.lower() == "wave" and isinstance(v, str))
    clean = []
    for wv in waves:
        wv = wv.replace("\\", "/")
        m = re.match(r"^([\^)(}*#@<>?!&~`+$%]*)(.*)$", wv)
        clean.append(m.group(2) if m else wv)
    chan = (kv_str(kv, "channel", "CHAN_AUTO") or "CHAN_AUTO").upper()
    if chan.isdigit():
        chan = ["CHAN_AUTO", "CHAN_WEAPON", "CHAN_VOICE", "CHAN_ITEM", "CHAN_BODY", "CHAN_STREAM",
                "CHAN_STATIC", "CHAN_VOICE2"][int(chan)]
    return {
        "channel": chan,
        "volume": interval(kv_str(kv, "volume"), {"VOL_NORM": 1.0}, 1.0),
        "pitch": interval(kv_str(kv, "pitch"), {"PITCH_NORM": 100, "PITCH_LOW": 95, "PITCH_HIGH": 120}, 100),
        "soundlevel": soundlevel,
        "waves": clean,
    }


# ---------------------------------------------------------------------------
# SDK behaviour facts per weapon C++ class that are not in the scripts.
# Each value is transcribed from the named SDK file.
# ---------------------------------------------------------------------------

# Script name -> (reloadsSingly, randomCrits).
#   reloadsSingly: CTFWeaponBase::m_bReloadsSingly (set true in the constructors of
#     CTFShotgun [tf_weapon_shotgun.cpp, inherited by CTFScatterGun], CTFRocketLauncher,
#     CTFGrenadeLauncher, CTFPipebombLauncher; false otherwise — basecombatweapon_shared.cpp).
#   randomCrits: 'ranged' = CTFWeaponBase::CalcIsAttackCriticalHelper per-shot roll;
#     'rapid' = the same with UseRapidFireCrits (2 s crit bursts); 'melee' =
#     CTFWeaponBaseMelee::CalcIsAttackCriticalHelper (15%); 'backstab' = CTFKnife (crit only
#     from behind); 'headshot' = CTFSniperRifle::CanFireCriticalShot (crit only on zoomed
#     headshots); 'none' = deals no damage.
WEAPON_CLASS_FACTS: dict[str, tuple[bool, str]] = {
    "tf_weapon_bat": (False, "melee"),
    "tf_weapon_bottle": (False, "melee"),
    "tf_weapon_fireaxe": (False, "melee"),
    "tf_weapon_club": (False, "melee"),
    "tf_weapon_knife": (False, "backstab"),
    "tf_weapon_fists": (False, "melee"),
    "tf_weapon_shovel": (False, "melee"),
    "tf_weapon_wrench": (False, "melee"),
    "tf_weapon_bonesaw": (False, "melee"),
    "tf_weapon_shotgun_primary": (True, "ranged"),
    "tf_weapon_shotgun_soldier": (True, "ranged"),
    "tf_weapon_shotgun_hwg": (True, "ranged"),
    "tf_weapon_shotgun_pyro": (True, "ranged"),
    "tf_weapon_scattergun": (True, "ranged"),
    "tf_weapon_sniperrifle": (False, "headshot"),
    "tf_weapon_minigun": (False, "rapid"),
    "tf_weapon_smg": (False, "rapid"),
    "tf_weapon_syringegun_medic": (False, "rapid"),
    "tf_weapon_rocketlauncher": (True, "ranged"),
    "tf_weapon_grenadelauncher": (True, "ranged"),
    "tf_weapon_pipebomblauncher": (True, "ranged"),
    "tf_weapon_flamethrower": (False, "rapid"),
    "tf_weapon_pistol": (False, "ranged"),
    "tf_weapon_pistol_scout": (False, "ranged"),
    "tf_weapon_revolver": (False, "ranged"),
    "tf_weapon_pda_engineer_build": (False, "none"),
    "tf_weapon_pda_engineer_destroy": (False, "none"),
    "tf_weapon_pda_spy": (False, "none"),
    "tf_weapon_builder": (False, "none"),
    "tf_weapon_medigun": (False, "none"),
    "tf_weapon_invis": (False, "none"),
}
# Weapon scripts whose C++ class reports a different ETFWeaponType than the upper-cased name.
WEAPON_ID_OVERRIDES = {"tf_weapon_sapper": "TF_WEAPON_BUILDER"}

# SDK: tf_weaponbase.cpp s_viewmodelacttable — base activity -> role activity.
VM_ACT_BASES = [
    "ACT_VM_DRAW", "ACT_VM_HOLSTER", "ACT_VM_IDLE", "ACT_VM_PULLBACK", "ACT_VM_PRIMARYATTACK",
    "ACT_VM_SECONDARYATTACK", "ACT_VM_RELOAD", "ACT_RELOAD_START", "ACT_RELOAD_FINISH",
    "ACT_VM_DRYFIRE", "ACT_VM_IDLE_TO_LOWERED", "ACT_VM_IDLE_LOWERED", "ACT_VM_LOWERED_TO_IDLE",
    "ACT_VM_HITCENTER", "ACT_VM_SWINGHARD",
]
VM_ACT_ROLE_PREFIX = {"PRIMARY": "PRIMARY", "SECONDARY": "SECONDARY", "MELEE": "MELEE", "PDA": "PDA",
                      "ITEM1": "ITEM1", "ITEM2": "ITEM2", "ITEM3": "ITEM3", "ITEM4": "ITEM4",
                      "MELEE_ALLCLASS": "MELEE_ALLCLASS", "SECONDARY2": "SECONDARY2", "PRIMARY2": "PRIMARY"}


def vm_activity_table(role: str) -> dict[str, str]:
    """The role's rows of s_viewmodelacttable (tf_weaponbase.cpp)."""
    pre = VM_ACT_ROLE_PREFIX.get(role)
    out: dict[str, str] = {}
    if pre is None:  # BUILDING / GRENADE have no rows: base activities are used as-is
        return out
    has_reload_startfinish = role in ("PRIMARY", "SECONDARY", "ITEM1", "SECONDARY2", "PRIMARY2")
    has_melee = role in ("MELEE", "MELEE_ALLCLASS")
    for base in VM_ACT_BASES:
        if base in ("ACT_RELOAD_START", "ACT_RELOAD_FINISH"):
            if not has_reload_startfinish:
                continue
            suffix = base.replace("ACT_", "")
            out[base] = f"ACT_{pre}_{suffix}"
            continue
        if base in ("ACT_VM_HITCENTER", "ACT_VM_SWINGHARD") and not has_melee:
            continue
        if base == "ACT_VM_SECONDARYATTACK" and role in ("SECONDARY2", "PRIMARY2"):
            continue
        out[base] = base.replace("ACT_VM_", f"ACT_{pre}_VM_")
    if role == "PRIMARY2":  # PRIMARY2 reload rows use the *_3 sequences
        out["ACT_VM_RELOAD"] = "ACT_PRIMARY_VM_RELOAD_3"
        out["ACT_RELOAD_START"] = "ACT_PRIMARY_RELOAD_START_3"
        out["ACT_RELOAD_FINISH"] = "ACT_PRIMARY_RELOAD_FINISH_3"
    if role == "MELEE":
        for a in ("ACT_BACKSTAB_VM_DOWN", "ACT_BACKSTAB_VM_UP", "ACT_BACKSTAB_VM_IDLE"):
            out[a] = a
    return out


# Sounds the stock game needs beyond those named by weapon/class/object scripts.
SOUND_PATTERNS = [
    r"^Announcer\.(RoundBegins\d+[Ss]econds|RoundEnds\d+(seconds|minutes)|Success|Failure|"
    r"ControlPointContested(_Neutral)?|TimeAdded(ForEnemy)?|TimeAwarded\w*|Cart\.(Final)?Warning|"
    r"(Our|Enemy)TeamCloseToWinning|(Our|Their|Your)Team\w*|"
    r"(Attack|Capture|Defend)\w*|AM_RoundStart\w*|SuddenDeath|Overtime\w*|Stalemate|"
    r"We\w*|They\w*|Last\w*|Sec\w*|Your\w*|Final\w*|Warning\w*)$",
    r"^(AttackDefend|CaptureFlag|Invade|Resource)\.\w+$",
    r"^Game\.(YourTeamWon|YourTeamLost|Stalemate|Overtime|SuddenDeath|Domination|Nemesis|Revenge)$",
    r"^Hud\.\w+$",
    r"^Player\.(Death|MeleeDeath|ExplosionDeath|FallDamage\w*|FallGib|Spawn|OnFire|Spy_\w+|UseDeny|"
    r"DenyWeaponSelection|WeaponSelect\w*|HitSoundDefaultDing|KillSoundDefaultDing|Swim|Wade|"
    r"ResistanceLight|ResistanceMedium|ResistanceHeavy|AmmoPickup|PickupWeapon|DrownStart|DrownContinue)$",
    r"^TFPlayer\.(AirBlastImpact|AttackerPain|CritBoostOff|CritBoostOn|CritDeath|CritHit|CritHitMini|"
    r"CritPain|Drown|FlameOut|FlareImpact|FreezeCam|InvulnerableOff|InvulnerableOn|MedicChargedDeath|"
    r"Pain|ReCharged|SaveMe|StunImpact|StunImpactRange|DoubleDonk|Decapitated)$",
    r"^WeaponMedigun\.\w+$",
    r"^Building_(Sentrygun|Dispenser|Teleporter|MiniSentrygun)\.\w+$",
    r"^Building_Sentry\.\w+$",
    r"^BaseExplosionEffect\.Sound$",
    r"^BaseCombatCharacter\.AmmoPickup$",
    r"^HealthKit\.Touch$|^AmmoPack\.Touch$|^Regenerate\.Touch$|^Item\.\w+$",
    r"^Weapon_(Grenade_Pipebomb|StickyBombLauncher|Sapper|General|Crowbar)\.\w+$",
    r"^Weapon_FlameThrower\.\w+$",
    r"^Weapon_Wrench\.\w+$",
    r"^\w+\.Step(Left|Right)$|^Ladder\.\w+$",
    r"^\w+\.BulletImpact$",
    r"^Bounce\.\w+$|^Flesh\.\w+$",
    r"^Default\.(ImpactSoft|ImpactHard)$",
]
VOICE_SUFFIXES = re.compile(
    # Pain and death (CTFPlayer::PainSound / DeathSound), the Medic call, the on-fire shout,
    # and the Medic's charge-ready / charge-deploy lines.
    r"^(PainSharp\d+|PainSevere\d+|PainCrticialDeath\d+|AutoOnFire\d+|Medic\d+|Death|CritDeath|"
    r"MeleeDeath|ExplosionDeath|AutoChargeReady\d+|ActivateCharge\d+)$"
)


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def load_english(g: GameFiles) -> dict[str, str]:
    root = parse_kv(g.text("resource/tf_english.txt"))
    lang = first_block(root)
    tokens = lang.get("Tokens")
    out: dict[str, str] = {}
    if isinstance(tokens, KV):
        for k, v in tokens:
            if isinstance(v, str) and k.lower() not in out:
                out[k.lower()] = v
    return out


def english(tokens: dict[str, str], key: str | None) -> str | None:
    if not key:
        return None
    return tokens.get(key.lstrip("#").lower())


def extract(g: GameFiles, sdk: Sdk) -> dict[str, Any]:
    weapon_ids = [n for n, _ in sdk.enum("game/shared/tf/tf_shareddefs.h", "ETFWeaponType")]
    weapon_ids = [n for n in weapon_ids if n != "TF_WEAPON_COUNT"]
    projectile_names = sdk.string_array("game/shared/tf/tf_shareddefs.cpp", "g_szProjectileNames")
    bits = sdk.dmg_bits()
    weapon_dmg = sdk.weapon_damage_types(weapon_ids, bits)
    tokens = load_english(g)

    # --- items (stock = baseitem 1, as GetBaseItemDefinitionMap) ---
    schema = ItemSchema(first_block(g.kv("scripts/items/items_game.txt")))
    stock: dict[int, dict] = {}
    upgradeable: dict[int, int] = {}
    for idx in schema.all_defindices():
        raw = schema.items.get(str(idx))
        if kv_str(raw, "baseitem") == "1":
            it = schema.item(idx)
            # The class weapon slots only: the action/utility base items (spellbook,
            # grappling hook, PASS Time gun, MvM canteen) are mode-specific.
            if it.get("item_slot") in ("action", "utility"):
                continue
            stock[idx] = it
    base_names = {it["name"]: idx for idx, it in stock.items()}
    for idx in schema.all_defindices():
        raw = schema.items.get(str(idx))
        nm = kv_str(raw, "name", "") or ""
        if nm.startswith("Upgradeable ") and nm[len("Upgradeable "):] in base_names:
            upgradeable[idx] = base_names[nm[len("Upgradeable "):]]

    def loadout_slot(it: dict, cls: str) -> str | None:
        ub = it.get("used_by_classes") or {}
        v = ub.get(cls)
        if v is None:
            return None
        return v if v != "1" else it.get("item_slot")

    # --- classes ---
    classes: list[dict | None] = [None]
    for ci in range(1, 10):
        kv = first_block(g.kv(f"scripts/playerclasses/{CLASS_FILES[ci]}.ctx"))
        c = parse_class_script(kv, weapon_ids)
        c["classIndex"] = ci
        c["name"] = CLASS_NAMES[ci]
        c["displayName"] = english(tokens, c["localizeName"]) or c["name"]
        c["viewOffsetZ"] = CLASS_VIEW_Z[ci]
        c["voicePrefix"] = VOICE_PREFIX[ci]
        # SDK: CTFInventoryManager::GetBaseItemForClass — the first base item (by defindex)
        # whose loadout slot for this class matches.
        loadout: dict[str, int] = {}
        for slot in LOADOUT_SLOTS:
            for idx in sorted(stock):
                if loadout_slot(stock[idx], ITEM_CLASS_KEYS[ci]) == slot:
                    loadout[slot] = idx
                    break
        c["defaultLoadout"] = loadout
        classes.append(c)

    # --- weapon scripts used by the stock items ---
    def translate(item_class: str, ci: int) -> str:
        # SDK: tf_shareddefs.cpp TranslateWeaponEntForClass (the stock-relevant rows)
        table = {
            "tf_weapon_shotgun": {3: "tf_weapon_shotgun_soldier", 6: "tf_weapon_shotgun_hwg",
                                  7: "tf_weapon_shotgun_pyro", 9: "tf_weapon_shotgun_primary"},
            "tf_weapon_pistol": {1: "tf_weapon_pistol_scout", 9: "tf_weapon_pistol"},
        }
        return table.get(item_class, {}).get(ci, item_class)

    scripts: dict[str, dict] = {}
    weapons: dict[int, dict] = {}
    for idx, it in sorted(stock.items()):
        ic = it.get("item_class")
        if not ic or not ic.startswith("tf_weapon_"):
            continue
        per_class: dict[str, dict] = {}
        for ci in range(1, 10):
            slot = loadout_slot(it, ITEM_CLASS_KEYS[ci])
            if slot is None:
                continue
            sname = translate(ic, ci)
            per_class[CLASS_NAMES[ci]] = {"scriptName": sname, "slot": slot}
            if sname not in scripts:
                kv = first_block(g.kv(f"scripts/{sname}.ctx"))
                s = parse_weapon_script(sname, kv, projectile_names)
                wid_name = WEAPON_ID_OVERRIDES.get(sname, sname.upper())
                s["weaponIdName"] = wid_name
                s["weaponId"] = weapon_ids.index(wid_name)
                dval, dexpr = weapon_dmg.get(wid_name, (0, "DMG_GENERIC"))
                s["damageType"] = Commented(dval, f"g_aWeaponDamageTypes: {dexpr}")
                singly, crits = WEAPON_CLASS_FACTS[sname]
                if crits in ("ranged", "rapid"):
                    crits = "rapid" if s["primary"]["useRapidFireCrits"] else "ranged"
                s["reloadsSingly"] = singly
                s["randomCrits"] = crits
                scripts[sname] = s
        first_script = scripts[next(iter(per_class.values()))["scriptName"]]
        anim_slot = it.get("anim_slot")
        role = first_script["weaponType"]
        if anim_slot and anim_slot.upper() != "FORCE_NOT_USED" and anim_slot.upper() in WEAPON_TYPES:
            role = anim_slot.upper()
        repl = (it.get("visuals") or {}).get("animation_replacement") or {}
        vm = vm_activity_table(role)
        for base, act in repl.items():
            vm[base] = act
        snd = dict(first_script["sounds"])
        for k, v in (it.get("visuals") or {}).items():
            if k.startswith("sound_") and isinstance(v, str):
                snd[k[len("sound_"):]] = v
        weapons[idx] = {
            "defindex": idx,
            "name": it.get("name"),
            "displayName": english(tokens, it.get("item_name")) or it.get("name"),
            "itemClass": ic,
            "perClass": per_class,
            "role": role,
            "viewModel": it.get("model_player") or None,
            "attachToHands": it.get("attach_to_hands") == "1",
            "worldModel": it.get("model_world") or it.get("model_player") or None,
            "vmActivities": vm,
            "sounds": snd,
        }

    return {
        "weaponIds": weapon_ids,
        "projectileNames": projectile_names,
        "bits": bits,
        "tokens": tokens,
        "schema": schema,
        "stock": stock,
        "upgradeable": upgradeable,
        "classes": classes,
        "scripts": scripts,
        "weapons": weapons,
        "loadoutSlot": loadout_slot,
    }


def load_surfaces(g: GameFiles) -> dict[str, dict[str, Any]]:
    """Surface properties (SDK: physics surface manifest): hl2's two files, then tf's."""
    import vpk  # type: ignore

    hl2 = vpk.open(os.path.join(g.root, "hl2", "hl2_misc_dir.vpk"))
    texts = [
        hl2.get_file("scripts/surfaceproperties.txt").read().decode("latin-1"),
        hl2.get_file("scripts/surfaceproperties_hl2.txt").read().decode("latin-1"),
        g.text("scripts/surfaceproperties_tf.txt"),
    ]
    raw: dict[str, dict[str, str]] = {}
    order: list[str] = []
    for t in texts:
        for name, body in parse_kv(t):
            if not isinstance(body, KV):
                continue
            key = name.lower()
            if key not in raw:
                order.append(key)
                raw[key] = {}
            for k, v in body:
                if isinstance(v, str):
                    raw[key][k.lower()] = v

    resolved: dict[str, dict[str, str]] = {}

    def resolve(name: str, depth: int = 0) -> dict[str, str]:
        if name in resolved:
            return resolved[name]
        props = raw.get(name, {})
        base_name = props.get("base", "default" if name != "default" else None)
        base = resolve(base_name.lower(), depth + 1) if base_name and depth < 16 else {}
        merged = dict(base)
        merged.update(props)
        resolved[name] = merged
        return merged

    out: dict[str, dict[str, Any]] = {}
    for name in order:
        p = resolve(name)
        gm = p.get("gamematerial", "C")
        out[name] = {
            "stepLeft": p.get("stepleft"),
            "stepRight": p.get("stepright"),
            "bulletImpact": p.get("bulletimpact"),
            "impactHard": p.get("impacthard"),
            "impactSoft": p.get("impactsoft"),
            "gameMaterial": gm,
        }
    return out


def load_sounds(g: GameFiles) -> dict[str, dict[str, Any]]:
    manifest = first_block(g.kv("scripts/game_sounds_manifest.txt"))
    out: dict[str, dict[str, Any]] = {}
    sources: dict[str, str] = {}
    files = [v for k, v in manifest if k.lower() in ("precache_file", "preload_file")]
    files.append("scripts/game_sounds_footsteps.txt")  # loaded by the engine's base manifest
    for path in files:
        try:
            root = parse_kv(g.text(path))
        except Exception:
            continue
        for name, body in root:
            if isinstance(body, KV) and name not in out:
                out[name] = parse_sound_entry(body)
                sources[name] = path
    for name in out:
        out[name]["source"] = sources[name]
    return out


GEN_NOTE = (
    "GENERATED by scripts/tf2-game/extract-data.py from a TF2 install's game scripts.\n"
    " * Re-run the script instead of editing by hand; a block between HAND-MAINTAINED\n"
    " * markers at the end of the file, where there is one, is preserved across runs."
)


def emit_items(d: dict[str, Any], out_dir: str) -> None:
    schema: ItemSchema = d["schema"]
    tokens = d["tokens"]
    items: dict[int, Any] = {}
    for idx, it in sorted(d["stock"].items()):
        attrs = []
        for section in ("static_attrs", "attributes"):
            for aname, aval in (it.get(section) or {}).items():
                info = schema.attributes.get(aname.lower(), {})
                if isinstance(aval, dict):
                    cls = aval.get("attribute_class") or info.get("class")
                    val = aval.get("value")
                else:
                    cls = info.get("class")
                    val = aval
                v: Any = val
                if isinstance(val, str) and re.fullmatch(r"-?\d+(\.\d+)?", val.strip()):
                    v = as_num(float(val))
                attrs.append({"name": aname, "class": cls, "value": v})
        used = {}
        for ci in range(1, 10):
            slot = d["loadoutSlot"](it, ITEM_CLASS_KEYS[ci])
            if slot:
                used[CLASS_NAMES[ci]] = slot
        visuals = it.get("visuals") or {}
        entry: dict[str, Any] = {
            "defindex": idx,
            "name": it.get("name"),
            "itemName": it.get("item_name"),
            "displayName": english(tokens, it.get("item_name")) or it.get("name"),
            "itemClass": it.get("item_class"),
            "itemSlot": it.get("item_slot"),
            "usedByClasses": used,
            "modelPlayer": it.get("model_player") or None,
        }
        if it.get("model_world"):
            entry["modelWorld"] = it.get("model_world")
        entry["attachToHands"] = it.get("attach_to_hands") == "1"
        if it.get("anim_slot"):
            entry["animSlot"] = it.get("anim_slot").upper()
        entry["attributes"] = attrs
        repl = visuals.get("animation_replacement")
        if repl:
            entry["animationReplacement"] = repl
        vsounds = {k[len("sound_"):]: v for k, v in visuals.items() if k.startswith("sound_") and isinstance(v, str)}
        if vsounds:
            entry["soundOverrides"] = vsounds
        items[idx] = Commented(entry, f"items_game.txt items/{idx} (prefab: {it.get('prefab', '-')})")

    text = f"""/**
 * Stock items (the base item of every class weapon slot) from scripts/items/items_game.txt,
 * with prefabs merged the way the SDK does (econ_item_schema.cpp MergeDefinitionPrefab:
 * prefabs applied right-to-left, then the item's own keys). "Stock" means `baseitem 1`,
 * which is what CTFInventoryManager::GetBaseItemForClass hands out; the mode-specific
 * action/utility base items (spellbook, grappling hook, PASS Time gun, canteen) are left out.
 *
 * {GEN_NOTE}
 */

import type {{ ClassName }} from '../core/constants';
import type {{ LoadoutSlot }} from './classes';

export interface ItemAttribute {{
  /** Attribute name as items_game spells it (e.g. 'flame_speed', 'min_viewmodel_offset'). */
  name: string;
  /** attribute_class the game code hooks on (CALL_ATTRIB_HOOK_*), when the schema defines one. */
  class: string | null;
  value: number | string;
}}

export interface StockItem {{
  defindex: number;
  /** items_game internal name, e.g. 'TF_WEAPON_ROCKETLAUNCHER'. */
  name: string;
  /** Localization token, e.g. '#TF_Weapon_RocketLauncher'. */
  itemName: string;
  /** English name from resource/tf_english.txt. */
  displayName: string;
  /** Entity class before per-class translation (TranslateWeaponEntForClass). */
  itemClass: string;
  /** Default loadout slot ('item_slot'). */
  itemSlot: LoadoutSlot;
  /** Classes that can equip the item and the slot each puts it in. */
  usedByClasses: Partial<Record<ClassName, LoadoutSlot>>;
  /** c_model drawn in the world and bonemerged onto the class arms in first person (null: none). */
  modelPlayer: string | null;
  modelWorld?: string;
  /** True when the first-person view is the class arms model with modelPlayer bonemerged. */
  attachToHands: boolean;
  /** items_game anim_slot override of the weapon role (FORCE_NOT_USED = keep the script's). */
  animSlot?: string;
  attributes: readonly ItemAttribute[];
  /** visuals/animation_replacement: activity -> activity overrides. */
  animationReplacement?: Readonly<Record<string, string>>;
  /** visuals sound_* overrides of the weapon script's SoundData (category -> sound entry). */
  soundOverrides?: Readonly<Record<string, string>>;
}}

export const STOCK_ITEMS: Readonly<Record<number, StockItem>> = {ts(items)};

/**
 * The strange-able "Upgradeable" copies of the stock items (items_game names
 * 'Upgradeable <base name>') mapped to the stock defindex they behave as.
 */
export const UPGRADEABLE_STOCK_ALIASES: Readonly<Record<number, number>> = {ts(d['upgradeable'])};

/** The stock item for a defindex, following the Upgradeable aliases. */
export function getStockItem(defindex: number): StockItem | undefined {{
  return STOCK_ITEMS[defindex] ?? STOCK_ITEMS[UPGRADEABLE_STOCK_ALIASES[defindex] ?? -1];
}}
"""
    write_module(os.path.join(out_dir, "items.ts"), text, None)


def emit_classes(d: dict[str, Any], out_dir: str) -> None:
    data: dict[int, Any] = {}
    for c in d["classes"][1:]:
        entry = {
            "classIndex": c["classIndex"],
            "name": c["name"],
            "displayName": c["displayName"],
            "scriptName": c["scriptName"],
            "localizeName": c["localizeName"],
            "model": c["model"],
            "modelHwm": c["modelHwm"],
            "handsModel": c["handsModel"],
            "maxHealth": c["maxHealth"],
            "maxSpeed": c["maxSpeed"],
            "maxArmor": c["maxArmor"],
            "viewOffsetZ": c["viewOffsetZ"],
            "maxAmmo": c["maxAmmo"],
            "defaultLoadout": c["defaultLoadout"],
            "scriptWeapons": c["scriptWeapons"],
            "grenades": c["grenades"],
            "buildables": c["buildables"],
            "deathSounds": c["deathSounds"],
            "voicePrefix": c["voicePrefix"],
            "thirdPersonCameraOffset": c["thirdPersonCameraOffset"],
        }
        data[c["classIndex"]] = Commented(entry, f"scripts/playerclasses/{CLASS_FILES[c['classIndex']]}.ctx")
    text = f"""/**
 * The nine classes, from scripts/playerclasses/*.ctx (ICE-decrypted; SDK:
 * TFPlayerClassData_t::ParseData), plus the SDK tables the scripts do not carry
 * (eye heights: tf_gamerules.cpp g_TFClassViewVectors; default loadout:
 * CTFInventoryManager::GetBaseItemForClass over items_game's base items).
 *
 * Every class shares one hull (tf_gamerules.cpp g_TFViewVectors: 48x48x82 standing,
 * 48x48x62 ducked) — see VEC_HULL_* in core/constants.ts and PLAYER_HULL below.
 *
 * {GEN_NOTE}
 */

import {{
  VEC_DUCK_HULL_MAX,
  VEC_DUCK_HULL_MIN,
  VEC_DUCK_VIEW_Z,
  VEC_HULL_MAX,
  VEC_HULL_MIN,
  type ClassName,
}} from '../core/constants';

/** ETFAmmoType (tf_shareddefs.h), minus the dummy slot 0. */
export type AmmoType = 'primary' | 'secondary' | 'metal' | 'grenades1' | 'grenades2' | 'grenades3';
export const TF_AMMO: Readonly<Record<AmmoType, number>> = {{
  primary: 1,
  secondary: 2,
  metal: 3,
  grenades1: 4,
  grenades2: 5,
  grenades3: 6,
}};

/** loadout_positions_t (tf_item_constants.h) weapon slots, as items_game names them. */
export type LoadoutSlot = 'primary' | 'secondary' | 'melee' | 'utility' | 'building' | 'pda' | 'pda2';
export const LOADOUT_POSITION: Readonly<Record<LoadoutSlot, number>> = {{
  primary: 0,
  secondary: 1,
  melee: 2,
  utility: 3,
  building: 4,
  pda: 5,
  pda2: 6,
}};

/** objects.txt section names (ObjectType_t order: dispenser 0, teleporter 1, sentry 2, sapper 3). */
export type BuildableName = 'OBJ_DISPENSER' | 'OBJ_TELEPORTER' | 'OBJ_SENTRYGUN' | 'OBJ_ATTACHMENT_SAPPER';

export interface ClassData {{
  /** ETFClass (core/constants.ts TF_CLASS_*). */
  classIndex: number;
  name: ClassName;
  displayName: string;
  /** The playerclass script's own "name" (heavyweapons for the Heavy). */
  scriptName: string;
  localizeName: string;
  /** models/player/<class>.mdl */
  model: string;
  /** High-quality variant the PC client loads when present. */
  modelHwm: string;
  /** First-person arms (c_models are bonemerged onto these). */
  handsModel: string;
  maxHealth: number;
  /** Max ground speed, units/s (speed_max). */
  maxSpeed: number;
  maxArmor: number;
  /** Eye height above the origin, standing (g_TFClassViewVectors). Ducked: VEC_DUCK_VIEW_Z. */
  viewOffsetZ: number;
  /** Reserve ammo caps per ammo type (AmmoMax; clips are on top of this). */
  maxAmmo: Readonly<Record<AmmoType, number>>;
  /** Stock item defindex per loadout slot (see items.ts / weapons.ts). */
  defaultLoadout: Readonly<Partial<Record<LoadoutSlot, number>>>;
  /** The script's weapon1..6 (ETFWeaponType names) — the pre-items default set. */
  scriptWeapons: readonly string[];
  /** Unused grenade slots left in the scripts from the TFC design. */
  grenades: readonly string[];
  buildables: readonly BuildableName[];
  /** Death sound entries (sound_death / _crit_death / _melee_death / _explosion_death). */
  deathSounds: Readonly<{{ generic: string; crit: string; melee: string; explosion: string }}>;
  /** game_sounds prefix of the class's voice lines ('<Prefix>.PainSharp01' ...). */
  voicePrefix: string;
  /** cameraoffset_* for third person. */
  thirdPersonCameraOffset: Readonly<{{ forward: number; right: number; up: number }}>;
}}

export const CLASS_DATA: Readonly<Record<number, ClassData>> = {ts(data)};

/** Class data by ETFClass; throws for TF_CLASS_UNDEFINED or out-of-range values. */
export function getClassData(classIndex: number): ClassData {{
  const c = CLASS_DATA[classIndex];
  if (!c) throw new Error(`no TF class ${{classIndex}}`);
  return c;
}}

/** Shared player hull (every class uses g_TFViewVectors). */
export const PLAYER_HULL = {{
  standMins: VEC_HULL_MIN,
  standMaxs: VEC_HULL_MAX,
  duckMins: VEC_DUCK_HULL_MIN,
  duckMaxs: VEC_DUCK_HULL_MAX,
  duckViewZ: VEC_DUCK_VIEW_Z,
  /** VEC_DEAD_VIEWHEIGHT. */
  deadViewZ: 14,
}} as const;
"""
    write_module(os.path.join(out_dir, "classes.ts"), text, "")


def emit_weapons(d: dict[str, Any], out_dir: str) -> None:
    scripts = {}
    for name in sorted(d["scripts"]):
        s = dict(d["scripts"][name])
        order = [
            "scriptName", "weaponIdName", "weaponId", "printName", "weaponType", "bucket",
            "bucketPosition", "clipSize", "defaultClip", "primaryAmmo", "secondaryAmmo",
            "meleeWeapon", "reloadsSingly", "randomCrits", "damageType", "builtRightHanded",
            "animPrefix", "primary", "secondary", "damageRadius", "lowerMainWeapon",
            "hasTeamSkinsViewmodel", "hasTeamSkinsWorldmodel", "doInstantEjectBrass",
        ]
        ordered = {k: s.pop(k) for k in order if k in s}
        ordered.update(s)
        scripts[name] = Commented(ordered, f"scripts/{name}.ctx")
    weapons = {}
    for idx, w in sorted(d["weapons"].items()):
        weapons[idx] = Commented(w, f"items_game items/{idx} + the scripts named in perClass")
    ids = {n: i for i, n in enumerate(d["weaponIds"])}
    projectiles = [p or "none" for p in d["projectileNames"]]
    script_names = " | ".join(f"'{n}'" for n in sorted(d["scripts"]))
    text = f"""/**
 * Stock weapon tables: every weapon script the stock items use (scripts/tf_weapon_*.ctx,
 * parsed exactly as FileWeaponInfo_t::Parse + CTFWeaponInfo::Parse do, defaults included)
 * and every stock weapon item joined to its per-class script, models, view-model
 * activities and sounds. Hard-coded SDK behaviour (projectile speeds, charge rates,
 * medigun/flamethrower/minigun rules, ...) is in the hand-maintained block at the end.
 *
 * Script quirks kept as the SDK reads them: "TimeIdleEmpty" is never read (the parser asks
 * for "TimeIdleEmpy"), so timeIdleEmpty is 0 everywhere; "Range" defaults to 8192.
 *
 * {GEN_NOTE}
 */

import type {{ ClassName }} from '../core/constants';
import type {{ AmmoType, LoadoutSlot }} from './classes';

/** TF_WPN_TYPE_* / g_szWeaponTypeSubstrings: the activity set a weapon animates with. */
export type WeaponRole = {" | ".join(f"'{r}'" for r in WEAPON_TYPES)};
export const WEAPON_ROLES: readonly WeaponRole[] = {ts(WEAPON_TYPES)};

/** g_szProjectileNames, indexed by ProjectileType_t ('none' for TF_PROJECTILE_NONE). */
export const PROJECTILE_TYPES = {ts(projectiles)} as const;
export type ProjectileType = (typeof PROJECTILE_TYPES)[number];

/** WeaponSound_t categories (weapon_parse.cpp pWeaponSoundCategories). */
export type WeaponSoundCategory = {" | ".join(f"'{c}'" for c in SOUND_CATEGORIES)};

/**
 * How a weapon's random crits work (SDK: CTFWeaponBase::CalcIsAttackCriticalHelper and the
 * overrides): 'ranged' rolls per shot, 'rapid' starts 2 s crit bursts (UseRapidFireCrits),
 * 'melee' rolls 15% per swing, 'backstab' crits only from behind (CTFKnife), 'headshot'
 * crits only on zoomed headshots (CTFSniperRifle), 'none' deals no damage.
 */
export type RandomCritMode = 'ranged' | 'rapid' | 'melee' | 'backstab' | 'headshot' | 'none';

/** ETFWeaponType (tf_shareddefs.h) — GetWeaponID() values. */
export const TF_WEAPON_IDS: Readonly<Record<string, number>> = {ts(ids)};

/** One fire mode of a weapon script (WeaponData_t). */
export interface WeaponFireMode {{
  /** Damage per bullet / projectile (medigun: heal per second; flamethrower: per second, unused — see FLAMETHROWER). */
  damage: number;
  range: number;
  bulletsPerShot: number;
  /** Spread as a vector-cone half-width (multiplied by the right/up spread variance). */
  spread: number;
  /** View kick in degrees (UpdatePunchAngles: pitch -= randomInt(p - 1, p + 1)). */
  punchAngle: number;
  /** Seconds between shots / swings. */
  timeFireDelay: number;
  timeIdle: number;
  timeIdleEmpty: number;
  /** Reload timings used when the view model has no reload sequence (UpdateReloadTimers). */
  timeReloadStart: number;
  timeReload: number;
  drawCrosshair: boolean;
  ammoPerShot: number;
  useRapidFireCrits: boolean;
  projectile: ProjectileType;
  projectileSpeed: number;
  /** Melee: seconds from swing to the damage trace. */
  smackDelay: number;
}}

export type StockWeaponScriptName = {script_names};

export interface WeaponScript {{
  /** The entity class / script file name. */
  scriptName: StockWeaponScriptName;
  weaponIdName: string;
  /** ETFWeaponType of the C++ class. */
  weaponId: number;
  printName: string;
  /** WeaponType: the default role (items may override with anim_slot). */
  weaponType: WeaponRole;
  bucket: number;
  bucketPosition: number;
  /** -1 = no clip (draws straight from reserve ammo). */
  clipSize: number;
  defaultClip: number;
  primaryAmmo: AmmoType | null;
  secondaryAmmo: AmmoType | null;
  meleeWeapon: boolean;
  /** Reloads one round at a time (TF_RELOAD_START -> RELOADING -> CONTINUE -> FINISH). */
  reloadsSingly: boolean;
  randomCrits: RandomCritMode;
  /** g_aWeaponDamageTypes entry: DMG_* bits (damage.ts) every hit carries. */
  damageType: number;
  builtRightHanded: boolean;
  /** Third-person animation prefix (legacy). */
  animPrefix: string;
  primary: WeaponFireMode;
  secondary: WeaponFireMode;
  damageRadius: number;
  lowerMainWeapon: boolean;
  hasTeamSkinsViewmodel: boolean;
  hasTeamSkinsWorldmodel: boolean;
  doInstantEjectBrass: boolean;
  sounds: Readonly<Partial<Record<WeaponSoundCategory, string>>>;
  scriptViewModel?: string;
  scriptPlayerModel?: string;
  muzzleFlashModel?: string;
  muzzleFlashModelDuration?: number;
  muzzleFlashParticle?: string;
  tracerEffect?: string;
  brassModel?: string;
  explosionSound?: string;
  explosionEffect?: string;
  explosionPlayerEffect?: string;
  explosionWaterEffect?: string;
}}

export const WEAPON_SCRIPTS: Readonly<Record<StockWeaponScriptName, WeaponScript>> = {ts(scripts)};

export interface StockWeapon {{
  defindex: number;
  name: string;
  displayName: string;
  /** items_game item_class, before TranslateWeaponEntForClass. */
  itemClass: string;
  /** Script (entity class) and loadout slot for each class that can use it. */
  perClass: Readonly<Partial<Record<ClassName, {{ scriptName: StockWeaponScriptName; slot: LoadoutSlot }}>>>;
  /** Activity role: the script's WeaponType unless items_game anim_slot overrides it. */
  role: WeaponRole;
  /**
   * c_model drawn in first person (bonemerged onto the class arms when attachToHands);
   * null when the class arms are the whole weapon (the Heavy's Fists).
   */
  viewModel: string | null;
  attachToHands: boolean;
  worldModel: string | null;
  /**
   * Base view-model activity -> the activity the arms model plays for this weapon
   * (s_viewmodelacttable rows for the role, after items_game animation_replacement).
   * Activities not listed play as-is.
   */
  vmActivities: Readonly<Record<string, string>>;
  /** Script SoundData with the item's visuals sound_* overrides applied. */
  sounds: Readonly<Partial<Record<WeaponSoundCategory, string>>>;
}}

export const STOCK_WEAPONS: Readonly<Record<number, StockWeapon>> = {ts(weapons)};

/** Third-person activity suffix for a role: ACT_MP_STAND_<suffix>, ACT_MP_ATTACK_STAND_<suffix>, ... */
export function playerAnimSuffix(role: WeaponRole): string {{
  return role === 'PRIMARY2' ? 'PRIMARY' : role;
}}

/** The script a class actually spawns for a stock item (shotguns/pistols differ per class). */
export function weaponScriptFor(defindex: number, className: ClassName): WeaponScript | undefined {{
  const entry = STOCK_WEAPONS[defindex]?.perClass[className];
  return entry ? WEAPON_SCRIPTS[entry.scriptName] : undefined;
}}
"""
    write_module(os.path.join(out_dir, "weapons.ts"), text, "")


def collect_sound_names(d: dict[str, Any], sounds: dict[str, Any], surfaces: dict[str, Any],
                        objects: dict[str, Any]) -> tuple[list[str], list[str]]:
    want: set[str] = set()
    for s in d["scripts"].values():
        want.update(s["sounds"].values())
        if s.get("explosionSound"):
            want.add(s["explosionSound"])
    for w in d["weapons"].values():
        want.update(w["sounds"].values())
    for c in d["classes"][1:]:
        want.update(c["deathSounds"].values())
    for o in objects.values():
        for k in ("explodeSound", "upgradeSound"):
            if o.get(k):
                want.add(o[k])
    for s in surfaces.values():
        for k in ("stepLeft", "stepRight", "bulletImpact", "impactHard", "impactSoft"):
            if s.get(k):
                want.add(s[k])
    pats = [re.compile(p) for p in SOUND_PATTERNS]
    prefixes = set(VOICE_PREFIX[1:])
    for name in sounds:
        if any(p.match(name) for p in pats):
            want.add(name)
            continue
        pre, _, rest = name.partition(".")
        if pre in prefixes and VOICE_SUFFIXES.match(rest):
            want.add(name)
    # Sound entry names are case-insensitive in the engine (scripts say Weapon_Bonesaw.*,
    # game_sounds_weapons.txt defines Weapon_BoneSaw.*): resolve to the defined spelling.
    canon = {n.lower(): n for n in sounds}
    have = sorted({canon[n.lower()] for n in want if n.lower() in canon})
    missing = sorted(n for n in want if n.lower() not in canon)
    return have, missing


def emit_sounds(d: dict[str, Any], sounds: dict[str, Any], surfaces: dict[str, Any],
                objects: dict[str, Any], out_dir: str) -> None:
    have, missing = collect_sound_names(d, sounds, surfaces, objects)
    entries = {}
    for n in have:
        e = dict(sounds[n])
        e["source"] = e["source"].replace("scripts/", "")
        entries[n] = e
    surf = {k: v for k, v in surfaces.items()}
    text = f"""/**
 * The game_sounds entries the stock game plays (weapon SoundData, class death/pain/voice
 * lines, announcer and HUD cues for the stock modes, buildings, medigun, footsteps and
 * impacts per surface), from the files scripts/game_sounds_manifest.txt lists plus
 * game_sounds_footsteps.txt. Wave paths are relative to sound/, with the leading Source
 * sound characters (^ ) # * @ ...) stripped. Sound levels are dB (SNDLVL_*); a range is
 * [min, max] and is picked uniformly per play, like the engine does.
 *
 * Look entries up with findSound(): the engine treats sound names case-insensitively and the
 * scripts do not always match the defining file's spelling (Weapon_Bonesaw / Weapon_BoneSaw).
 * Entries named by the scripts but absent from every sound file: {", ".join(missing) or "none"}.
 *
 * {GEN_NOTE}
 */

/** soundflags.h channels. */
export type SoundChannel =
  | 'CHAN_AUTO'
  | 'CHAN_WEAPON'
  | 'CHAN_VOICE'
  | 'CHAN_ITEM'
  | 'CHAN_BODY'
  | 'CHAN_STREAM'
  | 'CHAN_STATIC'
  | 'CHAN_VOICE2';

export type SoundRange = number | readonly [number, number];

export interface SoundEntry {{
  channel: SoundChannel;
  /** 0..1 (VOL_NORM = 1). */
  volume: SoundRange;
  /** Percent (PITCH_NORM = 100). */
  pitch: SoundRange;
  /** dB; attenuation = soundlevel > 50 ? 20 / (soundlevel - 50) : 4 (SNDLVL_TO_ATTN). */
  soundlevel: SoundRange;
  /** One is chosen at random per play (rndwave). */
  waves: readonly string[];
  /** The game_sounds file the entry came from. */
  source: string;
}}

export const SOUNDS: Readonly<Record<string, SoundEntry>> = {ts(entries)};

export interface SurfaceSounds {{
  stepLeft: string | null;
  stepRight: string | null;
  bulletImpact: string | null;
  impactHard: string | null;
  impactSoft: string | null;
  /** gamematerial (CHAR_TEX_*), a letter or number. */
  gameMaterial: string;
}}

/**
 * Surface properties' sounds (scripts/surfaceproperties.txt + _hl2 + _tf, with "base"
 * inheritance and "default" as the implicit base), keyed by lower-case surface name.
 */
export const SURFACE_SOUNDS: Readonly<Record<string, SurfaceSounds>> = {ts(surf)};

const SOUNDS_BY_LOWER_NAME: ReadonlyMap<string, SoundEntry> = new Map(
  Object.entries(SOUNDS).map(([name, entry]) => [name.toLowerCase(), entry]),
);

/** Look a sound entry up the way the engine does: names are case-insensitive. */
export function findSound(name: string): SoundEntry | undefined {{
  return SOUNDS[name] ?? SOUNDS_BY_LOWER_NAME.get(name.toLowerCase());
}}

/** SNDLVL_TO_ATTN (soundflags.h). */
export function soundlevelToAttenuation(soundlevel: number): number {{
  return soundlevel > 50 ? 20 / (soundlevel - 50) : 4;
}}
"""
    write_module(os.path.join(out_dir, "sounds.ts"), text, None)
    print(f"sounds: {len(entries)} entries, {len(missing)} missing: {missing}")


def load_objects(g: GameFiles) -> dict[str, dict[str, Any]]:
    """scripts/objects.txt (SDK: tf_shareddefs.cpp LoadObjectInfos)."""
    root = first_block(g.kv("scripts/objects.txt"))
    out: dict[str, dict[str, Any]] = {}
    for name, kv in root:
        if not isinstance(kv, KV):
            continue
        out[name] = {
            "className": kv_str(kv, "ClassName"),
            "statusName": kv_str(kv, "StatusName"),
            "buildTime": as_num(kv_float(kv, "BuildTime", 0)),
            "maxObjects": kv_int(kv, "MaxObjects", 0),
            "cost": kv_int(kv, "Cost", 0),
            "costMultiplier": as_num(kv_float(kv, "CostMultiplier", 1)),
            "upgradeCost": kv_int(kv, "UpgradeCost", 0),
            "upgradeDuration": as_num(kv_float(kv, "UpgradeDuration", 0)),
            "maxUpgradeLevel": kv_int(kv, "MaxUpgradeLevel", 0),
            "selectionSlot": kv_int(kv, "SelectionSlot", 0),
            "selectionPosition": kv_int(kv, "SelectionPosition", 0),
            "buildCount": kv_int(kv, "BuildCount", 1),
            "solidToPlayerMovement": kv_int(kv, "SolidToPlayerMovement", 0) != 0,
            "viewModel": kv_str(kv, "Viewmodel"),
            "playerModel": kv_str(kv, "Playermodel"),
            "explodeSound": kv_str(kv, "ExplodeSound"),
            "explodeEffect": kv_str(kv, "ExplodeEffect"),
            "upgradeSound": kv_str(kv, "UpgradeSound"),
            "metalToDropInGibs": kv_int(kv, "MetalToDropInGibs", 0),
        }
    return out


def emit_buildings(objects: dict[str, Any], out_dir: str) -> None:
    objs = {k: Commented(v, f"scripts/objects.txt {k}") for k, v in objects.items()}
    text = f"""/**
 * Engineer buildings and the Spy's sapper. OBJECT_INFO is scripts/objects.txt (SDK:
 * LoadObjectInfos — build time, cost, upgrade cost/duration, models, sounds); everything
 * the objects do is hard-coded in the server's tf_obj_*.cpp and lives in the
 * hand-maintained block (SENTRY, DISPENSER, TELEPORTER, SAPPER, BUILDING).
 *
 * {GEN_NOTE}
 */

import type {{ BuildableName }} from './classes';

export interface ObjectInfo {{
  className: string;
  statusName: string;
  /** Seconds to build from blueprint at the base rate (wrench hits speed it up). */
  buildTime: number;
  maxObjects: number;
  /** Metal to place. */
  cost: number;
  costMultiplier: number;
  /** Metal to go up one level. */
  upgradeCost: number;
  /** Seconds the upgrade animation takes. */
  upgradeDuration: number;
  maxUpgradeLevel: number;
  selectionSlot: number;
  selectionPosition: number;
  buildCount: number;
  solidToPlayerMovement: boolean;
  viewModel: string | null;
  playerModel: string | null;
  explodeSound: string | null;
  explodeEffect: string | null;
  upgradeSound: string | null;
  metalToDropInGibs: number;
}}

export const OBJECT_INFO: Readonly<Record<BuildableName, ObjectInfo>> = {ts(objs)};
"""
    write_module(os.path.join(out_dir, "buildings.ts"), text, "")


def emit_damage(d: dict[str, Any], sdk: Sdk, out_dir: str) -> None:
    bits = d["bits"]
    generic = {}
    tf_alias = {}
    tf_text = sdk.read("game/shared/tf/tf_shareddefs.h")
    for k, v in bits.items():
        if re.search(r"#define\s+" + k + r"\b", tf_text):
            tf_alias[k] = v
        else:
            generic[k] = v
    custom = [n for n, _ in sdk.enum("game/shared/tf/tf_shareddefs.h", "ETFDmgCustom")]
    custom_map = {n: i for i, n in enumerate(custom) if not n.endswith("_COUNT")}
    text = f"""/**
 * Damage: DMG_* bits (game/shared/shareddefs.h, and the TF re-uses of unused bits in
 * tf_shareddefs.h), ETFDmgCustom, and — in the hand-maintained block — the rules from
 * CTFGameRules::ApplyOnDamageModifyRules / RadiusDamage and CTFPlayer::OnTakeDamage /
 * ApplyPushFromDamage as constants and small pure functions.
 *
 * {GEN_NOTE}
 */

import {{ TF_WEAPON_IDS }} from './weapons';

/** shareddefs.h DMG_* bits. */
export const DMG = {ts(generic)} as const;

/** tf_shareddefs.h: TF meanings given to otherwise unused DMG_* bits. */
export const TF_DMG = {ts(tf_alias)} as const;

/** ETFDmgCustom (tf_shareddefs.h), the "custom kill" carried with each damage event. */
export const TF_DMG_CUSTOM = {ts(custom_map)} as const;
export type TfDmgCustomName = keyof typeof TF_DMG_CUSTOM;
"""
    write_module(os.path.join(out_dir, "damage.ts"), text, "")


INDEX_TS = """/**
 * TF2 class, weapon, item, building, damage and sound tables — extracted from the game
 * scripts by scripts/tf2-game/extract-data.py and checked against the Source SDK 2013.
 */

export * from './classes';
export * from './items';
export * from './weapons';
export * from './buildings';
export * from './damage';
export * from './sounds';
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tf2", default=os.environ.get("TF2_ROOT", "/home/user/tf2ds"),
                    help="TF2 (or TF2 dedicated server) install root containing tf/ and hl2/")
    ap.add_argument("--sdk", default=os.environ.get("SOURCE_SDK_ROOT", "/home/user/valvesoftware/source-sdk-2013"),
                    help="Source SDK 2013 checkout (for enum orders and damage-type tables)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "lib", "tf2-game", "data"))
    ap.add_argument("--dump", help="write the decrypted scripts to this directory and exit")
    args = ap.parse_args()

    g = GameFiles(args.tf2)
    if args.dump:
        os.makedirs(args.dump, exist_ok=True)
        for p in g.listing("scripts/"):
            if p.endswith(".ctx"):
                with open(os.path.join(args.dump, os.path.basename(p)[:-4] + ".txt"), "w") as f:
                    f.write(g.text(p))
        return 0

    sdk = Sdk(args.sdk)
    out_dir = os.path.abspath(args.out)
    d = extract(g, sdk)
    objects = load_objects(g)
    sounds = load_sounds(g)
    surfaces = load_surfaces(g)
    emit_classes(d, out_dir)
    emit_items(d, out_dir)
    emit_weapons(d, out_dir)
    emit_buildings(objects, out_dir)
    emit_damage(d, sdk, out_dir)
    emit_sounds(d, sounds, surfaces, objects, out_dir)
    with open(os.path.join(out_dir, "index.ts"), "w", encoding="utf-8") as f:
        f.write(INDEX_TS)
    written = [os.path.join(out_dir, f"{m}.ts") for m in
               ("classes", "items", "weapons", "buildings", "damage", "sounds", "index")]
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    try:
        import subprocess

        subprocess.run(["pnpm", "exec", "prettier", "--write", *written], cwd=repo, check=True,
                       stdout=subprocess.DEVNULL)
    except Exception as e:  # formatting is cosmetic; the data is already written
        print(f"prettier did not run ({e}); run: pnpm exec prettier --write lib/tf2-game/data")
    return 0


if __name__ == "__main__":
    sys.exit(main())
