"""File-system views the importer reads Source content through. All of them expose `read(path) -> bytes | None`
with Source's own path rules (case-insensitive, `/` or `\\`, no leading slash), so the rest of the pipeline never
cares where the bytes come from:

  LooseFS   one or more directories of loose files laid out like a game folder (`models/...`, `materials/...`),
            e.g. the content a public repository hosts, or a hand-extracted GCF/VPK. Earlier roots win.
  SteamFS   a Steam install (VPK archives + loose files), via scripts/tf2-assets/vpkfs.py; needs `pip install vpk`.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.normpath(os.path.join(HERE, "..", ".."))


def norm(name):
    return name.replace("\\", "/").lower().lstrip("/")


class LooseFS:
    def __init__(self, roots):
        self.roots = [os.path.abspath(r) for r in roots]
        self._index = {}
        self.used = {}  # normalised path -> real path, for every file `read` returned (provenance)
        for root in self.roots:
            for dirpath, _dirs, files in os.walk(root):
                for f in files:
                    full = os.path.join(dirpath, f)
                    rel = norm(os.path.relpath(full, root))
                    self._index.setdefault(rel, full)

    def read(self, name):
        path = self._index.get(norm(name))
        if path is None:
            return None
        self.used[norm(name)] = path
        with open(path, "rb") as fh:
            return fh.read()

    def relative(self, path):
        """(root index, path relative to that root, original case) of a real file path."""
        for i, root in enumerate(self.roots):
            if path.startswith(root + os.sep):
                return i, os.path.relpath(path, root).replace(os.sep, "/")
        return None

    def exists(self, name):
        return norm(name) in self._index

    def where(self, name):
        return self._index.get(norm(name))

    def names(self, prefix="", suffix=""):
        return sorted(n for n in self._index if n.startswith(prefix) and n.endswith(suffix))


class SteamFS:
    """Steam install root (the folder holding `hl2/` and/or `tf/`). First search dir wins."""

    def __init__(self, root, search=("hl2", "tf")):
        sys.path.insert(0, os.path.join(SCRIPTS, "tf2-assets"))
        from vpkfs import GameFS  # noqa: E402  (imports the optional `vpk` package)

        self._fs = GameFS(root)
        self.root = root
        self.search = search

    def read(self, name):
        name = norm(name)
        for d in self.search:
            path = os.path.join(self.root, d, name)
            if os.path.isfile(path):
                with open(path, "rb") as fh:
                    return fh.read()
        try:
            return self._fs.read(name)
        except OSError:
            return None

    def exists(self, name):
        return self.read(name) is not None

    def where(self, name):
        return "steam:" + norm(name)
