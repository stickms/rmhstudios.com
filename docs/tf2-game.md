# RMH TF2 — the browser game

A playable Team Fortress 2 in the browser, part of the [TF2 Hub](tf2-hub.md):
`/tf2/play`. It is a clean-room TypeScript engine — **not** the Source engine
and not built from any leaked engine code. The official
[Source SDK 2013](https://github.com/ValveSoftware/source-sdk-2013) (which
includes TF2's game code since 2025) is the reference for every constant,
formula and rule, so the game reflects TF2 as closely as an independent engine
can. Code that follows an SDK routine names it (`// SDK: CGameMovement::Friction`).
`lib/tf2-game/LICENSE-SOURCE-SDK.txt` carries Valve's SDK licence and notices,
as that licence requires for derived work; the game is free to play and stays
that way.

Game content (maps, models, textures, sounds) is never committed. The
`tf2-assets-sync` workflow converts it from a Steam install into object
storage, like the loadout builder's models (see [TF2 Hub](tf2-hub.md)).

## Layout

| Path                              | What                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/tf2-game/core/`              | Vectors and angles (`vec.ts`), SDK constants (`constants.ts`), the shared contracts (`types.ts`: `UserCmd`, `TraceResult`, `CollisionWorld`).                             |
| `lib/tf2-game/formats/`           | Readers for Valve formats: VPK, KeyValues, BSP v19–21, VTF, VMT, PHY. Pure TS over `Uint8Array`; used by the asset pipeline (Node) and the game (browser + server).        |
| `lib/tf2-game/world/`             | The map as a collision world: BSP brush tracing (CM_BoxTrace), displacement and static-prop collision, brush entities that move.                                         |
| `lib/tf2-game/data/`              | Class and weapon tables (stock arsenal), extracted from the game scripts and checked against the SDK.                                                                   |
| `lib/tf2-game/sim/`               | The authoritative simulation: game movement, players, weapons, projectiles, damage, conditions, buildings, map entities and I/O, game rules and modes. Deterministic.     |
| `lib/tf2-game/bots/`              | Bots: navigation graph, pathing, per-class behaviour.                                                                                                                      |
| `lib/tf2-game/net/`               | Protocol: snapshots, deltas, input packing; client prediction and interpolation.                                                                                          |
| `lib/tf2-game/render/`            | three.js renderer: world, props, players, view models, projectiles, buildings, particles, decals. Browser only.                                                          |
| `lib/tf2-game/audio/`             | Sound playback over `getAudioContext()`.                                                                                                                                   |
| `lib/tf2-game/client/`            | The browser game loop: input, local "listen server" worker for offline play, connection to the hub for online play.                                                      |
| `components/tf2-game/`            | React UI: the play page, HUD, menus (team, class, scoreboard, settings).                                                                                                   |
| `lib/tf2-game/server/`            | Match hosting: the `MatchHost` contract the simulation implements (`match-host.ts`), its one entry point `createTf2Match` (`create-match.ts`), the fixed-step loop (`match-runner.ts`), the worker entry (`match-worker.server.ts`) and the hub's thread pool (`pool.server.ts`). |
| `server/socket-server/handlers/tf2-game.ts` | Room manager on the hub (`tf2:*` events, `lib/tf2-game/net/events.ts`). Each match runs on a `worker_threads` worker (`lib/tf2-game/server/match-worker.server.ts`) so the hub's event loop never simulates.            |
| `scripts/tf2-game/`               | Asset pipeline: map packages, materials, props, sounds, view models, particles.                                                                                           |

## Conventions

- **Units and axes.** Source units (inches), Z up, angles `[pitch, yaw, roll]`
  in degrees — exactly the SDK's conventions, so a ported formula reads the
  same. Only the renderer converts to three.js (Y up, metres) with
  `sourceToGl` from the loadout particles.
- **Tick.** The simulation steps at 66.67 Hz (`TICK_INTERVAL = 0.015`). Nothing
  in `sim/` reads wall-clock time; it reads `world.curtime`.
- **Determinism.** `sim/` uses only its seeded random streams (`core/random.ts`),
  so the server and a predicting client agree on spread and crit rolls.
- **No allocation in hot loops.** Traces, movement and weapon frames reuse
  scratch vectors.
- **Environment-agnostic.** `core/`, `formats/`, `world/`, `data/`, `sim/`,
  `bots/` and `net/` import nothing from the DOM, React or Node — they run in a
  browser worker, the hub worker and Vitest alike.

## Multiplayer hosting

A match runs on a worker thread in the games hub's process, never on the hub's
event loop. The pieces, outermost first:

- **Room manager** (`server/socket-server/handlers/tf2-game.ts`): rooms, codes,
  the map allowlist (`data/maps.ts`), payload validation, chat delivery, and the
  relay — unreliable packets go out as volatile `tf2:snapshot`, reliable ones as
  `tf2:events`. A room whose last player drops is held 30 s for a rejoin.
- **Pool** (`server/pool.server.ts`): up to `TF2_MAX_WORKERS` threads (default
  1), `TF2_MAX_MATCHES` matches (default 4), 24 humans per match, a heap cap per
  thread (`TF2_WORKER_HEAP_MB`, default 256). A thread that crashes or stops
  heartbeating for 10 s is terminated, its rooms are closed with
  `server-error`, and a replacement is spawned after a backoff. A bundled hub
  without the worker bundle refuses matches; running from source (tsx, Vitest)
  it runs them in-process instead.
- **Runner** (`server/match-runner.ts`): hosts several matches on one thread at
  a drift-corrected 66.67 Hz (at most 5 catch-up ticks per wakeup; the rest of a
  backlog is dropped and logged), one `postMessage` per tick with the buffers
  transferred.
- **Host** (`server/match-host.ts`): what the simulation implements.
  `create-match.ts` is the only place a game is chosen; today it returns
  `EchoMatchHost`, a transport test double.

The worker is its own esbuild entry in both `package.json` `build` and the
Dockerfile `server-builder` stage (which asserts the output exists).

## Game assets

The `tf2-assets-sync` workflow converts the game's content into object storage
under `tf2-game/`, as channels gated by the Steam build like the hub's (see
[TF2 Hub](tf2-hub.md) "Keeping the game files current"). Builder versions live
in `lib/tf2-game/assets/versions.ts`; the workflow reads them from there.

| Channel          | Stored at                                | Built by                                                      | Entry point (published last) |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| `game-models`    | `tf2-game/mdl/`, shared `tf2-game/tex/`  | `scripts/tf2-game/model-list.py` → `models.py`                | `mdl/index.json`             |
| `game-sounds`    | `tf2-game/snd/<sha>.mp3`                 | `scripts/tf2-game/sound-list.py` → `sounds.py` (ffmpeg)       | `snd/index.json`             |
| `game-particles` | `tf2-game/particles/{effects,tex}/<sha>` | `scripts/tf2-game/game_particles.py` (`particle-systems.txt`) | `particles/index.json`       |
| `game-maps`      | `tf2-game/maps/`                         | `scripts/tf2-game/build-maps.ts` (wired once it exists)       | `maps/index.json`            |

`GET /api/tf2-game/assets/<kind>/<file>` serves them (`lib/tf2-game/assets/store.server.ts`,
paths checked by `paths.ts`): content-addressed files are immutable for a year,
index files revalidate after five minutes, Brotli passes through. In the
browser, `lib/tf2-game/assets/urls.ts` builds the URLs and loads the indexes.
The scheme is `<game>-game/<kind>/`, so the later `hl2-game/` and `portal-game/`
channels reuse the same code with a `game` argument.

- **Sounds.** `snd/index.json` is `{ v, entries: { <script name>: { waves: [sha…],
volume: [min,max], pitch: [min,max], soundlevel, channel, flags? } }, files:
{ "sound/<path>": "<sha>.mp3" }, loops: { "<sha>.mp3": { start, end } } }`.
  Scripts are read tf/-first (`gamefs.py`), conditionals evaluated as Windows
  desktop, Source's prefix characters kept as `flags`. MP3 is mono 64 kbps
  (less below 32 kHz) unless the sound is stereo by design (`)`, `^`, music:
  96 kbps stereo); an MP3 source already that small is copied untouched. Loop
  points come from the WAV `cue `/`ltxt` or `smpl` chunk, in seconds of the
  source. The encoder's leading padding is recorded in the LAME header, which
  Chromium and Firefox trim when decoding; where it is not trimmed (Safari) a
  loop starts about 25 ms late. The default list is about 1,400 files.
- **Particles.** `particles/index.json` is `{ v, systems: { <name>:
"effects/<sha>.json" }, missingTextures }`; each bundle is exactly the loadout's
  `ParticleBundle` (built by `scripts/tf2-assets/particles.py`'s `Graphs`), with
  `id` a stable hash of the name and `schema: { system }`. Its texture frames are
  `particles/tex/<sha>.webp` — load them with `particleAssetUrl`, not the loadout's
  `PARTICLE_API`.

**Storage budget.** Every game channel (all games) shares one budget,
`TF2_GAME_STORAGE_BUDGET_GB` (a repository variable; default 12 GB, R2).
Before any game upload, `scripts/tf2-game/storage-report.ts report` sums the
stored size of every channel from its state file — no bucket listing — plus
what this run would add, and fails the publish past the budget. Run it locally
(with the S3 variables) to see the footprint. Keep lists lean: `sound-list.py
--max-files` (default 1,500) fails a selection that grows, and
`particle-systems.txt` names only systems the game spawns.

Local runs: `python3 -B scripts/tf2-game/sound-list.py --root <install> --out list.json`,
`python3 -B scripts/tf2-game/sounds.py --root <install> --list list.json --out out`,
`python3 -B scripts/tf2-game/game_particles.py --root <install> --out out`. A
dedicated-server install has no texture or sound data, only their indexes: the
particle exporter records the textures it could not read and carries on; the
sound exporter reports every file as missing. Exporter tests:
`python3 -B -m unittest discover -s scripts/tf2-game -p 'test_sounds.py'` and
`-p test_game_particles.py` (the latter needs `vpk numpy pillow srctools==2.6.2`).

## Tests

The game's tests are their own suite, `pnpm test:tf2` (`vitest.tf2.config.ts`),
because the main suite is scoped to mission-critical code (see
[testing](testing.md)). Tests that need real game files read them from
`TF2_ROOT` (a Steam install) and skip when it is unset.

## Models

The game's model channel (`tf2-game/mdl/` and `tf2-game/tex/` in object storage) is built by
`scripts/tf2-game/models.py` from a list of MDL paths. `scripts/tf2-game/model-list.py --root <install>`
writes TF2's default list (class bodies and arms, stock weapons, projectiles, buildings, pickups, the flag,
player gibs); the map pipeline appends its props. Nothing in the converter is TF2-specific: `--search portal,hl2`
points it at another Source game.

```bash
python3 scripts/tf2-game/model-list.py --root <install> --out model-list.txt
python3 scripts/tf2-game/models.py --root <install> --list model-list.txt --out out [--state state.json] [--prev-index index.json]
pnpm exec tsx scripts/tf2-assets/publish.ts push --dir out --prefix tf2-game/ --state-key tf2-game/mdl/_state.json --index mdl/index.json --build <id>
```

- **Content addressed.** `mdl/<sha>.glb` and `tex/<sha>.webp` are named by the hash of their _source_
  (model, includes, VMTs, VTF bytes, encoder settings and `MODELS_VERSION` / `TEX_VERSION`), so an unchanged
  file keeps its name and is neither rebuilt nor uploaded. Textures are written once and shared by every
  model (and map) that uses them; a GLB references them as `../tex/<sha>.webp`. WebP q80, capped at 1024 px
  for player bodies, weapons and viewmodels and 512 px for everything else; alpha is kept when the VMT gives
  it a meaning (`alphaUse`). A missing texture (a dedicated-server install has none) leaves the material
  untextured but still named, and is listed in `untextured.json`.
- **`mdl/index.json`**: `{ <mdl path>: { glb, anims?, kind, bones, skinned, skins, attachments, hitboxes,
sequences, poseParameters? } }`. `mdl/players/<class>.anims.json` and `mdl/viewmodels/<class>.anims.json`
  hold `{ mdl, glb, anims, poseParameters, activities: { ACT_*: [{ seq, weight }] }, weightlists,
sequences: { <name>: { clips, looping, delta, post, fps, frames, blend?, layers?, weightlist? } } }`.
- **Body GLB.** LOD 0 of every body part; a switchable body group's submodels are separate primitives
  (`extras.bodygroup`, `extras.sub`); every primitive has `extras.slot` (its skin-reference slot) and uses
  skin family 0. Skinned (bones + inverse binds) unless it is a static single-bone prop. Positions are the
  compiled bind space in metres (Y up; Source (x, y, z) is glTF (y, z, x)).
- **Animation.** A model with `$includemodel`s (players, arms) gets a separate _anim pack_ GLB (skeleton +
  clips, no mesh); any other model carries its sequences in its own GLB. Players export every `ACT_MP_*`
  sequence except voice-command gestures, PASS Time and the CYOA PDA, plus the death sequences; arms every
  sequence with an activity; other models every sequence; plus, recursively, every sequence those layer on
  themselves (aim matrices, arm layers). Each animdesc is one glTF clip named `<sequence>` or
  `<sequence>@<cell>` (blend grids: cell = y × groupsize[0] + x). Rotations are normalized shorts and keys
  are reduced (0.06°, 0.01 unit). **Delta** clips (`extras.delta`) hold offsets from the identity: add the
  translation, and compose the rotation `d^w * base`, or `base * d^w` when the sequence is `post`; a bone
  with no track is the identity (delta) or the bind pose (absolute).

`scene.extras` of a body (all lengths in metres, matrices column-major 4×4, unless noted):

```jsonc
{
  "tf2game": 1, "mdl": "models/player/scout.mdl", "scale": 0.01905,
  "source": { "eyePosition": [x,y,z], "illumPosition", "hullMin", "hullMax", "viewMin", "viewMax" }, // Source units, Z up
  "flags": 0, "mass": 100, "contents": 1, "surfaceprop": "flesh", "keyvalues"?: "<raw $keyvalues>",
  "skinned": true,
  "bodyparts": [{ "name": "hat", "count": 2 }],            // every body part, in order (body index math)
  "skins": [[materialIndex per slot], ...per family],      // -1: no material for that slot
  "attachments": [{ "name": "muzzle", "bone": "weapon_bone", "flags": 0, "local": [16] }],
  "hitboxSets": [{ "name": "default", "hitboxes": [{ "bone", "group", "min": [3], "max": [3], "name"? }] }],
  "poseParameters": [{ "name": "body_pitch", "start": -45, "end": 90, "loop": 360 }],
  "boneControllers"?: [{ "bone", "axis": "XR", "type", "loop", "start", "end", "rest", "input" }],
  "includes"?: ["models/player/scout_animations.mdl"], "jiggle"?: [...], "proceduralBones"?: [{ "bone", "type" }],
  // models with their own sequences, and every anim pack (which also has "animPack": true):
  "sequences"?: [{ "name", "activity"?, "actweight"?, "flags", "looping", "delta", "post", "autoplay",
                   "hidden"?, "snap"?, "realtime"?, "world"?, "fps", "frames", "fadeIn", "fadeOut",
                   "clips": ["run_PRIMARY@0", ...],
                   "blend"?: { "groupsize": [3,3], "params": ["move_y","move_x"], "start": [..], "end": [..], "poseKeys"?: [[..],[..]] },
                   "layers"?: [{ "seq", "flags", "pose"?, "start", "peak", "tail", "end" }],
                   "events"?: [{ "frame", "cycle", "event", "type", "name"?, "options"? }],
                   "weightlist"?: 0, "nextSeq"?, "cyclePose"?, "modifiers"?, "keyvalues"? }],
  "activities"?: { "ACT_MP_RUN_PRIMARY": [{ "seq": "run_PRIMARY", "weight": 1 }] },
  "weightlists"?: [{ "<bone>": 0.0 }]   // per-bone weights that are not 1
}
```

A clip's `extras`: `{ fps, frames, looping, delta, source (animdesc name), movement?: [mstudiomovement_t, Source
units], groundSpeed? (units/s) }`. A material's `extras`: `{ material, vmt, shader, texture (VTF path),
translucent?, alphatest?, cutoff?, additive?, nocull?, selfillum?, selfillumTint?, selfillumMask?, vertexalpha?,
tintByBaseAlpha?, tintColorOverBase?, color?, color2?, phong?: { exponent, boost, fresnelRanges, tint?,
albedoTint?, baseAlphaMask?, exponentTexture? }, rimlight?: { exponent, boost, mask }, lightwarp?, bumpmap?,
envmap?, envmapTint?, envmapMask?, detail?, surfaceprop?, alphaUse?, eye?, missing? }` (texture names are
`materials/….vtf` paths).

Tests: `TF2_ROOT=<install> python -B -m unittest discover -s scripts/tf2-game -p test_models_game.py`.
