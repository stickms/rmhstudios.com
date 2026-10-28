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
