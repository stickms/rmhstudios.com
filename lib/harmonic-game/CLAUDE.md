# CLAUDE.md — lib/harmonic-game

**Harmonic** is an original, open-source, single-player story shooter that runs on
the site's clean-room browser Source engine (`lib/tf2-game/` + `lib/sp-game/`). All
of its content is original and in-repo; never use names, text or assets from any
other game or franchise.

## Authority

The plan in [`docs/plans/harmonic/`](../../docs/plans/harmonic/README.md) is
authoritative (decisions D1–D9 in its README win over the other files).
[`STATUS.md`](../../docs/plans/harmonic/STATUS.md) is the ledger: claim a work
package there, keep your row current, and change the plan in the same commit if
the spec is wrong.

## Module map (architecture.md §2)

| Path         | What                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| `index.ts`   | Public entry (re-exports).                                              |
| `levels/`    | One `LevelSource` per chapter + `dev_box.ts`.                           |
| `compiler/`  | LevelSource DSL → in-memory `BspFile` (brushes, kd-tree, bevels).       |
| `assets/`    | Procedural textures, materials, models, the `SpAssets` implementation.  |
| `sim/`       | Harmonic-only entities and services: weapons, damage, phase, enemies.   |
| `narrative/` | Dialogue/subtitle runner, radio, chapter flags, endings.                |
| `audio/`     | Synthesised sound bank (`recipes`→`dsp`→`synth`), beds, music, `HarmonicSoundEvent` bus (`events.ts`), `player.ts`. |
| `client/`    | Client wiring, view model renderer, HUD adapter, save slots.            |

React lives in `components/harmonic-game/`, the route in `app/routes/harmonic.tsx`,
strings in `locales/en/harmonic.json` (namespace `harmonic`).

## Conventions

- Source units (inches), Z up; the simulation tick is 0.015 s.
- Deterministic: no `Math.random()` or wall-clock time in sim/compiler; use the seeded RNG.
- `compiler/`, `sim/`, `levels/` and the pure parts of `assets/` are
  environment-agnostic: no DOM, no `window`, no canvas. They must run under Node tests.
- Original content only (plan D1). Levels, meshes, textures and audio are generated from TypeScript.
- Every user-facing string goes through `t('harmonic:…', { defaultValue })`.
- Tests are colocated (`*.test.ts`) and run with `pnpm test:tf2 lib/harmonic-game`.
- The game's content is additionally offered under CC BY-SA 4.0 (`LICENSE-CONTENT.md`).
