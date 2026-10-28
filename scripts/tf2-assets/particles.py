"""Extract unusual PCF graphs, VMTs and lossless animated VTFs for the loadout viewer.

    particles.py --root <TF2 install> --out <dir> [--state state.json] [--only 13,14]

Uses srctools' DMX/VTF readers (including the VTF resource directory and embedded
SHT sequences). No English-name heuristics, texture resizing or lossy encoding.
Each effect is a complete graph; textures and effect bundles are content addressed.
manifest.json is the only mutable entry point and is published last via --index.
"""
import argparse
import hashlib
import io
import json
import os
import re
import sys

from srctools import Keyvalues
from srctools.dmx import Element, ValueType
from srctools.vtf import VTF

import kv
from vpkfs import GameFS

VERSION = 1
GROUPS = ("renderers", "initializers", "operators", "emitters", "forces", "constraints")


def clean(path):
    path = path.replace("\\", "/").lower().strip()
    if path.startswith("materials/"):
        path = path[10:]
    if ".." in path or not re.fullmatch(r"[a-z0-9_/ .-]+", path):
        raise ValueError("unsafe material path: " + path)
    return path


def attribute(a):
    """Keep DMX numbers, vectors and colours typed; references become system names."""
    kind = a.type
    suffix = {ValueType.ELEMENT: "elem", ValueType.INTEGER: "int", ValueType.FLOAT: "float",
              ValueType.BOOL: "bool", ValueType.STRING: "str", ValueType.COLOR: "color",
              ValueType.VEC2: "vec2", ValueType.VEC3: "vec3", ValueType.VEC4: "vec4",
              ValueType.ANGLE: "angle", ValueType.QUATERNION: "quaternion", ValueType.TIME: "time"}.get(kind)
    if suffix is None:
        raise ValueError("unexpected particle attribute type: " + str(kind))

    def value(v):
        if kind == ValueType.ELEMENT:
            return v.name
        if kind in (ValueType.VEC2, ValueType.VEC3, ValueType.VEC4, ValueType.ANGLE,
                    ValueType.QUATERNION, ValueType.COLOR):
            return list(v)
        return v

    if a.is_array:
        return [value(v) for v in getattr(a, "iter_" + suffix)()]
    return value(getattr(a, "val_" + suffix))


def options(el, exclude=()):
    return {a.name.lower(): attribute(a) for a in el.values()
            if a.name.lower() not in ("name", *exclude)}


def system(el):
    out = {"name": el.name, "options": options(el, (*GROUPS, "children"))}
    for group in GROUPS:
        out[group] = [{"function": op["functionName"].val_str.lower(),
                       "params": options(op, ("functionname",))}
                      for op in el[group].iter_elem()] if group in el else []
    out["children"] = [{"system": child["child"].val_elem.name if "child" in child else child.name,
                        "delay": child["delay"].val_float if "delay" in child else 0}
                       for child in el["children"].iter_elem()] if "children" in el else []
    return out


def material(fs, name, seen=None):
    """Resolve patch includes while retaining nested proxies and shader parameters."""
    seen = set() if seen is None else seen
    path = clean(name)
    path += "" if path.endswith(".vmt") else ".vmt"
    if path in seen:
        raise ValueError("material include cycle: " + path)
    seen.add(path)
    raw = fs.read("materials/" + path)
    if raw is None:
        raise FileNotFoundError("materials/" + path)
    root = next(iter(Keyvalues.parse(raw.decode("utf8", "replace"), allow_escapes=False)))

    def tree(node):
        return [{"key": c.name, "value": tree(c) if c.has_children() else c.value} for c in node]

    params = {c.name: c.value for c in root if not c.has_children()}
    proxies = tree(root.find_block("proxies", or_blank=True))
    if root.name == "patch":
        base = material(fs, params["include"], seen)
        for mode in ("insert", "replace"):
            for c in root.find_block(mode, or_blank=True):
                if not c.has_children() and (mode == "replace" or c.name not in base["params"]):
                    base["params"][c.name] = c.value
        if proxies:
            base["proxies"] = proxies
        return base
    # Desktop sRGB path. Low-fill / console branches are deliberately not enabled.
    for key, val in list(params.items()):
        if key.startswith(("srgb?", "!lowfill?")):
            params[key.split("?", 1)[1]] = val
    return {"shader": root.name, "params": params, "proxies": proxies, "textures": {}}


def texture(raw, emit):
    """All full-resolution image frames, plus all four UV channels of each SHT frame."""
    file = io.BytesIO(raw)  # srctools decodes image data lazily; keep this open.
    vtf = VTF.read(file)
    frames = []
    for i in range(vtf.frame_count):
        def encode(frame=i):
            data = io.BytesIO()
            vtf.get(frame=frame).to_PIL().save(data, "WEBP", lossless=True, exact=True, method=4)
            return data.getvalue()
        frames.append(emit(raw, i, encode))
    sheets = {}
    for idx, seq in vtf.sheet_info.items():
        sheets[str(idx)] = {"clamp": seq.clamp, "duration": seq.duration,
                            "frames": [{"duration": f[0], "uv": [
                                [t.left, t.top, t.right, t.bottom] for t in f[1:]]}
                                       for f in seq.frames]}
    return {"width": vtf.width, "height": vtf.height, "flags": vtf.flags.value,
            "frames": frames, "sequences": sheets}


def build(fs, out, state=None, only=None):
    published = (state or {}).get("models", {})
    wanted = {}
    os.makedirs(out, exist_ok=True)

    def write(path, data):
        src = hashlib.sha256(b"particles-v%d|" % VERSION + data).hexdigest()
        wanted[path] = {"src": src}
        if published.get(path, {}).get("src") != src or os.environ.get("FORCE") == "1":
            full = os.path.join(out, path)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "wb") as fh:
                fh.write(data)
        return path

    def emit(directory, ext, data):
        return write("%s/%s.%s" % (directory, hashlib.sha256(data).hexdigest(), ext), data)

    def emit_frame(raw, frame, encode):
        # Address by exact source, frame and converter version, so unchanged images
        # are neither decoded nor encoded again. SHT metadata is read header-only.
        src = hashlib.sha256(b"particles-v%d|frame%d|" % (VERSION, frame) + hashlib.sha256(raw).digest()).hexdigest()
        path = "tex/%s.webp" % src
        wanted[path] = {"src": src}
        if published.get(path, {}).get("src") != src or os.environ.get("FORCE") == "1":
            full = os.path.join(out, path)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "wb") as fh:
                fh.write(encode())
        return path

    def json_bytes(data):
        return json.dumps(data, separators=(",", ":"), sort_keys=True, allow_nan=False).encode()

    raw = fs.read("scripts/items/items_game.txt")
    if raw is None:
        raise FileNotFoundError("scripts/items/items_game.txt")
    ig = kv.get(kv.parse(raw.decode("utf8", "replace")), "items_game")
    groups = kv.get(ig, "attribute_controlled_attached_particles") or []
    effects = {int(idx): dict(body) for group, entries in groups
               if group in ("cosmetic_unusual_effects", "taunt_unusual_effects", "weapon_unusual_effects")
               for idx, body in entries if isinstance(body, list) and (not only or int(idx) in only)}
    systems = {}
    suffixes = set()
    def collect_suffixes(pairs):
        for key, value in pairs:
            if key == "particle_suffix" and isinstance(value, str):
                suffixes.add(value)
            elif isinstance(value, list):
                collect_suffixes(value)
    collect_suffixes(ig)
    # Parse the game's manifest in order so later definitions override earlier ones.
    manifest_raw = fs.read("particles/particles_manifest.txt")
    paths = []
    if manifest_raw:
        entries = kv.get(kv.parse(manifest_raw.decode("utf8", "replace")), "particles_manifest") or []
        paths = [p.lstrip("!").replace("\\", "/").lower() for k, p in entries if k == "file"]
    paths += [p for p in fs.all_names("particles/", ".pcf") if p not in paths]
    for path in paths:
        raw = fs.read(path)
        if raw is None:
            continue
        root, fmt, _ver = Element.parse(io.BytesIO(raw))
        if fmt != "pcf":
            raise ValueError("not a particle file: " + path)
        for el in root["particleSystemDefinitions"].iter_elem():
            systems[el.name] = system(el)

    materials, textures, errors = {}, {}, []

    def visit(name, graph):
        if name in graph:
            return
        if name not in systems:
            raise ValueError("missing particle system: " + name)
        graph[name] = systems[name]
        mat = graph[name]["options"].get("material", "")
        if mat:
            key = clean(mat)
            graph[name] = {**graph[name], "material": key}
            if key not in materials:
                data = material(fs, mat)
                for param, path in data["params"].items():
                    if param not in ("$basetexture", "$basetexture2", "$texture2", "$normalmap",
                                     "$bumpmap", "$ram texture", "$ramptexture", "$detail") or not path:
                        continue
                    tex = clean(path.removesuffix(".vtf"))
                    if tex.startswith("_"):
                        continue  # engine framebuffer textures, supplied by the renderer
                    if tex not in textures:
                        vtf_raw = fs.read("materials/" + tex + ".vtf")
                        if vtf_raw is None:
                            raise FileNotFoundError("materials/" + tex + ".vtf")
                        textures[tex] = texture(vtf_raw, emit_frame)
                    data["textures"][param] = textures[tex]
                materials[key] = data
        for child in graph[name]["children"]:
            visit(child["system"], graph)

    index = {}
    for idx, schema in sorted(effects.items()):
        variants = [(str(idx), schema["system"])]
        if schema.get("use_suffix_name") == "1":
            variants = [("%d:%s" % (idx, suffix), schema["system"] + "_" + suffix)
                        for suffix in sorted(suffixes) if schema["system"] + "_" + suffix in systems]
            if not variants:
                errors.append({"id": str(idx), "error": "no matching weapon particle variants"})
        for key, name in variants:
            try:
                graph = {}
                visit(name, graph)
                mats = {s["material"]: materials[s["material"]] for s in graph.values() if "material" in s}
                bundle = {"v": VERSION, "id": idx, "system": name, "schema": schema,
                          "systems": graph, "materials": mats}
                index[key] = emit("effects", "json", json_bytes(bundle))
            except (ValueError, FileNotFoundError, NotImplementedError) as exc:
                # Never advertise a graph with missing dependencies as a working effect.
                # --preserve-index keeps its previously published version on refresh.
                errors.append({"id": key, "error": str(exc)})
                print("effect %s: %s" % (key, exc), file=sys.stderr)
    if not index:
        raise ValueError("no complete unusual effects were extracted")
    write("manifest.json", json_bytes({"v": VERSION, "effects": index}))
    with open(os.path.join(out, "wanted.json"), "w") as fh:
        json.dump(wanted, fh)
    with open(os.path.join(out, "errors.json"), "w") as fh:
        json.dump(errors, fh, indent=2)
    # Avoid deleting dependencies of any formerly published effect that failed this run.
    with open(os.path.join(out, "failed.json"), "w") as fh:
        json.dump(list(published) if errors else [], fh)
    print("particles: %d complete effects, %d systems, %d materials, %d textures; %d invalid graphs" % (
        len(index), len(systems), len(materials), len(textures), len(errors)))
    return index


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--state")
    ap.add_argument("--only", help="comma-separated effect IDs for local verification")
    args = ap.parse_args()
    state = json.load(open(args.state)) if args.state and os.path.exists(args.state) else None
    build(GameFS(args.root), args.out, state, set(map(int, args.only.split(","))) if args.only else None)


if __name__ == "__main__":
    main()
