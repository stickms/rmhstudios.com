"""Collect the files the HUD editor's base needs from a TF2 install.

    hud.py --root <game install> --out <dir> [--state state.json] [--build <steam build>]

Same selection as scripts/tf2-hud/import-base.mjs (panels and schemes under
resource/, the named scripts, the HUD's own materials and every material a
panel names) plus the texture (.vtf) each material points at, and the game's
localisation for the panels' `#Token` labels: `resource/tf_<language>.txt`
for every language TF2 ships (UTF-16 KeyValues, stored Brotli-compressed by
publish.ts; the editor and the browser game read only the one they show).

The browser game's Source-style menus are drawn from the same base, so it also
carries what they read (all small text): GameUI's and the engine's language
files (`resource/gameui_<language>.txt`, `resource/valve_<language>.txt`: the
options dialog's and the game menu's `#GameUI_*` / `#Valve_*` tokens), the key
list `scripts/kb_act.lst` (TF2's; Half-Life 2's as `hl2/scripts/kb_act.lst`),
TF2's Advanced Options script `cfg/user_default.scr`, and the main menu's
background lists `scripts/chapterbackgrounds.txt` / `characterbackgrounds.txt`
(the option pages `resource/OptionsSub*.res` are under resource/ already).
Files are read as the game reads them: tf/ before hl2/ (gameinfo.txt's search
order: TF2's archives, then its loose files, then Half-Life 2's), so TF2's
clientscheme.res, gamemenu.res and kb_act.lst win over Half-Life 2's — TF2 ships
several of its UI files loose under tf/, which an archives-first read let
Half-Life 2's packed copies shadow. The run prints where each menu file came from.
Closed captions and the item schema's strings are left out: no HUD reads
them, and they are the bulk of `resource/`. Only files whose
content changed since `--state` are written; `wanted.json` lists them all, and
`manifest.json` (the editor's index: [path, size, sha1]) is rebuilt every run.
"""
import argparse
import hashlib
import json
import os
import re

from vpkfs import GameFS
from srctex import parse_vmt, texture_path

KEEP_SCRIPTS = ["scripts/hudlayout.res", "scripts/hudanimations_manifest.txt",
                "scripts/hudanimations_tf.txt", "scripts/mod_textures.txt"]
KEEP_MATERIAL_DIRS = ["vgui", "hud", "console", "logo"]
TEXT_EXT = re.compile(r"\.(res|txt|menu)$", re.I)
IMAGE_KEYS = re.compile(
    r'"(?:image|icon|fg_image|bg_image|image_default|image_armed|image_selected|teambg_\d+|iconimage|texture|texturename|material|image_[a-z]+)"\s+"([^"\n]+)"', re.I)
# TF2's languages (lib/tf2-hud/localisation.ts TF_LANGUAGES): `resource/tf_<id>.txt`.
LANGUAGES = ["english", "spanish", "latam", "french", "german", "italian", "portuguese", "brazilian",
             "dutch", "polish", "czech", "hungarian", "romanian", "bulgarian", "russian", "ukrainian",
             "greek", "turkish", "danish", "finnish", "norwegian", "swedish", "schinese", "tchinese",
             "japanese", "koreana", "thai", "vietnamese"]
# Read by the browser game's menus (lib/tf2-game/client/menus/source.ts `menuFiles`).
MENU_FILES = ["scripts/kb_act.lst", "cfg/user_default.scr",
              "scripts/chapterbackgrounds.txt", "scripts/characterbackgrounds.txt"]
# Half-Life 2's own copies, published beside TF2's under hl2/ (the HL2 and Portal Options dialogs).
HL2_MENU_FILES = ["scripts/kb_act.lst"]
ENGINE_LANGUAGE_PREFIXES = ["valve", "gameui"]
# resource/ files no HUD reads: closed captions and the war paint / item names.
SKIP_RESOURCE = re.compile(r"^resource/(?:closecaption_|subtitles_|tf_proto_obj_defs_)", re.I)
BASE_VERSION = 3  # bump when the selection above changes


def wanted_resource(name):
    """Whether a file under resource/ belongs in the HUD base."""
    return not SKIP_RESOURCE.match(name)


def language_files():
    return ["resource/tf_%s.txt" % lang for lang in LANGUAGES]


def engine_language_files():
    """GameUI's and the engine's language files (lib/tf2-hud/localisation.ts gameLanguageFiles)."""
    return ["resource/%s_%s.txt" % (p, lang) for p in ENGINE_LANGUAGE_PREFIXES for lang in LANGUAGES]


def game_first(fs):
    """Search tf/ before hl2/, as gameinfo.txt does (the first hit wins in GameFS)."""
    def rank(pak):
        p = getattr(pak, "vpk_path", "").replace("\\", "/")
        return 0 if "/tf/" in p else 1
    fs.paks.sort(key=rank)
    fs._index = None
    return fs


# The menu and scheme files whose source the run reports (a Half-Life 2 copy here breaks the menus).
REPORT_FILES = ["resource/clientscheme.res", "resource/sourcescheme.res", "resource/gamemenu.res",
                "resource/ui/mainmenuoverride.res", "scripts/chapterbackgrounds.txt",
                "scripts/characterbackgrounds.txt"]


class TfFirst:
    """The search path TF2 reads with: its archives, then its loose files under tf/, then everything else
    (Half-Life 2's archives and loose files). GameFS alone reads every archive before any loose file."""

    def __init__(self, fs):
        self.fs = fs
        self.root = fs.root
        self.paks = fs.paks
        self.tf_paks = [p for p in fs.paks if "/tf/" in getattr(p, "vpk_path", "").replace("\\", "/")]
        self.origin = {}

    def read(self, name):
        name = name.replace("\\", "/").lower().lstrip("/")
        for pak in self.tf_paks:
            if name in pak:
                self.origin[name] = os.path.basename(pak.vpk_path)
                return pak[name].read()
        path = os.path.join(self.root, "tf", name)
        if os.path.isfile(path):
            self.origin[name] = "tf/ (loose)"
            with open(path, "rb") as fh:
                return fh.read()
        data = self.fs.read(name)
        if data is not None:
            pak = self.fs.index().get(name)
            self.origin[name] = os.path.basename(pak.vpk_path) if pak is not None else "loose"
        return data

    def all_names(self, prefix="", suffix=""):
        return self.fs.all_names(prefix, suffix)


def read_hl2(fs, name):
    """A file from Half-Life 2's own packs (hl2/), whatever tf/ has."""
    name = name.lower()
    for pak in fs.paks:
        if "/hl2/" in getattr(pak, "vpk_path", "").replace("\\", "/"):
            try:
                if name in pak:
                    return pak[name].read()
            except Exception:
                continue
    path = os.path.join(fs.root, "hl2", name)
    if os.path.isfile(path):
        with open(path, "rb") as fh:
            return fh.read()
    return None


def norm(parts):
    out = []
    for p in parts:
        if p == "..":
            if out:
                out.pop()
        elif p and p != ".":
            out.append(p)
    return "/".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--state")
    ap.add_argument("--build", default="unknown")
    args = ap.parse_args()

    fs = TfFirst(game_first(GameFS(args.root)))
    published = {}
    if args.state and os.path.exists(args.state):
        published = json.load(open(args.state)).get("models", {})

    files = {}  # path -> bytes
    def take(path):
        if path in files:
            return True
        try:
            data = fs.read(path)
        except OSError:
            # A dedicated-server install lists textures it does not ship (no archive): skip them.
            return False
        if data is None:
            return False
        files[path] = data
        return True

    for n in fs.all_names("resource/"):
        if wanted_resource(n):
            take(n)
    # The localisation lives in tf2_misc (or loose in tf/resource/): taken by name, wherever it is.
    for n in language_files():
        take(n)
    for n in engine_language_files():
        take(n)
    for n in KEEP_SCRIPTS + MENU_FILES:
        take(n)
    for n in HL2_MENU_FILES:
        data = read_hl2(fs, n)
        if data is not None:
            files["hl2/" + n] = data
    for n in fs.all_names("scripts/screens/"):
        take(n)
    vmts = set()
    for d in KEEP_MATERIAL_DIRS:
        for n in fs.all_names("materials/%s/" % d, ".vmt"):
            vmts.add(n)
    named = set()
    for n, data in list(files.items()):
        if TEXT_EXT.search(n):
            for m in IMAGE_KEYS.finditer(data.decode("utf-8", "ignore")):
                named.add(m.group(1).strip().replace("\\", "/"))
    for v in named:
        v = re.sub(r"\.(vtf|vmt|png|tga)$", "", v, flags=re.I)
        vmts.add(norm(["materials", "vgui"] + v.lower().split("/")) + ".vmt")
    for v in sorted(vmts):
        if not take(v):
            continue
        _shader, kv = parse_vmt(files[v].decode("latin-1"))
        base = kv.get("$basetexture")
        if base:
            take(texture_path(base))

    for n in REPORT_FILES:
        print("%-38s %s" % (n, fs.origin.get(n, "not found") if n in files else "not found"))
    os.makedirs(args.out, exist_ok=True)
    manifest_rows = []
    wanted, written = {}, 0
    for path in sorted(files):
        data = files[path]
        sha = hashlib.sha1(data).hexdigest()
        manifest_rows.append([path, len(data), sha])
        wanted[path] = {"src": "%d:%s" % (BASE_VERSION, sha)}
        if published.get(path, {}).get("src") == wanted[path]["src"] and os.environ.get("FORCE") != "1":
            continue
        dest = os.path.join(args.out, path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(data)
        written += 1

    manifest = {"version": 2,
                "source": {"repo": "steam://app/440", "commit": "tf2-build-%s" % args.build,
                           "license": "Valve (read from the installed game)"},
                "files": manifest_rows}
    mtext = ('{"version":2,"source":%s,"files":[\n%s\n]}\n'
             % (json.dumps(manifest["source"]), ",\n".join(" " + json.dumps(r) for r in manifest_rows)))
    msha = hashlib.sha1(mtext.encode()).hexdigest()
    wanted["manifest.json"] = {"src": "%d:%s" % (BASE_VERSION, msha)}
    if published.get("manifest.json", {}).get("src") != wanted["manifest.json"]["src"] or os.environ.get("FORCE") == "1":
        with open(os.path.join(args.out, "manifest.json"), "w") as fh:
            fh.write(mtext)
        written += 1
    json.dump(wanted, open(os.path.join(args.out, "wanted.json"), "w"))
    json.dump([], open(os.path.join(args.out, "failed.json"), "w"))
    print("hud: %d files selected, %d changed" % (len(files), written))


if __name__ == "__main__":
    main()
