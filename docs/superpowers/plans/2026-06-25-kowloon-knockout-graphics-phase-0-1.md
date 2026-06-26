# Kowloon Knockout Graphics Overhaul — Phase 0 + 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Kowloon Knockout's renderer to `three/webgpu` (`WebGPURenderer` + TSL node materials, auto WebGL2 fallback) at visual parity, then deliver the first high-fidelity visual jump — IBL lighting, PBR materials, and a bloom/tonemap/GTAO post-processing pipeline — on the existing procedural geometry.

**Architecture:** All work is confined to `components/kowloon-knockout/arena/` plus a small new render-support layer under `lib/kowloon-knockout/render/`. The deterministic sim (`lib/kowloon-knockout/game/world.ts`), networking, input, and HUD are **not touched** — the renderer only ever reads the per-frame `framesRef` snapshot, so multiplayer determinism is unaffected. The new path replaces the old `WebGLRenderer` Canvas; the old procedural look survives as the future `Low` tier (Phase 5), so nothing is deleted in these phases.

**Tech Stack:** React Three Fiber `^9.6.1`, three.js `^0.183.2` (specifically its `three/webgpu`, `three/tsl`, and `three/addons` subpath exports), Vite, Vitest `^4.1.8` (node env), Zustand store (existing).

## Global Constraints

- **three.js stays at `^0.183.2`** — do not bump three or R3F to satisfy an API; if an import path differs from this plan, verify it against the **installed** `0.183.2` and adjust (see "Verification approach" below). Copied from spec: renderer = `three/webgpu` `WebGPURenderer` + TSL, relying on its automatic WebGL2-backend fallback.
- **The combat sim, `net/*`, input, lobby, and HUD are out of scope** — no edits to `lib/kowloon-knockout/game/world.ts`, `net/`, `game/input.ts`, or the HUD/lobby components.
- **Desktop-first, scale down.** Expensive effects (post-processing, GTAO, high-res shadows) must be gated behind the render-tier check introduced in Task 5, never unconditional.
- **Lazy-load preserved.** Do not move three imports out of the already-lazy `GameView`/`Arena3D` module graph; the game must still only load three when a match starts.
- **Naming:** new render-support modules live in `lib/kowloon-knockout/render/`; new arena components in `components/kowloon-knockout/arena/`. Match the existing `'use client'` + named-default-export style of sibling files.

## Verification approach (read before starting)

This is a graphics migration. Two distinct verification modes are used, and each task states which it uses:

- **(UNIT)** — pure logic with no GPU/DOM dependency (e.g. tier detection). Real Vitest tests in node env, true TDD (failing test first). New test globs must be added to `vitest.config.ts`'s `include` array.
- **(RUN-OBSERVE)** — rendering/visual behaviour that cannot be unit-tested in node. Verified by running the app and observing. The canonical procedure, referenced as **[SMOKE]** throughout:
  1. `pnpm dev` (starts Vite + socket servers via the existing `dev` script).
  2. Open the app, navigate to Kowloon Knockout, start a **local** match (single-player vs AI — no lobby needed).
  3. Observe the stated visual criterion. Capture a screenshot for the reviewer.
  4. Open devtools console — confirm **no uncaught errors/warnings** from three/R3F and confirm the active backend log (Task 1 adds it).
  5. **Multiplayer smoke (after Phase 0 completes and after Phase 1 completes):** open two browser windows, host a lobby in one, join in the other, start the match, confirm both render and stay in sync for ~15s. This confirms the sim/net layer is untouched.

There is no automated visual-regression harness in this repo; do not invent one. "Parity" is judged by the reviewer against a baseline screenshot captured in Task 0.

---

### Task 0: Capture baseline + branch hygiene

**Files:**
- Create: `docs/superpowers/plans/baseline/` (screenshots, git-ignored if repo ignores binaries; otherwise commit)

**Interfaces:**
- Consumes: nothing.
- Produces: baseline screenshots referenced by later parity checks.

- [ ] **Step 1: Confirm deps are installed**

Run: `pnpm install`
Expected: completes; `node_modules/three` exists. Confirm three version:
Run: `node -e "console.log(require('three/package.json').version)"`
Expected: prints `0.183.2` (or a `0.183.x`).

- [ ] **Step 2: Capture baseline screenshots [SMOKE] steps 1–2**

Start a local match. Capture 3 screenshots (idle stare-down, mid-combat with neon ring + particles, a KO moment). Save under `docs/superpowers/plans/baseline/`.

- [ ] **Step 3: Confirm `three/webgpu` + `three/tsl` resolve in the installed version**

Run: `node -e "import('three/webgpu').then(m=>console.log('webgpu ok', !!m.WebGPURenderer)).catch(e=>console.log('FAIL',e.message))"`
Run: `node -e "import('three/tsl').then(m=>console.log('tsl ok', !!m.pass)).catch(e=>console.log('FAIL',e.message))"`
Expected: both print `ok true`. If either FAILs, STOP and report — the whole plan depends on these subpath exports existing in the installed build.

- [ ] **Step 4: Commit baseline**

```bash
git add docs/superpowers/plans/2026-06-25-kowloon-knockout-graphics-phase-0-1.md docs/superpowers/plans/baseline
git commit -m "chore(kowloon): capture render baseline before WebGPU overhaul"
```

---

## PHASE 0 — WebGPU foundation (parity)

### Task 1: Swap Canvas to WebGPURenderer (RUN-OBSERVE)

The load-bearing renderer change. Establishes and **documents** the confirmed renderer-swap pattern that every later task depends on.

**Files:**
- Modify: `components/kowloon-knockout/arena/GameView.tsx:1-19,89-98`
- Create: `lib/kowloon-knockout/render/webgpu.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createKowloonRenderer(props: { canvas?: HTMLCanvasElement } & Record<string, unknown>): Promise<WebGPURenderer>` — the R3F `gl` factory. Returns an initialized `WebGPURenderer`.
  - `extendKowloonThree(): void` — idempotently registers the `three/webgpu` namespace with R3F's catalogue so JSX intrinsics (`<meshStandardMaterial>` etc.) resolve to node materials. Called once at module load of `GameView`.

- [ ] **Step 1: Create the renderer factory + extend helper**

Create `lib/kowloon-knockout/render/webgpu.ts`:

```ts
import * as THREE from 'three/webgpu';
import { extend } from '@react-three/fiber';

let extended = false;

/** Register the three/webgpu namespace with R3F's JSX catalogue exactly once.
 *  After this, <meshStandardMaterial/> etc. resolve to the node-material
 *  implementations that WebGPURenderer requires. */
export function extendKowloonThree(): void {
    if (extended) return;
    // R3F's catalogue is a runtime registry; the webgpu namespace is a superset
    // of core, so extending with it is safe for all existing intrinsics.
    extend(THREE as unknown as Record<string, unknown>);
    extended = true;
}

/** R3F `gl` factory. WebGPURenderer.init() is async (adapter/device request);
 *  R3F v9 awaits a promise returned from the gl factory before first render.
 *  The renderer auto-selects the WebGPU backend and falls back to WebGL2. */
export async function createKowloonRenderer(
    props: Record<string, unknown>,
): Promise<THREE.WebGPURenderer> {
    const renderer = new THREE.WebGPURenderer({
        ...props,
        antialias: true,
        powerPreference: 'high-performance',
    });
    await renderer.init();
    // Surface which backend actually won, for the [SMOKE] console check.
    const backend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    // eslint-disable-next-line no-console
    console.info(`[kowloon] renderer backend: ${backend}`);
    return renderer;
}

export type KowloonRenderer = THREE.WebGPURenderer;
```

> **Version note:** if `renderer.backend?.isWebGPUBackend` is undefined in the installed build, derive the backend from `renderer.backend?.constructor?.name` instead. Adjust and keep the console line — Task 1's [SMOKE] depends on it.

- [ ] **Step 2: Wire the factory into the Canvas**

In `components/kowloon-knockout/arena/GameView.tsx`, replace the three import region and the `<Canvas>` props.

Replace lines 4 and 17–19:

```tsx
import { Canvas } from '@react-three/fiber';
```

with:

```tsx
import { Canvas } from '@react-three/fiber';
import { createKowloonRenderer, extendKowloonThree } from '@/lib/kowloon-knockout/render/webgpu';

// Register the three/webgpu material/object catalogue with R3F before any
// arena JSX mounts.
extendKowloonThree();
```

(Delete the `PIXEL_DPR` constant and its comment — native-res is set in Task 3; for now keep parity by leaving `dpr` untouched in this step, handled below.)

Replace the `<Canvas …>` opening tag (lines 91–96) with:

```tsx
            <Canvas
                shadows
                gl={createKowloonRenderer}
                camera={{ position: [0, 9, 15], fov: 50, near: 0.1, far: 120 }}
            >
```

> Note: `dpr` is intentionally dropped here (defaults to device DPR). If the reviewer wants strict parity-before-sharpening, temporarily add `dpr={0.5}` back and remove it in Task 3. Recommended: drop it now, since Task 3 does this anyway and a single visual review is cheaper.

- [ ] **Step 3: Run the app [SMOKE] steps 1–4**

Run: `pnpm dev`
Expected:
- Local match renders the arena, fighters, neon ring, skyline.
- Console shows `[kowloon] renderer backend: WebGPU` (on a WebGPU-capable browser e.g. current Chrome).
- **No** uncaught console errors. (Some materials may look different — that's Task 2. The bar here is: it renders and runs.)

If the screen is black or throws on a node-material intrinsic, that confirms a material that needs explicit migration → note it for Task 2, but the renderer itself must initialize.

- [ ] **Step 4: Commit**

```bash
git add lib/kowloon-knockout/render/webgpu.ts components/kowloon-knockout/arena/GameView.tsx
git commit -m "feat(kowloon): render arena with WebGPURenderer (auto WebGL2 fallback)"
```

---

### Task 2: Centralize + verify material migration (RUN-OBSERVE)

Under WebGPURenderer, materials are node materials. Most JSX intrinsics keep working after `extend`, but the two custom behaviours — `toneMapped={false}` neon and the **runtime `emissiveIntensity` mutation** in `Environment` (`Environment.tsx:47-52`) — must be confirmed against node materials, and the per-class fighter colors centralized so later phases have one seam.

**Files:**
- Create: `components/kowloon-knockout/arena/materials.ts`
- Modify: `components/kowloon-knockout/arena/Environment.tsx:47-52` (animated emissive ref typing)
- Reference (do not yet restyle): `components/kowloon-knockout/arena/StickFighter.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `NEON_PALETTE: readonly string[]` — re-exported from one place (currently duplicated as `NEON` in `Environment.tsx:8`).
  - `emissiveMaterialProps(color: string, intensity: number): { color: string; emissive: string; emissiveIntensity: number; toneMapped: false }` — helper returning props for a neon emissive `meshStandardMaterial`.

- [ ] **Step 1: Create the material helper**

Create `components/kowloon-knockout/arena/materials.ts`:

```ts
/** Shared neon palette + material prop helpers for the arena.
 *  Single source of truth so Phase 1 (PBR/bloom) has one place to tune. */
export const NEON_PALETTE = ['#ff3366', '#33ccff', '#ffcc00', '#33ff99', '#cc33ff', '#ff6633'] as const;

export function emissiveMaterialProps(color: string, intensity: number) {
    return {
        color,
        emissive: color,
        emissiveIntensity: intensity,
        toneMapped: false as const,
    };
}
```

- [ ] **Step 2: Point Environment at the shared palette + type the animated material as a node material**

In `components/kowloon-knockout/arena/Environment.tsx`:

Replace line 5–8:

```tsx
import * as THREE from 'three/webgpu';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ARENA_RADIUS } from '@/lib/kowloon-knockout/game/fighters/types';
import { NEON_PALETTE } from './materials';

const NEON = NEON_PALETTE;
```

Replace the `useFrame` body (lines 47–52) so the material type is the node material and the mutation path is confirmed:

```tsx
    useFrame((state) => {
        if (ringRef.current) {
            // MeshStandardNodeMaterial still exposes emissiveIntensity as a
            // uniform-backed scalar, so per-frame mutation works unchanged.
            const m = ringRef.current.material as THREE.MeshStandardNodeMaterial;
            m.emissiveIntensity = 1.6 + Math.sin(state.clock.elapsedTime * 4) * 0.4;
        }
    });
```

> **Version note:** if `MeshStandardNodeMaterial` is not exported from `three/webgpu` in the installed build, fall back to typing as `THREE.MeshStandardMaterial` — the runtime object is the same; only the type annotation matters here.

- [ ] **Step 3: Run the app [SMOKE]**

Run: `pnpm dev`
Expected:
- Neon ring **pulses** (emissive animation works) — confirms runtime material mutation under WebGPU.
- Skyline towers and sign strips still glow (`toneMapped={false}` honoured).
- Fighters render with their class colors.
- No console errors.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/materials.ts components/kowloon-knockout/arena/Environment.tsx
git commit -m "feat(kowloon): centralize neon materials, verify node-material emissive animation"
```

---

### Task 3: Native-resolution render (RUN-OBSERVE)

Remove the half-res pixelation that defined the old look.

**Files:**
- Modify: `components/kowloon-knockout/arena/GameView.tsx` (Canvas `dpr`, already dropped in Task 1 — confirm)
- Modify: `components/kowloon-knockout/kowloon-knockout.css:975-979` (remove `image-rendering`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Cap DPR sanely**

In `GameView.tsx`, set an explicit DPR cap on the Canvas to avoid 3× retina cost:

```tsx
            <Canvas
                shadows
                dpr={[1, 2]}
                gl={createKowloonRenderer}
                camera={{ position: [0, 9, 15], fov: 50, near: 0.1, far: 120 }}
            >
```

- [ ] **Step 2: Remove pixelated upscale CSS**

In `components/kowloon-knockout/kowloon-knockout.css`, delete the `image-rendering` rules in the `.kk-arena canvas` block (lines ~975–979). Leave any sizing rules; only remove:

```css
    image-rendering: pixelated;
    image-rendering: crisp-edges;
```

- [ ] **Step 3: Run the app [SMOKE]**

Run: `pnpm dev`
Expected: arena renders **crisp** at native resolution (no chunky pixels). Compare against `docs/superpowers/plans/baseline/` — same composition, sharper. No console errors.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/GameView.tsx components/kowloon-knockout/kowloon-knockout.css
git commit -m "feat(kowloon): render at native resolution (drop pixel-art upscale)"
```

---

### Task 4: Verify WebGL2 fallback (RUN-OBSERVE)

Prove the auto-fallback path renders, since mobile/older browsers depend on it.

**Files:** none (verification only).

**Interfaces:**
- Consumes: `createKowloonRenderer`.
- Produces: nothing.

- [ ] **Step 1: Force the WebGL2 backend**

Temporarily, in `lib/kowloon-knockout/render/webgpu.ts`, pass `forceWebGL: true` to the `WebGPURenderer` constructor (this is the documented flag to force the WebGL2 backend):

```ts
    const renderer = new THREE.WebGPURenderer({
        ...props,
        antialias: true,
        powerPreference: 'high-performance',
        forceWebGL: true,
    });
```

- [ ] **Step 2: Run the app [SMOKE]**

Run: `pnpm dev`
Expected: console shows `[kowloon] renderer backend: WebGL2`; arena renders the same as Task 3. No console errors.

> **Version note:** if `forceWebGL` is not honoured by the installed build, instead test in a browser with WebGPU disabled (`chrome://flags` → disable "Unsafe WebGPU", or Safari without the WebGPU feature flag). The criterion is unchanged: it renders on the WebGL2 backend.

- [ ] **Step 3: Revert the force flag**

Remove `forceWebGL: true`. Confirm the app returns to `WebGPU` backend.

- [ ] **Step 4: Multiplayer smoke [SMOKE] step 5**

Run host+guest in two windows; confirm both render and stay in sync ~15s. This is the Phase 0 sign-off that sim/net is untouched.

- [ ] **Step 5: Commit (no-op revert confirmation)**

```bash
git add lib/kowloon-knockout/render/webgpu.ts
git commit -m "test(kowloon): verify WebGL2 fallback backend renders arena"
```

---

## PHASE 1 — Lighting + PBR + post-processing

### Task 5: Render-tier detection (UNIT — TDD)

The one pure-logic unit in these phases. Decides which expensive effects run. Phase 1's post-processing (Task 9) gates on it; Phase 5 expands it with adaptive scaling.

**Files:**
- Create: `lib/kowloon-knockout/render/tier.ts`
- Create: `lib/kowloon-knockout/render/__tests__/tier.test.ts`
- Modify: `vitest.config.ts` (add the new test glob to `include`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type RenderTier = 'ultra' | 'high' | 'medium' | 'low'`
  - `interface RenderCaps { backend: 'WebGPU' | 'WebGL2'; gpuTier: 0 | 1 | 2 | 3; isMobile: boolean }`
  - `detectTier(caps: RenderCaps): RenderTier` — pure function.
  - `TIER_FLAGS: Record<RenderTier, { bloom: boolean; gtao: boolean; ssr: boolean; volumetrics: boolean; shadowMapSize: number; gpuParticles: boolean }>` — capability flags consumed by render components.

- [ ] **Step 1: Add the test glob to vitest config**

In `vitest.config.ts`, add to the `include` array:

```ts
      'lib/kowloon-knockout/render/__tests__/**/*.test.ts',
```

- [ ] **Step 2: Write the failing test**

Create `lib/kowloon-knockout/render/__tests__/tier.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectTier, TIER_FLAGS, type RenderCaps } from '../tier';

const caps = (o: Partial<RenderCaps> = {}): RenderCaps => ({
    backend: 'WebGPU', gpuTier: 3, isMobile: false, ...o,
});

describe('detectTier', () => {
    it('gives ultra to a high-end desktop WebGPU GPU', () => {
        expect(detectTier(caps())).toBe('ultra');
    });
    it('caps a mid desktop WebGPU GPU at high', () => {
        expect(detectTier(caps({ gpuTier: 2 }))).toBe('high');
    });
    it('drops WebGL2 desktop to at most medium', () => {
        expect(detectTier(caps({ backend: 'WebGL2', gpuTier: 3 }))).toBe('medium');
    });
    it('always returns low on mobile', () => {
        expect(detectTier(caps({ isMobile: true, backend: 'WebGPU', gpuTier: 3 }))).toBe('low');
    });
    it('returns low for a weak GPU regardless of backend', () => {
        expect(detectTier(caps({ gpuTier: 0 }))).toBe('low');
    });
});

describe('TIER_FLAGS', () => {
    it('enables the full stack only on ultra', () => {
        expect(TIER_FLAGS.ultra.ssr && TIER_FLAGS.ultra.volumetrics).toBe(true);
        expect(TIER_FLAGS.high.ssr).toBe(false);
    });
    it('disables all post on low', () => {
        expect(TIER_FLAGS.low.bloom).toBe(false);
        expect(TIER_FLAGS.low.gtao).toBe(false);
    });
    it('scales shadow map size down by tier', () => {
        expect(TIER_FLAGS.ultra.shadowMapSize).toBeGreaterThan(TIER_FLAGS.medium.shadowMapSize);
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/tier.test.ts`
Expected: FAIL — `Cannot find module '../tier'`.

- [ ] **Step 4: Implement**

Create `lib/kowloon-knockout/render/tier.ts`:

```ts
export type RenderTier = 'ultra' | 'high' | 'medium' | 'low';

export interface RenderCaps {
    backend: 'WebGPU' | 'WebGL2';
    /** Coarse GPU strength bucket: 0 weak/integrated old, 3 strong discrete. */
    gpuTier: 0 | 1 | 2 | 3;
    isMobile: boolean;
}

export function detectTier(caps: RenderCaps): RenderTier {
    if (caps.isMobile || caps.gpuTier === 0) return 'low';
    if (caps.backend === 'WebGL2') return caps.gpuTier >= 1 ? 'medium' : 'low';
    // WebGPU desktop:
    if (caps.gpuTier >= 3) return 'ultra';
    if (caps.gpuTier === 2) return 'high';
    return 'medium';
}

export const TIER_FLAGS: Record<RenderTier, {
    bloom: boolean; gtao: boolean; ssr: boolean; volumetrics: boolean;
    shadowMapSize: number; gpuParticles: boolean;
}> = {
    ultra:  { bloom: true,  gtao: true,  ssr: true,  volumetrics: true,  shadowMapSize: 4096, gpuParticles: true },
    high:   { bloom: true,  gtao: true,  ssr: false, volumetrics: false, shadowMapSize: 2048, gpuParticles: true },
    medium: { bloom: true,  gtao: false, ssr: false, volumetrics: false, shadowMapSize: 1024, gpuParticles: false },
    low:    { bloom: false, gtao: false, ssr: false, volumetrics: false, shadowMapSize: 1024, gpuParticles: false },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/tier.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/kowloon-knockout/render/tier.ts lib/kowloon-knockout/render/__tests__/tier.test.ts vitest.config.ts
git commit -m "feat(kowloon): render-tier detection + capability flags"
```

---

### Task 6: Provide tier to the scene via context + capability probe (RUN-OBSERVE + light UNIT)

Bridge the pure `detectTier` to the live renderer by probing real capabilities once the Canvas exists.

**Files:**
- Create: `components/kowloon-knockout/arena/RenderTierContext.tsx`
- Create: `lib/kowloon-knockout/render/probe.ts`
- Create: `lib/kowloon-knockout/render/__tests__/probe.test.ts`
- Modify: `vitest.config.ts` (glob already added in Task 5 covers this dir)
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx` (wrap children in provider)

**Interfaces:**
- Consumes: `detectTier`, `TIER_FLAGS`, `RenderCaps`, `RenderTier` (Task 5); `useIsMobile` (`@/lib/studio/hooks/useIsMobile`).
- Produces:
  - `gpuTierFromRendererString(s: string): 0 | 1 | 2 | 3` — pure heuristic mapping an unmasked GPU string to a bucket.
  - `RenderTierProvider` (component) + `useRenderTier(): { tier: RenderTier; flags: typeof TIER_FLAGS[RenderTier] }` hook.

- [ ] **Step 1: Write the failing probe test**

Create `lib/kowloon-knockout/render/__tests__/probe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gpuTierFromRendererString } from '../probe';

describe('gpuTierFromRendererString', () => {
    it('buckets discrete NVIDIA/AMD/Apple GPUs high', () => {
        expect(gpuTierFromRendererString('Apple M2 Pro')).toBe(3);
        expect(gpuTierFromRendererString('NVIDIA GeForce RTX 4070')).toBe(3);
    });
    it('buckets integrated Intel mid-low', () => {
        expect(gpuTierFromRendererString('Intel(R) Iris(R) Xe Graphics')).toBe(2);
        expect(gpuTierFromRendererString('Intel(R) HD Graphics 4000')).toBe(1);
    });
    it('returns 0 for unknown/software', () => {
        expect(gpuTierFromRendererString('SwiftShader')).toBe(0);
        expect(gpuTierFromRendererString('')).toBe(0);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/probe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the probe heuristic**

Create `lib/kowloon-knockout/render/probe.ts`:

```ts
/** Map an unmasked WebGL GPU renderer string to a coarse strength bucket.
 *  Deliberately conservative — used only to pick a starting tier; the Phase 5
 *  adaptive governor corrects mistakes at runtime. */
export function gpuTierFromRendererString(s: string): 0 | 1 | 2 | 3 {
    const g = s.toLowerCase();
    if (!g || g.includes('swiftshader') || g.includes('software') || g.includes('llvmpipe')) return 0;
    if (g.includes('apple m') || /rtx|radeon rx|geforce (gtx|rtx)/.test(g)) return 3;
    if (g.includes('iris') || g.includes('apple gpu') || g.includes('adreno 7') || g.includes('mali-g7')) return 2;
    if (g.includes('intel') || g.includes('uhd') || g.includes('hd graphics')) return 1;
    return 1;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/probe.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the provider + hook**

Create `components/kowloon-knockout/arena/RenderTierContext.tsx`:

```tsx
'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useIsMobile } from '@/lib/studio/hooks/useIsMobile';
import { detectTier, TIER_FLAGS, type RenderTier } from '@/lib/kowloon-knockout/render/tier';
import { gpuTierFromRendererString } from '@/lib/kowloon-knockout/render/probe';

interface TierValue { tier: RenderTier; flags: (typeof TIER_FLAGS)[RenderTier]; }
const Ctx = createContext<TierValue | null>(null);

export function RenderTierProvider({ children }: { children: ReactNode }) {
    const gl = useThree((s) => s.gl) as unknown as {
        backend?: { isWebGPUBackend?: boolean };
        getContext?: () => WebGL2RenderingContext;
    };
    const isMobile = useIsMobile();

    const value = useMemo<TierValue>(() => {
        const backend: 'WebGPU' | 'WebGL2' = gl.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
        let rendererString = '';
        try {
            const ctx = gl.getContext?.();
            const dbg = ctx?.getExtension('WEBGL_debug_renderer_info');
            if (ctx && dbg) rendererString = String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
        } catch {
            /* probing is best-effort; fall through to bucket 1 */
        }
        const gpuTier = rendererString ? gpuTierFromRendererString(rendererString) : (backend === 'WebGPU' ? 3 : 1);
        const tier = detectTier({ backend, gpuTier, isMobile });
        // eslint-disable-next-line no-console
        console.info(`[kowloon] render tier: ${tier} (backend=${backend}, gpu=${gpuTier})`);
        return { tier, flags: TIER_FLAGS[tier] };
    }, [gl, isMobile]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRenderTier(): TierValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useRenderTier must be used within RenderTierProvider');
    return v;
}
```

> **Version note:** `gl.backend?.isWebGPUBackend` mirrors the Task 1 check; keep both consistent. Under the WebGPU backend `getContext()` may not return a WebGL context — that's why the WebGPU branch defaults `gpuTier` to 3 when no GL string is available.

- [ ] **Step 6: Wrap the scene in the provider**

In `components/kowloon-knockout/arena/Arena3D.tsx`, import the provider and wrap the returned fragment's contents. Replace the `return ( <> … </> )` so all children (lights through `<Fx>`) are inside `<RenderTierProvider>`:

```tsx
import { RenderTierProvider } from './RenderTierContext';
```

and wrap:

```tsx
    return (
        <RenderTierProvider>
            <color attach="background" args={['#070010']} />
            {/* …all existing children unchanged… */}
            <Fx session={session} />
        </RenderTierProvider>
    );
```

- [ ] **Step 7: Run the app [SMOKE]**

Run: `pnpm dev`
Expected: console logs `[kowloon] render tier: ultra (…)` on a strong desktop; arena renders identically to Task 3 (no visual change yet — provider only). No errors.

- [ ] **Step 8: Commit**

```bash
git add components/kowloon-knockout/arena/RenderTierContext.tsx lib/kowloon-knockout/render/probe.ts lib/kowloon-knockout/render/__tests__/probe.test.ts components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "feat(kowloon): probe GPU caps and expose render tier via context"
```

---

### Task 7: IBL environment + lighting rebuild (RUN-OBSERVE)

Give PBR surfaces a real environment to reflect and rebuild the lights for a noir key + neon fills.

**Files:**
- Create: `components/kowloon-knockout/arena/Lighting.tsx`
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx:30-48` (replace inline lights with `<Lighting/>`)
- Asset: `public/kowloon/env-night.hdr` (user-sourced CC0, e.g. Poly Haven night HDRI; optional — code falls back procedurally)

**Interfaces:**
- Consumes: `useRenderTier` (Task 6) for `flags.shadowMapSize`.
- Produces: `<Lighting/>` component (no props) — installs environment + lights.

- [ ] **Step 1: Build the Lighting component with a procedural-or-HDRI environment**

Create `components/kowloon-knockout/arena/Lighting.tsx`:

```tsx
'use client';

import { useThree } from '@react-three/fiber';
import { Environment as DreiEnvironment, Lightformer } from '@react-three/drei';
import { useRenderTier } from './RenderTierContext';

/** Noir key light + neon fills + image-based lighting.
 *  IBL uses Lightformers (procedural, no asset dependency) so the overhaul
 *  works before any HDRI is sourced; swap to `files="/kowloon/env-night.hdr"`
 *  on DreiEnvironment once the CC0 HDRI is added. */
export default function Lighting() {
    const { flags } = useRenderTier();
    const size = flags.shadowMapSize;
    useThree(); // ensure runs inside Canvas

    return (
        <>
            {/* Image-based lighting built from emissive panels → real PBR reflections */}
            <DreiEnvironment resolution={256} background={false}>
                <Lightformer intensity={2.5} color="#33ccff" position={[-6, 4, -4]} scale={[6, 10, 1]} />
                <Lightformer intensity={2.5} color="#ff3366" position={[6, 4, 4]} scale={[6, 10, 1]} />
                <Lightformer intensity={1.2} color="#ffcc88" position={[0, 8, 0]} scale={[10, 10, 1]} rotation={[Math.PI / 2, 0, 0]} />
            </DreiEnvironment>

            <ambientLight intensity={0.12} color="#3a2f5a" />
            <directionalLight
                position={[6, 14, 8]}
                intensity={1.4}
                color="#ffe0c0"
                castShadow
                shadow-mapSize-width={size}
                shadow-mapSize-height={size}
                shadow-camera-left={-12}
                shadow-camera-right={12}
                shadow-camera-top={12}
                shadow-camera-bottom={-12}
                shadow-bias={-0.0004}
            />
            <pointLight position={[-8, 6, -4]} intensity={50} color="#33ccff" distance={40} />
            <pointLight position={[8, 6, 4]} intensity={50} color="#ff3366" distance={40} />
        </>
    );
}
```

> **Asset note:** if `public/kowloon/env-night.hdr` is later added, change `<DreiEnvironment resolution={256} background={false}>…children…</DreiEnvironment>` to `<DreiEnvironment files="/kowloon/env-night.hdr" background={false} />`. Both paths are valid; Lightformers ship now with zero asset dependency.

- [ ] **Step 2: Swap inline lights for the component**

In `components/kowloon-knockout/arena/Arena3D.tsx`, delete the inline `<ambientLight>`, `<hemisphereLight>`, `<directionalLight>`, and two `<pointLight>` elements (lines 33–48) and replace with:

```tsx
import Lighting from './Lighting';
```

and in the JSX (after `<fog>`):

```tsx
            <Lighting />
```

Keep the `<color>` background and `<fog>` as-is.

- [ ] **Step 3: Run the app [SMOKE]**

Run: `pnpm dev`
Expected: surfaces pick up colored environment reflections; lighting reads as moodier/noir; shadows still cast. Slight look change is expected and desired. No errors. (Bloom comes in Task 9 — neon won't "glow" yet.)

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/Lighting.tsx components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "feat(kowloon): IBL environment + noir key/neon-fill lighting"
```

---

### Task 8: PBR material upgrade for fighters + floor (RUN-OBSERVE)

Now that there's an environment to reflect, make the surfaces physically based.

**Files:**
- Modify: `components/kowloon-knockout/arena/Environment.tsx:57-60` (floor material)
- Modify: `components/kowloon-knockout/arena/StickFighter.tsx` (body materials — metalness/roughness)
- Modify: `components/kowloon-knockout/arena/materials.ts` (add a PBR body-material helper)

**Interfaces:**
- Consumes: `NEON_PALETTE`, `emissiveMaterialProps` (Task 2).
- Produces: `bodyMaterialProps(color: string): { color: string; roughness: number; metalness: number }` in `materials.ts`.

- [ ] **Step 1: Add the body-material helper**

Append to `components/kowloon-knockout/arena/materials.ts`:

```ts
/** PBR props for fighter body parts — slightly metallic, matte-ish so the neon
 *  environment glints on edges without going chrome. */
export function bodyMaterialProps(color: string) {
    return { color, roughness: 0.45, metalness: 0.35 };
}
```

- [ ] **Step 2: Make the floor a wet, reflective PBR surface**

In `Environment.tsx`, replace the floor material (line 59):

```tsx
                <meshStandardMaterial color="#0d0a16" roughness={0.25} metalness={0.6} envMapIntensity={1.4} />
```

(Lower roughness + higher metalness makes the rooftop read as wet, catching the Lightformer neon. Full SSR is Phase 2.)

- [ ] **Step 3: Apply the PBR helper to fighter bodies**

In `components/kowloon-knockout/arena/StickFighter.tsx`, find the body-part `<meshStandardMaterial>` elements (limbs/torso/head — those using the per-class `color`/`accent`) and replace their inline `color=…/flatShading` props with the helper spread, e.g.:

```tsx
                <meshStandardMaterial {...bodyMaterialProps(color)} />
```

Add the import at the top:

```tsx
import { bodyMaterialProps } from './materials';
```

Leave the headband/accent emissive bits using `emissiveMaterialProps(accent, …)` where they were emissive. **Do not** change limb geometry or the animation code — materials only.

> Implementation note for the worker: open `StickFighter.tsx` and apply `bodyMaterialProps(color)` to the non-emissive body meshes only. If a part used `flatShading` for the faceted look, drop it — PBR + the new lighting supersedes the flat look. Keep accent/emissive parts on `emissiveMaterialProps`.

- [ ] **Step 4: Run the app [SMOKE]**

Run: `pnpm dev`
Expected: fighters have subtle sheen and pick up cyan/magenta environment light on edges; floor reflects neon as a wet rooftop. No errors.

- [ ] **Step 5: Commit**

```bash
git add components/kowloon-knockout/arena/materials.ts components/kowloon-knockout/arena/Environment.tsx components/kowloon-knockout/arena/StickFighter.tsx
git commit -m "feat(kowloon): PBR materials for fighters and wet reflective floor"
```

---

### Task 9: Post-processing pipeline — bloom + tonemap + GTAO (RUN-OBSERVE)

The headline effect. Tier-gated via Task 6.

**Files:**
- Create: `components/kowloon-knockout/arena/PostFx.tsx`
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx` (mount `<PostFx/>` last, inside provider)

**Interfaces:**
- Consumes: `useRenderTier` (Task 6); `three/webgpu` `PostProcessing`; `three/tsl` `pass`; bloom/GTAO TSL nodes from `three/addons`.
- Produces: `<PostFx/>` component (no props) — takes over rendering when post is enabled.

- [ ] **Step 1: Build the PostFx component**

Create `components/kowloon-knockout/arena/PostFx.tsx`:

```tsx
'use client';

import { useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { useRenderTier } from './RenderTierContext';

/** WebGPU TSL post pipeline: GTAO → scene → bloom on emissives → ACES tonemap.
 *  When the tier disables all post, renders nothing and lets R3F render
 *  normally. Takes over the render loop (useFrame priority 1) when active. */
export default function PostFx() {
    const { flags } = useRenderTier();
    const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);

    const enabled = flags.bloom || flags.gtao;

    const post = useMemo(() => {
        if (!enabled) return null;
        const pp = new THREE.PostProcessing(gl);
        const scenePass = pass(scene, camera);
        let color = scenePass.getTextureNode('output');

        if (flags.gtao) {
            const aoPass = ao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), camera);
            color = color.mul(aoPass);
        }
        if (flags.bloom) {
            color = color.add(bloom(color, 0.9, 0.4, 0.85));
        }
        pp.outputNode = color;
        return pp;
    }, [enabled, gl, scene, camera, flags.bloom, flags.gtao]);

    // ACES tonemapping on the renderer for the noir contrast curve.
    useEffect(() => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
    }, [gl]);

    useEffect(() => {
        if (post) post.setSize(size.width, size.height);
    }, [post, size.width, size.height]);

    // Priority > 0 disables R3F's automatic render; we drive it.
    useFrame(() => {
        if (post) post.renderAsync();
    }, 1);

    return null;
}
```

> **Version notes (verify against installed `0.183.2`):**
> - Addon import paths: confirm `three/addons/tsl/display/BloomNode.js` exports `bloom` and `three/addons/tsl/display/GTAONode.js` exports `ao`. If the path/name differs (these moved during the TSL stabilization), adjust the import — the pipeline structure is unchanged. Run `node -e "import('three/addons/tsl/display/BloomNode.js').then(m=>console.log(Object.keys(m)))"` to list exports.
> - `getTextureNode('normal')` requires the scene pass to output normals; if GTAO errors on a missing normal buffer, gate GTAO off for this phase (set `flags.gtao` consumption aside) and ship bloom + tonemap — GTAO can move to its own follow-up. Bloom is the headline; do not let GTAO block it.

- [ ] **Step 2: Mount PostFx last in the scene**

In `Arena3D.tsx`, add inside the provider, after `<Fx session={session} />`:

```tsx
import PostFx from './PostFx';
```

```tsx
            <PostFx />
```

- [ ] **Step 3: Run the app [SMOKE]**

Run: `pnpm dev`
Expected: **the neon blooms** — ring, towers, signs, and hit sparks glow and bleed light; overall image has filmic contrast. Confirm console tier log says `ultra`/`high` (post active). No errors / no black screen. Capture a screenshot beside the baseline — this is the "whoa" check.

- [ ] **Step 4: Verify the low path skips post**

Temporarily force `forceWebGL: true` (Task 4) → tier resolves to `medium`/`low`; confirm app still renders (medium keeps bloom; low shows no post but no crash). Revert the flag.

- [ ] **Step 5: Commit**

```bash
git add components/kowloon-knockout/arena/PostFx.tsx components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "feat(kowloon): bloom + ACES tonemap + GTAO post pipeline (tier-gated)"
```

---

### Task 10: Color grade + final look pass + sign-off (RUN-OBSERVE)

Tie the palette together and run the phase sign-off.

**Files:**
- Modify: `components/kowloon-knockout/arena/PostFx.tsx` (exposure/bloom tuning)
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx:31` (fog tuning to match new contrast)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Tune fog + exposure for the graded look**

In `Arena3D.tsx`, deepen the fog slightly to sit under bloom (line 31):

```tsx
            <fog attach="fog" args={['#0a0118', 16, 55]} />
```

In `PostFx.tsx`, expose two tuning constants at the top of the component and use them, so the reviewer can dial the look in one place:

```tsx
    const BLOOM_STRENGTH = 0.9;   // emissive bleed
    const EXPOSURE = 1.05;        // overall brightness post-ACES
```

Replace `bloom(color, 0.9, 0.4, 0.85)` with `bloom(color, BLOOM_STRENGTH, 0.4, 0.85)` and `gl.toneMappingExposure = 1.1` with `gl.toneMappingExposure = EXPOSURE`.

- [ ] **Step 2: Run the app [SMOKE] full pass**

Run: `pnpm dev`
Expected: cohesive neon-noir look — crisp, bloomed neon, wet reflective floor, moody fog. Compare all three baseline shots. No errors.

- [ ] **Step 3: Performance check**

With devtools Performance/FPS meter on a desktop, confirm a sustained ~60 fps during combat at `ultra`. Note the number for the reviewer. If well below 60, lower `BLOOM_STRENGTH`/resolution or report for a tier-threshold adjustment (do not silently degrade).

- [ ] **Step 4: Multiplayer sign-off [SMOKE] step 5**

Host+guest two-window test for ~20s through a full round including a KO. Confirm sync and that both clients show the new look. This is the Phase 1 sign-off that sim/net remains untouched.

- [ ] **Step 5: Run the full unit suite**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render`
Expected: all tier + probe tests PASS.

- [ ] **Step 6: Commit**

```bash
git add components/kowloon-knockout/arena/PostFx.tsx components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "feat(kowloon): final color grade + neon-noir look pass (Phase 1 complete)"
```

---

## Phases 2–5 (not in this plan)

Per the spec, these get their own plans when reached:
- **Phase 2** — environment overhaul (SSR, volumetric fog, animated signage, parallax skyline).
- **Phase 3** — GPU compute particles (port `Fx.tsx`).
- **Phase 4** — skeletal characters (shared rig + Mixamo/CC0 clips + sim-state→clip state machine).
- **Phase 5** — full tier UI + adaptive FPS governor + mobile/WebGL2 validation.

The seams these phases need already exist after Phase 0/1: `materials.ts` (one place for look), `tier.ts`/`TIER_FLAGS` (gating, with `ssr`/`volumetrics`/`gpuParticles` flags already declared), `RenderTierContext` (live tier), and `PostFx` (extensible node graph).
```
