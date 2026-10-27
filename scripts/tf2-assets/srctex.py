"""VTF texture and VMT material readers.

`decode_vtf` returns the largest mip of frame 0 as an RGBA Pillow image. DXT
data is decoded by wrapping it in a DDS header and letting Pillow do the work.
"""
import re
import struct
import io

import numpy as np
from PIL import Image

# ImageFormat enum values from the VTF spec -> (bytes per pixel, numpy reorder to RGBA)
_RAW = {
    0: (4, lambda a: a),                                  # RGBA8888
    1: (4, lambda a: a[..., [3, 2, 1, 0]]),                # ABGR8888
    2: (3, lambda a: a),                                  # RGB888
    3: (3, lambda a: a[..., ::-1]),                       # BGR888
    11: (4, lambda a: a[..., [1, 2, 3, 0]]),               # ARGB8888
    12: (4, lambda a: a[..., [2, 1, 0, 3]]),               # BGRA8888
    16: (4, lambda a: a[..., [2, 1, 0, 3]]),               # BGRX8888
    5: (1, None),                                         # I8
    6: (2, None),                                         # IA88
    8: (1, None),                                         # A8
}
_DXT = {13: (b"DXT1", 8), 20: (b"DXT1", 8), 14: (b"DXT3", 16), 15: (b"DXT5", 16)}


class TextureError(Exception):
    pass


def _image_size(fmt, w, h):
    if fmt in _DXT:
        return max(1, (w + 3) // 4) * max(1, (h + 3) // 4) * _DXT[fmt][1]
    if fmt in _RAW:
        return w * h * _RAW[fmt][0]
    if fmt == 4 or fmt == 17:  # 16-bit
        return w * h * 2
    raise TextureError("unsupported VTF format %d" % fmt)


def _dds(fourcc, w, h, data):
    pf = struct.pack("<II4sIIIII", 32, 4, fourcc, 0, 0, 0, 0, 0)
    head = struct.pack("<4sIIIIIII", b"DDS ", 124, 0x81007, h, w, len(data), 0, 0) + b"\0" * 44 + pf + struct.pack("<IIIII", 0x1000, 0, 0, 0, 0)
    return head + data


def decode_vtf(vtf):
    if vtf[:4] != b"VTF\0":
        raise TextureError("not a VTF")
    header_size = struct.unpack_from("<I", vtf, 12)[0]
    w, h = struct.unpack_from("<HH", vtf, 16)
    flags, frames = struct.unpack_from("<IH", vtf, 20)
    fmt = struct.unpack_from("<i", vtf, 52)[0]
    mips = vtf[56]
    low_fmt = struct.unpack_from("<i", vtf, 57)[0]
    low_w, low_h = vtf[61], vtf[62]
    if flags & 0x4000:
        raise TextureError("cubemap")
    off = header_size
    if low_fmt >= 0 and low_w and low_h:
        off += _image_size(low_fmt, low_w, low_h)
    # mips are stored smallest first; each holds every frame
    for level in range(mips - 1, 0, -1):
        off += _image_size(fmt, max(1, w >> level), max(1, h >> level)) * max(1, frames)
    size = _image_size(fmt, w, h)
    data = vtf[off:off + size]
    if len(data) < size:
        raise TextureError("truncated VTF")
    if fmt in _DXT:
        img = Image.open(io.BytesIO(_dds(_DXT[fmt][0], w, h, data)))
        return img.convert("RGBA")
    if fmt == 5:
        a = np.frombuffer(data, np.uint8).reshape(h, w)
        return Image.fromarray(a, "L").convert("RGBA")
    if fmt == 8:
        a = np.frombuffer(data, np.uint8).reshape(h, w)
        return Image.merge("RGBA", [Image.new("L", (w, h), 255)] * 3 + [Image.fromarray(a, "L")])
    if fmt == 6:
        a = np.frombuffer(data, np.uint8).reshape(h, w, 2)
        l = Image.fromarray(a[..., 0].copy(), "L")
        return Image.merge("RGBA", [l, l, l, Image.fromarray(a[..., 1].copy(), "L")])
    if fmt in _RAW:
        bpp, reorder = _RAW[fmt]
        a = np.frombuffer(data, np.uint8).reshape(h, w, bpp)
        a = reorder(a)
        if bpp == 3:
            return Image.fromarray(np.ascontiguousarray(a), "RGB").convert("RGBA")
        return Image.fromarray(np.ascontiguousarray(a), "RGBA")
    raise TextureError("unsupported VTF format %d" % fmt)


_TOKEN = re.compile(r'"[^"]*"|[{}]|[^\s{}"]+')


def parse_vmt(text):
    """Very small KeyValues reader: returns (shader, {lowercased key: value}).

    Nested blocks (proxies, patch `insert`/`replace`) are flattened so a
    `$basetexture` inside a patch's `insert` is found. First occurrence wins.
    """
    text = re.sub(r"//[^\n]*", "", text)
    toks = [t.strip('"') if t.startswith('"') else t for t in _TOKEN.findall(text)]
    shader = ""
    kv = {}
    depth = 0
    i = 0
    while i < len(toks):
        t = toks[i]
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        if t == "{":
            depth += 1
        elif t == "}":
            depth -= 1
        elif nxt == "{":
            if depth == 0 and not shader:
                shader = t.lower()
        elif depth >= 1 and nxt is not None and nxt not in ("{", "}"):
            kv.setdefault(t.lower(), nxt)
            i += 1
        i += 1
    return shader, kv


def resolve_material(fs, vmt_path, depth=0):
    """Load a VMT, following a `patch` shader's include. Returns (shader, kv, raw_text)."""
    data = fs.read(vmt_path)
    if data is None:
        return None
    text = data.decode("latin-1")
    shader, kv = parse_vmt(text)
    if shader == "patch" and depth < 4 and kv.get("include"):
        base = resolve_material(fs, kv["include"].replace("\\", "/").lower(), depth + 1)
        if base:
            bshader, bkv, btext = base
            merged = dict(bkv)
            merged.update({k: v for k, v in kv.items() if k != "include"})
            return bshader, merged, btext + "\n" + text
    return shader, kv, text
