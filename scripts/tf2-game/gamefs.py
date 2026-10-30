"""The game's files as the Source search path sees them.

scripts/tf2-assets/vpkfs.GameFS indexes every VPK under the install and lets the first
archive in path order win, so hl2/ (sorted before tf/) shadows TF2's own copies of the
same path: particles/particles_manifest.txt, particles/blood_impact.pcf,
scripts/game_sounds_*.txt and many sounds. The game itself searches tf/ first.
"""
import os


class GameFirst:
    """GameFS with the game's own archives searched before hl2/, as the Source search
    path does (tf/ overrides hl2/). GameFS alone is first-archive-wins in path order,
    which lets HL2's same-named sound scripts and sounds win."""

    def __init__(self, fs, game="tf"):
        self.fs = fs
        self.game = game
        self._index = None
        self._own = None

    def _build(self):
        mine = "%s%s%s" % (os.sep, self.game, os.sep)
        paks = sorted(self.fs.paks, key=lambda p: 0 if mine in os.path.abspath(p.vpk_path) else 1)
        idx, own = {}, set()
        for pak in paks:
            first = mine in os.path.abspath(pak.vpk_path)
            for name in pak:
                low = name.lower()
                idx.setdefault(low, (pak, name))
                if first:
                    own.add(low)
        self._index, self._own = idx, own

    def own_names(self, prefix="", suffix=""):
        """Paths the game itself ships (its VPKs and loose files), not inherited from hl2/."""
        if self._own is None:
            self._build()
        loose = set()
        top = os.path.join(self.fs.root, self.game)
        for dirpath, _d, names in os.walk(os.path.join(top, prefix)):
            for f in names:
                loose.add(os.path.relpath(os.path.join(dirpath, f), top).replace(os.sep, "/").lower())
        return sorted(n for n in self._own | loose if n.startswith(prefix) and n.endswith(suffix))

    def read(self, name):
        name = name.replace("\\", "/").lower().lstrip("/")
        if self._index is None:
            self._build()
        hit = self._index.get(name)
        if hit is not None:
            return hit[0][hit[1]].read()
        return self.fs.read(name)

    def all_names(self, prefix="", suffix=""):
        return self.fs.all_names(prefix, suffix)


class SearchFS:
    """The search path of a single-player Source game (gameinfo.txt): every VPK of the search
    directories in order (`portal` before `hl2`), then their loose files in the same order — the
    sound packs included, unlike the map pipeline's view. `search=("hl2",)` is the Half-Life 2 demo,
    `("portal", "hl2")` Portal: First Slice."""

    def __init__(self, fs, search=("hl2",)):
        self.fs = fs
        self.root = fs.root
        self.search = [s.strip("/").lower() for s in search if s.strip("/")]
        self._index = None
        self._own = None
        for pak in fs.paks:
            _fix_archive_names(pak)

    def _rank(self, pak):
        path = os.path.relpath(os.path.abspath(pak.vpk_path), os.path.abspath(self.root))
        first = path.replace(os.sep, "/").lower().split("/", 1)[0]
        return self.search.index(first) if first in self.search else len(self.search)

    def _build(self):
        idx, own = {}, set()
        for pak in sorted(self.fs.paks, key=self._rank):
            rank = self._rank(pak)
            if rank >= len(self.search):
                continue
            for name in pak:
                low = name.lower()
                idx.setdefault(low, (pak, name))
                if rank == 0:
                    own.add(low)
        self._index, self._own = idx, own

    def _loose(self, name):
        for d in self.search:
            path = os.path.join(self.root, d, name)
            if os.path.isfile(path):
                return path
        return None

    def read(self, name):
        name = name.replace("\\", "/").lower().lstrip("/")
        if self._index is None:
            self._build()
        hit = self._index.get(name)
        if hit is not None:
            return hit[0][hit[1]].read()
        path = self._loose(name)
        if path is None:
            return None
        with open(path, "rb") as fh:
            return fh.read()

    def exists(self, name):
        name = name.replace("\\", "/").lower().lstrip("/")
        if self._index is None:
            self._build()
        return name in self._index or self._loose(name) is not None

    def names(self, prefix="", suffix="", own=False):
        """Every path under the search directories (VPKs and loose files); `own` limits it to the
        first directory (the game itself, not what it inherits from hl2/)."""
        if self._index is None:
            self._build()
        found = set(self._own if own else self._index)
        for d in self.search[:1] if own else self.search:
            top = os.path.join(self.root, d)
            for dirpath, _d, files in os.walk(os.path.join(top, prefix)):
                for f in files:
                    found.add(os.path.relpath(os.path.join(dirpath, f), top).replace(os.sep, "/").lower())
        return sorted(n for n in found if n.startswith(prefix) and n.endswith(suffix))

    def own_names(self, prefix="", suffix=""):
        return self.names(prefix, suffix, own=True)

    def all_names(self, prefix="", suffix=""):
        return self.names(prefix, suffix)


def _fix_archive_names(pak):
    """The `vpk` package strips "english" from a VPK's path to name its archives (a quirk of old
    depots), so `hl2_sound_vo_english_dir.vpk` would read `hl2_sound_vo__000.vpk`. Name them the
    way the engine does: the directory file's name with `dir` replaced by the archive index."""
    path = getattr(pak, "vpk_path", "")
    if "english" not in os.path.basename(path).lower() or not path.endswith("_dir.vpk"):
        return

    def archive_path(metadata, base=path[:-len("dir.vpk")]):
        if metadata["archive_index"] == 0x7FFF:
            return path
        return "%s%03d.vpk" % (base, metadata["archive_index"])

    pak._make_vpkfile_path = archive_path


# Each game's search directories, as its gameinfo.txt lists them (CS:GO: csgo/pak01_dir.vpk and loose
# csgo/ files; the dedicated server ships the whole content depot under csgo/).
GAME_SEARCH = {"hl2": ("hl2",), "portal": ("portal", "hl2"), "csgo": ("csgo",)}


def open_game(root, game):
    """The file system a game's converters read: TF2 tf/-first (GameFirst), the others SearchFS
    (hl2, portal, csgo)."""
    from vpkfs import GameFS

    if game == "tf2":
        return GameFirst(GameFS(root))
    return SearchFS(GameFS(root), GAME_SEARCH[game])
