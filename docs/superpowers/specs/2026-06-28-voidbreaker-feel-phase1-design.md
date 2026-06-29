# Void Breaker — "Premium Roguelite" Overhaul

**Date:** 2026-06-28
**Status:** Phase 1 approved for implementation
**Owner:** ka1kqi

## Context & North Star

Void Breaker is a TypeScript arcade roguelite shooter (~9,800 lines) in the RMH Studios
games monorepo. It has a dual 2D-canvas / 3D-three.js renderer with bloom + post-processing,
procedural WebAudio, 40 waves across 3 maps, 11 enemy types, 8 bosses, 15 roguelite upgrades,
4 playable characters, 5 run modifiers, meta-progression (Void Cores / Void Forge), and a
scripted 40-wave story. A full run is ~10–20 minutes.

The stated goal is to make the game "rival GTA6" with "10 hours of content," "insane graphics
and animations," and "Destiny 2 / Bungie-level writing."

### Honest scope boundary

A browser-based TypeScript arcade shooter cannot literally rival GTA6 (a ~$1–2B, 1000+ person,
~7-year AAA production). We do not pretend otherwise. Instead we target the realistic and
genuinely excellent north star for this medium:

> **Hades / Returnal / Dead Cells tier** — enormous replay depth, exceptional game-feel, and
> genuinely great writing. Premium feel in a web game; we compete on craft and depth, not budget.

**Non-goals:** photoreal rendering, open world, full voice acting / mocap, literal AAA parity.

## The Roadmap (3 phases)

Each phase gets its own spec → plan → autonomous-harness build (with parallel agents on
independent units) → balance-sim + tests + review → checkpoint → next phase.

| Phase | Theme | Headline scope |
|---|---|---|
| **1. Feel** | Game-feel & animation polish | Hitstop, trauma-based shake, enemy spawn/death animations, weapon-specific feedback, impact VFX layering, juicier UI/menus, signature "wow" moments + synced audio. Builds on the existing renderer — no rebuild. |
| **2. Content** | Depth for 10+ hours | The big "10 hours" lever: many more enemies, new bosses w/ unique mechanics, new biomes/maps, a much larger upgrade pool with real build archetypes/synergies, weapon variety, deeper meta-progression, daily/challenge modes. Will be **decomposed into sub-phases** (2a enemies/bosses, 2b biomes, 2c builds/economy). |
| **3. Story** | Bungie-tier writing | A real campaign: world bible, character arcs, branching/reactive dialogue, cinematic between-wave beats, and a Grimoire/lore-collectible system. Lands on top of a deep, polished game. |

**Order:** Feel → Content → Story (confirmed). Rationale: each phase stands on a more premium
base than the last. Graphics are already in a good spot, so Phase 1 is *targeted polish that
multiplies what exists*, not a renderer rebuild.

---

# Phase 1: Game-Feel & Animation Polish

## Goal

Take combat from "fun" to "premium-feeling" without adding gameplay mechanics or content.
Every impactful action should feel weighty, readable, and satisfying.

## Core Architecture: the "feel layer"

Add a thin, renderer-agnostic **feel layer** in the engine. The engine decides *what*
impactful thing happened and *how hard* (a weighted intensity); the renderers decide *how to
show it*. This keeps the 2D and 3D renderers in visual sync, keeps the simulation deterministic
and headless-testable, and isolates "feel" from "rules."

Concretely:
- A small amount of new engine state (e.g. `hitstopTimer`, a trauma accumulator, per-entity
  animation phase/lifecycle fields, queued "impact" descriptors) surfaced on `GameState` /
  entity records.
- `VoidBreakerEngine.update(dt, input)` consumes hitstop by scaling the simulation `dt`; trauma
  decays each frame; spawn/death animation lifecycles advance.
- Both `renderer.ts` (2D) and `renderer3d.ts` (3D) read this state and visualize it. Neither
  renderer owns timing — they are pure visualizers of engine state.
- Audio (`audio.ts`) impact events are emitted by the engine in sync with the same beats.

**Headless-safety:** hitstop and animation timing must be a no-op (or fully fast-forwarded) on
the sim path so `scripts/void-breaker-balance-sim.ts` still completes and balance numbers are
unaffected. The feel layer changes presentation timing, never gameplay outcomes.

## The seven workstreams (parallel-agent units)

These are intentionally independent so they can be fanned out to parallel agents inside the
harness. Shared engine state changes (workstream 1 & 2) land first as a foundation; 3–7 build on it.

### 1. Hitstop / impact freeze *(engine)*
Micro time-freeze (scaled `dt`, typically a few frames) on high-impact events: crits, kills,
detonations, boss hits, and player-taking-damage. Duration is trauma-weighted (bigger hit =
longer freeze, capped). Drives a brief pause that both renderers and audio respect.
**No-op on the headless sim path.**

### 2. Trauma-based screen shake *(engine + both renderers)*
Replace flat shake with a directional **trauma model**: trauma is a 0–1 accumulator that decays
over time; shake magnitude = trauma² (or similar) so small events barely register and big ones
slam. Events add weighted trauma (boss stomp ≫ pistol shot). Renderers translate trauma into
camera/canvas offset + rotation. Respects the existing Reduced Effects accessibility option.

### 3. Enemy spawn & death animations *(engine + both renderers)*
- **Spawn:** a brief warp-in telegraph (scale/fade/distort) before the enemy becomes active, so
  enemies don't pop in.
- **Death:** a shatter / dissolve / implode sequence instead of instant despawn, with
  per-enemy-type flavor (e.g. tank crumbles, splitter bursts, hive collapses). Death state is a
  lifecycle on the enemy record so the object pool only frees the slot after the animation ends.

### 4. Weapon & projectile feel *(engine + renderers)*
Recoil / kickback on fire, muzzle variety, tracer + impact-spark polish, and making distinct
builds *look* distinct (multishot fan spread, piercing as a beam-like trail, high-caliber as
heavy slow rounds). Driven by `PlayerStats` so visuals track the player's current build.

### 5. Impact VFX layering *(renderers)*
Directional hit sparks, void-splatter on impact, kill bursts, escalating combo visuals, and
damage-number polish (crit emphasis, color tiers, motion). Pure presentation on top of existing
particle/popup systems.

### 6. UI / menu juice *(components)*
Upgrade-card reveal animation, wave-clear celebration, animated boss intro cards, combo/surge
HUD escalation, and menu/transition polish in `VoidBreakerUI.tsx` / `VoidBreakerGame.tsx`.

### 7. Signature moments + audio sync *(engine + renderers + audio)*
Boss-death slow-mo + screen flash, surge-mode visual takeover, big-detonation cinematic, biome
entrance flourish. Layered/synced procedural audio (`audio.ts`) so every beat above has matching
sound. Reuses the hitstop + trauma primitives from workstreams 1–2.

## Quality gates

- Existing Vitest suite (`lib/__tests__/void-breaker-*.test.ts`) stays green.
- New engine-level tests for the deterministic parts of the feel layer: hitstop dt-scaling,
  trauma accumulation/decay, death-animation lifecycle (spawn → active → dying → freed).
- `scripts/void-breaker-balance-sim.ts` still completes and produces materially unchanged
  balance numbers (proves the feel layer is presentation-only).
- Manual browser playtest checkpoint at the end of the phase (both 2D and 3D renderers; with and
  without Reduced Effects).

## Scope discipline (YAGNI)

- No new gameplay mechanics, no new content (enemies, bosses, upgrades, maps) — that is Phase 2.
- No renderer rewrite; build on the existing 2D + 3D renderers.
- If a "feel" idea turns into a mechanic (changes outcomes, not just presentation), it moves to
  Phase 2 instead of expanding Phase 1.

## Working mode

Autonomous Plan → Sprint → Evaluate harness, with parallel agents fanning out the independent
workstreams (3–7) once the shared foundation (1–2) is in place. Review checkpoint with the user
before moving to Phase 2.
