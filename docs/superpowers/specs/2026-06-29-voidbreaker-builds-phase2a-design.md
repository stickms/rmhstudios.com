# Void Breaker — Phase 2a (Builds & Weapons) Design

**Date:** 2026-06-29
**Status:** Approved for implementation
**Owner:** ka1kqi
**Parent roadmap:** `docs/superpowers/specs/2026-06-28-voidbreaker-feel-phase1-design.md` (the 3-phase "premium roguelite" overhaul: Feel → Content → Story)

## Context

Phase 1 (Feel) is merged (PR #318). Phase 2 (Content) is the "10 hours of content" push. In a
roguelite, hours come from **replay depth**, not linear levels — so Phase 2 decomposes into three
sub-phases, confirmed order **Builds → Enemies → Biomes**, each with its own spec → plan → build.

This spec is **sub-phase 2a: Builds & Weapons** — the single biggest replayability lever. Today
Void Breaker has exactly **one** weapon (an auto-firing blaster in `firePlayerProj`) and a 15-card
upgrade pool feeding a `PlayerStats` block (`lib/void-breaker/upgrades.ts`). 2a turns that into
**multiple distinct weapons × a synergistic upgrade pool that forms recognizable build archetypes**
(crit, pierce, AoE/detonate, lifesteal-tank, orbital/chain).

### Decisions locked in brainstorming
- **Weapon acquisition:** pick one at run start (like Hades); unlocked permanently with Void Cores.
  No mid-run weapon swaps.
- **Ambition:** bold — **5 weapons** + **~13 new upgrades including build-defining transformers**.

### Non-goals (2a scope discipline)
- No mid-run weapon swaps/drops (pick-at-start only).
- No new enemies, bosses, or biomes (those are 2b / 2c).
- No charge-hold input mechanic — the Railgun auto-fires slowly instead of charging.
- No sustained/continuous beam weapon — the Arc Coil chains via discrete projectiles.
- No gameplay regressions to Phase 1 feel or existing balance guarantees.

## Architecture

**New file `lib/void-breaker/weapons.ts`** — pure, engine-free, unit-testable data, mirroring the
`characters.ts` pattern:
- `WeaponId` union, `WeaponDef` interface, `WEAPONS: WeaponDef[]`, `getWeapon(id)`, `isWeaponId(v)`.
- A `WeaponDef` carries: id, name, title, description, icon, color, `unlockCost`, base combat stats
  (base fire interval, base damage, base projectile speed/radius/life), and a **data-driven `fire`
  descriptor**: `{ mode: FireMode, ...params }`.
- `FireMode = 'single' | 'spread' | 'railgun' | 'lob' | 'arc'`. The engine's `firePlayerProj`
  switches on `mode` and reads the params; `weapons.ts` never imports the engine (no circular dep).

**Engine integration (`lib/void-breaker/game.ts`):**
- New field `weapon: WeaponDef` (set by the component before `startGame`, default Pulse Blaster),
  reset in `startGame`. Mirrors the existing `character` field.
- `firePlayerProj` is refactored from a hardcoded single-shot into a dispatcher over the weapon's
  `fire.mode`. Base weapon stats set the projectile's damage/speed/life/radius; **`PlayerStats`
  multipliers still stack on top** (so `fireRateMult`, `projectileCount`, `pierce`, `damageBonus`,
  `critChance`, etc. apply to every weapon).
- The fire-interval gate (`player.fireTimer` / `player.fireRate`) now derives its base from the
  weapon's base interval × `stats.fireRateMult` × character `fireRateMult`.

**Transformer behaviors** live in the projectile system. New `Projectile` fields (all default
inert so existing code is unaffected): `bounces: number` (ricochet hops left), `chains: number`
(chain-lightning arcs left), `explodeOnHit: boolean` + `explodeRadius: number`, `homing: number`
(turn rate, 0 = none). `updateProjectiles` / `checkPlayerHits` apply them on hit. A player-side
`explodePlayerBomb(p)` mirrors the enemy `explodeBomb` but damages enemies (used by the Grenade
Launcher and Explosive Rounds).

**`PlayerStats` extensions** (in `upgrades.ts`, all default to the inert value so existing balance
is unchanged): `bounceCount`, `chainCount`, `explodeOnHit` (bool) + `explodeRadius`, `homingTurn`,
`orbitalCount`, `overchargeEvery` (0 = off). `firePlayerProj` reads these to stamp the new
`Projectile` flags; orbitals are maintained as a small owned set updated each frame.

## The 5 weapons

| Weapon | FireMode | Feel | Reuses / new |
|---|---|---|---|
| **Pulse Blaster** | `single` | Current rapid single shot. Free default, baseline TTK. | existing path |
| **Scattergun** | `spread` | Short-range cone of ~5 pellets; big burst, slow fire, short `life`. | spread + life params |
| **Railgun** | `railgun` | Slow, heavy, fast round that pierces all (`pierce = 999`). Crit/pierce darling. | high damage + pierce |
| **Grenade Launcher** | `lob` | Lobs fused AoE bombs. | existing `Projectile.fuse`/`blastRadius` + new `explodePlayerBomb` |
| **Arc Coil** | `arc` | Bolts that chain to nearby enemies on hit. | new `chains` projectile field |

Weapon balance baselines (DPS-comparable at run start, differentiated by range/risk/AoE) are tuned
in M3 via the balance-sim. Each weapon's base stats live in its `WeaponDef`.

## Upgrades (pool 15 → ~28)

Added to `UPGRADE_DEFS` in `upgrades.ts`. Two groups:

**Stat synergy fillers (~7, common/rare)** — round out archetypes so picks feel build-coherent:
e.g. more crit, AoE, lifesteal, projectile-speed/count, fire-rate, detonate scaling. Each mutates
an existing or new `PlayerStats` field via its `apply`.

**Transformer upgrades (~6, rare, usually `maxStacks: 1`)** — build-defining, set a `PlayerStats`
transformer field that `firePlayerProj` stamps onto projectiles:
- **Ricochet** — bullets bounce to a new target after a hit (`bounceCount`).
- **Chain Lightning** — hits arc to nearby enemies (`chainCount`); supercharges Arc Coil.
- **Explosive Rounds** — bullets blast on impact (`explodeOnHit` + `explodeRadius`).
- **Homing** — bullets curve toward the nearest enemy (`homingTurn`).
- **Orbitals** — gain orbiting blades that damage on contact (`orbitalCount`).
- **Overcharge** — every Nth shot is empowered (guaranteed crit + bonus damage) (`overchargeEvery`).

`rollUpgradeChoices` is unchanged in shape; transformers use the existing `rare` weighting (boss
rewards bias toward them). Optional light `synergy` tag on `UpgradeDef` for UI hinting only — not
required for the roll logic (YAGNI: tags drive display, nothing else).

## Meta-progression & UI

- **Unlocks:** Pulse Blaster free; the other four cost 50–120 Void Cores. Reuse the character
  unlock pattern in `metaProgression.ts` (the persisted `unlocked` set + helpers) generalized or
  duplicated for weapons. Persist the selected weapon id alongside the selected character.
- **Weapon picker UI:** a selector on the menu beside the character picker in `VoidBreakerUI.tsx`,
  mirroring that component — shows each weapon's icon/name/description, lock state + cost, and lets
  an affordable locked weapon be unlocked + selected. Reduced-motion friendly (Phase 1 conventions).

## Testing & balance

- **`lib/__tests__/void-breaker-weapons.test.ts`** — weapon data integrity (ids unique, default
  free, costs sane), `getWeapon`/`isWeaponId`, and that each `fire.mode` spawns the expected
  projectile shape (pellet count, pierce, fuse, chain flags) via a headless engine.
- **Transformer engine tests** (extend the feel/engine suite): ricochet retargets to a second
  enemy, chain arcs to a nearby enemy, explosive deals AoE, homing curves toward a target,
  overcharge empowers the Nth shot. All deterministic via the existing `isolate`/`placeEnemy`
  helpers.
- **Balance sim:** add a `--weapon=<id>` (or positional) option to
  `scripts/void-breaker-balance-sim.ts` so the kiting bot runs each weapon. Acceptance: every
  weapon reaches a median wave in a sane band (no weapon dead-on-arrival, none trivially dominant).
  The bot keeps `headless = true` (Phase 1 contract).
- Existing 54 Void Breaker tests stay green; the 8 pre-existing unrelated i18n failures are out of
  scope.

## Implementation milestones (each a shippable plan-section)

- **M1 — Weapon system foundation:** `weapons.ts`; refactor `firePlayerProj` to a data-driven
  dispatcher; the 5 weapons; engine `weapon` field + reset; selection plumbing + Void-Core unlock;
  `weapons.test.ts`. Existing single-shot behavior preserved when weapon = Pulse Blaster (proven by
  unchanged sim numbers for that weapon).
- **M2 — Transformer upgrades:** new `Projectile`/`PlayerStats` fields; bounce/chain/explosive/
  homing/orbital/overcharge behaviors; `explodePlayerBomb`; the ~13 new upgrade defs; engine tests.
- **M3 — UI & balance:** weapon-picker UI; synergy tag hints; `--weapon` sim option; cross-weapon
  balance tuning; manual browser playtest checkpoint.

## Risks

- **Balance blowups** from transformers (chain + explosive + multishot could cascade). Mitigation:
  per-projectile hop/arc caps, the balance-sim per-weapon gate, conservative default magnitudes.
- **`firePlayerProj` refactor regressions.** Mitigation: Pulse Blaster must produce identical
  behavior to today (sim parity check in M1).
- **Performance** from orbitals/chains/explosions spawning many projectiles/particles. Mitigation:
  reuse the fixed object pools (`MAX_PROJECTILES`, `MAX_PARTICLES`); cap counts; honor `reducedFx`.
