#!/usr/bin/env python3
"""A game's main-menu data for the browser game: the `<game>-menu` channel (`<game>-game/menu/`).

    menu_ui.py --game hl2|portal|csgo --root <install> --out <dir> [--state state.json]

Half-Life 2 and Portal draw the classic Source GameUI: the game's console background, its title in the
game's own font, `resource/gamemenu.res`'s entries and the Options / New Game dialogs in the scheme's
colours. CS:GO draws Panorama: a background movie (or the map's screenshot), the game's fonts, icons and
words. Everything is read from the install at sync time and loaded at run time; nothing is copied into
the repository. Each file is content-addressed (SHA-256 of what was written):

  <out>/files/<sha>.json  `{path: text}` — the menu's text files (gamemenu.res, the schemes,
                          chapterbackgrounds.txt, gamelogo.res, gameinfo.txt), small KeyValues
  <out>/lang/<sha>.json   `{v, lang, tokens}` — GameUI's tokens and the game's chapter titles (Source),
                          the menu's and settings' tokens (CS:GO), every language the install ships
  <out>/img/<sha>.webp    console backgrounds and chapter pictures (Source), the map's screenshot (CS:GO)
  <out>/icons/<sha>.svg   CS:GO's menu icons and logo, sanitised (csgo_ui.sanitize_svg)
  <out>/font/<sha>.ttf|otf the fonts the schemes load (CustomFontFiles), Panorama's fonts (CS:GO)
  <out>/video/<sha>.webm  CS:GO: one main-menu background movie (browsers play WebM as it ships)
  <out>/index.json        `{v, game, files, lang, images, icons, fonts, video}`: install path -> file
  <out>/wanted.json, errors.json, failed.json   for publish.ts push (--index index.json)

The run prints what it found under the paths it searches, so a missing piece shows in the log.
"""
import argparse
import hashlib
import io
import json
import os
import re
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

from PIL import Image  # noqa: E402

import csgo_ui  # noqa: E402
import srctex  # noqa: E402

VERSION = 1
SEARCH = {"hl2": ("hl2",), "portal": ("portal", "hl2"), "csgo": ("csgo",)}
IMAGE_CAP = 1920
THUMB_CAP = 512
WEBP_QUALITY = 82
VIDEO_CAP = 40 * 1024 * 1024
# Source text files the menu reads (the first found in the search path).
SOURCE_FILES = ("resource/gamemenu.res", "resource/sourcescheme.res", "resource/clientscheme.res",
                "resource/gamelogo.res", "scripts/chapterbackgrounds.txt", "gameinfo.txt")
# Localisation: GameUI's words for every Source game; the game's own file for its chapter titles.
LANG_FILE = re.compile(r"resource/(gameui|hl2|portal|csgo)_([a-z_]+)\.txt$")
GAME_TOKENS = re.compile(r"(chapter|_title|gamemenu|newgame|loadgame|mainmenu)", re.I)
# CS:GO: the words the main menu and settings show.
CSGO_TOKENS = ("sfui_mainmenu", "sfui_settings", "sfui_gametype", "sfui_gamemode", "sfui_map_",
               "sfui_quit", "sfui_options", "sfui_controls", "sfui_audio", "sfui_video", "sfui_keyboard",
               "sfui_mouse", "sfui_game", "sfui_play", "settings_", "mainmenu_", "gameui_", "panorama_settings",
               "sfui_lobby", "sfui_bots", "sfui_offline", "sfui_practice", "sfui_dm", "sfui_classic")
CSGO_MENU_ICONS = re.compile(
    r"^(play\w*|settings\w*|gear\w*|power\w*|quit\w*|exit\w*|home\w*|inventory\w*|backpack\w*|watch\w*|tv\w*|"
    r"stats\w*|leaderboard\w*|news\w*|friends?\w*|profile\w*|map\w*|bot\w*|globe\w*|search\w*|back\w*|"
    r"close\w*|x\w*|check\w*|arrow\w*|caret\w*|plus\w*|minus\w*|controller\w*|keyboard\w*|mouse\w*|"
    r"audio\w*|speaker\w*|volume\w*|display\w*|video\w*|monitor\w*|crosshair\w*|radar\w*|hud\w*)$")
# The main menu's map backgrounds (`<map>.webm`, `<map>720.webm`, `<map>540.webm`): Dust II's when it
# has one, else a classic map's; previews, intros and the like are not backgrounds.
CSGO_VIDEO_PREFERENCE = ("dust2", "mirage", "inferno", "nuke", "overpass", "vertigo", "ancient", "anubis",
                         "cbble", "train", "sirocco")
CSGO_VIDEO_SKIP = re.compile(r"(preview|acknowledge|intro|tutorial|trailer|loading)")
FONT_EXT = (".ttf", ".otf", ".woff", ".woff2", ".vfont")
VFONT_MAGIC = b"VFONT1"
VFONT_KEY = 167


def decode_vfont(data):
    """Panorama's `.vfont`: a TrueType file with each byte XORed by a rolling key, seeded from a salt kept
    before the trailing `VFONT1` tag (the format as ValveResourceFormat, an open-source tool, reads it).
    -> the TrueType bytes."""
    if len(data) < len(VFONT_MAGIC) + 1 or data[-len(VFONT_MAGIC):] != VFONT_MAGIC:
        raise ValueError("not a vfont")
    count = data[-len(VFONT_MAGIC) - 1]
    end = len(data) - len(VFONT_MAGIC) - count
    if count < 1 or end < 0:
        raise ValueError("vfont: bad salt length")
    key = VFONT_KEY
    for b in data[end:end + count - 1]:
        key ^= (b + VFONT_KEY) % 256
    out = bytearray(end)
    for i in range(end):
        c = data[i]
        out[i] = c ^ key
        key = (c + VFONT_KEY) % 256
    return bytes(out)


def json_bytes(doc):
    return json.dumps(doc, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")


class Install:
    """The game's search path: its archives (SearchFS) and its loose files, listed and read."""

    def __init__(self, root, game):
        from gamefs import open_game

        self.root = root
        self.dirs = SEARCH[game]
        self.fs = open_game(root, "csgo" if game == "csgo" else game)

    def read(self, name):
        try:
            data = self.fs.read(name)
        except OSError:
            data = None
        if data is not None:
            return data
        for d in self.dirs:
            path = os.path.join(self.root, d, name)
            if os.path.isfile(path):
                with open(path, "rb") as fh:
                    return fh.read()
        return None

    def names(self, prefix, suffix=""):
        found = set()
        for pak in self.fs.fs.paks:
            for n in pak:
                low = n.lower()
                if low.startswith(prefix) and low.endswith(suffix):
                    found.add(low)
        for d in self.dirs:
            top = os.path.join(self.root, d)
            for dirpath, _dirs, files in os.walk(os.path.join(top, prefix)):
                for f in files:
                    rel = os.path.relpath(os.path.join(dirpath, f), top).replace(os.sep, "/").lower()
                    if rel.startswith(prefix) and rel.endswith(suffix):
                        found.add(rel)
        return sorted(found)


class Output(csgo_ui.Output):
    pass


def text_of(raw):
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16")
    return raw.decode("utf-8-sig", "replace")


def webp(img, cap):
    img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
    if max(img.size) > cap:
        k = cap / max(img.size)
        size = (max(1, round(img.size[0] * k)), max(1, round(img.size[1] * k)))
        if img.mode == "RGBA":
            rgb = img.convert("RGB").resize(size, Image.LANCZOS)
            rgb.putalpha(img.getchannel("A").resize(size, Image.LANCZOS))
            img = rgb
        else:
            img = img.resize(size, Image.LANCZOS)
    if img.mode == "RGBA" and img.getchannel("A").getextrema()[0] == 255:
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=WEBP_QUALITY, method=4)
    return buf.getvalue()


def material_texture(inst, material):
    """`console/background01` -> the VTF its VMT names (or the same-named VTF)."""
    base = "materials/%s" % material.strip("/").lower()
    vmt = inst.read(base + ".vmt")
    if vmt is not None:
        _shader, kv = srctex.parse_vmt(vmt.decode("latin-1"))
        tex = kv.get("$basetexture")
        if tex:
            data = inst.read(srctex.texture_path(tex))
            if data is not None:
                return data
    return inst.read(base + ".vtf")


def chapter_backgrounds(text):
    """The background names chapterbackgrounds.txt lists (any quoted value of its first block)."""
    return re.findall(r'^\s*"?\d+"?\s+"([a-z0-9_]+)"', text or "", re.I | re.M)


def scheme_fonts(text):
    """Font files a scheme loads: CustomFontFiles' `"1" "resource/x.ttf"` and `"font" "resource/x.ttf"`."""
    return sorted({m.lower().replace("\\", "/") for m in re.findall(r'"([^"]+\.(?:ttf|otf))"', text or "", re.I)})


def logo_images(text):
    return sorted({m.lower() for m in re.findall(r'"image"\s*"([^"]+)"', text or "", re.I)})


def build_source(inst, game, out, errors):
    files, images, fonts = {}, {}, {}
    texts = {}
    for path in SOURCE_FILES:
        raw = inst.read(path)
        if raw is None:
            print("  %-36s missing" % path)
            continue
        texts[path] = text_of(raw)
        print("  %-36s %d bytes" % (path, len(raw)))
    files_rel = out.emit("files", "json", json_bytes(texts)) if texts else None

    # Backgrounds: every chapter's console picture, both shapes; then the chapter thumbnails.
    names = chapter_backgrounds(texts.get("scripts/chapterbackgrounds.txt"))
    listed = [n[len("materials/"):-4] for n in inst.names("materials/console/", ".vtf")]
    print("  console pictures: %d (%s)" % (len(listed), ", ".join(listed[:12])))
    wanted = []
    for n in names or [x for x in listed if x.startswith("console/background")]:
        for v in ("console/%s" % n, "console/%s_widescreen" % n) if not n.startswith("console/") else (n,):
            if v not in wanted:
                wanted.append(v)
    wanted += [n[len("materials/"):-4] for n in inst.names("materials/vgui/chapters/", ".vtf")]
    for mat in logo_images(texts.get("resource/gamelogo.res")):
        wanted.append(mat if mat.startswith(("vgui/", "console/")) else "vgui/%s" % mat)
    for mat in wanted:
        vtf = material_texture(inst, mat)
        if vtf is None:
            continue
        try:
            cap = THUMB_CAP if "/chapters/" in mat else IMAGE_CAP
            images[mat] = out.emit("img", "webp", webp(srctex.decode_vtf(vtf), cap))
        except (srctex.TextureError, OSError, ValueError) as exc:
            errors.append({"id": mat, "error": str(exc)})
    # Fonts the schemes load, and any font file under resource/.
    font_paths = set()
    for path in ("resource/sourcescheme.res", "resource/clientscheme.res"):
        font_paths.update(scheme_fonts(texts.get(path)))
    font_paths.update(inst.names("resource/", ".ttf"))
    font_paths.update(inst.names("resource/", ".otf"))
    for path in sorted(font_paths):
        raw = inst.read(path)
        if raw:
            fonts[path] = out.emit("font", path.rsplit(".", 1)[1], raw)
    return files_rel, images, fonts


def build_lang(inst, game, out, errors):
    langs = {}
    merged = {}
    for path in inst.names("resource/", ".txt"):
        m = LANG_FILE.search(path)
        if not m:
            continue
        kind, lang = m.group(1), m.group(2)
        if (kind == "csgo") != (game == "csgo"):
            continue
        try:
            raw = inst.read(path)
            name, tokens = csgo_ui.read_localization(raw) if raw else (None, {})
        except (UnicodeDecodeError, OSError, ValueError) as exc:
            errors.append({"id": path, "error": str(exc)})
            continue
        if kind == "csgo":
            tokens = {t: v for t, v in tokens.items() if t.startswith(CSGO_TOKENS)}
        elif kind != "gameui":
            tokens = {t: v for t, v in tokens.items() if GAME_TOKENS.search(t)}
        merged.setdefault(name or lang, {}).update(tokens)
    for lang, tokens in sorted(merged.items()):
        if tokens:
            langs[lang] = out.emit("lang", "json", json_bytes({"v": VERSION, "lang": lang, "tokens": tokens}))
    print("  languages: %d (english %d tokens)" % (len(langs), len(merged.get("english", {}))))
    return langs


def build_csgo(inst, out, errors):
    images, icons, fonts, video = {}, {}, {}, None
    for prefix in ("panorama/videos/", "panorama/fonts/", "materials/panorama/images/map_icons/",
                   "materials/panorama/images/backgrounds/", "materials/panorama/images/icons/ui/",
                   "materials/panorama/images/logo", "panorama/images/"):
        names = inst.names(prefix)
        print("  %-44s %d (%s)" % (prefix, len(names), ", ".join(n.rsplit("/", 1)[-1] for n in names[:10])))
    # A background movie: the preferred map first, its 720p cut before the full one, under the size cap.
    movies = [n for n in inst.names("panorama/videos/", ".webm") if not CSGO_VIDEO_SKIP.search(n)]
    print("  videos: %s" % ", ".join(n.rsplit("/", 1)[-1] for n in movies))

    def rank(n):
        stem = n.rsplit("/", 1)[-1][:-5]
        pref = next((i for i, k in enumerate(CSGO_VIDEO_PREFERENCE) if stem.startswith(k)), 99)
        cut = 0 if re.search(r"720p?$", stem) else 1 if not re.search(r"\d+p?$", stem) else 2
        return (pref, cut, stem)
    ranked = sorted(movies, key=rank)
    for n in ranked:
        raw = inst.read(n)
        if raw and len(raw) <= VIDEO_CAP:
            video = {"path": n, "file": out.emit("video", "webm", raw)}
            break
    # Fonts (Panorama's own, wherever the install keeps them).
    font_names = [n for n in inst.names("panorama/fonts/") + inst.names("resource/") if n.endswith(FONT_EXT)]
    print("  fonts: %s" % ", ".join(font_names[:40]))
    print("  panorama/fonts/: %s" % ", ".join(n.rsplit("/", 1)[-1] for n in inst.names("panorama/fonts/")))
    for n in font_names:
        # Stratum2 (the menu's type, not its mono-digit cut) and Noto Sans for the letters it lacks; the
        # CJK and Thai Noto families are several MB each and stay out.
        stem = n.rsplit("/", 1)[-1]
        if not (re.match(r"stratum2(?!.*monodigit)", stem) or re.match(r"notosans-(regular|bold)\.", stem)):
            continue
        raw = inst.read(n)
        if not raw:
            continue
        try:
            if n.endswith(".vfont"):
                fonts[n[:-6] + ".ttf"] = out.emit("font", "ttf", decode_vfont(raw))
            else:
                fonts[n] = out.emit("font", n.rsplit(".", 1)[1], raw)
        except ValueError as exc:
            errors.append({"id": n, "error": str(exc)})
    # The logo and the default background, where Panorama keeps them as textures.
    for n in inst.names("materials/panorama/images/backgrounds/", ".vtf"):
        stem = n.rsplit("/", 1)[-1][:-4]
        if "logo" in stem or stem == "csgo_default":
            try:
                images[n] = out.emit("img", "webp", webp(srctex.decode_vtf(inst.read(n)), IMAGE_CAP))
            except (srctex.TextureError, OSError, ValueError, TypeError) as exc:
                errors.append({"id": n, "error": str(exc)})
    # The map's screenshot(s) and any background picture.
    for n in inst.names("materials/panorama/images/"):
        if not n.endswith((".png", ".jpg")):
            continue
        if ("de_dust2" in n and "map_icons" in n) or "/backgrounds/" in n:
            raw = inst.read(n)
            try:
                images[n] = out.emit("img", "webp", webp(Image.open(io.BytesIO(raw)), IMAGE_CAP))
            except (OSError, ValueError, TypeError) as exc:
                errors.append({"id": n, "error": str(exc)})
    # Menu icons and the logo (sanitised SVG).
    for n in inst.names("materials/panorama/images/", ".svg"):
        stem = n.rsplit("/", 1)[-1][:-4]
        is_icon = "/icons/ui/" in n and CSGO_MENU_ICONS.match(stem)
        is_logo = "logo" in n and ("csgo" in n or "counter" in n or "/logo" in n)
        is_map = "de_dust2" in n
        if not (is_icon or is_logo or is_map):
            continue
        try:
            icons[n] = out.emit("icons", "svg", csgo_ui.sanitize_svg(inst.read(n)))
        except (csgo_ui.SvgError, OSError, TypeError) as exc:
            errors.append({"id": n, "error": str(exc)})
    return images, icons, fonts, video


def build(inst, game, out_dir, state=None):
    os.makedirs(out_dir, exist_ok=True)
    out = Output(out_dir, state)
    errors = []
    print("%s menu:" % game)
    files_rel, images, icons, fonts, video = None, {}, {}, {}, None
    if game == "csgo":
        images, icons, fonts, video = build_csgo(inst, out, errors)
    else:
        files_rel, images, fonts = build_source(inst, game, out, errors)
    langs = build_lang(inst, game, out, errors)
    index = {"v": VERSION, "game": game, "files": files_rel, "lang": langs, "images": images,
             "icons": icons, "fonts": fonts, "video": video}
    data = json_bytes(index)
    with open(os.path.join(out_dir, "index.json"), "wb") as fh:
        fh.write(data)
    out.wanted["index.json"] = {"src": hashlib.sha256(data).hexdigest()}
    with open(os.path.join(out_dir, "wanted.json"), "w") as fh:
        json.dump(out.wanted, fh)
    with open(os.path.join(out_dir, "errors.json"), "w") as fh:
        json.dump(errors, fh, indent=1)
    with open(os.path.join(out_dir, "failed.json"), "w") as fh:
        json.dump([], fh)
    print("%s menu: %d images, %d icons, %d fonts, video %s, %d languages; %d files written, %d errors" % (
        game, len(images), len(icons), len(fonts), video["path"] if video else "none", len(langs), out.written,
        len(errors)))
    for e in errors[:20]:
        print("  error %s: %s" % (e["id"], e["error"]))
    if not (files_rel or images or icons or langs):
        raise SystemExit("%s menu: nothing was extracted" % game)
    return index


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--game", required=True, choices=sorted(SEARCH))
    ap.add_argument("--root", required=True, help="the install (the folder holding hl2/, portal/ or csgo/)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--state", help="the channel's published state (publish.ts state)")
    args = ap.parse_args(argv)
    state = None
    if args.state and os.path.exists(args.state):
        with open(args.state) as fh:
            state = json.load(fh)
    build(Install(args.root, args.game), args.game, args.out, state)


if __name__ == "__main__":
    main()
