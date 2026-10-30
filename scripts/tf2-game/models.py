"""The browser game's model channel: any Source MDL -> GLB, textures shared as content-addressed WebP.

    python3 scripts/tf2-game/models.py --root <install> --list <mdl list> --out <dir>
                                       [--state state.json] [--prev-index index.json]
                                       [--search tf,hl2] [--limit N] [--force]

`--list` names one model path per line (`models/player/scout.mdl`; blank lines and `#` comments are
ignored). `scripts/tf2-game/model-list.py` writes TF2's default list; the map pipeline appends its props.
Nothing here is TF2-only: point `--root`/`--search` at another Source install (`--search hl2` for the
Half-Life 2 demo, `--search portal,hl2` for Portal, `--search csgo` for CS:GO) with its own list.

CS:GO (`--search csgo`): MDL v49 and VTF 7.5 read like the others. Its VMTs carry conditional keys
(`"srgb?$basetexture"`, `">=dx90?$phong"`, `"GPU>=2?$detail"`) — `csgo_material` applies them as a
high-end Windows desktop does — and two shaders the renderer has no model of: `CustomWeapon` (the
weapon-finish compositor; only its `$basetexture` is used, the default finish) and `Character`
(agents). Both are converted as VertexLitGeneric (`extras.approx`) and counted in the run's summary,
as is every other shader the converter does not recognise; a material without a usable base texture
is logged in untextured.json like any other.

Output (`--out D`, pushed by `scripts/tf2-assets/publish.ts push --dir D --prefix tf2-game/
--state-key tf2-game/mdl/_state.json --index mdl/index.json`):

    D/mdl/<sha>.glb                      one per model, and one "anim pack" per model with $includemodels
    D/tex/<sha>.webp                     every texture once, shared by every model (and map) that uses it;
                                         a GLB references it as `../tex/<sha>.webp`
    D/mdl/index.json                     { <mdl path>: { glb, anims?, ...summary } }
    D/mdl/players/<class>.anims.json     activity -> sequences, for the 9 class bodies
    D/mdl/viewmodels/<class>.anims.json  the same for c_<class>_arms
    D/wanted.json                        { <path>: { src, bytes? } } — everything the list wants
    D/failed.json, D/untextured.json

Names are content hashes of the SOURCE (model files, includes, materials, texture bytes, converter version),
so a model or texture whose source is unchanged keeps its name and is neither converted nor uploaded again
(`--state` is the channel's published state). See docs/tf2-game.md "Models" for the GLB extras schema.
"""
import argparse
import hashlib
import io
import json
import math
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "tf2-assets"))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import convert  # noqa: E402  (material lookup and eye helpers, shared with the loadout converter)
import glb  # noqa: E402
import mdlinfo  # noqa: E402
import srcanim  # noqa: E402
import srcmodel  # noqa: E402
import srctex  # noqa: E402
from vpkfs import GameFS  # noqa: E402

# Bump when the GLB for the same source would change (renames every model GLB once).
MODELS_VERSION = 1
# Bump when the texture encoding changes (renames every texture once).
TEX_VERSION = 1
SCALE = 0.01905  # Source units (inches) -> metres
SCHEMA = 1  # scene.extras.tf2game: bump when the extras' shape changes incompatibly
WEBP_QUALITY = 80
# Source animation space (Z up, X forward) -> the compiled bind space the meshes use (Y up): gl = (y, z, x).
# Equal to `srcanim.root_fix` on every TF2 model that has a `ref` sequence; used when one has none.
SOURCE_TO_BIND = np.array([[0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0]])
EYE_SHADERS = convert.EYE_SHADERS
CLASSES = ("scout", "soldier", "pyro", "demo", "heavy", "engineer", "medic", "sniper", "spy")

UNTEXTURED = []  # (model, material, why)

# ------------------------------------------------------------------------------------------ CS:GO materials

# Shaders whose materials the renderer draws from the extras as they are.
KNOWN_SHADERS = {"vertexlitgeneric", "unlitgeneric", "lightmappedgeneric", "eyerefract", "eyes", "teeth",
                 "refract", "spritecard", "sprite", "worldvertextransition", "unlittwotexture",
                 "splinerope", "cable", "modulate", "wireframe", "patch"}
# CS:GO shaders drawn as VertexLitGeneric (their $basetexture, $bumpmap, $phong… mean the same).
CSGO_APPROX = {"customweapon": "vertexlitgeneric", "character": "vertexlitgeneric",
               "vertexlitgeneric_dx9": "vertexlitgeneric"}
SHADER_COUNTS = {}  # unrecognised / approximated shader -> materials seen


def _csgo_condition(cond):
    """A CS:GO VMT key condition (`srgb`, `>=dx90`, `gpu>=2`, `lowfill`, negated with `!`), evaluated
    as a high-end Windows desktop (sRGB, DX9.5, GPU level 3, CPU level 2, no low-fill path)."""
    c = cond.strip().lower().replace(" ", "")
    neg = c.startswith("!")
    c = c.lstrip("!")
    m = re.fullmatch(r"(gpu|cpu)(>=|<=|>|<|==)(\d+)", c)
    if m:
        level = 3 if m.group(1) == "gpu" else 2
        n = int(m.group(3))
        val = {">=": level >= n, "<=": level <= n, ">": level > n, "<": level < n, "==": level == n}[m.group(2)]
    elif re.fullmatch(r"(>=|<=|>|<)?dx\d+(_20b)?", c):
        d = re.fullmatch(r"(>=|<=|>|<)?dx(\d+)", c.replace("_20b", ""))
        lvl = int(d.group(2))
        lvl = lvl * 10 if lvl < 10 else lvl
        op = d.group(1) or "=="
        val = {">=": 95 >= lvl, "<=": 95 <= lvl, ">": 95 > lvl, "<": 95 < lvl, "==": lvl in (90, 95)}[op]
    else:
        val = c in ("srgb", "srgb_pc", "hdr", "pc", "win32", "windows")
    return not val if neg else val


def csgo_material(shader, kv):
    """CS:GO's VMT conditionals applied (`cond?$key` wins over `$key` when the condition holds; when it
    does not, it is dropped) and its unmodelled shaders mapped. -> (shader, kv, approx or None)"""
    out = {}
    cond_keys = []
    for k, v in kv.items():
        if "?" in k:
            cond_keys.append((k, v))
        else:
            out[k] = v
    for k, v in cond_keys:
        cond, key = k.rsplit("?", 1)
        if key and all(_csgo_condition(c) for c in cond.split("?")):
            out[key] = v
    approx = CSGO_APPROX.get(shader)
    if approx or shader not in KNOWN_SHADERS:
        SHADER_COUNTS[shader] = SHADER_COUNTS.get(shader, 0) + 1
    return (approx or shader), out, approx


def csgo_slots(fs, slots):
    """convert.material_files' slots with csgo_material applied (and the base texture re-read when a
    conditional changed it)."""
    out = []
    for slot in slots:
        if slot is None:
            out.append(None)
            continue
        vmt_path, shader, kv, vtf_path, vtf, text = slot
        shader2, kv2, approx = csgo_material(shader, kv)
        if approx:
            kv2["%approx_from"] = shader
        base = kv2.get("$basetexture")
        path2 = srctex.texture_path(base) if base else None
        if path2 != vtf_path:
            try:
                vtf = fs.read(path2) if path2 else None
            except OSError:
                vtf = None
            vtf_path = path2
        out.append((vmt_path, shader2, kv2, vtf_path, vtf, text))
    return out


def is_csgo(fs):
    return bool(getattr(fs, "search", None)) and fs.search[0].lower() == "csgo"


# ---------------------------------------------------------------------------------------------------- files

class SourceFS(GameFS):
    """GameFS with a search order, so another Source game resolves the way the engine does: loose files
    and VPKs of the first search directory win (`portal` before `hl2`)."""

    def __init__(self, root, search=("tf", "hl2")):
        super().__init__(root)
        self.search = [s.strip("/") for s in search if s.strip("/")]

        def rank(pak):
            path = os.path.relpath(getattr(pak, "vpk_path", "") or "", root).replace(os.sep, "/").lower()
            for i, d in enumerate(self.search):
                if path.startswith(d.lower() + "/"):
                    return i
            return len(self.search)
        self.paks.sort(key=rank)
        self._cache = {}

    def read(self, name):
        name = name.replace("\\", "/").lower().lstrip("/")
        if name in self._cache:
            return self._cache[name]
        data = None
        for d in self.search:
            path = os.path.join(self.root, d, name)
            if os.path.isfile(path):
                with open(path, "rb") as fh:
                    data = fh.read()
                break
        if data is None:
            try:
                data = super().read(name)
            except OSError:
                # a dedicated-server install lists every texture in its VPK index but ships no data
                # archives for them: treat it as missing, as the loadout converter's log does
                data = None
        if data is not None and len(data) < (8 << 20) and name.endswith((".mdl", ".vmt")):
            self._cache[name] = data
        return data


def sha1(*parts):
    h = hashlib.sha1()
    for p in parts:
        h.update(p if isinstance(p, bytes) else str(p).encode())
        h.update(b"|")
    return h.hexdigest()


# ------------------------------------------------------------------------------------------------ materials

def _vec(value, default=None):
    """A VMT colour/vector: "[1 0.5 0]" as is, "{255 128 0}" as 0-255 integers -> 0-1."""
    if value is None:
        return default
    nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+(?:e[-+]?\d+)?", value)]
    if not nums:
        return default
    if value.strip().startswith("{"):
        nums = [n / 255.0 for n in nums]
    if len(nums) == 1:
        nums = nums * 3
    return [round(n, 4) for n in nums[:3]]


def _num(value, default=None):
    try:
        return float(re.findall(r"[-+]?\d*\.?\d+(?:e[-+]?\d+)?", value)[0]) if value is not None else default
    except (IndexError, ValueError):
        return default


def _flag(kv, key):
    return (kv.get(key) or "0").strip() not in ("0", "", "false")


def _tex_ref(kv, key):
    v = kv.get(key)
    return srctex.texture_path(v) if v else None


def material_extras(vmt_path, shader, kv):
    """What the renderer needs to approximate the Source shader, from the VMT."""
    e = {"vmt": vmt_path, "shader": shader}
    if kv.get("%approx_from"):  # CS:GO: a shader drawn as `shader` (csgo_material)
        e["approx"] = kv["%approx_from"]
    base = _tex_ref(kv, "$basetexture")
    if base:
        e["texture"] = base
    for flag, key in (("translucent", "$translucent"), ("alphatest", "$alphatest"), ("additive", "$additive"),
                      ("nocull", "$nocull"), ("selfillum", "$selfillum"), ("vertexalpha", "$vertexalpha"),
                      ("tintByBaseAlpha", "$blendtintbybasealpha")):
        if _flag(kv, key):
            e[flag] = True
    if e.get("alphatest"):
        e["cutoff"] = _num(kv.get("$alphatestreference"), 0.5) or 0.5
    if e.get("selfillum"):
        e["selfillumTint"] = _vec(kv.get("$selfillumtint"), [1, 1, 1])
        if kv.get("$selfillummask"):
            e["selfillumMask"] = srctex.texture_path(kv["$selfillummask"])
    if _flag(kv, "$phong"):
        p = {"exponent": _num(kv.get("$phongexponent"), 5.0), "boost": _num(kv.get("$phongboost"), 1.0),
             "fresnelRanges": _vec(kv.get("$phongfresnelranges"), [0, 0.5, 1])}
        if kv.get("$phongtint"):
            p["tint"] = _vec(kv["$phongtint"])
        if _flag(kv, "$phongalbedotint"):
            p["albedoTint"] = True
        if _flag(kv, "$basemapalphaphongmask"):
            p["baseAlphaMask"] = True
        if kv.get("$phongexponenttexture"):
            p["exponentTexture"] = srctex.texture_path(kv["$phongexponenttexture"])
        e["phong"] = p
    if _flag(kv, "$rimlight"):
        e["rimlight"] = {"exponent": _num(kv.get("$rimlightexponent"), 4.0),
                         "boost": _num(kv.get("$rimlightboost"), 1.0), "mask": _flag(kv, "$rimmask")}
    for key, name in (("$lightwarptexture", "lightwarp"), ("$bumpmap", "bumpmap"), ("$envmapmask", "envmapMask"),
                      ("$detail", "detail")):
        if kv.get(key):
            e[name] = srctex.texture_path(kv[key])
    if kv.get("$envmap"):
        e["envmap"] = kv["$envmap"]
        if kv.get("$envmaptint"):
            e["envmapTint"] = _vec(kv["$envmaptint"])
    if kv.get("$color2"):
        e["color2"] = _vec(kv["$color2"])
    if kv.get("$color"):
        e["color"] = _vec(kv["$color"])
    if kv.get("$blendtintcoloroverbase"):
        e["tintColorOverBase"] = _num(kv["$blendtintcoloroverbase"], 0.0)
    if kv.get("$surfaceprop"):
        e["surfaceprop"] = kv["$surfaceprop"]
    # which meaning the base texture's alpha carries, so the encoder keeps it and the renderer reads it
    use = ("opacity" if e.get("translucent") or e.get("alphatest") else
           "tint" if e.get("tintByBaseAlpha") else
           "selfillum" if e.get("selfillum") and "selfillumMask" not in e else
           "phong" if e.get("phong", {}).get("baseAlphaMask") else None)
    if use:
        e["alphaUse"] = use
    return e


def encode_webp(img, cap, keep_alpha):
    if max(img.size) > cap:
        img = img.copy()
        img.thumbnail((cap, cap), Image.LANCZOS)
    if keep_alpha:
        img = img.convert("RGBA")
        if np.asarray(img)[..., 3].min() == 255:  # nothing to keep
            img = img.convert("RGB")
    else:
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=WEBP_QUALITY, method=4)
    return buf.getvalue()


class TexStore:
    """Writes each texture once as `tex/<sha>.webp`; the name hashes the VTF bytes and how it is encoded,
    so it is known (and an unchanged texture skipped) without decoding anything."""

    def __init__(self, out, published, wanted, force=False):
        self.out = out
        self.published = published
        self.wanted = wanted
        self.force = force
        self.done = {}
        os.makedirs(os.path.join(out, "tex"), exist_ok=True)

    def name(self, kind, sources, cap, alpha):
        return sha1(b"tex", TEX_VERSION, kind, cap, int(alpha), *[hashlib.sha1(s).digest() for s in sources])

    def get(self, kind, sources, cap, alpha, encode):
        """-> relative path `tex/<sha>.webp`, or None when it cannot be made. `encode()` -> webp bytes."""
        key = self.name(kind, sources, cap, alpha)
        rel = "tex/%s.webp" % key
        if rel in self.done:
            return self.done[rel]
        if not self.force and self.published.get(rel, {}).get("src") == key:
            self.wanted[rel] = {"src": key}
            self.done[rel] = rel
            return rel
        try:
            data = encode()
        except (srctex.TextureError, OSError, ValueError, struct.error) as e:
            self.done[rel] = None
            raise srctex.TextureError(str(e))
        with open(os.path.join(self.out, rel), "wb") as fh:
            fh.write(data)
        self.wanted[rel] = {"src": key, "bytes": len(data)}
        self.done[rel] = rel
        return rel


def texture_cap(mdl_path):
    p = mdl_path.lower()
    return 1024 if (p.startswith("models/player/") or "/c_models/" in p or "/v_models/" in p
                    or p.startswith("models/weapons/")) else 512


def emission_image(vtf, mask_vtf, tint):
    img = srctex.decode_vtf(vtf)
    rgba = np.asarray(img, dtype=np.float32) / 255.0
    if mask_vtf is not None:
        mask = srctex.decode_vtf(mask_vtf).convert("L").resize(img.size, Image.BILINEAR)
        m = np.asarray(mask, dtype=np.float32)[..., None] / 255.0
    else:
        m = rgba[..., 3:]
    rgb = np.clip(rgba[..., :3] * m * np.array(tint or [1, 1, 1], np.float32), 0, 1)
    return Image.fromarray((rgb * 255).astype(np.uint8), "RGB")


def build_material(fs, mdl_path, name, slot, store, cap):
    """One MDL texture slot (a VMT) as a glTF material dict for glb.write_glb (`image`/`emissive` hold
    `tex/<sha>.webp` paths until the caller indexes them), its textures written once to `store`.
    `slot` is convert.material_files' tuple or None. -> (material, [texture paths], source parts)"""
    mat = {"name": name.split("/")[-1], "image": None, "alpha": "OPAQUE", "double_sided": False,
           "tint": False, "emissive": None, "extras": {"material": name}}
    texs = []
    src = [name.encode()]
    if slot is None:
        UNTEXTURED.append((mdl_path, name, "no .vmt found in the model's material paths"))
        mat["extras"]["missing"] = "vmt"
        src.append(b"-")
        return mat, texs, src
    vmt_path, shader, kv, vtf_path, vtf, text = slot
    src += [vmt_path.encode(), text.encode("latin-1", "replace")]
    ex = material_extras(vmt_path, shader, kv)
    mat["extras"].update(ex)
    mat["double_sided"] = bool(ex.get("nocull"))
    mat["tint"] = bool(ex.get("tintByBaseAlpha"))
    if ex.get("alphatest"):
        mat["alpha"], mat["cutoff"] = "MASK", ex["cutoff"]
    elif ex.get("translucent") or ex.get("additive"):
        mat["alpha"] = "BLEND"
    keep_alpha = "alphaUse" in ex
    if shader in EYE_SHADERS and kv.get("$iris"):
        # the glTF stand-in for EyeRefract: sclera with the iris painted in (UVs projected per eyeball)
        iris = fs.read(srctex.texture_path(kv["$iris"]))
        sources = [iris or b"-", kv["$iris"].lower().encode()]
        src += sources
        try:
            rel = store.get("eye", sources, 128, False, lambda: convert.eye_texture(fs, kv))
            if rel:
                texs.append(rel)
                mat["image"] = rel
                mat["extras"]["eye"] = True
        except srctex.TextureError as e:
            UNTEXTURED.append((mdl_path, name, "eye: %s" % e))
        return mat, texs, src
    if vtf is None:
        why = ("%s has no $basetexture" % vmt_path if not vtf_path
               else "%s is not in the game files (from %s)" % (vtf_path, vmt_path))
        UNTEXTURED.append((mdl_path, name, why))
        mat["extras"]["missing"] = "texture"
        src.append(b"-")
        return mat, texs, src
    src.append(hashlib.sha1(vtf).digest())
    try:
        rel = store.get("base", [vtf], cap, keep_alpha,
                        lambda: encode_webp(srctex.decode_vtf(vtf), cap, keep_alpha))
        if rel:
            texs.append(rel)
            mat["image"] = rel
    except srctex.TextureError as e:
        UNTEXTURED.append((mdl_path, name, "%s: %s" % (vtf_path, e)))
        mat["extras"]["missing"] = "decode"
    if ex.get("selfillum") and mat["image"]:
        mask_vtf = fs.read(ex["selfillumMask"]) if ex.get("selfillumMask") else None
        tint = ex.get("selfillumTint")
        src.append(hashlib.sha1(mask_vtf).digest() if mask_vtf else b"-")
        try:
            rel = store.get("emission", [vtf, mask_vtf or b"", json.dumps(tint).encode()], cap, False,
                            lambda: encode_webp(emission_image(vtf, mask_vtf, tint), cap, False))
            if rel:
                texs.append(rel)
                mat["emissive"] = rel
        except srctex.TextureError:
            pass
    return mat, texs, src


# ---------------------------------------------------------------------------------------------------- meshes

def build_slot_meshes(mdl, vvd, vtx):
    """LOD 0 of every body part, one primitive per (material slot, switchable submodel). Like
    srcmodel.build_meshes(groups=True) but grouped by skin-reference slot rather than by family-0 texture,
    so every skin family can re-map each slot. -> (info, [{slot, group, pos, nrm, uv, idx, joints, weights}])"""
    info = srcmodel.read_mdl(mdl)
    verts = srcmodel.read_vvd(vvd)
    tris = srcmodel.read_vtx(vtx)
    by_key = {}
    for b, models in enumerate(info["bodyparts"]):
        switchable = len(models) > 1
        for m, model in enumerate(models if switchable else models[:1]):
            vmeshes = tris[b][m] if b < len(tris) and m < len(tris[b]) else []
            tag = (info["bodypart_names"][b], m) if switchable else None
            for k, mesh in enumerate(model["meshes"]):
                if k >= len(vmeshes) or not len(vmeshes[k]):
                    continue
                ids = (vmeshes[k][: len(vmeshes[k]) // 3 * 3].reshape(-1, 3)[:, ::-1].reshape(-1)
                       + model["vert_start"] + mesh["voff"])
                if ids.max() >= len(verts):
                    raise srcmodel.ModelError("vertex index out of range")
                by_key.setdefault((mesh["material"], tag), []).append(ids)
    info["eyeballs"] = [e for models in info["bodyparts"] if models for e in models[0]["eyeballs"]]
    out = []
    for (slot, tag), parts in by_key.items():
        ids = np.concatenate(parts)
        uniq, inverse = np.unique(ids, return_inverse=True)
        v = verts[uniq]
        nb = np.maximum(v["nb"].astype(np.int64), 1)
        w = np.where(np.arange(3)[None, :] < nb[:, None], v["w"], 0.0).astype(np.float32)
        w[:, 0] = np.where(v["nb"] == 0, 1.0, w[:, 0])
        w /= np.maximum(w.sum(1, keepdims=True), 1e-6)
        out.append({
            "slot": slot, "group": tag,
            "joints": np.concatenate([v["bone"].astype(np.uint16), np.zeros((len(v), 1), np.uint16)], axis=1),
            "weights": np.concatenate([w, np.zeros((len(v), 1), np.float32)], axis=1),
            "pos": np.ascontiguousarray(v["pos"]), "nrm": np.ascontiguousarray(v["nrm"]),
            "uv": np.ascontiguousarray(v["uv"]), "idx": inverse.astype(np.uint32),
        })
    out.sort(key=lambda m: (m["group"] is not None, m["group"] or ("", 0), m["slot"]))
    return info, out


def matrix4(pose12):
    m = np.eye(4)
    m[:3, :] = np.array(pose12, dtype=np.float64).reshape(3, 4)
    m[:3, 3] *= SCALE
    return m


def colmajor(m):
    return [round(float(x), 6) for x in np.asarray(m).T.flatten()]


def skeleton_of(mdl):
    bones = srcanim.read_skeleton(mdl)
    pose = srcmodel.read_bones(mdl)
    return bones, {
        "names": [b["name"].lower() for b in bones],
        "parent": [b["parent"] for b in bones],
        "pos": np.array([b["pos"] for b in bones], np.float64).reshape(-1, 3) * SCALE,
        "quat": np.array([b["quat"] for b in bones], np.float64).reshape(-1, 4),
        "ibm": [matrix4(p["pose_to_bone"]) for p in pose],
    }


def root_fix(base_mdl, bones):
    try:
        return srcanim.root_fix(base_mdl, bones)
    except (srcmodel.ModelError, struct.error, ValueError, IndexError, StopIteration):
        return SOURCE_TO_BIND


# ------------------------------------------------------------------------------------------------ animation

def _qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz])


def clip_from_desc(group, desc, skel, fix, name, fs, post=False):
    """One animdesc of `group` as a glTF clip over `skel` (bones matched by name). Absolute clips hold local
    bone TRS; delta clips hold offsets (translation added, rotation composed: d*base, or base*d when the
    sequence is STUDIO_POST) and leave out bones that stay at the identity."""
    pos, quat, delta = srcanim.decode_animdesc_ex(group.mdl, group.bones, desc, anim_block=group.anim_block(fs))
    for r, b in enumerate(group.bones):
        if b["parent"] >= 0:
            continue
        for f in range(pos.shape[0]):
            pos[f, r] = fix @ pos[f, r]
            if delta and post:
                continue  # base * d: d stays in the bone's own frame
            if delta:
                m = fix @ srcanim.quat_matrix(quat[f, r]) @ fix.T
            else:
                m = fix @ srcanim.quat_matrix(quat[f, r])
            quat[f, r] = srcanim.matrix_quat(m)
    by_name = {b["name"].lower(): i for i, b in enumerate(group.bones)}
    frames = pos.shape[0]
    loop = bool(desc["flags"] & srcanim.DESC_LOOPING)
    fps = desc["fps"] or 30.0
    times = np.arange(frames + (1 if loop and frames > 1 else 0)) / fps
    tracks = []
    ident_q = np.array([0, 0, 0, 1.0])
    for j, bone_name in enumerate(skel["names"]):
        k = by_name.get(bone_name)
        if k is None:
            continue
        q = quat[:, k].astype(np.float64)
        p = pos[:, k].astype(np.float64) * SCALE
        if len(times) > frames:
            q = np.concatenate([q, q[:1]])
            p = np.concatenate([p, p[:1]])
        for f in range(1, len(q)):
            if np.dot(q[f], q[f - 1]) < 0:
                q[f] = -q[f]
        q /= np.maximum(np.linalg.norm(q, axis=1, keepdims=True), 1e-9)
        if delta:
            rest_q, rest_p = ident_q, np.zeros(3)
        else:
            rest_q, rest_p = skel["quat"][j], skel["pos"][j]
        for path, vals, rest in (("rotation", q, rest_q), ("translation", p, rest_p)):
            rot = path == "rotation"
            const = _err(vals, vals[:1], rot).max() <= (ROT_TOL if rot else POS_TOL) * 0.5
            if const and _err(vals[:1], np.asarray(rest)[None], rot).max() <= (ROT_TOL if rot else POS_TOL) * 0.5:
                continue  # the rest pose (bind for absolute clips, identity for deltas): no track
            if const:
                tracks.append({"bone": j, "path": path, "values": vals[:1]})
                continue
            keep = reduce_keys(times, vals, rot)
            track = {"bone": j, "path": path, "values": vals[keep]}
            if len(keep) < len(times):
                track["times"] = times[keep]
            tracks.append(track)
    if not tracks:  # glTF needs one channel; a no-op key on the root keeps the clip valid
        root = next((j for j, p in enumerate(skel["parent"]) if p < 0), 0)
        tracks.append({"bone": root, "path": "rotation",
                       "values": np.array([[0, 0, 0, 1.0]] if delta else [skel["quat"][root]])})
    extras = {"fps": round(fps, 4), "frames": int(desc["frames"]), "looping": loop, "delta": delta,
              "source": desc["name"]}
    if desc.get("movements"):
        extras["movement"] = desc["movements"]
        last = desc["movements"][-1]["position"]
        dur = max(desc["frames"] - 1, 1) / fps
        extras["groundSpeed"] = round(math.hypot(last[0], last[1]) / dur, 3)
    return {"name": name, "times": times, "tracks": tracks, "extras": extras, "short_rotations": True}


# Keyframe reduction tolerances: a key is dropped when interpolating its neighbours reproduces it this closely.
ROT_TOL = 1e-3            # radians (0.06 degrees)
POS_TOL = 0.01 * SCALE    # 0.01 Source units


def _err(a, b, rot):
    if rot:
        a = a / np.maximum(np.linalg.norm(a, axis=-1, keepdims=True), 1e-9)
        return 2 * np.arccos(np.clip(np.abs((a * b).sum(-1)), 0, 1))
    return np.linalg.norm(a - b, axis=-1)


def _slerp(p, q, a):
    """What the player interpolates rotation keys with (three.js slerps glTF rotation tracks)."""
    d = float(np.dot(p, q))
    if d < 0:
        q, d = -q, -d
    if d > 0.9995:
        return p * (1 - a) + q * a
    w = math.acos(min(d, 1.0))
    s = math.sin(w)
    return (np.sin((1 - a) * w) / s) * p + (np.sin(a * w) / s) * q


def reduce_keys(t, v, rot):
    """Indices of the keys to keep so linear interpolation of the rest stays within tolerance."""
    n = len(v)
    if n <= 2:
        return list(range(n))
    tol = ROT_TOL if rot else POS_TOL
    keep, i = [0], 0
    while i < n - 1:
        best, j = i + 1, i + 2
        while j < n:
            a = ((t[i + 1:j] - t[i]) / (t[j] - t[i]))[:, None]
            if _err(_slerp(v[i], v[j], a) if rot else v[i] * (1 - a) + v[j] * a, v[i + 1:j], rot).max() > tol:
                break
            best = j
            j += 1
        keep.append(best)
        i = best
    return keep


# voice-command gestures, PASS Time and the Choose-Your-Own-Adventure PDA are not part of the game
ACT_SKIP = re.compile(r"^ACT_MP_(GESTURE_VC_|PASSTIME|CYOA_)", re.I)


def pick_sequences(vm, kind):
    """Virtual sequence indices to export. Players: every ACT_MP_* sequence (not the voice-command
    gestures) and the death animations; arms: every sequence with an activity; anything else: every
    sequence. Plus, recursively, every sequence those layer on top of themselves (aim matrices, arm
    layers)."""
    chosen = []
    for k in range(len(vm.seq)):
        g, s = vm.sequence(k)
        if s["flags"] & mdlinfo.STUDIO_OVERRIDE and not s["anims"]:
            continue
        act = s["activity"].upper()
        if kind == "player":
            ok = (act.startswith("ACT_MP_") and not ACT_SKIP.match(act)) or (
                re.search(r"death|dying", s["name"], re.I) and not re.search(r"taunt", s["name"], re.I))
        elif kind == "arms":
            ok = bool(act)
        else:
            ok = True
        if ok:
            chosen.append(k)
    seen = set(chosen)
    stack = list(chosen)
    while stack:
        g, s = vm.sequence(stack.pop())
        refs = [lay["seq"] for lay in s["layers"]]
        for local in refs:
            if 0 <= local < len(g.master_seq):
                k = g.master_seq[local]
                if k not in seen:
                    seen.add(k)
                    chosen.append(k)
                    stack.append(k)
    return sorted(chosen)


def plan_animation(vm, picks):
    """Sequence metadata and the clips to decode, from the MDL headers alone (no decoding), so a run that
    skips an unchanged animation pack still writes the same index. Each animdesc becomes one clip, named
    `<sequence>` or `<sequence>@<cell>`; a sequence that reuses another's animdesc points at that clip.
    -> (sequences metadata, activities, weightlists, [(clip name, group, anim index, post)])"""
    seq_meta, activities, weightlists, wl_index, jobs = [], {}, [], {}, []
    clip_of = {}  # (group path, anim index, post) -> clip name
    for k in picks:
        g, s = vm.sequence(k)
        if not s["anims"]:
            continue
        cells = []
        post = bool(s["flags"] & mdlinfo.STUDIO_POST)
        for cell, a in enumerate(s["anims"]):
            key = (g.path, a, post)
            if key not in clip_of:
                name = s["name"] if len(s["anims"]) == 1 else "%s@%d" % (s["name"], cell)
                clip_of[key] = name
                jobs.append((name, g, a, post))
            cells.append(clip_of[key])
        try:
            first = mdlinfo.animdesc(g.mdl, s["anims"][0])
        except (srcmodel.ModelError, struct.error, ValueError, IndexError):
            continue
        meta = {"name": s["name"], "flags": s["flags"],
                "looping": bool(s["flags"] & mdlinfo.STUDIO_LOOPING),
                "delta": bool(s["flags"] & mdlinfo.STUDIO_DELTA), "post": post,
                "autoplay": bool(s["flags"] & mdlinfo.STUDIO_AUTOPLAY),
                "fps": round(first["fps"] or 30.0, 4), "frames": int(first["frames"]),
                "fadeIn": round(s["fadein"], 4), "fadeOut": round(s["fadeout"], 4), "clips": cells}
        if s["activity"]:
            meta["activity"] = s["activity"].upper()
            meta["actweight"] = s["actweight"]
            activities.setdefault(meta["activity"], []).append({"seq": s["name"], "weight": s["actweight"]})
        for flag, key in ((mdlinfo.STUDIO_HIDDEN, "hidden"), (mdlinfo.STUDIO_SNAP, "snap"),
                          (mdlinfo.STUDIO_REALTIME, "realtime"), (mdlinfo.STUDIO_WORLD, "world")):
            if s["flags"] & flag:
                meta[key] = True
        params = [vm.pose_name(g, p) if p >= 0 else None for p in s["paramindex"]]
        if len(s["anims"]) > 1 or any(params):
            blend = {"groupsize": s["groupsize"], "params": params,
                     "start": [round(x, 4) for x in s["paramstart"]], "end": [round(x, 4) for x in s["paramend"]]}
            if s["posekeys"]:
                blend["poseKeys"] = [[round(x, 4) for x in row] for row in s["posekeys"]]
            meta["blend"] = blend
        if s["layers"]:
            meta["layers"] = []
            for lay in s["layers"]:
                entry = {"seq": vm.seq_name(g, lay["seq"]), "flags": lay["flags"],
                         "start": round(lay["start"], 4), "peak": round(lay["peak"], 4),
                         "tail": round(lay["tail"], 4), "end": round(lay["end"], 4)}
                if lay["flags"] & mdlinfo.STUDIO_AL_POSE:
                    entry["pose"] = vm.pose_name(g, lay["pose"])
                meta["layers"].append(entry)
        if s["events"]:
            frames = max(meta["frames"] - 1, 1)
            meta["events"] = [{"frame": round(e["cycle"] * frames, 3), "cycle": round(e["cycle"], 5),
                               "event": e["event"], "type": e["type"],
                               **({"name": e["name"]} if e["name"] else {}),
                               **({"options": e["options"]} if e["options"] else {})} for e in s["events"]]
        w = s["weights"]
        if w and any(abs(x - 1.0) > 1e-6 for x in w):
            names = [b["name"].lower() for b in g.bones]
            table = {names[i]: round(x, 4) for i, x in enumerate(w) if i < len(names) and abs(x - 1.0) > 1e-6}
            key = json.dumps(table, sort_keys=True)
            if key not in wl_index:
                wl_index[key] = len(weightlists)
                weightlists.append(table)
            meta["weightlist"] = wl_index[key]
        if s["nextseq"]:
            nxt = vm.seq_name(g, s["nextseq"])
            if nxt and nxt != s["name"]:
                meta["nextSeq"] = nxt
        if s["cyclepose"] >= 0:
            meta["cyclePose"] = vm.pose_name(g, s["cyclepose"])
        if s["modifiers"]:
            meta["modifiers"] = s["modifiers"]
        if s["keyvalues"]:
            meta["keyvalues"] = s["keyvalues"]
        seq_meta.append(meta)
    return seq_meta, activities, weightlists, jobs


def build_animation(fs, vm, picks, skel, fix):
    """-> (clips, sequences metadata, activities, weightlists, errors): `plan_animation` plus the decoded
    clips. A clip that cannot be decoded is reported in `errors` and left out (its name stays listed)."""
    seq_meta, activities, weightlists, jobs = plan_animation(vm, picks)
    clips, errors = [], []
    for name, g, a, post in jobs:
        try:
            clips.append(clip_from_desc(g, mdlinfo.animdesc(g.mdl, a), skel, fix, name, fs, post=post))
        except (srcmodel.ModelError, struct.error, ValueError, IndexError) as e:
            errors.append("%s: %s" % (name, e))
    return clips, seq_meta, activities, weightlists, errors


# ------------------------------------------------------------------------------------------------- the model

def model_kind(path):
    p = path.lower()
    if re.match(r"models/player/[a-z]+\.mdl$", p) and p.rsplit("/", 1)[-1][:-4] in CLASSES + ("demoman",):
        return "player"
    if re.search(r"/c_[a-z]+_arms\.mdl$", p) or re.search(r"/v_models/", p):
        return "arms"
    return "model"


def class_of(path):
    stem = path.lower().rsplit("/", 1)[-1][:-4]
    m = re.match(r"c_([a-z]+)_arms$", stem)
    return m.group(1) if m else stem


class Source:
    """Everything one model is built from, with its source hash."""

    def __init__(self, fs, path):
        self.path = path.lower()
        stem = self.path[:-4]
        self.mdl, self.vvd = fs.read(stem + ".mdl"), fs.read(stem + ".vvd")
        self.vtx = fs.read(stem + ".dx90.vtx") or fs.read(stem + ".dx80.vtx") or fs.read(stem + ".vtx")
        if self.mdl is None:
            raise srcmodel.ModelError("missing " + self.path)
        self.vm = mdlinfo.VirtualModel(fs, self.path, self.mdl)
        self.kind = model_kind(self.path)
        self.has_mesh = self.vvd is not None and self.vtx is not None
        self.info = srcmodel.read_mdl(self.mdl)
        self.slots = convert.material_files(fs, self.info)
        if is_csgo(fs):
            self.slots = csgo_slots(fs, self.slots)
        self.cap = texture_cap(self.path)
        anim_groups = [g for g in self.vm.groups[1:] if any(s["anims"] for s in g.sequences)]
        self.anim_pack = bool(anim_groups)
        self.picks = pick_sequences(self.vm, self.kind) if (self.anim_pack or self.kind != "model") else \
            [k for k in range(len(self.vm.seq)) if self.vm.sequence(k)[1]["anims"]]

    def used_textures(self):
        if not self.has_mesh:
            return []
        used_slots = set()
        for b, models in enumerate(self.info["bodyparts"]):
            for m in (models if len(models) > 1 else models[:1]):
                for mesh in m["meshes"]:
                    used_slots.add(mesh["material"])
        return sorted({fam[s] for fam in self.info["skins"] for s in used_slots if s < len(fam)})

    def body_src(self, tex_src):
        parts = [b"mdl", MODELS_VERSION, self.cap, hashlib.sha1(self.mdl).digest(),
                 hashlib.sha1(self.vvd or b"").digest(), hashlib.sha1(self.vtx or b"").digest()]
        if not self.anim_pack:  # animations embedded: their includes are part of the source
            parts += [hashlib.sha1(g.mdl).digest() for g in self.vm.groups[1:]]
        return sha1(*parts, *tex_src)

    def anims_src(self):
        return sha1(b"anims", MODELS_VERSION, *[hashlib.sha1(g.mdl).digest() for g in self.vm.groups])


def finite(value):
    """JSON has no NaN/Infinity (some compiled autolayer ramps are NaN): write null instead."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: finite(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [finite(v) for v in value]
    return value


def model_extras(src):
    mdl = src.mdl
    h = mdlinfo.header(mdl)
    bone_list = mdlinfo.bones(mdl)
    names = [b["name"].lower() for b in bone_list]
    extras = {"tf2game": SCHEMA, "mdl": src.path, "scale": SCALE,
              # header vectors stay in Source units and Source model space (Z up, X forward)
              "source": {k: [round(x, 4) for x in h[k]] for k in
                         ("eyePosition", "illumPosition", "hullMin", "hullMax", "viewMin", "viewMax")},
              "flags": h["flags"], "mass": h["mass"], "contents": h["contents"]}
    if h["surfaceprop"]:
        extras["surfaceprop"] = h["surfaceprop"]
    if h["keyvalues"]:
        extras["keyvalues"] = h["keyvalues"]
    extras["bodyparts"] = [{"name": n, "count": len(m)} for n, m in zip(src.info["bodypart_names"], src.info["bodyparts"])]
    # attachments: base model first, then new names from includes whose bone the base model has
    atts, seen = [], set()
    for gi, g in enumerate(src.vm.groups):
        gnames = [b["name"].lower() for b in mdlinfo.bones(g.mdl)]
        for a in mdlinfo.attachments(g.mdl, gnames):
            key = a["name"].lower()
            if key in seen or (a["bone"] or "").lower() not in names:
                continue
            seen.add(key)
            atts.append({"name": a["name"], "bone": a["bone"].lower(), "flags": a["flags"],
                         "local": colmajor(matrix4(a["local"]))})
    extras["attachments"] = atts
    extras["hitboxSets"] = [{"name": s["name"], "hitboxes": [
        {"bone": (b["bone"] or "").lower(), "group": b["group"],
         "min": [round(x * SCALE, 6) for x in b["min"]], "max": [round(x * SCALE, 6) for x in b["max"]],
         **({"name": b["name"]} if b["name"] else {})} for b in s["hitboxes"]]}
        for s in mdlinfo.hitbox_sets(mdl, names)]
    extras["poseParameters"] = [{"name": p["name"], "start": p["start"], "end": p["end"], "loop": p["loop"]}
                                for p in src.vm.pose]
    ctrl = mdlinfo.bone_controllers(mdl, names)
    if ctrl:
        extras["boneControllers"] = ctrl
    if len(src.vm.groups) > 1:
        extras["includes"] = [g.path for g in src.vm.groups[1:]]
    if src.vm.missing:
        extras["missingIncludes"] = src.vm.missing
    jig = convert.jiggle_metadata(mdl)
    if jig:
        extras["jiggle"] = jig
    procedural = [{"bone": b["name"].lower(), "type": b["proctype"]} for b in bone_list if b["proctype"]]
    if procedural:
        extras["proceduralBones"] = procedural
    return extras


def build_body(fs, src, store, want_clips):
    """-> (glb bytes, summary, textures). `want_clips`: embed the model's own sequences (no anim pack)."""
    if not src.has_mesh:
        raise srcmodel.ModelError("no .vvd/.vtx")
    info, meshes = build_slot_meshes(src.mdl, src.vvd, src.vtx)
    if not meshes:
        raise srcmodel.ModelError("no geometry")
    bones, skel = skeleton_of(src.mdl)
    clips, seq_meta, activities, weightlists, errors = [], [], {}, [], []
    if want_clips and src.picks:
        clips, seq_meta, activities, weightlists, errors = build_animation(
            fs, src.vm, src.picks, skel, root_fix(src.mdl, bones))
    skinned = is_skinned(src, bones)
    # materials: one per MDL texture used by any family; primitives use family 0
    tex_ids = src.used_textures()
    materials, mat_of, textures, images, image_of = [], {}, [], [], {}
    for t in tex_ids:
        name = info["textures"][t] if 0 <= t < len(info["textures"]) else "material%d" % t
        mat, texs, _ = build_material(fs, src.path, name, src.slots[t] if 0 <= t < len(src.slots) else None,
                                      store, src.cap)
        for key in ("image", "emissive"):
            if mat.get(key):
                rel = mat[key]
                if rel not in image_of:
                    image_of[rel] = len(images)
                    images.append({"uri": "../" + rel})
                mat[key] = image_of[rel]
        textures += texs
        mat["extras"] = finite(mat["extras"])
        mat_of[t] = len(materials)
        materials.append(mat)
    world = [np.linalg.inv(np.vstack([np.array(p["pose_to_bone"]).reshape(3, 4), [0, 0, 0, 1]]))
             for p in srcmodel.read_bones(src.mdl)]
    fam0 = info["skins"][0] if info["skins"] else []
    out_meshes = []
    for m in meshes:
        t = fam0[m["slot"]] if m["slot"] < len(fam0) else m["slot"]
        if t not in mat_of:  # a slot no family maps (malformed): give it a plain material
            mat_of[t] = len(materials)
            materials.append({"name": "slot%d" % m["slot"], "image": None, "alpha": "OPAQUE",
                              "double_sided": False, "tint": False, "emissive": None})
        uv = m["uv"]
        slot = src.slots[t] if 0 <= t < len(src.slots) else None
        if slot and slot[1] in EYE_SHADERS and info["eyeballs"]:
            cands = [e for e in info["eyeballs"] if 0 <= e["bone"] < len(world)]
            if cands:
                centre = m["pos"].mean(0)
                eye = min(cands, key=lambda e: np.linalg.norm(
                    (world[e["bone"]] @ np.array([*e["org"], 1]))[:3] - centre))
                uv = convert.project_eye_uv(m["pos"], eye, world[eye["bone"]])
        nrm = np.asarray(m["nrm"], np.float32)
        length = np.linalg.norm(nrm, axis=1, keepdims=True)
        # a few compiled normals are not unit length (or zero): glTF requires unit normals
        nrm = np.where(length > 1e-6, nrm / np.maximum(length, 1e-12), np.array([0, 1, 0], np.float32))
        out = {"pos": m["pos"] * SCALE, "nrm": nrm, "uv": uv, "idx": m["idx"], "material": mat_of[t],
               "extras": {"slot": int(m["slot"])}}
        if skinned:
            out["joints"], out["weights"] = m["joints"], m["weights"]
        if m["group"]:
            out["extras"].update({"bodygroup": m["group"][0], "sub": int(m["group"][1])})
        out_meshes.append(out)
    extras = model_extras(src)
    extras["skinned"] = skinned
    extras["skins"] = [[mat_of.get(fam[s], -1) if s < len(fam) else -1 for s in range(len(fam0))]
                       for fam in info["skins"]]
    if clips:
        extras.update({"sequences": seq_meta, "activities": activities})
        if weightlists:
            extras["weightlists"] = weightlists
    if errors:
        extras["animErrors"] = errors[:50]
    for c in clips:
        c["extras"] = finite(c["extras"])
    data = glb.write_glb(out_meshes, materials, images, finite(extras), skel, clips or None, compact=True)
    return data, summarize(src), textures


def build_anim_pack(fs, src):
    """The skeleton of `src` plus every picked sequence's clips (no mesh)."""
    bones, skel = skeleton_of(src.mdl)
    clips, seq_meta, activities, weightlists, errors = build_animation(
        fs, src.vm, src.picks, skel, root_fix(src.mdl, bones))
    if not clips:
        raise srcmodel.ModelError("no decodable sequences")
    extras = {"tf2game": SCHEMA, "mdl": src.path, "scale": SCALE, "animPack": True,
              "includes": [g.path for g in src.vm.groups[1:]],
              "poseParameters": [{"name": p["name"], "start": p["start"], "end": p["end"], "loop": p["loop"]}
                                 for p in src.vm.pose],
              "sequences": seq_meta, "activities": activities}
    if weightlists:
        extras["weightlists"] = weightlists
    if errors:
        extras["animErrors"] = errors[:50]
    for c in clips:
        c["extras"] = finite(c["extras"])
    data = glb.write_glb([], [], [], finite(extras), skel, clips, compact=True)
    return data, {"clips": len(clips), "sequences": len(seq_meta), "errors": len(errors)}, anim_index(src)


# ----------------------------------------------------------------------------------------------------- CLI

def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path, value):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(value, fh, indent=0, sort_keys=True)


def read_list(path):
    out = []
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    for line in lines:
        line = line.split("#", 1)[0].strip().replace("\\", "/").lower()
        if line and line.endswith(".mdl") and line not in out:
            out.append(line)
    return out


def write(out, rel, data, wanted, src=None):
    path = os.path.join(out, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data)
    wanted[rel] = {"src": src or hashlib.sha1(data).hexdigest(), "bytes": len(data)}


def convert_one(fs, path, out, store, published, wanted, force=False):
    """Convert (or, when the state says it is unchanged, only plan) one model. -> index entry."""
    src = Source(fs, path)
    entry = {"kind": src.kind}
    # materials first: textures are written once (or found in the state) and give the source hash
    tex_src = []
    for t in src.used_textures():
        name = src.info["textures"][t] if 0 <= t < len(src.info["textures"]) else "material%d" % t
        _mat, _texs, parts = build_material(fs, src.path, name,
                                            src.slots[t] if 0 <= t < len(src.slots) else None, store, src.cap)
        tex_src += parts
    if src.has_mesh:
        body = src.body_src(tex_src)
        rel = "mdl/%s.glb" % body
        if not force and published.get(rel, {}).get("src") == body:
            wanted[rel] = {"src": body}
            entry.update(summarize(src))
        else:
            data, summary, _texs = build_body(fs, src, store, want_clips=not src.anim_pack)
            write(out, rel, data, wanted, body)
            entry.update(summary)
        entry["glb"] = rel[4:]
    if src.anim_pack and src.picks:
        asrc = src.anims_src()
        arel = "mdl/%s.glb" % asrc
        index = None
        if not force and published.get(arel, {}).get("src") == asrc:
            wanted[arel] = {"src": asrc}
            index = anim_index(src)
        else:
            data, asum, index = build_anim_pack(fs, src)
            write(out, arel, data, wanted, asrc)
            if asum["errors"]:
                print("anim errors", src.path, asum["errors"], file=sys.stderr)
        entry["anims"] = arel[4:]
        if src.kind in ("player", "arms"):
            sub = "players" if src.kind == "player" else "viewmodels"
            body = json.dumps(finite({**index, "anims": entry["anims"], "glb": entry.get("glb")}),
                              separators=(",", ":"), sort_keys=True).encode()
            write(out, "mdl/%s/%s.anims.json" % (sub, class_of(src.path)), body, wanted)
    if "glb" not in entry and "anims" not in entry:
        raise srcmodel.ModelError("nothing to convert")
    return entry


def is_skinned(src, bones):
    """Skinned when the model has a skeleton to speak of, is animated, or is bone-merged onto another
    model (players' and viewmodels' weapons); a static single-bone prop stays a plain mesh."""
    animated = any(mdlinfo.animdesc(g.mdl, a)["frames"] > 1
                   for g, s in (src.vm.sequence(k) for k in src.picks) for a in s["anims"][:1])
    return len(bones) > 1 or animated or src.kind != "model" or "/c_models/" in src.path


def summarize(src):
    """The index entry's summary: from the MDL's metadata only, so a run that skips an unchanged model
    writes the same entry as the run that converted it."""
    names = [b["name"].lower() for b in mdlinfo.bones(src.mdl)]
    out = {"bones": len(names), "skins": len(src.info["skins"]), "skinned": is_skinned(src, names),
           "attachments": len(mdlinfo.attachments(src.mdl, names)),
           "hitboxes": sum(len(s["hitboxes"]) for s in mdlinfo.hitbox_sets(src.mdl, names)),
           "sequences": 0 if src.anim_pack else len(src.picks)}
    if src.vm.pose:
        out["poseParameters"] = [p["name"] for p in src.vm.pose]
    return out


def anim_index(src):
    """`<kind>/<class>.anims.json`: activity -> sequences, and per sequence its clips, flags, blend grid and
    layers — enough to drive the animation state without opening the pack's extras."""
    seq_meta, activities, weightlists, _jobs = plan_animation(src.vm, src.picks)
    keep = ("clips", "looping", "delta", "post", "fps", "frames", "blend", "layers", "weightlist")
    return {"mdl": src.path,
            "poseParameters": [{k: p[k] for k in ("name", "start", "end", "loop")} for p in src.vm.pose],
            "activities": activities, "weightlists": weightlists,
            "sequences": {m["name"]: {k: m[k] for k in keep if k in m} for m in seq_meta}}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", required=True, help="game install (the folder holding tf/ or hl2/)")
    ap.add_argument("--list", required=True, help="model paths, one per line")
    ap.add_argument("--out", required=True)
    ap.add_argument("--state", help="the channel's published state (publish.ts state)")
    ap.add_argument("--prev-index", help="the published mdl/index.json: a model that fails keeps its old entry")
    ap.add_argument("--search", default="tf,hl2", help="game directories in priority order")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args(argv)

    fs = SourceFS(args.root, args.search.split(","))
    paths = read_list(args.list)
    if args.limit:
        paths = paths[: args.limit]
    published = {}
    if args.state and os.path.exists(args.state):
        published = load_json(args.state).get("models", {})
    prev = {}
    if args.prev_index and os.path.exists(args.prev_index):
        try:
            prev = load_json(args.prev_index)
        except ValueError:
            print("ignoring unreadable --prev-index", args.prev_index, file=sys.stderr)
        prev = prev if isinstance(prev, dict) else {}
    force = args.force or os.environ.get("FORCE") == "1"
    os.makedirs(os.path.join(args.out, "mdl"), exist_ok=True)
    wanted, failed, index, reasons = {}, [], {}, {}
    store = TexStore(args.out, published, wanted, force)
    built = 0
    for n, path in enumerate(paths):
        try:
            index[path] = convert_one(fs, path, args.out, store, published, wanted, force)
            built += 1
        except Exception as e:  # noqa: BLE001 — one bad model must not stop the run
            why = "%s: %s" % (type(e).__name__, e)
            reasons[why] = reasons.get(why, 0) + 1
            print("fail", path, why, file=sys.stderr)
            old = prev.get(path)
            failed.append(path)
            if old:  # keep serving the last good conversion
                index[path] = old
                for key in ("glb", "anims"):
                    if old.get(key):
                        rel = "mdl/" + old[key]
                        failed.append(rel)
                        if rel in published:
                            wanted[rel] = {"src": published[rel]["src"]}
        if (n + 1) % 100 == 0:
            print("models", n + 1, "/", len(paths), flush=True)
    body = json.dumps(finite(index), separators=(",", ":"), sort_keys=True).encode()
    write(args.out, "mdl/index.json", body, wanted)
    save_json(os.path.join(args.out, "wanted.json"), wanted)
    save_json(os.path.join(args.out, "failed.json"), failed)
    seen = sorted(set(UNTEXTURED))
    save_json(os.path.join(args.out, "untextured.json"), [{"model": m, "material": n, "why": w} for m, n, w in seen])
    made = {k: v for k, v in wanted.items() if "bytes" in v}
    total = sum(v["bytes"] for v in made.values())
    tex = sum(v["bytes"] for k, v in made.items() if k.startswith("tex/"))
    print("models: %d ok, %d failed; files wanted %d, written %d (%.1f MiB, textures %.1f MiB); "
          "untextured materials %d" % (built, len([f for f in failed if f.endswith(".mdl")]), len(wanted),
                                       len(made), total / 1048576, tex / 1048576, len(seen)))
    for why, n in sorted(reasons.items(), key=lambda kv: -kv[1])[:10]:
        print("  %5d  %s" % (n, why))
    if SHADER_COUNTS:
        print("shaders approximated or not recognised (materials): " + ", ".join(
            "%s %d%s" % (sh, n, " -> " + CSGO_APPROX[sh] if sh in CSGO_APPROX else "")
            for sh, n in sorted(SHADER_COUNTS.items(), key=lambda kv: -kv[1])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
