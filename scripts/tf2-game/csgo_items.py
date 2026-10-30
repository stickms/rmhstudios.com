"""CS:GO's item schema and map configuration, read for the asset pipeline — default loadouts only.

Shared by `csgo-model-list.py` (models), `sound-list.py --game csgo` (weapon sound prefixes),
`game_particles.py --game csgo` (weapon effects) and `csgo_ui.py` (weapon data, localisation
tokens). Pure readers over a file system with `read(path)` / `names(prefix, suffix)` (gamefs.SearchFS);
nothing here knows about storage.

The browser game ships CS:GO skinless: every default weapon and knife, the default gloves and ONE
default player model per team with its arms — never a paint kit, sticker, agent or glove beyond the
defaults. `scripts/items/items_game.txt` (KeyValues, ~6 MB) defines each weapon as an `items` entry
whose `prefab` chain (`weapon_ak47_prefab` -> `rifle` -> `primary` -> `statted_item_base` …) carries its
models, visuals (sounds, effects) and attributes; `resolve` merges that chain the way the game does
(each prefab in order, the item's own keys last, nested blocks merged key by key).
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [p for p in (HERE, os.path.join(HERE, "..", "tf2-assets")) if p not in sys.path]

# A quote-aware KeyValues tokenizer: Valve's text keeps `//` inside quoted values (URLs in the
# localisation), escapes quotes as \" and tags pairs with platform conditionals ([$X360]).
_TOKEN = re.compile(r'"((?:[^"\\]|\\.)*)"|//[^\n]*|(\[[^\]\n]*\])|([{}])|([^\s{}"\[]+)')
_UNESCAPE = re.compile(r"\\([\\\"])")


def _condition(cond):
    """`[$WIN32]`, `[!$X360]`, `[$WIN32||$OSX]` as the Windows desktop game evaluates them."""
    if not cond:
        return True
    expr = cond.strip("[] \t").upper()

    def term(t):
        t = t.strip()
        neg = t.startswith("!")
        val = t.lstrip("!").strip() in ("$WIN32", "$WINDOWS", "$PC")
        return not val if neg else val

    return any(all(term(t) for t in alt.split("&&")) for alt in expr.split("||"))


def parse_kv(text):
    """KeyValues text -> [(key, value)] where value is a string or a nested list (order and repeated
    keys kept). Pairs whose conditional is false on Windows desktop are dropped."""
    toks = []
    for m in _TOKEN.finditer(text):
        if m.group(1) is not None:
            toks.append(("s", _UNESCAPE.sub(r"\1", m.group(1))))
        elif m.group(2):
            toks.append(("c", m.group(2)))
        elif m.group(3):
            toks.append((m.group(3), m.group(3)))
        elif m.group(4):
            toks.append(("s", m.group(4)))
    pos = 0

    def cond_here():
        nonlocal pos
        if pos < len(toks) and toks[pos][0] == "c":
            pos += 1
            return toks[pos - 1][1]
        return None

    def block():
        nonlocal pos
        out = []
        while pos < len(toks):
            kind, key = toks[pos]
            pos += 1
            if kind == "}":
                return out
            if kind != "s":
                continue
            pre = cond_here()
            if pos >= len(toks):
                break
            kind, val = toks[pos]
            pos += 1
            if kind == "{":
                val = block()
            elif kind != "s":
                continue
            post = cond_here()
            if _condition(pre) and _condition(post):
                out.append((key, val))
        return out

    return block()

# The classic competitive arsenal (items_game `name`s). Danger Zone, co-op and the shield are not in it.
DEFAULT_WEAPONS = (
    # pistols
    "weapon_glock", "weapon_hkp2000", "weapon_usp_silencer", "weapon_p250", "weapon_elite",
    "weapon_fiveseven", "weapon_tec9", "weapon_cz75a", "weapon_deagle", "weapon_revolver",
    # SMGs
    "weapon_mac10", "weapon_mp9", "weapon_mp7", "weapon_mp5sd", "weapon_ump45", "weapon_p90",
    "weapon_bizon",
    # rifles
    "weapon_famas", "weapon_galilar", "weapon_ak47", "weapon_m4a1", "weapon_m4a1_silencer",
    "weapon_aug", "weapon_sg556", "weapon_ssg08", "weapon_awp", "weapon_scar20", "weapon_g3sg1",
    # heavy
    "weapon_nova", "weapon_xm1014", "weapon_sawedoff", "weapon_mag7", "weapon_m249", "weapon_negev",
    # gear, knives, grenades, the bomb
    "weapon_taser", "weapon_knife", "weapon_knife_t", "weapon_c4",
    "weapon_hegrenade", "weapon_flashbang", "weapon_smokegrenade", "weapon_molotov",
    "weapon_incgrenade", "weapon_decoy",
)
# Bought equipment without a weapon of its own (prices and names for the buy menu).
DEFAULT_GEAR = ("item_kevlar", "item_assaultsuit", "item_defuser")

# The default gloves (items_game `t_gloves` / `ct_gloves`), and their models when the schema lacks them.
DEFAULT_GLOVES = {"t": "t_gloves", "ct": "ct_gloves"}
FALLBACK_GLOVES = {
    "t": "models/weapons/v_models/arms/glove_fingerless/v_glove_fingerless.mdl",
    "ct": "models/weapons/v_models/arms/glove_hardknuckle/v_glove_hardknuckle.mdl",
}
# The classic factions, when the map names none the install has.
CLASSIC_PLAYERS = {"t": ("tm_phoenix", "tm_leet_varianta"), "ct": ("ctm_sas", "ctm_fbi", "ctm_st6", "ctm_idf")}
PLAYER_DIR = "models/player/custom_player/legacy/"
BARE_HANDS = "models/weapons/v_models/arms/bare/v_bare_hands.mdl"

# Models the game's code spawns by path (not in items_game): the planted bomb, the defuse kit,
# thrown grenades and the ejected shells.
FIXED_MODELS = (
    "models/weapons/w_c4_planted.mdl",
    "models/weapons/w_defuser.mdl",
    "models/weapons/w_defuser_display.mdl",
    "models/weapons/w_eq_fraggrenade_thrown.mdl",
    "models/weapons/w_eq_flashbang_thrown.mdl",
    "models/weapons/w_eq_smokegrenade_thrown.mdl",
    "models/weapons/w_eq_molotov_thrown.mdl",
    "models/weapons/w_eq_incendiarygrenade_thrown.mdl",
    "models/weapons/w_eq_decoy_thrown.mdl",
    "models/shells/shell_9mm.mdl",
    "models/shells/shell_57.mdl",
    "models/shells/shell_12gauge.mdl",
    "models/shells/shell_338mag.mdl",
    "models/shells/shell_556.mdl",
    "models/shells/shell_762nato.mdl",
)
# Variants of an item's world model the game also draws (dropped on the ground, the magazine that
# falls on reload, a thrown grenade); only the ones the install has are kept.
SIBLING_SUFFIXES = ("_dropped", "_mag", "_thrown")

MODEL_PATH = re.compile(r"^models/[a-z0-9_./ -]+\.mdl$")
# Keys of a resolved item that never matter for a skinless default weapon.
DROP_KEYS = re.compile(r"^(paint_data|inventory_image_data|image_inventory\w*|capabilities|tool|"
                       r"tags|static_attrs|item_set|loot_list\w*|armory_\w+)$")


def log(msg):
    print("csgo: %s" % msg, file=sys.stderr)


def _to_dict(pairs):
    """KeyValues pairs -> dict with lowercase keys; a repeated scalar keeps the last value, repeated
    blocks merge."""
    out = {}
    for k, v in pairs:
        key = k.lower()
        if isinstance(v, list):
            v = _to_dict(v)
            if isinstance(out.get(key), dict):
                merge(out[key], v)
                continue
        out[key] = v
    return out


def merge(base, over):
    """Deep merge `over` into `base` (blocks key by key, scalars replaced). -> base"""
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            merge(base[k], v)
        elif isinstance(v, dict):
            base[k] = merge({}, v)
        else:
            base[k] = v
    return base


class ItemsGame:
    """`scripts/items/items_game.txt`: its prefabs and items, resolved on demand."""

    def __init__(self, text):
        root = parse_kv(text)
        top = []
        for k, v in root:
            if k.lower() == "items_game" and isinstance(v, list):
                top += v
        if not top:
            raise ValueError("items_game.txt has no items_game block")
        self.prefabs = {}
        self.items = []  # (defindex, name, dict) in file order
        for k, v in top:
            if not isinstance(v, list):
                continue
            if k.lower() == "prefabs":
                for name, body in v:
                    if isinstance(body, list):
                        self.prefabs[name.lower()] = _to_dict(body)
            elif k.lower() == "items":
                for key, body in v:
                    if isinstance(body, list) and key.isdigit():
                        d = _to_dict(body)
                        self.items.append((int(key), str(d.get("name", "")).lower(), d))

    def resolve(self, item, _depth=0, _seen=()):
        """An item (or prefab) with its prefab chain merged in. Adds `prefabs`: the chain, base first."""
        out, chain = {}, []
        for p in str(item.get("prefab", "")).split():
            p = p.lower()
            if p in _seen or _depth > 16:
                continue
            body = self.prefabs.get(p)
            if body is None:
                log("unknown prefab %s" % p)
                continue
            sub = self.resolve(body, _depth + 1, _seen + (p,))
            chain += [c for c in sub.pop("prefabs", []) if c not in chain] + [p]
            merge(out, sub)
        merge(out, {k: v for k, v in item.items() if k != "prefab"})
        out["prefabs"] = chain
        return out

    def find(self, name):
        """-> (defindex, resolved) of the item named `name` (the `baseitem` one when several), or None."""
        hits = [(d, it) for d, n, it in self.items if n == name.lower()]
        if not hits:
            return None
        hits.sort(key=lambda h: (str(h[1].get("baseitem", "0")) != "1", h[0]))
        defindex, item = hits[0]
        return defindex, self.resolve(item)

    def defaults(self, names=DEFAULT_WEAPONS + DEFAULT_GEAR):
        """{name: (defindex, resolved)} of the default items the schema has (missing ones are logged)."""
        out = {}
        for n in names:
            hit = self.find(n)
            if hit is None:
                log("items_game has no %s" % n)
                continue
            out[n] = hit
        return out


def load_items_game(fs):
    raw = fs.read("scripts/items/items_game.txt")
    if raw is None:
        log("scripts/items/items_game.txt is not in the install")
        return None
    return ItemsGame(raw.decode("utf-8", "replace"))


# ------------------------------------------------------------------------------------------- reading

def models_in(value):
    """Every `models/….mdl` string anywhere in a resolved item (model_player, model_world,
    model_dropped, `magazine model` attributes …), normalised."""
    found = []

    def walk(v):
        if isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, str):
            p = v.strip().replace("\\", "/").lower()
            if MODEL_PATH.match(p) and p not in found:
                found.append(p)

    walk(value)
    return found


def sound_prefixes(items):
    """Script-entry prefixes of the items' sounds (`visuals.sound_single_shot` "Weapon_AK47.Single" ->
    "Weapon_AK47"): every entry under one is the weapon's (draw, clip in/out, bolt, deploy …)."""
    out = []
    for _d, r in items.values():
        for key, val in (r.get("visuals") or {}).items():
            if key.startswith("sound_") and isinstance(val, str) and "." in val:
                p = val.rsplit(".", 1)[0].strip()
                if p and p not in out:
                    out.append(p)
    return out


def effect_names(items):
    """Particle systems the items' visuals name (muzzle flash 1st/3rd person, heat, brass, tracer)."""
    out = []
    for _d, r in items.values():
        for key, val in (r.get("visuals") or {}).items():
            if "effect" in key and isinstance(val, str) and val.strip() and "/" not in val:
                if val.strip() not in out:
                    out.append(val.strip())
    return out


def loc_tokens(items):
    """Localisation tokens the items name (`#SFUI_WPNHUD_AK47` -> `sfui_wpnhud_ak47`)."""
    out = set()
    for _d, r in items.values():
        for key in ("item_name", "item_description", "item_type_name"):
            v = r.get(key)
            if isinstance(v, str) and v.startswith("#"):
                out.add(v[1:].lower())
    return out


def compact(items, scripts=None):
    """The weapon data the simulation reads: `{v, items: {name: {defindex, prefabs, …resolved keys}},
    scripts: {weapon_x: KeyValues as a dict}}` (scripts only when the install still ships them)."""
    doc = {"v": 1, "items": {}, "scripts": scripts or {}}
    for name, (defindex, r) in sorted(items.items()):
        doc["items"][name] = {"defindex": defindex,
                              **{k: v for k, v in sorted(r.items()) if not DROP_KEYS.match(k)}}
    return doc


def weapon_scripts(fs, names=DEFAULT_WEAPONS):
    """Old-style `scripts/weapon_<name>.txt` (gone from current CS:GO; read when present)."""
    out = {}
    for n in names:
        raw = fs.read("scripts/%s.txt" % n)
        if raw is None:
            continue
        text = raw.decode("utf-16") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("utf-8", "replace")
        pairs = parse_kv(text)
        body = next((v for _k, v in pairs if isinstance(v, list)), None)
        if body is not None:
            out[n] = _to_dict(body)
    return out


# ------------------------------------------------------------------------------------------- players

def map_config(fs, map_name):
    """`maps/<map>.kv` -> {t_models: [names], ct_models: [names], t_arms, ct_arms} (empty when absent)."""
    raw = fs.read("maps/%s.kv" % map_name)
    out = {"t_models": [], "ct_models": [], "t_arms": None, "ct_arms": None}
    if raw is None:
        return out
    pairs = parse_kv(raw.decode("utf-8", "replace"))
    body = next((v for _k, v in pairs if isinstance(v, list)), [])
    for k, v in body:
        key = k.lower()
        if key in ("t_models", "ct_models") and isinstance(v, list):
            out[key] += [m.lower() for m, _ in v]
        elif key in ("t_arms", "ct_arms") and isinstance(v, str):
            out[key] = v.replace("\\", "/").lower()
    return out


def faction(model_name):
    """`tm_leet_varianta` -> `leet`, `ctm_sas` -> `sas`."""
    m = re.match(r"^c?tm_([a-z0-9]+)", model_name.lower())
    return m.group(1) if m else ""


def choose_players(names, config, overrides=None):
    """ONE player model per team: the map's first listed model the install has, else the classic
    faction. -> {team: {"name", "model", "source"}}."""
    overrides = overrides or {}
    out = {}
    for team in ("t", "ct"):
        cands = []
        if overrides.get(team):
            cands.append((overrides[team], "override"))
        cands += [(n, "map") for n in config.get("%s_models" % team, [])]
        cands += [(n, "classic") for n in CLASSIC_PLAYERS[team]]
        for name, source in cands:
            path = PLAYER_DIR + name.lower() + ".mdl"
            if path in names:
                out[team] = {"name": name.lower(), "model": path, "source": source}
                break
        else:
            log("no %s player model in the install (tried %s)" % (team, ", ".join(n for n, _ in cands)))
    return out


def arms_for(names, team, player, config, items_game=None):
    """The first-person arms of a team: the map's `<team>_arms`, the default gloves (items_game
    `t_gloves`/`ct_gloves`), the player's faction sleeves and the bare hands — those the install has."""
    want = []
    if config.get("%s_arms" % team):
        want.append(config["%s_arms" % team])
    gloves = items_game.find(DEFAULT_GLOVES[team]) if items_game else None
    if gloves:
        want += models_in(gloves[1])
    want.append(FALLBACK_GLOVES[team])
    fac = faction(player["name"]) if player else ""
    if fac:
        prefix = "models/weapons/v_models/arms/%s/" % fac
        want += sorted(n for n in names if n.startswith(prefix) and n.endswith(".mdl"))
    want.append(BARE_HANDS)
    out = []
    for p in want:
        if p in names and p not in out:
            out.append(p)
    return out


def model_list(names, items_game, config, overrides=None):
    """The CS:GO model channel's list (map props are appended by build-maps.ts --props-only).
    -> (paths, report) — only paths the install has."""
    players = choose_players(names, config, overrides)
    want, report = [], {"players": players, "missing": []}
    for team in ("t", "ct"):
        if team in players:
            want.append(players[team]["model"])
        want += arms_for(names, team, players.get(team), config, items_game)
    items = items_game.defaults(DEFAULT_WEAPONS) if items_game else {}
    for _name, (_d, r) in sorted(items.items()):
        for m in models_in(r):
            want.append(m)
            stem = m[:-4]
            for suffix in SIBLING_SUFFIXES:
                if not stem.endswith(suffix):
                    want.append(stem + suffix + ".mdl")
    want += FIXED_MODELS
    out = []
    for p in want:
        if p in names:
            if p not in out:
                out.append(p)
        elif not p.endswith(tuple(s + ".mdl" for s in SIBLING_SUFFIXES)) or p in FIXED_MODELS:
            if p not in report["missing"]:
                report["missing"].append(p)
    return out, report
