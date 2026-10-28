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
| `server/socket-server/handlers/tf2-game.ts` | Room manager on the hub. Each match runs in a `worker_threads` worker (`lib/tf2-game/server/match-worker.ts`) so the hub's event loop never simulates.            |
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

## Tests

The game's tests are their own suite, `pnpm test:tf2` (`vitest.tf2.config.ts`),
because the main suite is scoped to mission-critical code (see
[testing](testing.md)). Tests that need real game files read them from
`TF2_ROOT` (a Steam install) and skip when it is unset.
