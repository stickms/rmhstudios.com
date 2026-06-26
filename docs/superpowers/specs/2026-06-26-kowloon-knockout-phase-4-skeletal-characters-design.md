# Kowloon Knockout — Phase 4: Skeletal Characters — Design Spec

> Date: 2026-06-26. Phase 4 of the Kowloon Knockout graphics overhaul (see `2026-06-25-kowloon-knockout-graphics-overhaul-design.md`). Builds on merged Phase 0–3 (WebGPU/TSL render path, tiers, environment, particles). Replaces the procedural `StickFighter` with real skeletal-animated characters on the higher tiers, while keeping `StickFighter` as the low-tier path and universal fallback.

## Goal

Give the fighters real skeletal animation — a rigged humanoid playing motion-captured clips (idle, walk, the four punches, block, hit, stun, KO) crossfaded by the existing sim state machine — so combat reads as a fight, not articulated primitives. The combat sim, networking, input, and HUD are untouched: the render layer only reads the per-frame `RenderFighter` snapshot, exactly as `StickFighter` does today. Animation is a cosmetic layer.

## Asset decision (locked in brainstorm)

- **Rig:** Mixamo **Y-Bot** (standard `mixamorig:` skeleton). The user sources the assets; the runtime is built here to Y-Bot's conventions.
- **Identity:** one shared Y-Bot rig for all 9 classes, differentiated by **per-class material tint + procedural accessories** (headband in class `accent`, belt) — not 9 distinct models. Carries over the existing `StickFighter` headband concept and the `CLASS_DISPLAY` `color`/`accent` data.
- **Packaging:** **separate GLB files** (no Blender merge). The user converts each Mixamo FBX → GLB individually (e.g. via the three.js editor) and drops them in. The runtime assembles the clips onto the shared skeleton by bone name (all share the `mixamorig:` rig, so no retargeting).

### Asset contract — exact files the runtime loads
`public/kowloon/fighter/`:
```
ybot.glb                                   (skinned mesh, T-pose)
idle.glb  walk.glb                         (loops; walk = Mixamo "In Place")
jab.glb   cross.glb  hook.glb  uppercut.glb (one-shots)
block.glb hit.glb    stunned.glb  ko.glb   (block loop; hit/ko one-shots; stunned loop)
```
Until these exist, every fighter falls back to `StickFighter` (no regression). Mixamo source terms: Fighting Idle, Walking (In Place), Jab, Cross Punch, Hook Punch, Uppercut, Blocking, Hit Reaction, Stunned/Drunk Idle, Knocked Out/Falling Back Death. Animations downloaded "Without Skin"; the runtime maps by *our* filename, not Mixamo's clip name, so close matches are fine.

## Architecture — clip-based skeletal layer behind a dispatcher

A new skeletal renderer is selected per seat by a small dispatcher; `StickFighter` is retained unchanged as the low-tier path and the universal fallback (missing assets, load error, or while loading).

- Load the shared assets **once** (drei `useGLTF`, cached): `ybot.glb` + the 10 clip GLBs. Clone the skinned mesh **per seat** via `SkeletonUtils.clone` so each fighter has an independent skeleton + `AnimationMixer`. ≤4 fighters → 4 cheap mixers.
- Each frame, read `framesRef.current.find(seat)` and drive everything imperatively (no React state, same pattern as `StickFighter`): root position/yaw (damped), the state-machine crossfade, `mixer.update(delta)`.
- Approach chosen over a hand-rolled `GLTFLoader`/`AnimationMixer` (more code, no benefit) and over shared-skeleton instancing (overkill at ≤4 fighters).

## Components & boundaries

### Pure, headlessly-testable core — `lib/kowloon-knockout/render/fighter/`
- `clips.ts` — the clip manifest: `type ClipKey = 'idle'|'walk'|'jab'|'cross'|'hook'|'uppercut'|'block'|'hit'|'stunned'|'ko'`; the filename map; per-clip params (`loop: boolean`, `oneShot: boolean`, `fade: number`). Single source of truth shared by loader + state machine.
- `stateMachine.ts` — `resolveClip(rf: RenderFighter) → { clip: ClipKey; loop: boolean }`. Pure mapping from sim `state`/`punch` → clip. Unit-tested (TDD).
- `rootMotion.ts` — `stripRootMotionXZ(clip: THREE.AnimationClip): void` — zeroes the hips XZ position track (keeps Y so the KO topple still reads). Pure transform over three's `AnimationClip`/`KeyframeTrack` (run in node). Unit-tested.

### Render layer — `components/kowloon-knockout/arena/`
- `SkeletalFighter.tsx` — loads/clones the rig, builds the mixer + actions, applies identity + accessories + Mixamo normalization, drives per-frame from `framesRef`. RUN-OBSERVE.
- `Fighter.tsx` — the per-seat dispatcher mounted by `Arena3D`: `low` tier → `StickFighter`; otherwise an ErrorBoundary + Suspense (both falling back to `StickFighter`) wrapping `SkeletalFighter`.
- `FighterTrappings.tsx` — the floating nameplate + blob shadow extracted from `StickFighter` and shared by both renderers (avoids duplication).
- `StickFighter.tsx` — unchanged except for having its nameplate/shadow factored into `FighterTrappings`.
- `Arena3D.tsx` — the seat map renders `<Fighter>` instead of `<StickFighter>`.

## State machine + clip mapping

`resolveClip` maps each `RenderFighter`:

| sim `state` | clip | playback |
|---|---|---|
| idle | `idle` | loop |
| walking | `walk` | loop |
| punching | `jab` / `cross` / `hook` / `uppercut` (by `rf.punch`, default `jab`) | one-shot |
| blocking | `block` | loop (hold) |
| hit | `hit` | one-shot |
| stunned | `stunned` | loop |
| knockedOut | `ko` | one-shot, clamp last frame |
| (unknown) | `idle` | loop |

The mixer crossfades to the target action over the clip's `fade` (~0.12s; ~0.08s for punches). One-shots use `LoopOnce` + `clampWhenFinished`, triggered with `reset().play()` on state-entry. **Punch sync:** v1 triggers the punch one-shot on entering `punching` with `timeScale` fit to the punch window; exact frame-locking via `rf.punchFrame` (`action.time = (punchFrame/total)*duration`) is a refinement for browser sign-off.

## Mixamo normalization

The runtime absorbs Mixamo's quirks so the dropped-in assets "just work":
- **Scale:** auto-measure the cloned model's bounding-box height and scale to `TARGET_HEIGHT ≈ 1.8` units (matching `StickFighter`) — robust to whatever units the FBX→GLB conversion produced.
- **Forward axis:** a tunable `MODEL_YAW_OFFSET` constant rotates the model so its facing aligns with the sim's `+Z` punch direction (reusing `StickFighter`'s `yaw → faceY` math).
- **Root motion:** `stripRootMotionXZ` on every clip at load (sim owns x/z; vertical kept).

## Identity & per-frame visuals

- **Tint:** clone the Y-Bot material per seat; set `color` to the class `color`. (`color`/`accent` come from the existing `RenderFighter`/`CLASS_DISPLAY`.)
- **Accessories:** two small procedural meshes parented to bones — a headband (class `accent`) on the head bone (`mixamorig:Head`), a belt on the hips bone (`mixamorig:Hips`) — so they animate with the body.
- **Hit flash:** `rf.hitFlash > 0` → emissive red pulse on the body material (as `StickFighter`).
- **Alive:** `rf.alive === false` → dim the body color.
- **Trappings:** nameplate (`Html`) + blob shadow via the shared `FighterTrappings`.

## Data flow & fallback

- **Data flow:** identical to `StickFighter` — per frame: `const rf = framesRef.current.find(f => f.seat === seat)`; damp root x/z and rotation.y; `const { clip, loop } = resolveClip(rf)`; crossfade to that action if changed; `mixer.update(delta)`. No React state.
- **Fallback/tier:** `low` → `StickFighter`. `medium/high/ultra` → `SkeletalFighter`, with `StickFighter` as both the Suspense fallback (while the GLBs load) and the ErrorBoundary fallback (missing/failed assets). This mirrors the Phase 3 GPU-layer boundary pattern and means: no assets → all `StickFighter`, zero regression; assets present → skeletal lights up.

## Testing

- **UNIT (Vitest, node env):** `resolveClip` — every `state` and every `punch` → correct clip key + loop flag, default → idle; `stripRootMotionXZ` — synthetic `AnimationClip` with a hips position track → XZ zeroed, Y preserved, other tracks untouched. Run `node_modules/.bin/vitest run lib/kowloon-knockout/render`.
- **RUN-OBSERVE (deferred to user), two-stage:**
  1. **Before assets exist:** confirm `StickFighter` still renders for all fighters across tiers — the merge gate (no regression from the dispatcher/refactor).
  2. **After the user adds the GLBs:** confirm Y-Bot loads, scales and faces correctly, and clips play + crossfade per state (idle/walk/punches/block/hit/stun/KO); confirm `low` tier and asset-error still fall back to `StickFighter`.
- Per project workflow: every PR is preceded by a `senior-swe-reviewer` pass.

## Out of scope

- `lib/kowloon-knockout/game/**`, `net/**`, `game/input.ts`, HUD, lobby — untouched. No game-logic, sim, or netcode changes.
- No new combat states or `RenderFighter` fields. No per-class distinct models or per-class bone-scale proportions (a possible later refinement on top of tint+accessories). No facial animation, no IK, no ragdoll (KO uses the baked clip).
- three stays at `^0.183.2`.

## Risks & mitigations

- **Assets are user-sourced and browser-only verifiable.** The skeletal path can't be headlessly tested and can't be confirmed until the user adds the GLBs. Mitigation: pure-logic core is unit-tested; `StickFighter` fallback keeps the game fully working until/if assets land or fail.
- **Mixamo convention drift** (scale/forward/bone-naming differences from the FBX→GLB conversion). Mitigation: auto-scale by bbox, tunable `MODEL_YAW_OFFSET`, and bone lookups by name with guards; if a bone isn't found, skip that accessory rather than crash.
- **`SkeletonUtils.clone` correctness** for skinned meshes (shared geometry, independent skeleton). Mitigation: the documented three.js pattern; verify each fighter animates independently during sign-off.
- **Suspense/fallback flash** as assets load. Mitigation: `StickFighter` is the Suspense fallback (always something visible); assets cache after first load.
