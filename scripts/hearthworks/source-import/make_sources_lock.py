#!/usr/bin/env python3
"""Write `sources.json` (the provenance lock fetch_sources.py consumes) from a conversion's `--used-files` list.

    python3 hearth_import.py --src A --src B --used-files used.json ...
    python3 make_sources_lock.py --used used.json \\
        --root lambdawars=DoArInF/LambdaWarsRework-main@<commit>:lambdawars/:A \\
        --root hl2=JJL772/source-2013-custom@<commit>:game/hl2/:B

`--root key=<owner/repo>@<commit>:<path prefix inside the repo>:<local dir that was passed as --src>`, in the
same order as the `--src` arguments. Records every file's path inside the repo, size and SHA-256.
"""
import argparse
import hashlib
import json
import os
import re
import sys


CREDITS_HEAD = """# Hearthworks character models: credits and provenance

The `*.glb` files here are converted from **Valve Source-engine content (Half-Life 2)**: the meshes, skeletons,
textures and animation sequences are Valve's. Valve proprietary content, redistributed at the owner's
instruction (2026-11-04); remove on request.

The models were converted by `scripts/hearthworks/source-import/` (see its README). The source files were
obtained only as downloaded data from the public GitHub repositories below and were parsed, never executed.
Every file read by the conversion is listed with its repository, commit, path inside the repository and SHA-256
(the same list is `scripts/hearthworks/source-import/sources.json`, which `fetch_sources.py` re-downloads and
verifies).

## Repositories

{repos}

## What each skin is

| Skin | Source model | Geometry / textures | Animation clips (all genuine Source sequences) |
| --- | --- | --- | --- |
{skins}

Nothing here is invented: where a clip is borrowed from another model of the same `ValveBiped` rig family
(bones matched by name) the table says so. Skins without a row (the nine TF2 classes) have **no** Valve model in
this folder: no public copy of the TF2 player models could be found, so the game keeps its procedural stand-ins
for them (`provenance: "stand-in"` is simply the absence of a manifest entry).

## Provenance caveats (what could and could not be verified)

- Geometry (`.mdl` + `.vvd` + `.dx90.vtx`) and the `.ani` animation blocks come from `LambdaWarsRework-main`;
  materials (`.vmt` / `.vtf`) from `source-2013-custom`. The latter's `game/hl2/models` has the retail `.mdl`
  files but no `.vvd` / `.vtx`, so geometry could not be cross-checked against it.
- `police.mdl`, `combine_soldier.mdl`, `police_animations.mdl`, `combine_soldier_anims.mdl` and `breen_anims.mdl`
  are byte-identical in both repositories (retail Half-Life 2 `.mdl` files). The citizens, Barney, Breen,
  the G-Man, the female rig, `male_shared` / `female_shared` and the Combine elite are *recompiled* in
  `LambdaWarsRework-main` (MDL v44-49, different checksums; `male_shared.mdl` and `female_shared.mdl` keep the
  retail file size, the others differ by a few KB). Their geometry, bone names and the sequences used here appear to match
  the retail ones in structure, but they are the mod's builds of Valve's content, not verified byte-for-byte
  against a Steam install. Re-running the importer on your own install (`--steam`) replaces them with retail data.
- No texture normal maps, phong masks, env maps or face flexes are used; only albedo (and the Combine's
  self-illumination mask as an emissive map).

## Files read, per repository

Columns: path inside the repository (case as stored), size, SHA-256 (first 16 hex digits), skins that use it.

{files}
"""

SKIN_NOTES = {
    "citizen": ("models/humans/group01/male_01 (HL2 citizen)", "idle_subtle, walk_all, run_all, jump_holding_jump, jump_holding_glide, shootp1, reload_pistol, Fear_Reaction, cit_door[12-52] (death), Open_door_away (all `male_shared`)"),
    "worker": ("models/humans/group03/male_02", "same male_shared clips as citizen"),
    "rebel": ("models/humans/group03/female_01", "female_shared: idle_subtle, walk_all, run_all, jump_holding_*, shootp1, reloadpistol, Fear_Reaction, Open_door_away; death borrowed: male_shared cit_door[12-52]"),
    "barney": ("models/barney", "barney_animations idle_subtle; male_shared walk/run/jump/shootp1/reload_pistol/Fear_Reaction/cit_door[12-52]/Open_door_away"),
    "metrocop": ("models/police", "police_animations: batonidle1, walk_all, run_all, shootp1, reload_pistol, flinch2, thrust; jump/fall/death borrowed from male_shared"),
    "combine-soldier": ("models/combine_soldier", "combine_soldier_anims: Idle_Unarmed, WalkEasy_all, RunALL, jump_holding_*, shootSMG1s, reload, flinchbig, signal_advance; death borrowed: male_shared cit_door[12-52]"),
    "combine-elite": ("models/combine_super_soldier", "same combine_soldier_anims clips as combine-soldier"),
    "breen": ("models/breen", "breen_anims B_idle01; male_shared walk_all_Moderate/run_all/jump/shootp1/reload_pistol/Fear_Reaction/cit_door[12-52]/Open_door_away"),
    "gman": ("models/gman", "gman.mdl idle_subtle, walk_all_Moderate, tiefidget; male_shared run_all/jump/shootp1/reload_pistol/Fear_Reaction/cit_door[12-52]"),
}


def credits_markdown(lock):
    repos = "\n".join("- `%s` at commit `%s`; files under `%s` (key `%s`)" % (
        r["repo"], r["commit"], r["prefix"], r["key"]) for r in lock["roots"])
    skins = "\n".join("| `%s` | `%s` | Valve geometry + Valve textures (VTF/VMT) | %s |" % (k, v[0], v[1])
                      for k, v in SKIN_NOTES.items())
    blocks = []
    for i, root in enumerate(lock["roots"]):
        rows = ["### `%s` @ `%s`" % (root["repo"], root["commit"][:12]), "", "| Path | Bytes | SHA-256 | Skins |",
                "| --- | ---: | --- | --- |"]
        for f in lock["files"]:
            if f["root"] == i:
                rows.append("| `%s%s` | %d | `%s` | %s |" % (root["prefix"], f["path"], f["bytes"], f["sha256"][:16],
                                                           ", ".join(f["skins"])))
        blocks.append("\n".join(rows))
    return CREDITS_HEAD.format(repos=repos, skins=skins, files="\n\n".join(blocks))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--used", required=True)
    ap.add_argument("--root", action="append", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources.json"))
    ap.add_argument("--credits", help="also write the CREDITS.md file listing (public/models/hearthworks/CREDITS.md)")
    args = ap.parse_args(argv)
    roots, local = [], []
    for spec in args.root:
        m = re.fullmatch(r"([\w-]+)=([^@]+)@([0-9a-f]{40}):([^:]*):(.+)", spec)
        if not m:
            ap.error("bad --root %r" % spec)
        key, repo, commit, prefix, directory = m.groups()
        roots.append({"key": key, "repo": repo, "commit": commit, "prefix": prefix})
        local.append(directory)
    used = json.load(open(args.used, encoding="utf-8"))
    files = {}
    for skin, entries in sorted(used.items()):
        for root, path in entries:
            key = (root, path)
            if key not in files:
                with open(os.path.join(local[root], path), "rb") as fh:
                    data = fh.read()
                files[key] = {"root": root, "path": path, "bytes": len(data),
                              "sha256": hashlib.sha256(data).hexdigest(), "skins": []}
            files[key]["skins"].append(skin)
    lock = {"note": "Valve Source content (Half-Life 2), pinned for reproducible re-conversion. See "
                    "public/models/hearthworks/CREDITS.md.",
            "roots": roots, "files": sorted(files.values(), key=lambda f: (f["root"], f["path"].lower()))}
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(lock, fh, indent=1)
        fh.write("\n")
    print("%d files -> %s" % (len(lock["files"]), args.out))
    if args.credits:
        with open(args.credits, "w", encoding="utf-8") as fh:
            fh.write(credits_markdown(lock))
        print("credits -> %s" % args.credits)
    return 0


if __name__ == "__main__":
    sys.exit(main())
