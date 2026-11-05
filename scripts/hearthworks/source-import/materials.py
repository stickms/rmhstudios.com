"""Materials: MDL texture slot -> VMT -> VTF -> a PNG/JPEG for the GLB.

Handles what the HL2/TF2 character models use: VertexLitGeneric (the sheet and face maps), the `Eyes` /
`EyeRefract` shaders (a sclera with the iris painted in the middle, and UVs projected the way the shader
does), `Teeth` (plain texture), `$color`, `$alphatest` / `$translucent`, and `$selfillum` with a
`$selfillummask` (the Combine's glowing visor and chest light -> a glTF emissive texture).
Normal maps, phong masks and env maps are intentionally dropped: the game renders these as plain lit
albedo, and the budget is 512 px per texture.
"""
import io
import re

import numpy as np
from PIL import Image

from _deps import srctex

EYE_SHADERS = ("eyes", "eyerefract")
SCLERA = (238, 234, 228)


def find_vmt(fs, info, tex):
    """materials/<cd>/<tex>.vmt for the first cdtexture directory that has it, else None."""
    for cd in info["cdtextures"] or [""]:
        cand = ("materials/" + cd.strip("/") + "/" + tex + ".vmt").replace("//", "/").lower()
        if fs.read(cand) is not None:
            return cand
    if "/" in tex:
        cand = "materials/" + tex.replace("\\", "/").lower() + ".vmt"
        if fs.read(cand) is not None:
            return cand
    return None


def vec(value, default=None):
    """A VMT colour: "[1 0.5 0]" as is, "{255 128 0}" as 0-255; a single number is a grey."""
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


def fit(img, cap):
    """Downscale so the longest side is at most `cap` (power-of-two sources stay power of two)."""
    w, h = img.size
    if max(w, h) <= cap:
        return img
    k = cap / max(w, h)
    return img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)


def encode(img, cap, keep_alpha):
    """-> {'bytes', 'mime'}: PNG when the alpha channel matters, otherwise JPEG (much smaller for photo sheets)."""
    img = fit(img, cap)
    buf = io.BytesIO()
    if keep_alpha:
        img.convert("RGBA").save(buf, "PNG", optimize=True)
        return {"bytes": buf.getvalue(), "mime": "image/png"}
    img.convert("RGB").save(buf, "JPEG", quality=88, optimize=True, subsampling=0)
    return {"bytes": buf.getvalue(), "mime": "image/jpeg"}


def texture_image(fs, ref):
    """Decode a VMT texture reference (`models/x/y`) to RGBA, or None when absent / undecodable."""
    if not ref:
        return None
    data = fs.read(srctex.texture_path(ref))
    if data is None:
        return None
    try:
        return srctex.decode_vtf(data)
    except (srctex.TextureError, ValueError, OSError):
        return None


def eye_image(fs, kv, size=128):
    """The Eyes shader paints `$iris` over the eye-white `$basetexture`; we bake that into one square image."""
    base = Image.new("RGBA", (size, size), (*SCLERA, 255))
    white = texture_image(fs, kv.get("$basetexture"))
    if white is not None:
        base = white.convert("RGBA").resize((size, size), Image.LANCZOS)
    iris = texture_image(fs, kv.get("$iris"))
    if iris is not None:
        iris = iris.convert("RGBA").resize((size, size), Image.LANCZOS)
        a = np.asarray(iris)[..., 3]
        if a.min() == 255:  # no alpha cut-out: use the inscribed disc as the mask
            yy, xx = np.mgrid[0:size, 0:size]
            disc = ((xx - size / 2 + 0.5) ** 2 + (yy - size / 2 + 0.5) ** 2) <= (size / 2) ** 2
            mask = Image.fromarray((disc * 255).astype(np.uint8), "L")
        else:
            mask = Image.fromarray(a, "L")
        base.paste(iris.convert("RGB"), (0, 0), mask)
    return base


def project_eye_uv(pos, eye, world):
    """UVs for an eyeball mesh, the way the Eyes shader projects its iris: along the eyeball's own axes,
    spanning 2 * radius / iris_scale. `pos` [n,3] and `world` (the eye bone's bind-pose 4x4) are in Source units."""
    rot, org = world[:3, :3], world[:3, 3] + world[:3, :3] @ np.array(eye["org"])
    up = rot @ np.array(eye["up"])
    fwd = rot @ np.array(eye["forward"])
    right = np.cross(up, fwd)
    local = pos - org
    span = 2.0 * max(eye["radius"], 1e-3) / max(eye["iris_scale"], 1e-3)
    u = local @ right / span + 0.5
    v = 0.5 - local @ up / span
    return np.stack([u, v], axis=1).astype(np.float32)


def emissive_image(fs, kv, base):
    """`$selfillum` with a `$selfillummask`: base colour x mask x tint, as an RGB image the size of `base`."""
    mask = texture_image(fs, kv.get("$selfillummask"))
    if mask is None or base is None:
        return None
    tint = np.array(vec(kv.get("$selfillumtint"), [1, 1, 1]), np.float64)
    rgb = np.asarray(base.convert("RGB"), np.float64) / 255.0
    m = np.asarray(mask.convert("L").resize(base.size, Image.LANCZOS), np.float64)[..., None] / 255.0
    out = np.clip(rgb * m * tint[None, None, :], 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8), "RGB")


class MaterialSet:
    """Collects the GLB images and materials a model needs; `get(slot)` returns the material index."""

    def __init__(self, fs, info, tex_cap=512, report=None):
        self.fs, self.info, self.tex_cap = fs, info, tex_cap
        self.images, self.materials, self.by_slot = [], [], {}
        self.report = report if report is not None else []
        self.slot_kv = {}   # slot -> (shader, kv) for the eye logic
        self._img_key = {}

    def _add_image(self, key, make):
        if key not in self._img_key:
            self.images.append(make())
            self._img_key[key] = len(self.images) - 1
        return self._img_key[key]

    def is_eye(self, slot):
        return self.slot_kv.get(slot, ("", {}))[0] in EYE_SHADERS

    def get(self, slot):
        if slot in self.by_slot:
            return self.by_slot[slot]
        name = self.info["textures"][slot] if 0 <= slot < len(self.info["textures"]) else "material%d" % slot
        entry = {"name": name.split("/")[-1], "image": None, "alpha": "OPAQUE", "double_sided": False}
        vmt = find_vmt(self.fs, self.info, name)
        if vmt is None:
            self.report.append((name, "no .vmt in the model's material paths"))
        else:
            shader, kv, _ = srctex.resolve_material(self.fs, vmt)
            self.slot_kv[slot] = (shader, kv)
            if shader in EYE_SHADERS:
                img = eye_image(self.fs, kv)
                entry["image"] = self._add_image(("eye", kv.get("$basetexture"), kv.get("$iris")),
                                                 lambda: encode(img, 128, False))
            else:
                base = texture_image(self.fs, kv.get("$basetexture"))
                if base is None:
                    self.report.append((name, "%s: $basetexture %r not found / unreadable" % (vmt, kv.get("$basetexture"))))
                else:
                    cut = kv.get("$alphatest") == "1" or kv.get("$translucent") == "1"
                    if cut:
                        entry["alpha"] = "MASK" if kv.get("$alphatest") == "1" else "BLEND"
                    entry["image"] = self._add_image(("tex", kv.get("$basetexture", "").lower(), cut),
                                                     lambda: encode(base, self.tex_cap, cut))
                    if kv.get("$selfillum") == "1" and kv.get("$selfillummask"):
                        em = emissive_image(self.fs, kv, base)
                        if em is not None:
                            entry["emissive"] = self._add_image(("emi", kv.get("$selfillummask", "").lower()),
                                                                lambda: encode(em, self.tex_cap, False))
                    if kv.get("$nocull") == "1":
                        entry["double_sided"] = True
                col = vec(kv.get("$color")) or vec(kv.get("$color2"))
                if col:
                    entry["base_color"] = col
        self.materials.append(entry)
        self.by_slot[slot] = len(self.materials) - 1
        return self.by_slot[slot]
