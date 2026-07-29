# 3D performance audit — games, apps, and pages

Measured 2026-07-29 against the dev server (`pnpm exec vite dev`, port 7005) with
an instrumented headless Chromium. Covers every route that opens a WebGL/WebGPU
context.

## How the numbers were produced

`WebGL2RenderingContext.prototype.drawElements` / `drawArrays` /
`*Instanced` were monkey-patched to count draw calls and triangles, and a
`requestAnimationFrame` probe recorded frame cadence. Draw-call and triangle
counts are therefore renderer-agnostic — they are what the page actually asks
the GPU to do, independent of R3F vs. raw three vs. the WebGPU backend. A
`PerformanceObserver` on `longtask` captured main-thread stalls.

> **Read the fps column as a relative signal, not an absolute one.** The
> capture environment has no GPU; Chromium ran on SwiftShader (software
> rasterisation), which massively penalises fill rate and triangle throughput.
> Real hardware will be far faster. **Draw calls, triangles-per-frame, and
> long-task counts are hardware-independent and are the actionable numbers
> here.** fps is only useful for comparing the games against each other under
> an identical handicap.

Sample: 15s of steady state after entering gameplay, 1280×720, DPR 1.

## Results

| Route / mode | fps¹ | draws/frame | tris/frame | long tasks (15s) | worst stall | Bound by |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| forest-explorer — Free Explore | 3.3 | 94 | **181,757** | 55 | 418 ms | triangles + main thread |
| cookgame — The Suburbs | 6.1 | **432** | 10,120 | 88 | 236 ms | draw calls + main thread |
| kowloon-knockout — arena, mid-fight | **0 frames in 15s** | — | — | 7 | **3,486 ms** | fill rate + compile stall |
| kowloon-knockout — fighter select | 59.9 | 11 | 484 | 0 | — | (preview canvas only) |
| void-breaker | not captured² | | | | | |
| velum2099 | not captured² | | | | | |
| rmh-farming-sim | not captured² | | | | | |

¹ software rasteriser — relative only.
² gated behind a menu the harness could not clear (velum2099 uses a typed
terminal menu; void-breaker's loadout screen did not hand off to the renderer;
rmh-farming-sim never opened a context). Static findings for all three are in §5.

The two headline games fail in **opposite** ways, so they need opposite fixes.

---

## 1. forest-explorer — 182k triangles/frame, and it renders everything, always

94 draw calls is healthy; the environment is properly instanced
(`buildTreeInstancedMeshes.ts`, `GrassBorder.tsx`, `ScatterDecor.tsx`). The
problem is that ~182k triangles are submitted **every frame regardless of where
the camera looks**, and then largely submitted a second time for the shadow
pass.

### 1.1 No DPR clamp — the single biggest fill-rate multiplier

`components/forest-explorer/explore/ExploreGame.tsx:44` and
`components/forest-explorer/story/StoryGame.tsx:173`:

```tsx
<Canvas shadows gl={{ antialias: true }} camera={{ fov: 75, near: 0.1, far: 600 }}>
```

No `dpr` prop, so R3F uses the device pixel ratio. On a 2× retina display that
is 4× the fragments; on a 3× phone, 9×. Combined with `antialias: true`, this is
the most expensive possible default. Every other game in the repo clamps DPR —
`rmh-farming-sim` uses `[0.75, 1]`, `kowloon-knockout` `[1, 2]`,
`rmhmusic` `[1, 1.5]`. forest-explorer is the outlier.

**Fix:** `dpr={[1, 1.5]}` (and drop `antialias` on low tiers). One line per
Canvas, and on a retina laptop it is close to a 2× win on its own.

### 1.2 InstancedMesh disables per-instance frustum culling

280–320 trees × 4 instanced meshes are one draw call each — good — but an
`InstancedMesh` is culled as a single unit. With every tree in one instance
buffer spanning a 150-unit-radius map, nothing is ever culled: trees behind the
camera are transformed and rasterised every frame.

**Fix:** chunk the instance buffers spatially (e.g. a 4×4 or 8×8 grid of
`InstancedMesh`es covering the map) so off-screen chunks cull. This is the
biggest triangle-count lever available and does not change how anything looks.

### 1.3 Shadow camera is 200×200 units on a 1024² map

`ActOneScene.tsx:121-126`, `ActTwoScene.tsx:166-171`, `ActThreeScene.tsx:175-180`:

```tsx
shadow-mapSize={[1024, 1024]}
shadow-camera-left={-100} shadow-camera-right={100}   // 240 wide in ActThree
shadow-camera-top={100}   shadow-camera-bottom={-100}
```

That is ~0.2 world units per shadow texel — shadows are simultaneously
**expensive** (the whole 182k-triangle scene re-renders into the shadow map) and
**low quality** (blocky, swimming edges). For comparison `cookgame`
(`models/Lighting.tsx:51-56`) uses 2048² over a 44-unit extent — about 0.02
units/texel, 10× sharper.

**Fix:** shrink the shadow frustum to a tight box around the player (±25–30
units) and let distant geometry go unshadowed, or add a second cascade. Sharper
shadows *and* far fewer shadow-pass triangles.

### 1.4 Scene keeps rendering at full cost behind pause/intro overlays

`StoryGame.tsx:26` tracks `paused`, but it only gates UI (`:227`, `:299`). The
`<Canvas>` has no `frameloop` prop, so the full scene renders behind the blurred
pause card — which itself is a full-viewport `backdrop-filter`. `ExploreGame`
has no pause concept at all. The profiler caught this directly: the scene was
already drawing 181 draw calls while sitting on the "Enter the Forest" card.

**Fix:** `frameloop={paused || !entered ? 'never' : 'always'}`. Free, and it
stops burning battery on a menu.

### 1.5 Store writes re-render the landmark tree ~20×/second

`InteractionSystem.tsx:95` runs every 3rd frame and always publishes a
**freshly-allocated array**:

```ts
setFlashlightRevealed(revealedIds);   // new array identity every time
```

`useLandmarkState.ts:19` subscribes to that array by reference:

```ts
const revealedIds = useStoryStore(s => s.flashlightRevealedIds);
```

Zustand compares by identity, so all 7 landmark components
(`ShadowWall`, `AncientStone`, `ShatteredMonument`, `CrystalCluster`,
`Observatory`, `EchoChamber`, plus the hook itself) re-render ~20×/second even
when nothing about them changed. Each of those re-renders allocates
`new Color(...)` **as a JSX material prop** — `ShadowWall.tsx:80,86,92,98,117`,
`AncientStone.tsx:62`, `Observatory.tsx:107`, `EchoChamber.tsx:80,99`,
`CrystalCluster.tsx:63`, and ~15 more sites — so R3F re-applies the material
property each time too.

Separately, `Interactables3D.tsx:41,98` subscribe with
`s.flashlightRevealedIds.includes(item.id)` — an O(n) scan per subscriber over
40 interactables, on every store write.

This is the most likely source of the 55 long tasks (worst **418 ms**) and the
"sluggish" feel, which is a main-thread problem, not a GPU one.

**Fixes, in order:**
1. Make the reveal state a `Set` (or a bitmask) and have `useLandmarkState`
   select a **boolean**: `useStoryStore(s => s.revealedSet.has(id))`. Selecting
   a primitive means Zustand's default equality actually prevents the re-render.
2. Only write when the set genuinely changed (compare before `set`).
3. Hoist every `new Color(...)` out of JSX into a module-level constant or
   `useMemo`. These are static colours; they never need re-allocating.

### 1.6 Per-frame vector allocations in the controllers

`StoryPlayerController.tsx:172-190` and `shared/PlayerController.tsx:49-67`
allocate a `Vector2` and four `Vector3`s **every frame** (~300/sec at 60fps).
`StoryPlayerController.tsx:238` allocates a `Euler` on top. The file already
demonstrates the right pattern elsewhere (`InteractionSystem.tsx:31` memoises
`flatDir`) — apply it here: hoist to `useMemo`/module scope and mutate in place.

Note these loops are already throttled (position every 3rd frame, rotation every
6th) — prior optimisation work is visible. The remaining cost is the allocation
churn, not the cadence.

### 1.7 forest-explorer has no adaptive quality at all

A repo-wide grep for `AdaptiveDpr|PerformanceMonitor` returns exactly one file
(`daily-puzzles/three/DeskScene.tsx`). forest-explorer — the heaviest scene
measured — has no DPR clamp, no quality tiers, and no governor. See §6.

---

## 2. cookgame — 432 draw calls for 10,120 triangles

~23 triangles per draw call. The GPU is idle waiting on state changes; this is
purely a batching problem, and it is the clearest, most mechanical win in the
whole audit.

### 2.1 Every model is a pile of individually-materialed boxes

| Model | `<mesh>` count |
| --- | ---: |
| `models/Building.tsx` | 32 |
| `models/stations/GrowPlotModel.tsx` | 32 |
| `models/stations/DryingRackModel.tsx` | 30 |
| `models/stations/ChemStationModel.tsx` | 28 |
| `models/stations/SupplierStallModel.tsx` | 22 |
| `models/stations/PackagingModel.tsx` | 20 |
| `models/stations/MixingBenchModel.tsx` | 16 |

Each `<mesh>` declares its own `<boxGeometry>` **and** its own
`<meshStandardMaterial {...matteMaterialProps(PALETTE.x)} />`
(`Building.tsx:32-77`). `matteMaterialProps` (`models/palette.ts:21`) returns a
fresh props object, so nothing is shared — every box is a separate geometry, a
separate material, and therefore a separate draw call. `TownScene.tsx` places 7
`<Building>`s plus a full set of stations and 6 grow plots.

**Fix, highest value first:**
1. **Share materials.** There are only a handful of distinct colours in
   `PALETTE`. Build one `MeshStandardMaterial` per palette entry at module scope
   and reference it. This alone lets three batch aggressively.
2. **Merge static geometry.** Each building/station is rigid — merge its boxes
   into one `BufferGeometry` per material with
   `BufferGeometryUtils.mergeGeometries()` at build time. A 32-mesh building
   becomes ~3–4 draws.
3. **Instance the repeats.** `GrowPlotModel` is placed 6× via
   `PLOT_POSITIONS.map` (`TownScene.tsx:148`) and buildings repeat by variant —
   use `<Instances>`, which `StreetProps.tsx:41` already does correctly.

Realistically this takes 432 draws to well under 100.

### 2.2 117 shadow casters against a 2048² map

`grep -c castShadow` across `components/cookgame` returns 117. Every one of
those is re-rendered into the shadow map, roughly doubling an already
draw-call-bound frame. The shadow *config* is good
(`models/Lighting.tsx:46-60`: tight 44-unit frustum, sensible bias) — the
problem is the caster count.

**Fix:** only let objects that visibly cast shadows do so — buildings and the
player, not every window frame, doorknob, and roof trim. Dropping `castShadow`
from small props should remove most of those 117 without a visible change.

### 2.3 88 long tasks in 15 seconds

~6 main-thread blocks per second over 50ms, worst 236ms. Rapier physics
(`world/PlayerController.tsx`, `Physics` in `CookGameGame.tsx:139`) plus
per-frame store writes (`world/Interactable.tsx:25-34` calls
`setNearbyInteractable` from `useFrame`) are the candidates. Worth a dedicated
CPU profile once the draw calls are fixed.

### 2.4 No DPR clamp

`CookGameGame.tsx:138`: `<Canvas shadows camera={...}>` — no `dpr`, no `gl`
config, so antialias defaults on. Same fix as §1.1.

---

## 3. What is already good (don't "fix" these)

- **`lib/void-breaker/renderer3d.ts`** — `setPixelRatio(1)` (`:121`), shadow
  maps off, and heavy `InstancedMesh` use for enemies, projectiles, shards,
  orbitals (`:328-424`). This is the best-optimised renderer in the repo.
- **`components/forest-explorer/shared/buildTreeInstancedMeshes.ts`** — correct
  instancing with per-instance colour attributes and low-poly (7-segment)
  primitives.
- **`components/cookgame/models/props/StreetProps.tsx:41-68`** — proper
  `<Instances>`/`<Instance>` usage. The pattern the rest of cookgame needs.
- **`components/kowloon-knockout/arena/`** — the only game with a real adaptive
  quality system (see §6).
- **`components/rmh-farming-sim/FarmCanvas.tsx:11-17`** — `dpr={[0.75, 1]}`,
  `antialias: false`, tight `far: 80`. Textbook.

---

## 4. kowloon-knockout and void-breaker

Both stayed at ~60fps in the harness with very low draw counts, but neither
number reflects real gameplay load:

- **kowloon-knockout** was captured on the fighter-select screen (11 draws / 484
  tris = the small `FighterPreview3D` canvas). Its tier detector
  (`lib/kowloon-knockout/render/tier.ts:9-15`) correctly classified SwiftShader
  as `gpuTier 0 → 'low'`, which disables bloom, GTAO, reflections, atmosphere
  and GPU particles. **The governor doing its job is itself the finding** — this
  is the system the other games lack.
- **void-breaker** opened a WebGL2 context but recorded 0 draws in the sample
  window; it sits behind a loadout/menu screen the harness did not clear. Given
  §3, it is the least likely to need work.

### 4.1 The StickFighter → SkeletalFighter swap: 7.9 MB of uncompressed FBX

`arena/Fighter.tsx:29-39` uses `StickFighter` for **three different reasons**,
and only one of them is about frame rate:

```tsx
const stick = <StickFighter seat={seat} framesRef={framesRef} />;
if (tier === 'low') return stick;                    // (a) quality decision
return (
    <FighterBoundary fallback={stick}>               // (c) load failed
        <Suspense fallback={stick}>                  // (b) still loading
            <SkeletalFighter seat={seat} framesRef={framesRef} />
```

(a) is an fps decision — on `low` tier the stick figure is permanent. But the
visible *upgrade* mid-match is (b): `SkeletalFighter.tsx:38-39` calls
`useLoader(FBXLoader, RIG_URL)` and `useLoader(FBXLoader, CLIP_URLS)`, which
**suspend until every asset resolves**. That is:

| Asset | Size |
| --- | ---: |
| `ybot.fbx` (rig) | 1,936 KB |
| `dance.fbx` | 1,195 KB |
| `stunned.fbx` | 884 KB |
| `ko.fbx` | 692 KB |
| `idle.fbx` | 516 KB |
| + 6 more clips | ~2,360 KB |
| **total** | **~7.9 MB, uncompressed** |

Nothing upgrades until all 12 files have downloaded **and** been parsed. This is
the right *architecture* — the match starts instantly and stays playable instead
of blocking on a 7.9 MB download — but the payload and the parse are both
oversized:

1. **FBX is the wrong delivery format.** These are Mixamo exports shipped as-is.
   Converting to glTF/GLB with Draco or meshopt compression typically lands
   under 1 MB for this kind of rig + clip set. Clips especially: an animation
   track has no business being 1.2 MB.
2. **All 11 clips block the swap.** `dance` is explicitly a render-only emote
   ("never returned by `resolveClip`", `clips.ts:4`) yet its 1.2 MB gates the
   upgrade for everyone. Load `idle` + `walk` to trigger the swap, then stream
   the rest.
3. **`FBXLoader` parses on the main thread.** The measured **3,486 ms long task**
   on arena entry (§4) is consistent with FBX parse + `cloneSkeleton` +
   per-seat material cloning. glTF + a worker-based loader moves most of this
   off the main thread.

**If it never upgrades at all**, you are hitting (a) or (c), not (b) — check the
console for `[Fighter] skeletal load failed, using StickFighter:`
(`Fighter.tsx:17`), and check the detected tier, which is logged as
`[kowloon] detected render tier: …` (`RenderTierContext.tsx:43`).

---

## 5. Static findings for the routes the harness couldn't drive

**velum2099** (`components/velum2099/game/scene/CyberpunkScene.ts`) — 11.9k
lines, the largest 3D surface in the repo.
- `:286` `setPixelRatio(Math.min(window.devicePixelRatio, 2))` combined with
  `:1980` `UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), …)`
  is the expensive combination: UnrealBloom is a multi-pass mip chain, and at
  DPR 2 it runs over 4× the pixels. Clamp to 1.5, or build the bloom pass at
  half resolution — bloom is low-frequency and does not need native res.
- `:289` shadow maps are already disabled, and `:282` `antialias: false` with an
  FXAA pass instead — both good calls.
- 204 geometry/material constructions against 42 `.dispose()` calls; worth
  auditing for leaks on scene teardown given the game is long-running.

**rmh-farming-sim** — mostly well configured (§3), but
`scene/FarmWorld.tsx:320-331` walks 400 points on the CPU every frame and sets
`needsUpdate`, re-uploading the buffer each frame. A vertex-shader-driven
`pointsMaterial` (time uniform, modulo fall) removes the upload and the loop.
`:93` and `:347` also allocate a `Vector3`/`Color` per frame.

**breakpoint** (`components/breakpoint/GameView.tsx:197`) — correctly clamps DPR
and disables antialias. `arena/Effects.tsx:30-31` allocates two `Vector3`s per
tracer per frame; hoist them.

**Other 3D surfaces, all sanely configured:**
`components/library/BookCanvas.tsx:428` (`dpr={[1,2]}`, `flat`, orthographic),
`components/rmhmusic/Visualizer.tsx:159` (`dpr={[1,1.5]}`, instanced bars),
`components/daily-puzzles/three/DeskScene.tsx:87` (`shadows={false}` plus
`PerformanceMonitor` — the only drei adaptive helper in use anywhere).

---

## 6. The cross-cutting fix: one shared quality governor

`kowloon-knockout` has a complete adaptive-quality system that no other game
uses:

- `lib/kowloon-knockout/render/tier.ts` — `detectTier()` buckets by backend, GPU
  string and mobile, into `ultra | high | medium | low`, with `TIER_FLAGS`
  mapping each tier to bloom / GTAO / reflections / atmosphere / shadow-map size
  / GPU particles.
- `arena/Governor.tsx` — a `FrametimeMonitor` over a 90-frame window that steps
  the tier **down** when the rolling average exceeds a 20ms budget, with a
  cooldown.
- `arena/RenderTierContext.tsx` — probes `WEBGL_debug_renderer_info`, respects a
  user preference, and re-detects on breakpoint changes.

This is genuinely good and it is walled inside one game. Lifting it to something
like `lib/render/` and adopting it in forest-explorer, cookgame, and velum2099
is a far better use of effort than any engine change — it is the difference
between "this game is unplayable on my laptop" and "this game quietly turns off
bloom".

The minimum viable version, if the full tier system is too much: clamp DPR and
drop in drei's `<AdaptiveDpr pixelated />` + `<PerformanceMonitor>`, which
`daily-puzzles` already demonstrates.

---

## 7. Suggested order of work

| # | Change | Where | Cost | Expected effect |
| --- | --- | --- | --- | --- |
| 1 | Clamp `dpr` to `[1, 1.5]` | forest `ExploreGame:44`, `StoryGame:173`, `CookGameGame:138` | minutes | Large on retina/mobile; the cheapest win available |
| 2 | Share materials + merge static geometry | `cookgame/models/**` | 1–2 days | 432 draws → <100 |
| 3 | Reveal-state as `Set`, select booleans | `lib/forest-explorer/store.ts`, `useLandmarkState.ts`, `Interactables3D.tsx` | half day | Removes ~20 re-renders/sec; targets the 418ms stalls |
| 4 | Tighten shadow frustum | forest `acts/*Scene.tsx` | hours | Cheaper *and* sharper shadows |
| 5 | Prune `castShadow` on small props | `cookgame/models/**` (117 sites) | hours | Roughly halves the shadow pass |
| 6 | `frameloop` gating behind overlays | forest `StoryGame`/`ExploreGame` | minutes | Zero cost while paused |
| 7 | Hoist per-frame allocations | forest controllers, `breakpoint/Effects.tsx`, `FarmWorld.tsx` | hours | Less GC hitching |
| 8 | Spatially chunk tree instances | `buildTreeInstancedMeshes.ts` | 1 day | Restores frustum culling; biggest triangle lever |
| 9 | Half-res bloom / clamp DPR | `velum2099/CyberpunkScene.ts:286,1980` | hours | Large if velum is a known offender |
| 10 | Extract the tier system to `lib/render/` | from `kowloon-knockout` | 2–3 days | Every game degrades gracefully instead of dying |
| 11 | FBX → compressed glTF; don't block the swap on `dance` | `public/kowloon/fighter/*`, `render/fighter/clips.ts` | 1 day | 7.9 MB → <1 MB; kills the 3.5s arena-entry stall |

Items 1, 6, and 7 are near-free and could land as a single small PR.

## Reproducing

The harness lives outside the repo (session scratchpad) and is not committed. To
rebuild it: patch `WebGL2RenderingContext.prototype.draw*` via
`page.addInitScript`, drive each game past its menus with Playwright, sample
`requestAnimationFrame` deltas for ~15s, and read back per-frame draw/triangle
deltas. Point Playwright at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
and expect software-rasteriser fps.
