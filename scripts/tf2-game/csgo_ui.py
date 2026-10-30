#!/usr/bin/env python3
"""CS:GO's HUD and buy-menu data for the browser game: the `csgo-ui` channel (`csgo-game/ui/`).

    csgo_ui.py --root <csgo ds install> --out <dir> [--state state.json] [--all-ui-icons]

Three kinds of file, each content-addressed (SHA-256 of what was written), plus the index:

  <out>/icons/<sha>.svg   Panorama icons (`materials/panorama/images/icons/equipment/*.svg` of the
                          default weapons and equipment, and the HUD's `icons/ui/*.svg` matching
                          UI_ICON_KEEP), SANITISED: no script, foreignObject, iframe/object/embed,
                          animation or event-handler attributes, no external references (href /
                          url() / @import outside the document), no DOCTYPE or entities. Served with a
                          sandboxing CSP as well (store.server.ts).
  <out>/lang/<sha>.json   `{v, lang, tokens: {TOKEN: text}}` from `resource/csgo_<language>.txt`
                          (UTF-16 KeyValues), every language the install ships, filtered to the HUD's
                          tokens (TOKEN_PREFIXES and the default items' names). The text is loaded at
                          run time; none of it is copied into the repository.
  <out>/data/<sha>.json   the default weapons' data (csgo_items.compact): items_game.txt items with
                          their prefab chains resolved — prices, clip sizes, damage, spread, speeds,
                          sounds, effects, models — plus old-style weapon scripts if present.
  <out>/index.json        `{v, icons: {"equipment/ak47": "icons/<sha>.svg", …}, lang: {english:
                          "lang/<sha>.json", …}, weapons: "data/<sha>.json"|null}` (published last)
  <out>/wanted.json, errors.json, failed.json   for publish.ts push (--index index.json
                          --preserve-index icons,lang)

The weapon data is extracted as compact JSON rather than publishing items_game.txt (≈6 MB of paint
kits, stickers and other games' items): what the game needs is a few dozen resolved items.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

import csgo_items  # noqa: E402

VERSION = 1
ICON_ROOT = "materials/panorama/images/icons/"
# Equipment icons besides the weapons' own (`weapon_ak47` -> `ak47`).
EQUIPMENT_EXTRA = ("defuser", "kevlar", "assaultsuit", "armor", "armor_helmet", "c4", "knife",
                   "knife_t", "taser", "helmet", "planted_c4", "defuse", "bomb")
# HUD icons (icons/ui/<name>.svg) kept by name: health and armour, the bomb and defusing, the kill
# feed's modifiers, the round timer and money, team and radio markers.
UI_ICON_KEEP = re.compile(
    r"^(health\w*|armor\w*|kevlar\w*|helmet\w*|bomb\w*|c4\w*|defus\w*|kit\w*|headshot\w*|penetrat\w*|"
    r"wallbang\w*|noscope\w*|blind\w*|smoke\w*|suicide\w*|dominat\w*|revenge\w*|kill\w*|death\w*|dead\w*|"
    r"skull\w*|clock\w*|timer\w*|time\w*|money\w*|dollar\w*|cash\w*|ammo\w*|bullet\w*|crosshair\w*|"
    r"ct\w*|t_\w*|terrorist\w*|counterterrorist\w*|team\w*|radio\w*|voice\w*|microphone\w*|"
    r"buy\w*|cart\w*|shop\w*|elimination\w*|explosion\w*|target\w*|warning\w*|alert\w*|"
    r"check\w*|x\w*|close\w*|arrow\w*|caret\w*|plus\w*|minus\w*|player\w*|teammate\w*|enemy\w*)$")
# Localisation tokens the HUD reads, by prefix (lowercase): weapon and HUD names, round notices,
# buy menu, radio, hints and team names.
TOKEN_PREFIXES = ("sfui_wpnhud_", "sfui_notice_", "sfui_buymenu_", "sfui_buy_", "sfui_radio_",
                  "sfui_hint_", "sfui_scoreboard_", "sfui_ct_", "sfui_t_", "sfui_teamname",
                  "sfui_bomb", "sfui_defus", "sfui_round", "sfui_wincond", "sfui_cash", "sfui_hud_",
                  "sfui_dm_", "sfui_gamemode", "sfui_map_de_dust2", "cstrike_titlestxt_",
                  "cstrike_ct", "cstrike_ter", "csgo_type_", "csgo_item_desc_weapon_",
                  "panorama_hud_", "hud_", "radio_", "buymenu_", "loadoutslot_", "inv_category_")

# ------------------------------------------------------------------------------------------ SVG

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
# Elements removed with their content: anything that runs code, embeds another document, or animates
# (an <animate>/<set> can rewrite an href to javascript:).
DROP_ELEMENTS = {"script", "foreignobject", "iframe", "object", "embed", "handler", "listener",
                 "animate", "animatemotion", "animatetransform", "animatecolor", "set", "audio",
                 "video", "canvas", "noscript", "meta", "link", "base"}
SAFE_DATA_IMAGE = re.compile(r"^data:image/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$", re.I)
CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I)


class SvgError(ValueError):
    pass


def _local(tag):
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def _clean_css(text):
    """Style text without @import, expression(), behaviour bindings or non-local url()s."""
    if re.search(r"@import|expression\s*\(|behavior\s*:|-moz-binding|javascript:", text, re.I):
        text = re.sub(r"@import[^;]*;?", "", text, flags=re.I)
        text = re.sub(r"expression\s*\([^)]*\)|behavior\s*:[^;]*;?|-moz-binding\s*:[^;]*;?|javascript:",
                      "", text, flags=re.I)

    def url(m):
        target = m.group(2).strip()
        return m.group(0) if target.startswith("#") or SAFE_DATA_IMAGE.match(target) else "none"

    return CSS_URL.sub(url, text)


def sanitize_svg(raw):
    """Panorama SVG bytes -> sanitised SVG bytes (UTF-8). Raises SvgError when it is not an SVG."""
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    if re.search(r"<!ENTITY", text, re.I):
        raise SvgError("entity declarations")
    text = re.sub(r"<!DOCTYPE[^>\[]*(\[[^\]]*\])?\s*>", "", text, flags=re.I | re.S)
    text = re.sub(r"<\?(?!xml\s)[^>]*\?>", "", text)  # processing instructions (stylesheets)
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise SvgError("not well-formed: %s" % exc) from exc
    if _local(root.tag) != "svg":
        raise SvgError("root element is <%s>" % _local(root.tag))

    def clean(el):
        for child in list(el):
            name = _local(child.tag)
            if not isinstance(child.tag, str) or name in DROP_ELEMENTS:
                el.remove(child)
                continue
            if name == "a":  # keep the drawing, lose the link
                idx = list(el).index(child)
                el.remove(child)
                clean(child)
                for j, grand in enumerate(list(child)):
                    el.insert(idx + j, grand)
                continue
            clean(child)
        for attr in list(el.attrib):
            name = _local(attr)
            val = el.attrib[attr]
            low = re.sub(r"\s+", "", val).lower()
            if name.startswith("on") or "javascript:" in low or "vbscript:" in low:
                del el.attrib[attr]
            elif name in ("href", "src") or attr.endswith("}href"):
                ok = val.strip().startswith("#") or (_local(el.tag) == "image" and SAFE_DATA_IMAGE.match(val.strip()))
                if not ok:
                    del el.attrib[attr]
            elif name == "style" or "url(" in low:
                el.attrib[attr] = _clean_css(val)
        if _local(el.tag) == "style" and el.text:
            el.text = _clean_css(el.text)
        if _local(el.tag) == "image" and not any(a.endswith("href") for a in el.attrib):
            el.attrib.pop("width", None)  # an <image> without a safe source draws nothing

    clean(root)
    ET.register_namespace("", SVG_NS)
    ET.register_namespace("xlink", XLINK_NS)
    return ET.tostring(root, encoding="utf-8", xml_declaration=False)


# ------------------------------------------------------------------------------------- localisation

def read_localization(raw):
    """`resource/csgo_<language>.txt` (UTF-16 with a BOM, or UTF-8) -> (language, {token: text}).
    Tokens are lowercased; `[english]TOKEN` (the English source kept in translations) is skipped."""
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16")
    else:
        text = raw.decode("utf-8-sig", "replace")
    lang, tokens = None, {}
    for top, body in csgo_items.parse_kv(text):
        if top.lower() != "lang" or not isinstance(body, list):
            continue
        for k, v in body:
            if k.lower() == "language" and isinstance(v, str):
                lang = v.strip().lower()
            elif k.lower() == "tokens" and isinstance(v, list):
                for tok, val in v:
                    if isinstance(val, str) and not tok.startswith("["):
                        tokens.setdefault(tok.lower(), val.replace("\\n", "\n"))
    return lang, tokens


def keep_token(token, extra=()):
    return token.startswith(TOKEN_PREFIXES) or token in extra


def filter_tokens(tokens, extra=()):
    return {t: v for t, v in sorted(tokens.items()) if keep_token(t, extra)}


# ------------------------------------------------------------------------------------------- icons

def equipment_names(items):
    """Icon stems of the default items (`weapon_ak47` -> `ak47`, `item_defuser` -> `defuser`)."""
    out = set(EQUIPMENT_EXTRA)
    for name in items:
        out.add(re.sub(r"^(weapon|item)_", "", name))
    return out


def pick_icons(names, items, all_ui=False):
    """Icon paths to publish: equipment icons of the default items, and the HUD's ui icons."""
    keep_equipment = equipment_names(items)
    out = []
    for n in sorted(names):
        if not n.startswith(ICON_ROOT) or not n.endswith(".svg"):
            continue
        rel = n[len(ICON_ROOT):-4]
        kind, _, stem = rel.partition("/")
        if "/" in stem:
            continue
        if kind == "equipment" and stem in keep_equipment:
            out.append(n)
        elif kind == "ui" and (all_ui or UI_ICON_KEEP.match(stem)):
            out.append(n)
    return out


# ------------------------------------------------------------------------------------------- build

class Output:
    def __init__(self, out, state):
        self.out = out
        self.published = (state or {}).get("models", {})
        self.wanted = {}
        self.written = 0

    def emit(self, folder, ext, data):
        sha = hashlib.sha256(data).hexdigest()
        rel = "%s/%s.%s" % (folder, sha, ext)
        self.wanted[rel] = {"src": sha}
        if self.published.get(rel, {}).get("src") != sha or os.environ.get("FORCE") == "1":
            os.makedirs(os.path.join(self.out, folder), exist_ok=True)
            with open(os.path.join(self.out, rel), "wb") as fh:
                fh.write(data)
            self.written += 1
        return rel


def json_bytes(doc):
    return json.dumps(doc, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")


def build(fs, out, state=None, all_ui=False):
    os.makedirs(out, exist_ok=True)
    output = Output(out, state)
    errors = []
    ig = csgo_items.load_items_game(fs)
    items = ig.defaults() if ig else {}
    if not items:
        errors.append({"id": "weapons", "error": "no items_game.txt / default items"})

    # Weapon data.
    weapons = None
    if items:
        doc = csgo_items.compact(items, csgo_items.weapon_scripts(fs))
        weapons = output.emit("data", "json", json_bytes(doc))

    # Icons.
    icons = {}
    for path in pick_icons(fs.names(ICON_ROOT, ".svg"), items, all_ui):
        key = path[len(ICON_ROOT):-4]
        try:
            raw = fs.read(path)
            if raw is None:
                raise SvgError("not in the install")
            icons[key] = output.emit("icons", "svg", sanitize_svg(raw))
        except (SvgError, OSError) as exc:
            errors.append({"id": key, "error": str(exc)})
            print("icon %s: %s" % (key, exc), file=sys.stderr)

    # Localisation, every language the install ships.
    extra = csgo_items.loc_tokens(items)
    langs = {}
    for path in fs.names("resource/", ".txt"):
        m = re.fullmatch(r"resource/csgo_([a-z_]+)\.txt", path)
        if not m:
            continue
        try:
            raw = fs.read(path)
            lang, tokens = read_localization(raw) if raw else (None, {})
        except (UnicodeDecodeError, OSError, ValueError) as exc:
            errors.append({"id": m.group(1), "error": str(exc)})
            continue
        if not tokens:
            continue  # not a localisation file (or empty)
        lang = lang or m.group(1)
        kept = filter_tokens(tokens, extra)
        langs[lang] = output.emit("lang", "json", json_bytes({"v": VERSION, "lang": lang, "tokens": kept}))
        print("lang %s: %d of %d tokens" % (lang, len(kept), len(tokens)))
    if "english" not in langs:
        errors.append({"id": "english", "error": "resource/csgo_english.txt missing or empty"})

    index = {"v": VERSION, "icons": dict(sorted(icons.items())), "lang": dict(sorted(langs.items())),
             "weapons": weapons}
    data = json_bytes(index)
    with open(os.path.join(out, "index.json"), "wb") as fh:
        fh.write(data)
    output.wanted["index.json"] = {"src": hashlib.sha256(data).hexdigest()}
    with open(os.path.join(out, "wanted.json"), "w") as fh:
        json.dump(output.wanted, fh)
    with open(os.path.join(out, "errors.json"), "w") as fh:
        json.dump(errors, fh, indent=1)
    with open(os.path.join(out, "failed.json"), "w") as fh:
        json.dump(list(output.published) if errors else [], fh)
    print("csgo ui: %d icons, %d languages, weapon data %s (%d items); %d files written, %d errors" % (
        len(icons), len(langs), "yes" if weapons else "no", len(items), output.written, len(errors)))
    if not icons and not langs and not weapons:
        raise SystemExit("csgo ui: nothing was extracted")
    return index, errors


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True, help="the dedicated server install (the folder holding csgo/)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--state", help="the channel's published state (publish.ts state)")
    ap.add_argument("--all-ui-icons", action="store_true", help="every icons/ui/*.svg, not only the HUD's")
    args = ap.parse_args(argv)
    from gamefs import open_game

    state = None
    if args.state and os.path.exists(args.state):
        with open(args.state) as fh:
            state = json.load(fh)
    build(open_game(args.root, "csgo"), args.out, state, args.all_ui_icons)


if __name__ == "__main__":
    main()
