# Hearthworks Source importer

Turns Source-engine character models (Half-Life 2, Team Fortress 2) into the skinned, animated GLBs that
Hearthworks loads (`public/models/hearthworks/<skin>.glb` + `manifest.json`). It is a standalone Python tool; it is
not part of the site build and nothing imports it.

```
Source:  MDL v44-49 + VVD + VTX(dx90) + VMT/VTF + $includemodel animation files (+ .ani blocks)
   ->    GLB: one skinned mesh, <= 64 joints, baked textures (<= 512 px JPEG/PNG), 30 fps TRS clips
```

Owner decision (2026-11-04): skins are different character models built from the Valve assets, with the Source
engine's own animations. Licensing: see the end of this file and `public/models/hearthworks/CREDITS.md`.

## Result checked in

9 of the 18 skins have real Valve models (all HL2): `citizen worker rebel barney metrocop combine-soldier
combine-elite breen gman`, 0.4-0.74 MB each, 5.2 MB in total, 3.9k-7.5k triangles. The nine TF2 classes are **not**
included: no public copy of the TF2 player models could be found (see "TF2" below). Per-skin provenance, which
Source sequence feeds which clip and every source file with its repository, commit and SHA-256 are in
`public/models/hearthworks/CREDITS.md`.

## Reproduce it

Needs `python3`, `numpy`, `Pillow` (all already used by `scripts/tf2-assets`).

**A. From the same public files the checked-in output was made from** (pinned commits, SHA-256 verified):

```bash
python3 -I scripts/hearthworks/source-import/fetch_sources.py --out /tmp/hearth-src        # 131 files, ~26 MB
python3 -I scripts/hearthworks/source-import/hearth_import.py \
    --src /tmp/hearth-src/lambdawars --src /tmp/hearth-src/hl2 --out public/models/hearthworks
```

The output is byte-for-byte reproducible (the checked-in GLBs were rebuilt this way and compared).

**B. From your own Steam install** (the owner's route; replaces the third-party builds with retail data):

```bash
pip install vpk
python3 scripts/hearthworks/source-import/hearth_import.py \
    --steam "C:/Program Files (x86)/Steam/steamapps/common/Half-Life 2" \
    --out public/models/hearthworks --skins citizen,worker,rebel,barney,metrocop,combine-soldier,combine-elite,breen,gman
python3 scripts/hearthworks/source-import/hearth_import.py \
    --steam "C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2" \
    --out public/models/hearthworks --skins scout,soldier,pyro,demoman,heavy,engineer,medic,sniper,spy
```

`--steam` reads the install's VPK archives and loose files through `scripts/tf2-assets/vpkfs.py`, the reader the
repo's own TF2 pipeline already uses. **This route was not exercised here** (no install was available); the
loose-file route was. `--out` accumulates: each run updates `manifest.json` for the skins it converted and keeps
the others. Options: `--skins a,b`, `--config skins.json`, `--report r.json` (triangles, bones, clips, failures,
untextured materials), `--used-files used.json`.

## What it does, per skin (`hearth_import.py`)

1. **Read** the MDL (`SourceModel`), its `$includemodel` files as the engine's virtual model (`mdlinfo.py`), and
   the `.ani` animation blocks those files point at. Geometry is LOD 0 of every body group's first submodel.
2. **Clips.** `skins.json` names, per gameplay role (`idle walk run jump fall shoot reload hurt death interact`),
   the Source sequence to bake (by name, by activity regex, with optional `trim`/`fps`/`pose`). Movement
   sequences are 9-way blends; the cell for `move_yaw = 0` (TF2: `move_x = 1`) is the forward one. The bone
   animation is decoded (`srcanim.decode_animdesc_ex`: raw and RLE quaternions/positions, sections, `.ani`
   blocks), matched to the skin's bones **by name** (this is what lets the HL2 humans share `male_shared`), resampled
   to 30 fps (loops get a closing key equal to the first) and keyframe-reduced (0.03 degrees / 0.4 mm). Only
   absolute sequences are used; delta/layer sequences (the engine blends those on top of others) are rejected.
3. **Rest pose.** The compiled bind pose is a T-pose facing the wrong way for glTF, so the mesh is re-skinned
   into frame 0 of the idle clip: the GLB's rest pose is the standing pose, facing +Z, feet on y = 0.
4. **Axes and units.** Source +X forward, +Y left, +Z up, 1 unit = 1/16 ft (0.01905 m) -> glTF +Z forward,
   +X the character's left, +Y up, metres: `gl = (y, z, x) * 0.01905`, a cyclic permutation (det +1), so winding and
   handedness are preserved; bone transforms are conjugated by it (`mathutil.py`, tested).
5. **Bones.** Only bones with weight and their ancestors are kept; over 64, the lightest leaves merge into their
   parents. Node names have no `.` (three's loader strips it), so `ValveBiped.Bip01_R_Hand` is the node
   `ValveBiped_Bip01_R_Hand`, and that string is the manifest's `handBone`.
6. **Materials** (`materials.py`): `$basetexture` -> JPEG (PNG only when `$alphatest`/`$translucent`), capped at
   512 px; the `Eyes` shader becomes an eye-white with the iris painted on and UVs projected like the shader does;
   `$selfillum` + `$selfillummask` (the Combine's visor) -> glTF emissive. Normal/phong/env maps are dropped.
7. **GLB** (`gltf_out.py`): plain glTF 2.0 (no extensions, no Draco, no meshopt: every file is well under
   the 1.5 MB budget without them). Each animation carries `extras`: `source` (the Source sequence),
   `loop`, `srcFps`, `duration` and, where the sequence has movement keys, `groundSpeed` in m/s (for example
   citizen walk 1.52, run 4.0) so the runtime can match foot speed.

The manifest follows the runtime contract: `{ version: 1, models: { <skin>: { file, height, yaw, handBone, bytes,
provenance: "valve-source", clips: { role: clip name } } } }`. Clip names equal the roles (`idle`, `walk`, ...).
`height` is the standing bounding-box height of the mesh in metres (~1.32-1.40: Source humans are 72 units tall).
`yaw` is 0: the models face +Z.

Notes for the loader: set `frustumCulled = false` on the SkinnedMesh (three computes its bounds once, at the rest
pose); the root bone moves up to a few centimetres within a clip (gait sway), never drifts.

## Clips that are not authored for every skin

HL2's NPC models have no authored death animation (the engine ragdolls them), and metrocops have no jump. Where a
skin lacks a role, the config borrows the sequence from another model of the same `ValveBiped` rig family
(`extraModels`; bones are matched by name): `death` is `cit_door` frames 12-52 of the male citizen set (a knock-down
that ends lying) for every skin that has one, and the metrocop's `jump`/`fall` come from `male_shared`. These are real
Source animations on a related skeleton, not synthesized; CREDITS.md says which is which. `hurt` is `Fear_Reaction`
(a flinch into a cower) for the citizen-family skins, `flinch2` for the metrocop, `flinchbig` for the Combine.
Procedural helper bones (`Ulna`, `Wrist`, `Bicep`, ...) are skinned like any bone but their engine-side
procedural drivers are not evaluated, so forearm twist is slightly stiffer than in-game.

## TF2

The nine TF2 entries in `skins.json` are **untested**. No public repository hosting the TF2 player models
(`models/player/scout.mdl` ... `spy.mdl` with `*_animations.mdl`) could be found, so nothing was converted and
the manifest has no entry for them (the runtime keeps the procedural stand-ins). The config names TF2's activities
(`ACT_MP_STAND_MELEE`, `ACT_MP_RUN_MELEE`, ...) and expects `bip_hand_R`; a clip that does not resolve is reported and
skipped, and `idle` + `walk` are required. Run route B above against a TF2 install, read the report, and adjust the
activity names in `skins.json` if needed. Paint-tint masks and team-colour variants are not handled (RED skin family
0, albedo only).

## Verify (headless Chromium, swiftshader WebGL)

```bash
node scripts/hearthworks/source-import/verify/render.mjs --glb public/models/hearthworks --out /tmp/hw-verify \
     [--skins gman,citizen] [--frames 8] [--chrome <path to chromium if Playwright's is not installed>]
```

Loads each GLB with three's `GLTFLoader` the way the runtime will and writes `contact-sheet.png`, per skin
`<skin>.png` (rest pose from four sides, idle/walk/run filmstrips), `<skin>.clips.png` (every other clip),
`<skin>.big.png` and `<skin>.json` (per-clip duration, root travel, bounding box). What to look for: upright
and facing the camera in the "front" cells, legs cycling in walk/run, the root not leaving its place.

Unit tests (synthetic data only; no Valve files are committed as fixtures):

```bash
python3 -m unittest discover -s scripts/hearthworks/source-import -p "test_*.py"
```

## Files

| File | Role |
| --- | --- |
| `hearth_import.py` | the converter and CLI |
| `skins.json` | skin -> MDL, hand bone, clip role -> Source sequence |
| `_deps.py` | imports the repo's tested Source readers (`scripts/tf2-assets`, `scripts/tf2-game`) |
| `vtx.py` | VTX reader that detects the MDL v49 header sizes (the shared reader silently drops strip groups there) |
| `materials.py`, `mathutil.py`, `gltf_out.py`, `srcfs.py` | materials, maths, GLB writer, file systems |
| `fetch_sources.py`, `make_sources_lock.py`, `sources.json` | pinned download list (repo, commit, path, SHA-256) |
| `verify/` | the Playwright/three verifier |
| `test_import.py` | unit tests |

## Licensing

The models, textures and animations are **Valve proprietary content** (Half-Life 2 and, if you convert them, Team
Fortress 2), copyright Valve Corporation, redistributed here at the project owner's instruction (2026-11-04) and
removable on request. This repository's licence does not extend to them. The converter code in this directory is
the project's own. The source files were taken from public third-party GitHub repositories
(`DoArInF/LambdaWarsRework-main`, `JJL772/source-2013-custom`); neither declares a licence that grants Valve's
rights, and both are mirrors of Valve content, so treat the output as Valve's. If the owner prefers retail data
only, run route B on a Steam install and drop `sources.json` / `fetch_sources.py`.
