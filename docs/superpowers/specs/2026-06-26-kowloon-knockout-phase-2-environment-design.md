# Kowloon Knockout — Phase 2: Environment Overhaul

**Date:** 2026-06-26
**Status:** Design approved, pending implementation
**Branch:** `kowloon-phase-2-environment` (Phase 0+1 merged to `main`)

## Goal

Turn the procedural neon-Kowloon backdrop into a wet reflective, atmospheric, animated,
deep cityscape — all tier-gated. Builds directly on the Phase 0+1 WebGPU/TSL render
path that is now merged and browser-verified working. Combat sim, networking, input,
and HUD remain untouched.

## Current state (baseline, post Phase 0+1)

- **Renderer:** `WebGPURenderer` + TSL node materials active on the
  `kowloon-graphics-overhaul` branch; WebGL2 fallback backend in place.
- **Tier system:** `useRenderTier()` + `TIER_FLAGS` live at
  `lib/kowloon-knockout/render/tier.ts`. Current flags: `bloom`, `gtao`, `ssr`,
  `volumetrics`, `shadowMapSize`, `gpuParticles`.
- **Materials:** centralized in `materials.ts`; all meshes use node materials
  (`MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`).
- **Post-processing:** `PostFx.tsx` — bloom + tonemapping + GTAO pipeline.
- **Lighting:** `Lighting.tsx` — rebuilt PBR keyed + neon emitters + IBL.
- **Environment:** `Environment.tsx` at 108 lines — arena floor, rings, posts,
  towers, and sign strips all in one file. No planar reflection, no volumetric
  atmosphere, no animated signage.
- **TSL availability (confirmed against three@0.183.2):**
  - `three/tsl` exports `reflector()`, `time`, `oscSine`, `mrt`, `texture`.
  - `three/webgpu` exports `InstancedMesh`.
  - The legacy WebGL `Reflector` class is **not** present in `three/webgpu`; the TSL
    `reflector()` node is the correct path.

## Locked decisions

1. All four subsystems build on the existing WebGPU/TSL path; no renderer changes.
2. Tier flags `ssr` and `volumetrics` are renamed to `reflection` and `atmosphere`
   for honest semantics. The rename propagates through `tier.ts` (type, `TIER_FLAGS`,
   and the existing tier tests), `PostFx.tsx`, and any other read sites.
3. `Environment.tsx` is refactored to the arena stage only (floor + rings + posts).
   Towers and signs are extracted to the new `Skyline.tsx`. The arena stage's current
   visual output at `low` tier must be regression-free after the extraction.
4. All geometry remains procedural. No texture files, no HDRI, no GLB props.
5. Planar reflection is ultra-only (it re-renders the scene); lower tiers keep the
   existing IBL/metalness fake reflection already provided by Phase 1.

## Architecture principles

- **Four new files, two renamed flags.** The entire phase is additive; nothing
  outside the arena render layer is touched.
- **Pure generators are unit-testable.** Layout and animation-param logic lives in
  side-effect-free functions under `lib/kowloon-knockout/render/` so tests can run in
  a plain Node environment without a canvas or renderer.
- **Parallel worktree development.** The four subsystems are largely independent and
  can be built by four subagent worktrees simultaneously. Each goes through a
  `senior-swe-reviewer` gate before its PR merges.
- **Tier-gating is the safety valve.** Expensive techniques (planar reflection, light
  shafts) are unreachable at lower tiers; users without WebGPU or on mobile never pay
  for them.

## File structure changes

```
components/kowloon-knockout/arena/
  Environment.tsx          — KEEP, but trimmed to arena stage only
                             (floor + rings + posts; floor gains planar reflection)
  Skyline.tsx              — NEW: instanced layered cityscape + animated signage
  Atmosphere.tsx           — NEW: light shafts + ground haze

lib/kowloon-knockout/render/
  tier.ts                  — rename ssr→reflection, volumetrics→atmosphere
  skyline.ts               — NEW: deterministic layout generator (pure, TDD)
  signage.ts               — NEW: per-sign animation-param generator (pure, TDD)
  __tests__/
    tier.test.ts           — UPDATE: reflect renamed flags
    skyline.test.ts        — NEW
    signage.test.ts        — NEW
```

## Subsystem 1 — Planar reflection (wet floor)

**What it does:** Makes the arena floor read as a wet rooftop, catching the neon
emitters as shimmering reflections.

**Implementation:**
- Use the TSL `reflector()` node from `three/tsl` to create a planar reflection
  mirrored across the floor plane (Y = 0).
- Mix the reflector output into the floor's `MeshStandardNodeMaterial` via a Fresnel
  term: grazing angles receive strong reflection, normal-incidence receives little.
  Add a wet-roughness term so the floor reads as damp concrete rather than a mirror.
- Configure the reflector to exclude the floor mesh itself (no recursion).
- The reflector re-renders the scene from the mirrored camera; this is the most
  expensive technique in Phase 2. **Gate strictly to `flags.reflection` (ultra only).**
- At high/medium/low tiers, the floor retains the Phase 1 IBL metalness fake —
  no regression, no new code needed below ultra.

**Tier:** `reflection` flag — ultra only.

**Seams:** `Environment.tsx` floor mesh, `TIER_FLAGS.reflection`, `materials.ts`.

## Subsystem 2 — Atmosphere (light shafts + ground haze)

**What it does:** Gives the arena a humid, neon-drenched air — slanted light cones
bleeding down from the sign clusters, and a low ground haze that thickens toward
the floor.

**Implementation:**
- **Light shafts:** 4–6 additive soft-edged cone or quad meshes, positioned beneath
  the brightest neon emitters in the scene, tinted to each emitter's color. Blending
  mode: additive. Opacity kept deliberately low — subtle is better. Animated via TSL
  `time` + `oscSine`: slow sway on the lean axis, gentle flicker on opacity. Both
  sway speed and flicker rate are per-shaft constants so the movement is not
  synchronized.
- **Ground haze:** 1–2 large horizontal planes near the floor, rendered with a TSL
  scrolling soft-noise alpha mask (dense at the base, fading upward). Neon-tinted
  (warm pink/cyan). The scroll is driven by `time` so it drifts continuously.
- Both effects live in `Atmosphere.tsx` and are unmounted when `flags.atmosphere` is
  false. Medium/low tiers keep the existing `<fog>` already present in the scene.

**Tier:** `atmosphere` flag — ultra and high.

**Seams:** `Atmosphere.tsx` (new), `TIER_FLAGS.atmosphere`, `PostFx.tsx` (no
changes needed — fog stays on the scene regardless).

## Subsystem 3 — Animated neon signage

**What it does:** Brings the sign strips and tower emissives to life with per-element
flicker, hue cycling, and occasional dead-sign dropout — cheap enough to run on all
tiers.

**Implementation:**
- A pure helper `lib/kowloon-knockout/render/signage.ts` generates per-sign animation
  params: random phase offset, oscillation speed, pattern type (pulse / scroll /
  dropout), and a low-frequency hash gate for the dead-sign effect. Input is a
  deterministic seed (sign index); output is a plain object. No renderer imports.
- In `Skyline.tsx`, these params drive TSL material expressions on each sign's
  `MeshBasicNodeMaterial`: `oscSine(time.add(phase)).mul(speed)` on
  `emissiveIntensity`; scrolling hue via a remapped `time` term on the color node;
  the hash gate occasionally clamps intensity to zero (dead sign).
- The existing sign geometry in `Environment.tsx` is extracted to `Skyline.tsx` as
  part of the refactor; the animation layer is added there.
- Cost: pure node graph evaluation in the TSL compiler — no per-frame JS work, no
  additional draw calls.

**Tier:** all tiers (the TSL graph is always compiled; it is not an expensive path).
At `low`, the WebGL2 TSL fallback evaluates the same graph so flickering works there
too.

**Seams:** `signage.ts` (new), `Skyline.tsx` (new), sign meshes migrated from
`Environment.tsx`.

## Subsystem 4 — Layered instanced cityscape (skyline)

**What it does:** Replaces the flat ring of towers with a multi-depth instanced
skyline that creates parallax as the camera dollies and gives the arena a sense of
being embedded in a living mega-city.

**Implementation:**
- A pure helper `lib/kowloon-knockout/render/skyline.ts` takes a seed and a layer
  count, and returns a deterministic array of instance transforms
  (position/scale/color) for each layer. Near/mid/far rings have increasing radius,
  increasing building count, and increasing fog-fade weight. No renderer imports;
  fully unit-testable.
- In `Skyline.tsx`, each depth layer is a single `InstancedMesh` (from
  `three/webgpu`), fed by the layout generator. Far layers are rendered darker and
  with higher fog blend to simulate atmospheric depth — no per-layer fog object, just
  a color-lerp applied to the instance colors during layout generation.
- **Procedural windows:** at ultra/high tiers, tower face UVs drive a TSL grid
  pattern (modulo-based, no texture file) with per-window flicker via a hash of
  instance index + window index fed into `oscSine(time)`. At medium/low, window
  animation is skipped; the tower faces are solid emissive.
- Towers and signs from `Environment.tsx` are moved here; the low-tier path renders
  them identically to their current appearance (regression check).

**Layer counts by tier:**
- Ultra: 3 layers (near + mid + far) + procedural animated windows
- High: 2 layers (near + mid) + procedural animated windows
- Medium: 1–2 layers, no window animation
- Low: current static tower arrangement (no instanced expansion)

**Seams:** `skyline.ts` (new), `Skyline.tsx` (new), `InstancedMesh` from
`three/webgpu`, towers/signs extracted from `Environment.tsx`.

## Tier matrix

| Tier   | `reflection`         | `atmosphere`       | Sign animation | Skyline                      |
|--------|----------------------|--------------------|----------------|------------------------------|
| ultra  | Planar (reflector()) | Shafts + haze      | Yes            | 3 layers + animated windows  |
| high   | IBL/metalness fake   | Shafts + haze      | Yes            | 2 layers + animated windows  |
| medium | None                 | None (`<fog>` only) | Yes           | 1–2 layers, no windows       |
| low    | None                 | None (`<fog>` only) | Yes (cheap)   | Current static towers        |

## Testing

**Unit tests (node-env, TDD):**
- `skyline.test.ts` — given a seed and layer count, assert instance count per layer,
  that far-layer colors are darker than near-layer colors, and that the output is
  deterministic (same seed → same output).
- `signage.test.ts` — given a sign index, assert the returned params are in valid
  ranges (phase 0–2π, speed > 0, pattern is a known enum value), and that different
  indices produce different phases.
- `tier.test.ts` — update existing tests to use renamed flags (`reflection`,
  `atmosphere`); confirm `ultra` has both true, `high` has `atmosphere` true and
  `reflection` false, `medium`/`low` have both false.

**Visual sign-off (browser):**
- Planar reflection correctly mirrors neon emitters at ultra; no mirror artifact at
  high/medium/low.
- Atmosphere effects are subtle and do not overpower the combat readability.
- Sign animation is visible but not distracting; dead-sign dropout occurs
  occasionally across the sign population.
- Skyline layers show clear depth progression; parallax is visible when the in-game
  camera dollies.
- Low tier visually matches current main-branch appearance (regression check before
  each subsystem PR merges).

**Multiplayer smoke test:** host + guest session after all four subsystems merge, to
confirm sim/net unaffected.

## Risks & mitigations

1. **Planar reflector cost / recursion.** The reflector re-renders the full scene.
   Mitigation: ultra-only gate, and configure the reflector to exclude itself
   (prevents infinite recursion). If frame budget is still tight in sign-off,
   reduce reflector resolution before widening the tier gate.
2. **Light-shaft meshes look fake if overdone.** Additive overlapping quads are
   prone to appearing as obvious geometry. Mitigation: keep opacity low, tune during
   browser sign-off with the senior-swe-reviewer gate as a check. Err on the side of
   subtlety.
3. **TSL `reflector()` R3F wiring is new territory.** No prior precedent in this
   codebase. Mitigation: confirm the reflector node round-trips through R3F's
   `frameloop` correctly in an isolated browser test before building the full floor
   material around it. This is the first thing built in Subsystem 1.
4. **Extracting towers/signs from `Environment.tsx` must not break `low` tier.**
   Visual regression is silent (no screenshot diffing CI). Mitigation: explicit
   before/after browser comparison at `low` tier is a merge prerequisite for
   Subsystem 4's PR.
5. **`InstancedMesh` instance counts at ultra.** Three depth layers with many towers
   each could stress fill rate on some GPUs even at ultra. Mitigation: cap per-layer
   instance count conservatively in `skyline.ts`; tune in sign-off.
6. **Renamed flags break existing read sites.** `ssr` and `volumetrics` may be read
   in `PostFx.tsx` or elsewhere. Mitigation: the flag-rename is a single contained
   commit (`tier.ts` + all read sites + tests); TypeScript will catch any missed
   references at build time.

## Out of scope

- Combat sim, networking, input, lobby, HUD — untouched by design.
- Real texture files, HDRIs, or artist-authored sign artwork (all geometry and
  patterns remain procedural).
- Skeletal character rendering (Phase 4).
- GPU compute particles (Phase 3).
- Adaptive FPS governor and the settings panel for manual tier override (Phase 5).
- Any changes to `PostFx.tsx` post-processing passes (bloom, GTAO, tonemapping
  remain as shipped in Phase 1).
