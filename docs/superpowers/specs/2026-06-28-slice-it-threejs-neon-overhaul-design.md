# Slice It — three.js Neon Overhaul

**Date:** 2026-06-28
**Status:** Approved design, pending implementation plan
**Branch:** `slice-it-raytracing-overh`

## Goal

Give Slice It (the repo's two-lane rhythm game, currently rendered in pure Canvas 2D)
much more visual "pop" by replacing its renderer with a three.js WebGL scene styled
like Void Breaker — emissive neon materials plus a bloom-driven post-processing chain.

Note on "raytracing": the Void-Breaker look the user pointed at is **not** ray/path
tracing. It is WebGL emissive rendering + `UnrealBloomPass` + chromatic aberration +
vignette + film grain + ACES tone mapping. That is the proven, performant look we are
matching. No actual ray tracing is involved.

## Decisions (locked)

- **Visual target:** Void Breaker look — three.js WebGL, emissive neon, bloom post chain.
- **Presentation:** 2.5D — keep the readable two-lane layout, render it on a tilted plane
  receding into a neon environment. Not a full free-3D scene.
- **Renderer strategy:** Full replacement. The Canvas-2D renderer is removed; three.js is
  the only renderer. (Safety net for WebGL failure described under Risks.)
- **Effects:** All four — beat-reactive world, slice-impact FX, neon environment,
  screen FX & color grade.
- **Environment aesthetic:** Abstract neon void + drifting particles (near-black void,
  drifting neon particles/nebula, minimal geometry — notes pop hardest).
- **Palette:** Keep blue/pink lane identity but make them emissive/neon
  (lane 0 = electric blue, lane 1 = hot pink). Preserves player muscle memory.
- **Rollout:** One branch, full overhaul, single PR (matches how Void Breaker shipped).

## Key structural insight

Rendering is already isolated. The entire visual is one function in
`components/game/GameCanvas.tsx`:

```
render(ctx, engine, keybinds)   // ~lines 597–1100
```

Each frame it only *reads* from:
- `engine.getActiveMap()` — the notes ("slices") and their times/lanes/types
- `engine.feedbackQueue` — latest hit judgments (drives particles + judgment text)
- `engine.getTargetedSlice(lane)` — the next-hittable note per lane (drives glow)
- `AudioManager.getInstance().getCurrentTime()` — playback time
- `useGameStore.getState().modifiers` — spin / invisible / oneTrack / speed / etc.

Everything timing-critical (input handlers, `GameEngine`, `AudioManager`, multiplayer
sync, the store) is separate from `render()`. So "full replacement" means **replacing
one read-only render function with a three.js subsystem** and leaving the game's logic
and input untouched. Gameplay feel is preserved by construction.

`three@0.183.2` is already a dependency. No new packages required.

## Architecture

New subsystem under `lib/game/render3d/`:

| File | Responsibility |
|---|---|
| `SliceRenderer3D.ts` | Orchestrator. Owns `WebGLRenderer`, `Scene`, `PerspectiveCamera`, `EffectComposer`. Public API: `mount(canvas)`, `resize(w, h, dpr)`, `renderFrame(engine, audioTime)`, `setReducedFx(bool)`, `dispose()`. |
| `NoteField.ts` | Builds/updates lanes + note meshes each frame from `engine.getActiveMap()`. One `InstancedMesh` per note family (STANDARD/MOVING/SPEED/SILENT as cubes, LONG as head+tail, BOMB as orb, SWITCH as diamond). Emissive `MeshStandardMaterial`. Handles the targeted-note glow, hold-tail length, SWITCH lane-flip animation, and per-note opacity (invisible modifier / behind-cursor fade / on-hit fade). |
| `Environment.ts` | Abstract neon void: near-black background, fog, drifting GPU particle field / nebula, minimal accent geometry. Beat-reactive light intensity. |
| `EffectsLayer.ts` | Slice-impact FX driven off `engine.feedbackQueue`: GPU particle bursts, neon shard scatter, slash trail, hit-flash. Intensity scaled by judgment (MARVELOUS → huge … GOOD → modest). Also owns screen shake. Capped particle pool. |
| `PostFX.ts` | `EffectComposer` chain: `RenderPass` → `UnrealBloomPass` → `RGBShiftShader` (ShaderPass) → `VignetteShader` (ShaderPass) → `FilmPass`. ACES filmic tone mapping. Beat-reactive bloom swell. `setReducedFx` dampens shake and disables aberration + grain. |
| `palette.ts` | Neon color constants per lane/note type (replaces the neumorphic `COLORS` object). |

### Changes to existing files

- **`components/game/GameCanvas.tsx`** — delete the Canvas-2D `render()` function and the
  CPU particle system (`particlesRef`, `spawnParticles`). The RAF loop instead does:
  ```
  renderer.renderFrame(engine, AudioManager.getInstance().getCurrentTime());
  ```
  The `<canvas>` element keeps a WebGL context instead of `2d`. Input handlers, engine
  init, multiplayer listeners, resize observer, visibility handling — all unchanged.
- **`lib/audio/AudioManager.ts`** — add an `AnalyserNode` tapped off the existing
  `gainNode` (parallel branch; does not alter the audio output path) and expose
  `getFrequencyData()` / low-frequency energy for beat reactivity. Small, isolated.
- **`components/slice-it/slice-it.css`** — the neumorphic light/dark CSS variables that
  fed the 2D renderer are no longer read by the renderer; background becomes the WebGL
  scene. Keep any vars still used by surrounding chrome/HUD.

## The 2.5D field model

Keep the two-lane layout; render it on a tilted plane receding into the void.

- **Reuse the exact timing math.** Today a note's scroll position is
  `CURSOR_MAIN ± (slice.time − audioTime) × PPS`, with `PPS = axisLength / 3.0 × speedMod`
  (~3 s lookahead). This formula is kept verbatim; only the mapping of
  `(scrollVal, laneVal)` → 3D world coordinates is new. Identical note arrival timing ⇒
  identical gameplay.
- Lanes render as glowing rails on the plane; notes travel toward a bright **hit line**
  near the camera. A modest camera tilt gives depth (the Void-Breaker steep-follow camera,
  adapted to a fixed rhythm track).
- **Both orientations preserved.** Desktop = horizontal scroll, lanes top/bottom.
  Mobile-vertical (`isMobileV`, portrait canvas) = vertical scroll, lanes left/right.
  The camera/field reorients exactly where the current `isMobileV` branch does, and touch
  lane-detection (left/right vs top/bottom halves) is unchanged because it lives in the
  input layer, not the renderer.

## The four FX systems

1. **Beat-reactive world** — a pulse value in [0,1] derived from low-frequency audio
   energy (see below), plus discrete kicks on each successful hit. Drives bloom strength,
   a subtle camera "breath," and environment light intensity so the scene throbs with the
   track.
2. **Slice impact FX** — every non-miss, non-bad hit spawns a particle burst + neon shard
   scatter + slash trail + hit-flash at the note's lane/position, intensity scaled by
   judgment text, reading the same `feedbackQueue` entry the current 2D particles use
   (`text`, `lane`, `offset`, `color`, `time`).
3. **Neon environment** — the abstract void: drifting particle field/nebula, fog for
   depth, minimal accent geometry behind the lanes.
4. **Screen FX & grade** — chromatic aberration + vignette + film grain via the post
   chain; screen shake on big hits / high combos; a color grade that can shift per song or
   difficulty.

## Beat / music reactivity source

`AudioManager` currently has no `AnalyserNode`. It has `gainNode` (source → normNode →
gainNode → destination). We add an `AnalyserNode` as a **parallel tap** off `gainNode`
(it does not need to reach `destination`, so the audible signal path is unchanged), and
expose its low-frequency energy. This makes the world react to *any* song without
depending on the beat map. Discrete per-hit kicks layer on top.

## Gameplay parity — non-negotiables to preserve

- **Modifiers:** `spin` (rotate field/camera about center), `invisible` (note fade near
  hit line), `oneTrack` (single rail), `speed` (already in timing math).
- **Note types:** STANDARD, MOVING, SPEED, SILENT (cubes); LONG (head + held tail,
  clamps to cursor while held); BOMB (orb with warning ring + "!"); SWITCH (diamond with
  arrow, animated lane flip near hit line).
- Targeted-note glow per lane; judgment feedback text; combo/score HUD (unchanged — it's
  separate React components).
- Input: keyboard, mouse, gamepad, touch; countdown flow; pause; multiplayer sync.
- Mobile-vertical and desktop-horizontal orientations.

## Risks & safety net

- **No 2D fallback** (full replacement). WebGL can fail (context lost, no GPU). On WebGL
  context-creation failure, show a graceful "WebGL unavailable" message rather than
  crashing the game route.
- **Reduced motion:** honor `prefers-reduced-motion` via `setReducedFx(true)` — damp
  screen shake, disable chromatic aberration + film grain (mirrors Void Breaker).
- **Performance:** target 60fps via `InstancedMesh` for notes, a capped GPU particle
  pool, and bloom resolution tuned to viewport. Dispose geometries/materials/render
  targets on unmount (`dispose()`), and handle `webglcontextlost`/`restored`.

## Testing & verification

- Engine/timing logic is untouched, so existing logic tests stay green.
- No DOM/WebGL test environment exists in this repo (per project notes), so rendering is
  verified by running the app in-browser: note timing matches audio, all note types
  render, all modifiers behave, both orientations work, hits produce impact FX, the scene
  is beat-reactive, and teardown leaks nothing.

## Build order (for the implementation plan)

1. `AudioManager` analyser tap + accessor.
2. `palette.ts` + `SliceRenderer3D` scaffold (scene/camera/renderer/composer, mount/resize/dispose), wired into `GameCanvas` RAF, drawing an empty void.
3. `NoteField` — lanes + all note types with correct timing/positions (parity with 2D).
4. `PostFX` — bloom + aberration + vignette + grain + ACES.
5. `EffectsLayer` — slice-impact particles/shards/trails/flash + screen shake.
6. `Environment` — drifting particle void + fog + reactive lights.
7. Beat reactivity wiring (bloom swell, camera breath, light pulse).
8. Modifier parity pass (spin, invisible, oneTrack, speed) + reduced-motion + WebGL-fail message.
9. Remove dead Canvas-2D code; in-browser verification; senior-swe-reviewer pass before PR.
