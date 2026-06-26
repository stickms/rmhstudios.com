# Kowloon Knockout — Phase 3: GPU Compute Particles — Design Spec

> Date: 2026-06-26. Phase 3 of the multi-phase Kowloon Knockout graphics overhaul (see `2026-06-25-kowloon-knockout-graphics-overhaul-design.md`). Builds on the merged Phase 0+1 (WebGPU/TSL render path, tiers, post) and Phase 2 (environment: reflective floor, atmosphere, layered skyline).

## Goal

Make the arena **beautiful** — a dense, atmospheric cyberpunk night-city mood — by adding a particle layer the current 260-instance CPU pool can't reach: **ambient neon rain + drifting ground fog** at thousands of GPU-simulated particles, plus **dramatically beefed event bursts** (debris, smoke, lingering sparks, big KO blowouts). All tier-gated; the combat sim, networking, input, and HUD are untouched — the render layer only reads the per-frame snapshot and the FX event stream.

Beauty is the deliverable; **GPU compute is a means, used only where the richness demands it** (the high-count, always-on ambient layers). Event bursts stay on the proven CPU path.

## Scope

In scope:
- **Neon rain** (ambient): light drizzle streaking down, catching neon color, with a wet-floor splash fade that ties into the Phase 2 reflective floor.
- **Ground fog** (ambient): low drifting wisps curling on a flowing noise field. **Ambient drift only — NOT fighter-reactive** (rejected in brainstorm as high-risk / low-payoff at combat speed; a possible later add-on).
- **Beefed event bursts:** debris chunks with physics, expanding smoke puffs, lingering spark trails; KO produces a big blowout.
- Tier gating + graceful per-layer fallback; pure unit-tested generators.

Out of scope:
- `lib/kowloon-knockout/game/**`, `net/**`, `game/input.ts`, HUD, lobby — not edited.
- Fighter-reactive fog; cross-layer particle interaction; GPU-emitted bursts (see Escape Hatch).
- New assets: no textures, HDRIs, or GLBs. All geometry/sprites procedural (soft sprites via node-material radial alpha). three stays at `^0.183.2`.

## Architecture — Approach 2: layered per-effect passes

Chosen over a unified GPU engine (Approach 1) after an explicit risk review. **GPU compute is used only for rain + fog**; bursts stay on the CPU.

- Each ambient layer is its own small, self-contained TSL compute system: an `instancedArray` GPU **storage buffer**, a compute kernel dispatched via `renderer.computeAsync(...)` each frame, and a node material that reads the **same buffer** for instance position so data stays GPU-resident (no CPU round-trip).
- Ambient particles **procedurally recycle** (wrap-around) instead of emitting. This deliberately **avoids GPU emission / atomic counters** — the single most fragile TSL-under-R3F technique — which is what keeps these layers pure compute and low-risk.
- Event bursts stay on the **CPU instanced pool** (`Fx.tsx`), extended. Bursts are event-driven emission ("spawn N here, now"), bounded and momentary, which the CPU integrates at 60 fps without trouble — and which would otherwise force the risky GPU-emission path.

### Why this over the unified engine
Beauty lives in the ambient density, which both approaches deliver at the **same** quality (both are pure compute, both fill-rate-bound). The unified engine's only added capability is bigger burst spectacle (tens of thousands of GPU particles), bought with high-likelihood/high-cost emission-atomics work — and it does **not** remove the CPU fallback (WebGL2 has no compute shaders, so the CPU pool is required regardless). Layered passes also ship and fall back **independently**: a fog kernel bug can't take down rain or bursts.

## Components & boundaries

### Pure, headlessly-testable core — `lib/kowloon-knockout/render/particles/`
- `budget.ts` — `particleBudget(tier)` → `{ rain, fog, burstCap }`. The tier table as a pure function. Unit-tested.
- `seed.ts` — deterministic initial-state seeders: `seedRain(count, bounds)`, `seedFog(count, bounds)` → typed position/velocity arrays from a seeded PRNG (mulberry32, as in `skyline.ts`). Unit-tested: count, determinism, within-bounds.
- `burst.ts` — the burst **integration step** as a pure function `stepParticle(p, dt)` (gravity, floor-bounce for debris, drag for smoke, life decay). Unit-tested — this is what makes the beefed CPU bursts verifiable headlessly.

### Render layers — `components/kowloon-knockout/arena/`, each self-gating on tier (like `Atmosphere.tsx`)
- `Rain.tsx` — **compute** layer on ultra/high: storage buffer seeded by `seedRain`; kernel = fall + wind + wrap-to-top with a near-floor splash fade; drawn as thin additive instances reading the buffer. On **medium**, a cheap CPU instanced rain at a modest count; on **low**, renders nothing.
- `Fog.tsx` — **compute** layer on ultra/high only: storage buffer advected by a curl/flow-noise kernel; drawn as large soft additive sprites (radial alpha falloff in the node material — no texture). Nothing below high.
- `Fx.tsx` — the **existing CPU burst pool, extended**: cap raised from 260 to the tier `burstCap`; `debris` / `smoke` / `spark` behaviors routed by event kind (KO → big debris + smoke + sparks; hit → sparks + small debris; block → soft sparks). Runs on **all tiers**; integration delegates to `burst.stepParticle`.

All three mounted in `Arena3D.tsx` alongside the existing `<Fx/>`.

## Data flow

- **Ambient (rain/fog):** fully autonomous, no event input. Mount → seed buffer. Each frame: a `useFrame` writes a couple of uniform nodes (`dt`, `time`, `wind`) and calls `renderer.computeAsync(kernel)`; the node material draws from the buffer. Particles never die — they wrap/recycle. Per-frame JS ≈ 2 uniform writes + 1 dispatch per layer. Buffers + nodes disposed on unmount / tier change.
- **Bursts (CPU):** unchanged event path — `session.drainFx()` each frame → spawn into pool → `stepParticle` integrate → write instance matrices. Just more particle kinds and a higher cap.

## Fallback & safety

- **WebGPU-only guard:** compute layers are instantiated only when `flags.gpuParticles && backend === 'WebGPU'`. On WebGL2 they are never created, so no compute API is touched — same discipline as the Phase 2 reflector gate.
- **Per-layer try/catch** around compute setup (as PostFx does for GTAO): a compute failure disables that one layer and logs, rather than crashing the canvas or the sibling layers.
- **Tier matrix** (counts are tunable constants for browser sign-off — ship conservative, bump during SMOKE until dense without dropping frames):

| Tier | Rain | Fog | Burst cap | Path |
|------|------|-----|-----------|------|
| Ultra | ~8k | ~4k | ~1500 | compute rain+fog, rich CPU bursts, wet-floor splash |
| High | ~5k | ~2.5k | ~1000 | compute rain+fog, CPU bursts |
| Medium | ~2k | — | ~600 | CPU rain (no compute), no fog, modest bursts |
| Low / WebGL2 | — | — | ~300 | today's bursts only; today's look preserved |

## Performance characteristics

The compute simulation is nearly free; the real cost is **transparent-particle overdraw**, so quality is fill-rate-bound and tuned via counts/alpha/size per tier:
- **Rain (compute):** kernel is trivial (~ALU ops/particle); cost is screen-wide overdraw from additive depth-write-off streaks. Keep drops thin/small, cap per tier.
- **Fog (compute):** the most expensive thing in the feature — large, soft, overlapping low-alpha sprites = heavy overdraw. Use fewer/larger motes at low alpha, confine to a near-floor band, scale hard per tier, optionally render at half-res.
- **Bursts (CPU):** cost is the JS integration loop (linear in active particles) + per-frame instance-matrix upload; comfortable to ~1–1.5k live.

## Maximum-quality ceiling (acknowledged tradeoffs)

1. **Burst spectacle caps at ~1–1.5k CPU particles**, not tens of thousands — "very juicy," not "cinematic fountain." Mitigated by art (bigger/longer debris, smoke sprites that read as volume, trails) plus existing bloom + screen-shake.
2. **No cross-layer interaction** (debris can't kick up fog, etc.) — separate buffers. Irrelevant to this vibe.
3. **Several dispatches/draw calls** instead of one — negligible at these counts.

Ambient rain+fog density (the main goal) is **not** capped — it's pure compute, identical to what the unified engine would achieve.

## Escape hatch — migrating to Approach 1

If, after browser sign-off, the ~1.5k CPU burst cap makes KO/hit spectacle feel weak, **do not rewrite the whole feature.** Keep Approach 2's ambient layers and add a **single isolated GPU-emission burst pass** as a contained "Phase 3.5" — taking on the atomics/emission risk on its own, after the ambient beauty is already banked. Approach 1 (one shared buffer + one type-branching kernel + atomic emission) remains the fallback only if even that proves insufficient; its only advantage is burst count, and it carries the full emission-atomics risk while still needing the CPU pool for WebGL2.

## Testing

- **UNIT (Vitest, node env):** `budget.ts`, `seed.ts`, `burst.stepParticle` — counts, determinism, bounds, integration math (debris bounces, life decays to zero, smoke decelerates). Run via `node_modules/.bin/vitest run lib/kowloon-knockout/render`.
- **RUN-OBSERVE (deferred to user):** all compute/visual behavior — per-tier browser SMOKE: ultra (dense rain + drifting fog + juicy KO), medium (CPU rain only), low (unchanged), forced WebGL2 (no crash, bursts only). `eslint` is the headless gate.
- Per project workflow: every PR is preceded by a `senior-swe-reviewer` pass.

## Risks

- **TSL compute under R3F is novel here and browser-only verifiable.** Mitigation: layered/independent passes, procedural recycling (no atomics), per-layer try/catch, conservative initial counts, WebGPU-only instantiation.
- **Overdraw** is the perf cliff (esp. fog). Mitigation: tunable counts/alpha per tier, near-floor confinement, optional half-res fog.
- **Disposal leaks** on tier change. Mitigation: explicit buffer/node disposal in effect cleanup, as with the Phase 2 reflector.
