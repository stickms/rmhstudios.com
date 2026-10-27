"""Read-only view over the TF2 dedicated server's VPK archives plus loose files.

Later archives do not override earlier ones in practice for the paths we read
(models and materials live in tf2_misc / tf2_textures / hl2_*), so the first
hit wins.
"""
import glob
import os
import struct

import vpk


class GameFS:
    def __init__(self, root):
        self.root = root
        self.paks = []
        for p in sorted(glob.glob(os.path.join(root, "**", "*_dir.vpk"), recursive=True)):
            try:
                self.paks.append(vpk.open(p))
            except Exception:
                pass
        self._index = None

    def index(self):
        if self._index is None:
            idx = {}
            for pak in self.paks:
                for name in pak:
                    idx.setdefault(name.lower(), pak)
            self._index = idx
        return self._index

    def names(self, prefix="", suffix=""):
        return [n for n in self.index() if n.startswith(prefix) and n.endswith(suffix)]

    def loose(self, prefix):
        """Loose (non-VPK) files under <root>/tf and <root>/hl2 matching a path prefix."""
        found = []
        for base in (os.path.join(self.root, "tf"), os.path.join(self.root, "hl2")):
            top = os.path.join(base, prefix)
            for dirpath, _d, files in os.walk(top):
                for f in files:
                    full = os.path.join(dirpath, f)
                    found.append(os.path.relpath(full, base).replace(os.sep, "/").lower())
        return found

    def all_names(self, prefix="", suffix=""):
        return sorted(set(self.names(prefix, suffix)) | {n for n in self.loose(prefix) if n.endswith(suffix)})

    def read(self, name):
        name = name.replace("\\", "/").lower().lstrip("/")
        pak = self.index().get(name)
        if pak is not None:
            return pak[name].read()
        for base in (self.root, os.path.join(self.root, "tf"), os.path.join(self.root, "hl2")):
            path = os.path.join(base, name)
            if os.path.isfile(path):
                with open(path, "rb") as fh:
                    return fh.read()
        return None


def cstr(data, off):
    end = data.index(b"\0", off)
    return data[off:end].decode("latin-1")


def mdl_materials(mdl):
    """Texture names, cd-texture dirs and skin table from an MDL header (v44-v49)."""
    (num_tex, tex_idx, num_cd, cd_idx, num_skin_ref, num_skin_fam, skin_idx) = struct.unpack_from(
        "<7i", mdl, 0xCC
    )
    textures = []
    for i in range(num_tex):
        base = tex_idx + i * 64
        name_off = struct.unpack_from("<i", mdl, base)[0]
        textures.append(cstr(mdl, base + name_off))
    cds = []
    for i in range(num_cd):
        off = struct.unpack_from("<i", mdl, cd_idx + i * 4)[0]
        cds.append(cstr(mdl, off).replace("\\", "/"))
    return textures, cds


def resolve_vmt(fs, tex, cds):
    """First existing materials/<cd>/<tex>.vmt, with its bytes."""
    for cd in cds:
        path = ("materials/" + cd.strip("/") + "/" + tex + ".vmt").replace("//", "/").lower()
        data = fs.read(path)
        if data is not None:
            return path, data
    return None, None
