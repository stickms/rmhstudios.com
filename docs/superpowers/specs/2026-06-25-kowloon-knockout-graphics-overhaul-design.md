# Kowloon Knockout — WebGPU/TSL Graphics Overhaul

**Date:** 2026-06-25
**Status:** Design approved, pending implementation plan
**Branch:** `kowloon-graphics-overhaul`

## Goal

Revamp the rendering of Kowloon Knockout from its current deliberately-low-res
procedural look into a full high-fidelity, modern real-time presentation —
"pushing to the edge of the graphics we can achieve" — built on `WebGPURenderer`
+ TSL with automatic WebGL2 fallback, desktop-first with graceful degradation
tiers down to mobile.

## Current state (baseline)

- **Stack:** React Three Fiber `^9.6.1` + three.js `^0.183.2`, `WebGLRenderer`
  only. No WebGPU, no post-processing pipeline today.
- **Art style:** "3D pixel-art" = 100% procedural primitive geometry (cylinders,
  spheres, boxes, flat shading) rendered at half resolution (`dpr={0.5}`) and
  nearest-neighbour upscaled (`image-rendering: pixelated`). Zero asset files —
  no models, textures, or sprites.
- **Lighting:** flat ambient + hemisphere + one 1024² shadow-casting directional
  + two neon point lights.
- **Animation:** fully procedural / imperative limb rotations in `useFrame`; no
  skeletal rig or clips.
- **Particles:** a 260-instance CPU-driven `InstancedMesh` pool (`Fx.tsx`).
- **Sim/net:** deterministic fixed-timestep sim (`lib/kowloon-knockout/game/world.ts`),
  host-authoritative over Socket.IO. Rendering reads a per-frame `framesRef`
  snapshot — **rendering is a pure cosmetic layer; nothing visual feeds the sim.**
- **Entry points:** `components/kowloon-knockout/arena/GameView.tsx:91` (Canvas),
  `arena/Arena3D.tsx:28` (scene/lights), `arena/StickFighter.tsx` (fighter +
  procedural anim), `arena/Environment.tsx` (procedural arena), `arena/Fx.tsx`
  (particles), `vite.config.ts:138` (three bundling).

## Locked decisions

1. **Art direction:** Full high-fidelity (abandon the low-res pixelation).
2. **Target hardware:** Desktop-first, scale down via quality tiers; mobile stays
   playable but is not the showcase.
3. **Renderer:** `three/webgpu` `WebGPURenderer` + TSL node materials, relying on
   its automatic WebGL2-backend fallback (single material/shader graph for both).
4. **Assets / characters:** Real skeletal characters via a **shared humanoid rig**
   + CC0/Mixamo animation clips; the 9 fighter classes are differentiated by PBR
   material params + procedural accessories, not bespoke per-fighter meshes. User
   sources Mixamo/CC0 files; the runtime (loading, mixer, state machine,
   materials) is built here. Fighters we can't source well fall back to upgraded
   procedural geometry.

## Architecture principles

- **The combat sim, networking, and input are untouched.** `world.ts`, `net/*`,
  and input handling stay exactly as-is. The entire overhaul lives in
  `components/kowloon-knockout/arena/` plus a new material/post/tier layer.
- **Multiplayer determinism is unaffected by construction** — the visual layer
  only ever *reads* the sim snapshot. Host/guest smoke tests run after each phase
  regardless.
- **Quality tiers, not one renderer.** A `Ultra / High / Medium / Low` tier system
  gates expensive techniques, auto-detected from WebGPU availability + a GPU
  heuristic + an adaptive FPS governor. `Low` ≈ today's look and doubles as the
  mobile/WebGL fallback. The existing procedural `StickFighter`/`Environment` path
  is **kept** as the `Low` tier, not deleted.
- **Rollout behind a flag.** The new rendering path lives alongside the old one,
  toggled by a feature flag + the tier system, so work ships and is compared
  incrementally without breaking the live game.

## Phased plan (each phase independently shippable)

### Phase 0 — WebGPU foundation (parity)
- Swap `<Canvas>` to a custom `gl` factory returning `new WebGPURenderer(props)`
  from `three/webgpu`, awaiting `init()` (R3F v9 async/promise path; hold
  `frameloop` until ready). `extend(THREE)` from the webgpu build.
- Migrate all materials: `meshStandardMaterial → MeshStandardNodeMaterial`; the
  `toneMapped={false}` neon basics → `MeshBasicNodeMaterial` with emissive nodes.
  Centralize in a `<KKMaterials>` / material-factory helper so per-class colors
  flow through one place.
- Drop `dpr={0.5}` and `image-rendering: pixelated`; render native res (DPR capped
  ~2).
- **Exit criteria:** visual parity with today on both WebGPU and the WebGL2
  fallback backend.

### Phase 1 — Lighting + PBR + post-processing (the payoff)
- **Lighting rebuild** in `Arena3D`: keyed directional with 2048–4096 shadow map,
  neon point/area lights as real PBR emitters, and **IBL from an HDRI
  environment** (night-city HDR or a procedurally-built env map) for real
  reflections/ambient. Replaces flat ambient+hemisphere.
- **PBR materials:** real metalness/roughness on the procedural meshes + subtle
  procedural normal/roughness detail via TSL (no texture files required yet).
  Neon stays emissive.
- **Post-processing** via the WebGPU `PostProcessing` node pipeline (TSL passes),
  WebGL fallback via equivalent passes:
  - **Bloom** on emissives — headline effect; the neon finally glows.
  - **Tonemapping** (ACES or AgX) + **color grading** (LUT) for the noir palette.
  - **GTAO/SSAO** for contact shadows / grounding.
  - Optional tier-gated toggles: vignette, chromatic aberration, film grain.
- This phase delivers the biggest visual jump on the *existing* procedural
  geometry.

### Phase 2 — Environment overhaul
- Wet PBR rooftop with **SSR** reflections catching the neon.
- **Volumetric fog** (raymarched / froxel-lite, tier-gated) for atmosphere.
- Animated emissive signage (TSL flicker/scroll).
- Parallax / instanced skyline depth. Mix of procedural + optional CC0 modular
  props.

### Phase 3 — GPU compute particles
- Port the 260-instance CPU pool (`Fx.tsx`) to a **TSL compute** particle system —
  hit sparks, embers, ambient rain/dust, KO bursts at thousands of particles.
- WebGL fallback keeps the instanced CPU pool. Driven by the same FX event stream.

### Phase 4 — Skeletal characters
- New fighter renderer: load shared rigged GLB, `AnimationMixer`, a **state
  machine** mapping sim state (idle / walk / punch / block / hit / stun / KO) →
  clips with crossfade blending; root motion stripped (sim owns position/facing).
- Per-class identity via PBR material params + procedural accessories (the
  existing headband concept, extended).
- Falls back to procedural `StickFighter` at `Low` tier. User sources Mixamo/CC0
  clips; runtime is built here.

### Phase 5 — Tiers, scaling, settings, validation
- Implement the tier table below with an **adaptive governor** (rolling frametime
  average; step tier down if it exceeds budget for N frames; settings toggle to
  lock the tier).
- **Detection:** WebGPU presence + `WEBGL_debug_renderer_info` GPU-string
  heuristic + optional quick first-load benchmark.
- New settings panel for manual tier override.
- Validate mobile/WebGL2 fallback path.

## Quality tiers

| Tier   | Target           | Post                          | Shadows | Particles    | Characters             |
|--------|------------------|-------------------------------|---------|--------------|------------------------|
| Ultra  | Desktop WebGPU   | Bloom + GTAO + SSR + volumetrics | 4096 | GPU compute  | Skeletal               |
| High   | Capable desktop  | Bloom + GTAO                  | 2048    | GPU compute  | Skeletal               |
| Medium | Laptop / iGPU    | Bloom only                    | 1024    | Instanced    | Skeletal (or procedural) |
| Low    | Mobile / WebGL2  | none                          | 1024    | Instanced    | Procedural (today's look) |

## Risks & mitigations

1. **R3F v9 + WebGPU maturity** (async init, suspense edge cases) — Phase 0 is the
   renderer swap at parity, isolating this risk before any visual work.
2. **Material-migration regressions** (every mesh changes) — centralized material
   helper + parity screenshots.
3. **Bundle size** (skinned meshes, clips, HDRIs vs. today's zero-asset game) —
   keep the existing lazy-load; load HDRI/models per-tier; compress with
   Draco/KTX2.
4. **Mobile WebGPU is spotty** — the `Low` tier IS the WebGL2/procedural path, so
   mobile keeps something close to today.
5. **Asset sourcing / licensing** (Mixamo/CC0) — user fetches, licenses vetted;
   Phase 4 is last so it never blocks the visual win.
6. **Multiplayer** — unaffected by design (cosmetic layer only); host+guest
   smoke-tested after each phase anyway.

## Testing per phase

- Visual parity / screenshot checks (especially Phase 0).
- FPS on a desktop profile + a throttled/mobile profile.
- Host + guest multiplayer smoke test to confirm sim/net untouched.

## Out of scope

- Changes to combat sim, balance, networking protocol, lobby/matchmaking.
- Bespoke artist-authored per-fighter models (shared rig + materials instead).
- New game modes or gameplay features.

## Notes / cleanup opportunities

- `@react-three/rapier` is bundled into `vendor-three` but unused by this game —
  candidate for removal from the chunk to trim the bundle.
