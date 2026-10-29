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

| Path                                        | What                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/tf2-game/core/`                        | Vectors and angles (`vec.ts`), SDK constants (`constants.ts`), the shared contracts (`types.ts`: `UserCmd`, `TraceResult`, `CollisionWorld`).                                                                                                                                     |
| `lib/tf2-game/formats/`                     | Readers for Valve formats: VPK, KeyValues, BSP v19–21, VTF, VMT, PHY. Pure TS over `Uint8Array`; used by the asset pipeline (Node) and the game (browser + server).                                                                                                               |
| `lib/tf2-game/world/`                       | The map as a collision world: BSP brush tracing (CM_BoxTrace), displacement and static-prop collision, brush entities that move.                                                                                                                                                  |
| `lib/tf2-game/data/`                        | Class and weapon tables (stock arsenal), extracted from the game scripts and checked against the SDK.                                                                                                                                                                             |
| `lib/tf2-game/sim/`                         | The authoritative simulation: game movement, players, weapons, projectiles, damage, conditions, buildings, map entities and I/O, game rules and modes. Deterministic.                                                                                                             |
| `lib/tf2-game/bots/`                        | Bots (see [Bots](#bots)): nav mesh generation and `nav.bin`, A\* and path following, the TFBot brain.                                                                                                                                                                             |
| `lib/tf2-game/net/`                         | Protocol: snapshots, deltas, input packing; client prediction and interpolation.                                                                                                                                                                                                  |
| `lib/tf2-game/render/`                      | three.js renderer: world, props, players, view models, projectiles, buildings, particles, decals. Browser only.                                                                                                                                                                   |
| `lib/tf2-game/audio/`                       | Sound playback over `getAudioContext()`: the mixer, attenuation and channel rules, soundscapes, scenes, captions.                                                                                                                                                                 |
| `lib/tf2-game/client/`                      | The browser game loop: input, local "listen server" worker for offline play, connection to the hub for online play; the HL2 / Portal client (see [Playing](#playing-the-clients)).                                                                                                |
| `components/tf2-game/`                      | React UI: the play page, HUD, menus (team, class, scoreboard, settings).                                                                                                                                                                                                          |
| `lib/tf2-game/server/`                      | Match hosting: the `MatchHost` contract the simulation implements (`match-host.ts`), its one entry point `createTf2Match` (`create-match.ts`), the fixed-step loop (`match-runner.ts`), the worker entry (`match-worker.server.ts`) and the hub's thread pool (`pool.server.ts`). |
| `server/socket-server/handlers/tf2-game.ts` | Room manager on the hub (`tf2:*` events, `lib/tf2-game/net/events.ts`). Each match runs on a `worker_threads` worker (`lib/tf2-game/server/match-worker.server.ts`) so the hub's event loop never simulates.                                                                      |
| `scripts/tf2-game/`                         | Asset pipeline: map packages, materials, props, sounds, view models, particles.                                                                                                                                                                                                   |

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

## Playing: the clients

| Route          | Page                                    | Client                                                        |
| -------------- | --------------------------------------- | ------------------------------------------------------------- |
| `/tf2/play`    | `components/tf2-game/Tf2PlayPage.tsx`   | `lib/tf2-game/client/tf2-client.ts` (online or listen server) |
| `/half-life-2` | `components/sp-game/Hl2PlayPage.tsx`    | `lib/tf2-game/client/sp-client.ts` (`SpWorld`, main thread)   |
| `/portal`      | `components/sp-game/PortalPlayPage.tsx` | `sp-client.ts` + `portal-view.ts` (recursive portal views)    |

All three mount `components/tf2-game/GameCanvas.tsx`: the canvas, the HUD (`GameHud`), loading progress per
stage, errors with retry, pointer lock, fullscreen and the phone's rotate hint. A client owns exactly one
`requestAnimationFrame` (`client/loop.ts`, paused while the tab is hidden) and runs everything on it.

- **TF2** (`tf2-client.ts`): `connectTf2` → create/join (or the listen-server worker, `net/listen-worker.ts`, which
  uses the bots module's brain when one is present) → the map package (one BSP parse feeds the renderer and the
  predicting client world) → per frame: look applied to the view angles, 66.67 Hz commands (`buildUserCmd` →
  `InputSender` → `Prediction`), snapshots into the interpolation buffer, the camera (`client/view.ts`: stairs,
  roll, punch, the zoom FOV; death cam → freeze cam on the killer → chase; spectator in-eye / chase / roaming),
  `WorldRenderer` + `EntityRenderer` + the view model, audio, the HUD at 20 Hz. HUD commands map to match
  commands; build / destroy / disguise / taunt travel as `tf2:extra` (`zExtraCommand`). A new `hello` map
  reloads the level; a reconnect restarts prediction.
- **Half-Life 2 / Portal** (`sp-client.ts`): the browser `SpAssets` (`client/sp-assets.ts`: model sequences and
  bounds from the GLBs' `scene.extras`, hulls from the map's `hulls.bin`, scenes and captions from `snd/`), a
  fixed-step `SpWorld`, level transitions (`trigger_changelevel` loads the next package with the carried
  player; a map that is not published ends the demo), checkpoints (death reloads them inside the world) and
  Continue (`client/sp-save.ts`: the last level start in localStorage). The manifest has no `%noportal` or
  `$surfaceprop` yet, so Portal refuses portals on metal / glass / tool materials by name.
- **Quality** (`client/quality.ts`): desktop / laptop / mobile from WebGL2, the texture limit, memory, cores,
  the GPU name and touch; each sets resolution scale, DPR cap, texture cap, anisotropy, particle budget, prop
  draw distance and portal recursion (2 desktop, 1 phone). A frame-time governor lowers the resolution scale
  under sustained load and raises it slowly.

Smoke test in a real browser (not part of a suite): `scripts/tf2-game/play-smoke.ts` (its header has the setup —
a Vite dev server with the map packages under `LOCAL_STORAGE_DIR`, no Postgres needed). Pure client logic is
tested in `lib/tf2-game/client/play-client.test.ts`.

## Custom HUDs in game

Any HUD from the [HUD editor](tf2-hud-editor.md) can be the in-game HUD: pause menu → **HUD** (TF2 Default,
this device's drafts, the account's saved HUDs, the workshop, or a pasted share link), or the editor's
**Test in game** (`/tf2/play?hud=draft:<id>|cloud:<id>|share:<token>|default`). The choice is remembered
(`localStorage` `rmh-tf2-game-hud`). Code: `lib/tf2-game/client/custom-hud/` (logic, tested in
`custom-hud.test.ts`) and `components/tf2-game/custom-hud/` (UI).

- **Same renderer as the editor.** The HUD's `.res` panels are built by the editor's scene builder
  (`lib/tf2-hud/scene/build.ts`) and painted by its painter onto one canvas over the game, so positions,
  sizes (`c`/`r`/`f`, `pin_to_sibling`, proportional integer scaling), visibility, scheme colours, fonts
  (including font files the HUD ships), textures and labels resolve exactly as the editor previews them.
  The fidelity test checks every panel rectangle against the editor's build for the base HUD and two sample
  HUDs (`sample-huds.ts`) at 1920×1080 and 1280×720.
- **Fed by the live game.** `adapter.ts` maps `HudState` onto the editor's `TestState` (class, team,
  health, ammo, Über/cloak/sticky meters, metal, sentry level, scores, round clock, events) plus the
  `%variables%` only the game knows; `bindings.ts` adds what the game decides at run time (clip vs. no-clip
  ammo labels, condition icons, the health cross fill, KOTH clocks, the win panel's top players, building
  bars); `events.ts` starts the HUD's own animation events (`DamagedPlayer`, the health/low-ammo/Über
  pulses, `AccountMoneyAdded`, disguise fades, `ActiveTimerHighlight`, `TimerIncrement`, …).
- **Cost.** `scene.ts` builds each panel file on its own and caches it under exactly the inputs it reads;
  `renderer.ts` repaints only the changed areas, inside the HUD store's ≤30 Hz publish (no loop of its
  own). Measured in Chromium at 1920×1080 (`scripts/tf2-game/hud-harness/perf.ts`): ~0.3–0.9 ms per update
  when nothing changed, ~0.7–1.4 ms when health or Über changes, ~1.1–2.2 ms (p95 ≤ 4 ms) for a full
  rebuild and repaint. Switching HUDs loads files, fonts and textures first and keeps the old HUD until then.
- **What stays the game's own** (made at run time in TF2 too): the round timer, control points, flags and
  cart, kill feed, chat, messages, damage numbers, crosshair and menus — placed by the HUD's
  `hudlayout.res` (`layout.ts`). The Engineer's building panels come from the HUD only when it customises
  them (the base pack lacks most of their textures). Missing textures draw nothing in game.
- **Edit HUD** opens the full editor over the match (offline play pauses: the listen server holds the
  match, `MatchRunner.setPaused`; online play goes on); **Test in game** applies the edited draft and
  returns; **Export** is the editor's zip for `tf/custom`. A draft saved in another tab is re-read
  (`BroadcastChannel` `rmh-tf2-hud-drafts`).
- Harness: `shoot.ts` adds `custom-*` shots and `compare-*` (game HUD beside the editor's pipeline, same
  HUD and state); `tap-check.ts` covers the pause menu and its HUD view.

## Items and loadouts

Players can wear what they build in the [loadout builder](tf2-hub.md): pause menu → **Loadout**
(`components/tf2-game/tf2/LoadoutPauseView.tsx`, the builder's own class picker, slot tiles, item picker,
customise modal and 3D preview) loads this device's drafts or the account's saved loadouts and **Equip**s
one. As in TF2 a change applies at the next respawn or resupply, or at once inside your own respawn room;
the view says which. Bots stay stock; at hard and expert each held slot may carry a fully simulated unlock
(`sim/items/bots.ts`, from the match's seeded random stream).

- **Command.** Online: `tf2:loadout` `{ cls, slots }` (`net/lobby-schema.ts` `zLoadout`, the saved-loadout
  slot schema; 20/min in `server/socket-server/config.ts`) → the match command `{ kind: 'loadout' }`;
  offline the same command goes to the listen server. `sim/items/command.ts` checks it like a saved loadout
  (`lib/tf2-loadout/validate.ts` `slotProblem` — class, slot, equip regions, duplicates — plus the game's
  rules, `checkGameLoadout`) and answers the owner with a `loadout` event: `applied`, `pending` or
  `refused` + reason. The private NET_PLAYER fields `loadoutPending` / `inSpawnRoom` drive the view's status.
- **Catalog.** The hub reads the stored catalog row (`lib/tf2-game/server/item-catalog.server.ts`, every 10
  min) and posts it to every match worker (`{ t: 'items' }`); the browser fetches
  `/api/tf2-loadout/catalog` for the listen server and for prediction. Both call `setItemCatalog`
  (`sim/items/registry.ts`). Without a catalog everyone is stock.
- **What an item does** (`sim/items/resolve.ts`): a weapon's `item_class` (after TranslateWeaponEntForClass)
  picks the stock implementation, or an unlock script that refines one (`data/unlock-scripts.ts`, generated
  by `scripts/tf2-game/extract-unlock-scripts.py`: the Direct Hit is the rocket launcher running
  `tf_weapon_rocketlauncher_directhit`); `tf_wearable…` items are worn providers (Gunboats); an item class
  with no implementation here (the Huntsman, jars, lunchboxes, flare guns, shields' charge…) is a
  **fallback**: the wearer gets the class's stock weapon of that slot, and the builder view says so.
- **Attributes** (`sim/items/attributes.ts`, `hooks.ts`): the catalog's `at` (`[class, value, op]`) is
  applied per CALL_ATTRIB_HOOK as the SDK does — a weapon's hooks see its own attributes plus the wearer's
  worn items, a player hook sees every provider (a `provide_on_active` weapon only while active), ops by
  `description_format` (percentage/inverted multiply, additive add, or/lookup set), integer hooks rounded.
  Weapon-only numbers are folded into the weapon's stats from its defindex (clip, damage, bullets, spread,
  fire delay, reload, deploy), so prediction rebuilds them from the replicated defindex. Simulated:
  damage, clip (override and multiplier), fire rate, reload, bullets and spread, deploy and switch times,
  swords' range and holster penalty, crit chance, projectile speed, blast radius, damage vs players /
  buildings, mini-crits on airborne targets, damage taken (all, fire, blast, bullet, melee), blast-jump
  self damage and force, health on hit / on kill / on blast damage, über on hit, max health, max ammo,
  move speed (always, active, aiming), health regen, healing received (medics, packs), Medi Gun heal
  rate / overheal / über build and the Kritzkrieg's crits, minigun spin-up, sniper charge rate, cloak
  drain and regen, afterburn damage and duration, airblast cost and its removal
  (`sim/items/support.ts` `SUPPORTED_ATTRIBUTES`; a few take only their stock value, `PARTIAL_ATTRIBUTES`).
  Everything else on an item is listed as unsupported and the Loadout view shows "Some of this item's
  effects aren't simulated yet" with the list. Whole mechanics not simulated (`ITEM_CLASS_MECHANICS`):
  Air Strike, shove, hype and boost, revenge crits, Crikey, heads, the Classic's charge, honorbound,
  balls, the Caber, the Gunslinger, slaps, sapper variants, shield charges, the Razorback. Against the
  local catalog build: of 477 weapon-slot items, 315 are fully simulated, 118 partly, 44 fall back.
- **Replication.** NET_PLAYER `items` (public string) lists what a player shows:
  `/`-separated `<slot code><defindex>[w][s<style>][p<paint>][e<effect>][f][k<kit>.<wear>.<seed>]`
  (`P/S/M/D/E/B/A` weapon slots, `w` worn, `C` cosmetics; `sim/items/loadout.ts` `encodeItems`). The
  predicting client restores the owner's worn providers from it, and the renderer dresses every player.
- **Rendering** (`render/entities/loadout-models.ts`): unlock weapons (third person and the view model,
  with the role's view-model activity table) and cosmetics from the loadout builder's model channel —
  rigid parts on their bone at the converter's pose, bone-merged ones on the skeleton — with paint
  (two-tone paints switch per team), styles, per-class variants, the body groups they hide, festivizers,
  war paints and unusual effects (`ParticleLibrary` `unusual:<id>`, the loadout particle channel, on the
  head). Until a model loads, or when the channel has none, the class's stock weapon of the slot is drawn.
  Cosmetics are not drawn beyond 1800 units. Gaps: the channel publishes RED skins only (unpainted BLU
  cosmetics wear them), jiggle bones hang still, weapon unusual effects and killstreak sheens are not drawn,
  wearable c_models that span both feet (Gunboats, Mantreads) are rigid on one bone.

## Game assets

The `tf2-assets-sync` workflow converts the game's content into object storage
under `tf2-game/`, as channels gated by the Steam build like the hub's (see
[TF2 Hub](tf2-hub.md) "Keeping the game files current"). Builder versions live
in `lib/tf2-game/assets/versions.ts`; the workflow reads them from there.

| Channel                        | Stored at                                                   | Built by                                                                                      | Entry point (published last)        |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| `game-models`                  | `tf2-game/mdl/`, shared `tf2-game/tex/`                     | `scripts/tf2-game/model-list.py` → `models.py`                                                | `mdl/index.json`                    |
| `game-sounds`                  | `tf2-game/snd/<sha>.mp3`                                    | `scripts/tf2-game/sound-list.py` → `sounds.py` (ffmpeg)                                       | `snd/index.json`                    |
| `game-particles`               | `tf2-game/particles/{effects,tex}/<sha>`                    | `scripts/tf2-game/game_particles.py` (`particle-systems.txt`)                                 | `particles/index.json`              |
| `game-maps`                    | `tf2-game/maps/`, shared `tf2-game/tex/`                    | `scripts/tf2-game/build-maps.ts` (see [Maps](#maps))                                          | `maps/index.json`                   |
| `hl2-maps`, `hl2-models`       | `hl2-game/maps/`, `hl2-game/mdl/`, `hl2-game/tex/`          | `build-maps.ts --game hl2`, `models.py --search hl2` (Half-Life 2 demo, app 219)              | `maps/index.json`, `mdl/index.json` |
| `portal-maps`, `portal-models` | `portal-game/maps/`, `portal-game/mdl/`, `portal-game/tex/` | `build-maps.ts --game portal`, `models.py --search portal,hl2` (Portal: First Slice, app 410) | `maps/index.json`, `mdl/index.json` |
| `hl2-sounds`, `portal-sounds`  | `hl2-game/snd/`, `portal-game/snd/`                         | `sound-list.py --game hl2\|portal` → `sounds.py --game hl2\|portal` (ffmpeg)                  | `snd/index.json`                    |

`GET /api/tf2-game/assets/<kind>/<file>` serves them (`lib/tf2-game/assets/store.server.ts`,
paths checked by `paths.ts`): content-addressed files are immutable for a year,
index files revalidate after five minutes, Brotli passes through. In the
browser, `lib/tf2-game/assets/urls.ts` builds the URLs and loads the indexes.
The scheme is `<game>-game/<kind>/`: `GET /api/hl2-game/assets/…` and
`GET /api/portal-game/assets/…` serve the other two games with the same code (a `game`
argument). Files named by a content hash (64 hex, or the model channel's 40) are the
immutable ones, including multi-part extensions such as `<sha>.hulls.bin`.

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
- **Half-Life 2 and Portal sounds.** `sound-list.py --game hl2|portal` lists what the published
  maps use (read as their gameinfo.txt searches, sound packs included — `gamefs.SearchFS`):
  entity values naming a script entry or a sound file (ambient_generic, door / button / train
  sounds), env_soundscape soundscapes and their waves, logic_choreographed_scene speech (read
  from `scenes/scenes.image`, `sourcegame.SceneImage`), the NPCs and surfaces present, the
  player and each game's own set (portal gun, portals, energy balls; the suit), dropping what
  the demo depots do not ship; `--max-files` defaults to 800. `sounds.py --game …` publishes,
  next to the index, `snd/soundscapes.json` (`{v, soundscapes: {name: {dsp?, rules}}}`),
  `snd/scenes.json` (`{v, scenes: {"scenes/…/x.vcd": {duration, speak: [{actor, sound, start,
end, cc?, ccType?}]}}}`) and `snd/captions.json` (`{v, lang, captions: {token: {text, color?,
sfx?, len?, delay?, norepeat?}}}` — English captions, `<clr>` / `<I>` / `<B>` / `<cr>` reduced
  to `<color=#rrggbb>`, `<i>`, `<b>` and newlines). About 650 files / 11 MB (HL2) and 340 files
  / 14 MB (Portal, mostly its songs). Tests: `-p test_sourcegame.py` (with `HL2_ROOT` /
  `PORTAL_ROOT` it also lists the real games).
- **Playback.** `lib/tf2-game/audio/` (`AudioEngine`) mixes over the page's shared
  `getAudioContext()`: Source's sound-level attenuation (`attenuation.ts`), per-entity channel
  replacement (`channels.ts`), an LRU of decoded buffers under a byte budget, HRTF panning,
  volume groups, voice ducking, throttled occlusion, a 48-voice limit, soundscapes with the
  3-second crossfade, scene speech and caption events for the HUD.
- **Particles.** `particles/index.json` is `{ v, systems: { <name>:
"effects/<sha>.json" }, missingTextures }`; each bundle is exactly the loadout's
  `ParticleBundle` (built by `scripts/tf2-assets/particles.py`'s `Graphs`), with
  `id` a stable hash of the name and `schema: { system }`. Its texture frames are
  `particles/tex/<sha>.webp` — load them with `particleAssetUrl`, not the loadout's
  `PARTICLE_API`.

**Storage budget.** Every game channel (all games) shares one budget,
`TF2_GAME_STORAGE_BUDGET_GB` (a repository variable; default 12 GB, R2).
Before any game upload, `scripts/tf2-game/storage-report.ts report` sums the
stored size of every channel of all three games from its state file — no bucket
listing — plus what this run would add (an object two channels publish, like a shared
`tex/` file, counted once), and fails the publish past the budget. Run it locally
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

## Maps

`scripts/tf2-game/build-maps.ts` turns each published map into a package under `<game>-game/maps/`;
the contract (zod schemas and the TypeScript types the renderer imports) is
`lib/tf2-game/assets/map-manifest.ts`, the maps each game publishes are
`lib/tf2-game/assets/game-maps.ts` (TF2: the hub allowlist in `data/maps.ts`; HL2: the demo's
`d1_trainstation_01`–`06`; Portal: First Slice's `testchmb_a_00`–`06`).

```bash
pnpm exec tsx scripts/tf2-game/build-maps.ts --root <install> --game tf2|hl2|portal --out out \
  [--maps a,b | --maps-file f] [--state state.json] [--prev-index maps/index.json] \
  [--props-list-out props.list] [--sizes] [--force]
pnpm exec tsx scripts/tf2-game/build-maps.ts --root <install> --game hl2 --props-only --props-list-out models.list
pnpm exec tsx scripts/tf2-assets/publish.ts push --dir out --prefix hl2-game/ \
  --state-key hl2-game/maps/_state.json --index maps/index.json --build <id>
```

- **Search paths** mirror each `gameinfo.txt` (sound packs left out): TF2 `tf2_textures`, `tf2_misc`,
  `hl2_textures`, `hl2_misc`, then loose `tf/`, `hl2/`; HL2 `hl2_pak`, `hl2_textures`, `hl2_misc`, loose
  `hl2/`; Portal `portal_pak`, `hl2_textures`, `hl2_misc`, loose `portal/`, `hl2/`. The map's own pakfile
  is searched first (its cubemap-patched materials resolve through their `include`).
- **`maps/<sha>.bsp`**: the map with every lump decompressed (game lumps too, offsets rewritten), the
  pakfile, cubemap and unused lighting lumps emptied (the HDR lightmaps and ambient cubes are kept when the
  map has them, else the LDR ones); everything else byte-identical. `parseBsp` reads it.
- **Materials**: every texdata name (faces, displacements, overlays, brush entities, water) plus
  entity-referenced materials (sprites, ropes, decals), resolved with `patch` includes and the DX9 shader
  blocks. Base textures are `$basetexture`, `$basetexture2` / `$texture2` and `$blendmodulatetexture`
  (never bump, env, detail maps). Tool textures are `nodraw` (`tools/toolsskybox*` are `sky`,
  `tools/toolsblack*` is unlit black); `color` is the texdata reflectivity, gamma-encoded, for every
  material — what a material without a texture (a dedicated-server install has none) draws.
- **Textures**: the largest mip ≤ 1024 px, frame 0, WebP q80, alpha kept only when the material uses it
  (translucent, alpha test, self-illumination in the base alpha) and the pixels have it. Named exactly as
  models.py names textures (`TEX_VERSION`, kind `base`, cap, alpha, VTF digest; textures ≤ 512 px take the
  512 cap name, which is what a prop gets), so a texture is stored once across maps and models.
- **Props**: every static prop model and every `prop_*`, `item_*` and `physics_cannister` entity model;
  their collision (the `.phy`'s first solid, via `world/prop-collision.ts`) is `maps/<sha>.hulls.bin`.
  `--props-list-out` / `--props-only` append the models models.py can read (not pakfile-only ones) to its
  list, so every prop gets a GLB, plus the game's `GAME_ALWAYS_MODELS` — models the client draws that no
  map names (Portal: `v_portalgun` / `w_portalgun`).
- **Incremental**: files are named by their content (textures by their source), so with `--state` an
  unchanged map writes nothing and decodes no texture, but is still listed in `wanted.json`. A map that
  fails keeps its previous index entry (`failed.json`).
- **Navigation mesh** (TF2, on by default; `--no-nav` skips it, `--nav` forces it for another game):
  `maps/<sha>.nav.bin`, generated from the BSP and the prop hulls — the same collision the game runs —
  within `NAV_TIME_BUDGET_MS` (60 s) per map; see [Bots](#bots). The manifest's `nav` names it.

Sizes (BSP raw / Brotli as stored; textures as encoded; local installs, 2026-10-29 — the TF2 dedicated
server has no texture data, so TF2's textures are an estimate from HL2's per-map figure):

| Game   | Map                 | BSP raw  | BSP Brotli | Textures              |
| ------ | ------------------- | -------- | ---------- | --------------------- |
| TF2    | ctf_2fort           | 22.1 MiB | 10.2 MiB   | (not in a DS install) |
| TF2    | ctf_turbine         | 5.9 MiB  | 2.4 MiB    |                       |
| TF2    | cp_dustbowl         | 21.2 MiB | 10.4 MiB   |                       |
| TF2    | cp_granary          | 22.5 MiB | 10.3 MiB   |                       |
| TF2    | cp_badlands         | 27.8 MiB | 11.5 MiB   |                       |
| TF2    | koth_viaduct        | 16.1 MiB | 7.7 MiB    |                       |
| TF2    | koth_harvest_final  | 13.6 MiB | 5.8 MiB    |                       |
| TF2    | pl_badwater         | 19.4 MiB | 9.4 MiB    |                       |
| TF2    | pl_upward           | 22.8 MiB | 10.6 MiB   |                       |
| HL2    | d1_trainstation_01  | 13.6 MiB | 6.6 MiB    | 237 (10.0 MiB)        |
| HL2    | d1_trainstation_02  | 11.0 MiB | 4.8 MiB    | 194 (8.5 MiB)         |
| Portal | testchmb_a_00       | 3.2 MiB  | 1.3 MiB    | 70 (1.2 MiB)          |
| Portal | testchmb_a_01       | 5.2 MiB  | 2.0 MiB    | 53 (0.9 MiB)          |
| Portal | testchmb_a_02 … _06 | 20.9 MiB | 8.3 MiB    | ≈ 1 MiB more          |

Projected stored size: TF2 ≈ 78 MiB BSP and ≈ 60 MiB textures (estimate) for 9 maps; HL2 ≈ 11 MiB BSP
and ≈ 14 MiB textures for its 2 maps (the demo licence ships data for `d1_trainstation_01` and `_02`
only; the rest of its depot is empty placeholders); Portal ≈ 12 MiB BSP and 2.5 MiB textures for all 7.
All maps of the three games come to about 0.2 GB, plus their props' GLBs (HL2: 208 props, 11.6 MiB;
Portal 2 maps: 47 props, 4.5 MiB; ctf_2fort: 326 props, 13.5 MiB untextured).
Tests: `HL2_ROOT=… PORTAL_ROOT=… TF2_ROOT=… pnpm test:tf2 scripts/tf2-game/build-maps.test.ts` (each game
skips without its install; prints the sizes above).

## Bots

`lib/tf2-game/bots/` fills empty seats online and is the opposition offline. Bots are ordinary players:
a `BotBrain` (`server/tf2-match-host.ts`) returns one `UserCmd` per tick and the host queues it, so bots
move through the same `playerMove`, weapons and rules as humans. `createTf2Match` and the listen server
play `TFBotBrain` at the match's `botDifficulty` by default; `Tf2MatchHostOptions.botBrain` replaces it
and `botClasses` / `setBotClassPreference(team, classes)` give a team's bots a fixed line-up (an
offline player's choice). The SDK's NextBot / TFBot code (`game/server/NextBot`, `tf/bot`,
`nav_*.cpp`) is the behavioural reference; the implementation is independent.

- **Nav mesh** (`bots/nav/`). `NavGenerator` samples walkable ground on a 25-unit grid with the TF
  player hull (48 × 48, 82 tall, 62 crouched), flood-filling from the map's spawns, control points,
  flags, capture zones, payload `path_track`s and pickups. Each sample tries its four neighbours as
  `CGameMovement` would move: a step (≤ 18), a walk off a ledge (a drop, ≤ 250), a crouch-jump up to
  64 (landing up to two cells away, over lips a hull cannot stand on), or swimming up out of water;
  ground steeper than 0.7, ledge corners whose centre is unsupported, and lethal `trigger_hurt`
  volumes are not walkable; a low lintel makes both ends crouch areas. Doors, toggled `func_brush`es
  and the cart are ignored while sampling; the areas they overlap remember the brush. Samples merge
  into coplanar rectangles (≤ 12 × 12 cells) that share their attributes: RED/BLU spawn room
  (`func_respawnroom`), capture area, capture zone, resupply, water, crouch, door. Connections carry
  their kind (walk / jump / drop, one-way when too high to climb back) and portal. Visibility is a
  sector PVS: areas grouped into ~512-unit sectors, pairs within 5000 units that the BSP's PVS allows
  sampled with line traces, stored as a bitset. `nav.bin` (`serialize.ts`) is the compact
  little-endian form. Generation is incremental (`step(traceBudget)`): when a package has no mesh
  the hub worker (or the browser listen server) builds one a slice per tick, cached per map.
- **Paths** (`bots/path.ts`). A\* over areas (distance, crouch/water/jump/drop costs, the per-team
  danger map of recent deaths; the enemy's spawn rooms and blocked doors are forbidden — doors per
  `CTFNavMesh::ComputeBlockedAreas`: a bare closed door or solid toggled brush blocks everyone, a
  trigger-opened door only the team its filter keeps out). An unreachable goal paths to the closest
  area (bots wait at setup gates). `PathFollower` steers to the portals (each leg stays inside one
  convex area, narrow ramps walked down the middle), jumps and crouch-jumps at jump connections,
  crouches through crouch areas, swims up, walks off perches the mesh does not know, and repaths when
  stuck or off the path. A world's bots share three searches a tick.
- **Brain** (`bots/brain/`). Perception every third tick: a vision cone and line of sight (pre-culled by
  the sector PVS), gunfire heard within 1800, whoever just hurt us; disguised spies pass as friends
  until they bump, attack or are seen through; cloaked ones show only when flickering or burning. Class
  choice follows TFBot's offense / defense rosters (`CTFBot::GetNextSpawnClassname`), re-chosen each
  death. Objectives (`objective.ts`) read the live entities: capture or block points (standing in the
  capture trigger), defend, KOTH, push or block the cart, fetch / escort / deliver / defend the
  intelligence, chase a carrier. Per class: scouts strafe and jump with the scattergun close, soldiers
  lead rockets at the feet (and rocket-jump toward far goals on hard+), pyros flame close and reflect
  incoming rockets and pipes, demomen arc pipes and lay sticky traps they detonate under enemies,
  heavies spin up before engaging, engineers build a sentry at a spot that sees what they defend, a
  dispenser and teleporters, and maintain them with the wrench, medics pick a patient (heavy first),
  heal, über when hurt, and defend themselves, snipers scope from vantage spots and wait for charge,
  spies disguise, cloak on the approach, backstab and sap sentries. Everyone retreats to health or
  ammo (pickups, resupply, dispensers), reloads when safe and calls lines (`voice` events).
- **Difficulty** (`difficulty.ts`):

| Knob                                     | easy | normal | hard | expert |
| ---------------------------------------- | ---- | ------ | ---- | ------ |
| Reaction time (s, `GetMinRecognizeTime`) | 1.0  | 0.5    | 0.3  | 0.2    |
| Aim tracking interval (s)                | 1.0  | 0.25   | 0.1  | 0.05   |
| Aim error (°; scoped rifle × 0.35)       | 4.5  | 2.2    | 1.2  | 0.5    |
| Turn rate (°/s)                          | 300  | 540    | 800  | 1200   |
| Field of view (°)                        | 90   | 90     | 100  | 110    |
| Retreat below health                     | 55 % | 45 %   | 35 % | 30 %   |
| Sniper charge before a body shot         | 30 % | 50 %   | 70 % | 85 %   |
| Projectile lead                          | 30 % | 65 %   | 85 % | 100 %  |
| Airblast reaction chance                 | 10 % | 35 %   | 60 % | 85 %   |
| Rocket jumps                             | no   | no     | yes  | yes    |

Nav meshes of the nine maps (local install, 2026-10-29; generation in Node, including the visibility
pass): ctf_2fort 866 areas / 80 KiB / 1.7 s, ctf_turbine 606 / 55 KiB / 0.8 s, cp_dustbowl 2132 /
202 KiB / 2.5 s, cp_granary 1841 / 181 KiB / 1.7 s, cp_badlands 2726 / 276 KiB / 2.8 s, koth_viaduct
1274 / 125 KiB / 1.5 s, koth_harvest_final 1165 / 115 KiB / 1.5 s, pl_badwater 1949 / 190 KiB / 1.8 s,
pl_upward 2592 / 262 KiB / 2.7 s.

Tests: `pnpm test:tf2 lib/tf2-game/bots` (the synthetic mesh test runs anywhere); with `TF2_ROOT`,
`bots.nav.maps.test.ts` checks every map's mesh (connectivity from each team spawn to every
objective, the `nav.bin` round trip) and walks a bot from each spawn to every current objective,
`bots.match.maps.test.ts` plays 12v12 bots for five minutes on each map (objective progress, kills for
every class, > 90 % of bots moving, the bots' share of a tick; ~15 minutes) and
`bots.offline.maps.test.ts` one human through the host's input path with eleven bots.

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
  MDL's compiled bind space in metres, unpermuted — so the axes depend on how the model was compiled, and
  the GLB does not record them:
  - TF2 players, arms, c_model weapons and buildings: Y up, Source (x, y, z) is glTF (y, z, x).
  - Most static props, pickups, the flag, HL2/Portal props and HL2 humans: Source axes (Z up).
  - Some rigid single-bone models: another axis rotation (`w_rocket`: Source X along glTF Y).

  Clips are re-expressed with the MDL's `ref` sequence root fix, or with the (y, z, x) mapping when the
  MDL has no `ref` — even when its bind pose is Z up (HL2 humans, most props), so a posed model can sit in a
  different frame from its bind pose. Child bones keep Source's bone-local frames; only the root differs.
  The renderer resolves both in one place, `lib/tf2-game/render/model-axes.ts`: `modelFrame()` matches the
  bind bounds against `extras.source.hullMin/hullMax` over the 24 axis rotations, `animatedFrame()`
  compares the root bone's rotation at the start of an idle clip with its bind rotation (kept only when the
  idle's bones fit the hull better that way, `checkPosedFrame`: an HL2 / Portal view model's `ref` pose
  turns its arm 90° and the idle swings it back, which is animation, not a frame change), and every model
  (static props included) is placed with `sourceTransformToMatrix(origin, angles) · frame`. (Writing the
  root fix into `scene.extras` would let the converter state this instead.)

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

## Entity rendering

`lib/tf2-game/render/entities/` draws everything that is not the map, from plain per-entity state —
`{ id, type: <net schema type>, fields: <the schema's field names>, origin?, angles? }` — so the client's
snapshot mirror and a single-player world feed it the same way, plus the simulation's events
(`index.ts` documents the per-frame calls: `beginFrame`, `sync`, `handleEvent`, `updateViewModel`,
`endFrame`, then the world, then `renderViewModel`).

- **Models** (`model-asset.ts`, `model-instance.ts`, `model-material.ts`): a `ModelLibrary` per game loads
  GLBs and anim packs by MDL path (it is also the world's static-prop `ModelProvider`); an instance clones
  the scene with its own skeleton, skin family, body groups and attachments, bone-merges weapons
  (`lib/tf2-loadout/bone-merge.ts`), and shades with VertexLitGeneric terms in linear space: the leaf
  ambient cube, the sun and up to two local world lights vrad left out of the cubes, half-Lambert through a
  lightwarp stand-in, phong and rim light per material extras, alpha test / translucency / additive,
  per-instance tint, screen-door fade and a noise dissolve (cloak). Untextured materials (a dedicated
  server install) draw their team colour.
- **Animation** (`animator.ts`): bone_setup.cpp's AccumulatePose over the clips — blend grids with pose
  keys, autolayers (aim matrices), weightlists, delta layers, gesture slots, a main-sequence cross-fade,
  autoplay sequences and events (footsteps).
- **Players** (`player-anim-state.ts`, `player-renderer.ts`): CMultiPlayerAnimState + CTFPlayerAnimState
  over the networked record (activity selection, the weapon acttables, 9-way move blend, feet-yaw lag,
  `animEvent` gestures), team / über skins, cloak, disguises, crit glow, burning, death sequences, gibs and
  corpses.
- **View model** (`viewmodel.ts`): arms + c_model, the weapon's `vmActivity` → item `vmActivities` → arms
  sequence, TF weapon bob (no lag: `cl_wpn_sway_interp` 0), `viewmodel_fov` 54 in its own pass.
  `sp-viewmodel.ts` draws a single-player `v_` model the same way (Portal's `v_portalgun` from the model
  channel: ACT_VM_IDLE, ACT_VM_PRIMARYATTACK on either portal); nothing until it loads, nothing if the
  channel lacks it.
- **Objects** (`objects.ts`): projectiles and trails, buildings (blueprints, construction, sentry aim pose
  parameters and muzzle flashes, damage smoke, teleporter effects), pickups, the flag, `prop` / `entity`
  models with their sequence, `info_particle_system`.
- **Effects** (`effects.ts`): the game particle bundles (pooled, ≤ 64 live systems, LOD at 3000 units, soft
  particles and refraction off), instanced tracers and ring-buffer decals, gibs.
- **Items** (`loadout-models.ts`): unlock weapons and cosmetics from the loadout model channel — see
  [Items and loadouts](#items-and-loadouts).

The render harness shoots entity scenes too: `shoot.ts --scenes scripts/tf2-game/render-harness/entity-scenes.json`
(regenerate it with `entity-scenes.py`). With `--loadout <dir>` players wear their `items` (the `loadout-*`
scenes): `<dir>/catalog.json`, `<dir>/models/*.glb` from `scripts/tf2-assets/convert.py` and
`<dir>/particles/manifest.json` + effect bundles.
