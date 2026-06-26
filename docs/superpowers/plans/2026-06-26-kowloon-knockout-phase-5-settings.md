# Kowloon Knockout Phase 5 — Tier Settings + Adaptive FPS Governor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a main-menu Graphics panel (Auto/Ultra/High/Medium/Low + a recent-FPS readout), a downscale-only adaptive FPS governor (Auto mode only), persistence of the choice, and mobile/WebGL2 validation — the control/scaling layer over the tiers shipped in Phases 0–4.

**Architecture:** A pure governor module + a localStorage-persisted zustand store bridge the DOM menus and the in-Canvas tier provider. `RenderTierProvider` becomes runtime-stateful (effective tier = `preference==='auto' ? governorTier : preference`); a `Governor` component samples frametime in-Canvas and steps the tier down on sustained low FPS. The eight existing `useRenderTier()` consumers re-gate automatically. Sim/net/input/HUD untouched.

**Tech Stack:** React Three Fiber `^9.6.1` (`useFrame`), `zustand` 5 (`persist`/`createJSONStorage`), TypeScript, Vitest `^4.1.8` (node env).

## Global Constraints

- **Downscale-only governor**, active in Auto mode only. Manual pick = locked tier, governor inert. The only thing that ever raises tier is a manual pick or a new session/mount.
- **No net-protocol / sim / input / HUD changes.** No new render techniques; no changes to `TIER_FLAGS` values or `detectTier` logic.
- **Additive context shape:** `useRenderTier()` keeps returning `{ tier, flags }` (existing consumers unaffected); new fields `detectedTier`, `preference`, `downscale` are added.
- **Persistence:** zustand `persist`, localStorage key `kk-graphics`, persist ONLY `preference` (fps is ephemeral). Node-safe (storage getter returns undefined when `window` is absent).
- **Governor defaults (tunable):** target 50 FPS → `BUDGET_MS = 20`; rolling window 90 frames (~1.5 s); after a downscale, reset the monitor (cooldown = re-sample a full window before another step).
- **Test runner:** `node_modules/.bin/vitest run <path>` (node env). **Lint:** `node_modules/.bin/eslint <files>`. The config already globs `lib/kowloon-knockout/render/**/__tests__/**` — no config change needed.
- Per project workflow: a `senior-swe-reviewer` pass before the PR.

## Verification approach

- **(UNIT)** — `governor.ts` and `graphicsStore.ts`: real Vitest TDD in node. Run `node_modules/.bin/vitest run lib/kowloon-knockout/render`.
- **(RUN-OBSERVE)** — `RenderTierContext` refactor, `Governor.tsx`, `GraphicsSettings.tsx`/`MainMenu`: browser-only; **[SMOKE]** deferred to user; `eslint` is the headless gate.

## Parallelization guidance

Tasks 1 (governor) and 2 (store) are independent pure modules. Task 3 (context refactor) consumes both. Task 4 (Governor component) consumes Task 3. Task 5 (panel + menu) consumes Task 2. Build 1→2→3→4→5.

---

### Task 1: `governor.ts` — frametime monitor + downscale decision (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/governor.ts`
- Create: `lib/kowloon-knockout/render/__tests__/governor.test.ts`

**Interfaces:**
- Consumes: `RenderTier` from `./tier`.
- Produces:
  - `function nextLowerTier(tier: RenderTier): RenderTier` (ultra→high→medium→low, floors at low).
  - `class FrametimeMonitor` with `constructor(window = 90)`, `push(deltaMs)`, `full(): boolean`, `averageMs(): number`, `reset()`.
  - `function shouldDownscale(monitor: FrametimeMonitor, budgetMs: number): boolean` — true only when the window is full AND the rolling average exceeds budget.

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/__tests__/governor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextLowerTier, FrametimeMonitor, shouldDownscale } from '../governor';

describe('nextLowerTier', () => {
    it('steps down one level and floors at low', () => {
        expect(nextLowerTier('ultra')).toBe('high');
        expect(nextLowerTier('high')).toBe('medium');
        expect(nextLowerTier('medium')).toBe('low');
        expect(nextLowerTier('low')).toBe('low');
    });
});

describe('FrametimeMonitor', () => {
    it('is not full until the window fills, then averages a fixed window', () => {
        const m = new FrametimeMonitor(3);
        m.push(10); m.push(20);
        expect(m.full()).toBe(false);
        m.push(30);
        expect(m.full()).toBe(true);
        expect(m.averageMs()).toBeCloseTo(20, 5);
        m.push(60); // drops the oldest (10) → [20,30,60]
        expect(m.averageMs()).toBeCloseTo(110 / 3, 5);
    });
    it('reset empties the window', () => {
        const m = new FrametimeMonitor(2);
        m.push(10); m.push(10);
        m.reset();
        expect(m.full()).toBe(false);
        expect(m.averageMs()).toBe(0);
    });
});

describe('shouldDownscale', () => {
    it('is false until the window is full, even when slow', () => {
        const m = new FrametimeMonitor(3);
        m.push(50); m.push(50);
        expect(shouldDownscale(m, 20)).toBe(false);
    });
    it('is true when a full window averages over budget', () => {
        const m = new FrametimeMonitor(3);
        m.push(30); m.push(30); m.push(30);
        expect(shouldDownscale(m, 20)).toBe(true);
    });
    it('is false when a full window is within budget', () => {
        const m = new FrametimeMonitor(3);
        m.push(15); m.push(16); m.push(14);
        expect(shouldDownscale(m, 20)).toBe(false);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/governor.test.ts`
Expected: FAIL — `Cannot find module '../governor'`.

- [ ] **Step 3: Implement `governor.ts`**

Create `lib/kowloon-knockout/render/governor.ts`:

```ts
import type { RenderTier } from './tier';

const TIER_ORDER: RenderTier[] = ['low', 'medium', 'high', 'ultra'];

/** One tier down (ultra→high→medium→low); floors at low. */
export function nextLowerTier(tier: RenderTier): RenderTier {
    const i = TIER_ORDER.indexOf(tier);
    return i <= 0 ? 'low' : TIER_ORDER[i - 1];
}

/** Rolling average of frame deltas (ms) over a fixed window. */
export class FrametimeMonitor {
    private samples: number[] = [];
    constructor(private readonly window: number = 90) {}
    push(deltaMs: number): void {
        this.samples.push(deltaMs);
        if (this.samples.length > this.window) this.samples.shift();
    }
    full(): boolean {
        return this.samples.length >= this.window;
    }
    averageMs(): number {
        if (this.samples.length === 0) return 0;
        let sum = 0;
        for (const s of this.samples) sum += s;
        return sum / this.samples.length;
    }
    reset(): void {
        this.samples = [];
    }
}

/** Downscale only when the average over a FULL window exceeds the per-frame
 *  budget — i.e. FPS has been sustainedly below target, not a transient spike. */
export function shouldDownscale(monitor: FrametimeMonitor, budgetMs: number): boolean {
    return monitor.full() && monitor.averageMs() > budgetMs;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/governor.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/render/governor.ts lib/kowloon-knockout/render/__tests__/governor.test.ts
git add lib/kowloon-knockout/render/governor.ts lib/kowloon-knockout/render/__tests__/governor.test.ts
git commit -m "feat(kowloon): frametime monitor + downscale decision for the FPS governor"
```

---

### Task 2: `graphicsStore.ts` — persisted graphics-settings store (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/graphicsStore.ts`
- Create: `lib/kowloon-knockout/render/__tests__/graphicsStore.test.ts`

**Interfaces:**
- Consumes: `RenderTier` from `./tier`; `zustand`.
- Produces:
  - `type TierPreference = 'auto' | RenderTier`
  - `useGraphicsStore` — zustand hook/store with state `{ preference: TierPreference; setPreference(p): void; fps: number; setFps(n): void }`. Default `preference: 'auto'`, `fps: 0`. Persisted to localStorage key `kk-graphics`, persisting ONLY `preference`. Node-safe.

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/__tests__/graphicsStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphicsStore } from '../graphicsStore';

describe('useGraphicsStore', () => {
    beforeEach(() => {
        useGraphicsStore.setState({ preference: 'auto', fps: 0 });
    });
    it('defaults to auto preference and 0 fps', () => {
        const s = useGraphicsStore.getState();
        expect(s.preference).toBe('auto');
        expect(s.fps).toBe(0);
    });
    it('setPreference updates the preference', () => {
        useGraphicsStore.getState().setPreference('medium');
        expect(useGraphicsStore.getState().preference).toBe('medium');
        useGraphicsStore.getState().setPreference('auto');
        expect(useGraphicsStore.getState().preference).toBe('auto');
    });
    it('setFps updates fps', () => {
        useGraphicsStore.getState().setFps(58);
        expect(useGraphicsStore.getState().fps).toBe(58);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/graphicsStore.test.ts`
Expected: FAIL — `Cannot find module '../graphicsStore'`.

- [ ] **Step 3: Implement `graphicsStore.ts`**

Create `lib/kowloon-knockout/render/graphicsStore.ts`:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RenderTier } from './tier';

/** 'auto' = adaptive governor; a specific tier = locked (governor inert). */
export type TierPreference = 'auto' | RenderTier;

interface GraphicsState {
    preference: TierPreference;
    setPreference: (p: TierPreference) => void;
    /** Most recent smoothed FPS from the in-Canvas Governor (ephemeral). */
    fps: number;
    setFps: (n: number) => void;
}

export const useGraphicsStore = create<GraphicsState>()(
    persist(
        (set) => ({
            preference: 'auto',
            setPreference: (preference) => set({ preference }),
            fps: 0,
            setFps: (fps) => set({ fps }),
        }),
        {
            name: 'kk-graphics',
            // Node/SSR-safe: no storage when window is absent (persistence no-ops).
            storage: createJSONStorage(() =>
                (typeof window !== 'undefined' ? window.localStorage : undefined as unknown as Storage),
            ),
            // Persist only the user's preference; fps is runtime telemetry.
            partialize: (s) => ({ preference: s.preference }),
        },
    ),
);
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/graphicsStore.test.ts`
Expected: PASS (3 tests). (zustand may log a persist warning about unavailable storage in node — that is expected and harmless.)

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/render/graphicsStore.ts lib/kowloon-knockout/render/__tests__/graphicsStore.test.ts
git add lib/kowloon-knockout/render/graphicsStore.ts lib/kowloon-knockout/render/__tests__/graphicsStore.test.ts
git commit -m "feat(kowloon): persisted graphics-settings store (preference + fps)"
```

---

### Task 3: `RenderTierContext.tsx` — runtime-mutable tier (RUN-OBSERVE)

**Files:**
- Modify: `components/kowloon-knockout/arena/RenderTierContext.tsx`

**Interfaces:**
- Consumes: `nextLowerTier` (Task 1); `useGraphicsStore`, `TierPreference` (Task 2); existing `detectTier`/`TIER_FLAGS`/`gpuTierFromRendererString`/`useIsMobile`.
- Produces: `useRenderTier()` returning `{ tier, flags, detectedTier, preference, downscale }` (the first two unchanged for existing consumers).

- [ ] **Step 1: Make the tier runtime-stateful**

Rewrite `components/kowloon-knockout/arena/RenderTierContext.tsx`. Keep the detection logic, but split it into a memoized `detectedTier`, hold a `governorTier` state initialised to it, read `preference` from the store, and compute the effective tier. Expose `downscale` (one step via `nextLowerTier`).

```tsx
'use client';

import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useIsMobile } from '@/lib/studio/hooks/useIsMobile';
import { detectTier, TIER_FLAGS, type RenderTier } from '@/lib/kowloon-knockout/render/tier';
import { gpuTierFromRendererString } from '@/lib/kowloon-knockout/render/probe';
import { nextLowerTier } from '@/lib/kowloon-knockout/render/governor';
import { useGraphicsStore, type TierPreference } from '@/lib/kowloon-knockout/render/graphicsStore';

interface TierValue {
    tier: RenderTier;
    flags: (typeof TIER_FLAGS)[RenderTier];
    detectedTier: RenderTier;
    preference: TierPreference;
    /** Governor: lower the auto tier by one step (downscale-only). */
    downscale: () => void;
}
const Ctx = createContext<TierValue | null>(null);

export function RenderTierProvider({ children }: { children: ReactNode }) {
    const gl = useThree((s) => s.gl) as unknown as {
        backend?: { isWebGPUBackend?: boolean };
        getContext?: () => WebGL2RenderingContext;
    };
    const isMobile = useIsMobile();
    const preference = useGraphicsStore((s) => s.preference);

    const detectedTier = useMemo<RenderTier>(() => {
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
        console.info(`[kowloon] detected render tier: ${tier} (backend=${backend}, gpu=${gpuTier})`);
        return tier;
    }, [gl, isMobile]);

    // The governor lowers this while in Auto. Resets to detected on remount.
    const [governorTier, setGovernorTier] = useState<RenderTier>(detectedTier);
    const downscale = useCallback(() => setGovernorTier((t) => nextLowerTier(t)), []);

    const value = useMemo<TierValue>(() => {
        const tier = preference === 'auto' ? governorTier : preference;
        return { tier, flags: TIER_FLAGS[tier], detectedTier, preference, downscale };
    }, [preference, governorTier, detectedTier, downscale]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRenderTier(): TierValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useRenderTier must be used within RenderTierProvider');
    return v;
}
```

> Note: `useState(detectedTier)` initialises `governorTier` to the first detected tier; detection is stable per mount (memoised on `[gl, isMobile]`), so `governorTier` is only ever changed by `downscale`. Switching `preference` away from `auto` and back keeps the last governor tier (acceptable — a fresh match remounts the provider and resets it).

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/RenderTierContext.tsx`
Expected: clean.

- [ ] **Step 3: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → match. Expected: renders exactly as before at the detected tier (no behaviour change yet — `preference` defaults to `auto`, `governorTier` = detected). No console errors beyond the existing `[kowloon] detected render tier` line. Existing consumers (`PostFx`, `Rain`, `Fog`, `Fx`, `Skyline`, `Atmosphere`, `Lighting`, `Fighter`) still gate correctly.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/RenderTierContext.tsx
git commit -m "feat(kowloon): runtime-mutable render tier (preference + governor downscale)"
```

---

### Task 4: `Governor.tsx` — in-Canvas frametime sampler (RUN-OBSERVE)

**Files:**
- Create: `components/kowloon-knockout/arena/Governor.tsx`
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx` (mount `<Governor />`)

**Interfaces:**
- Consumes: `useRenderTier()` (`{ preference, downscale }`, Task 3); `useGraphicsStore` `setFps` (Task 2); `FrametimeMonitor`, `shouldDownscale` (Task 1); `useFrame`.
- Produces: `<Governor />` (no props), renders null.

- [ ] **Step 1: Implement the governor sampler**

Create `components/kowloon-knockout/arena/Governor.tsx`. Sample frametime each frame, publish a smoothed FPS to the store (throttled), and — only in Auto — step the tier down on sustained low FPS, resetting the monitor as a cooldown.

```tsx
'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRenderTier } from './RenderTierContext';
import { useGraphicsStore } from '@/lib/kowloon-knockout/render/graphicsStore';
import { FrametimeMonitor, shouldDownscale } from '@/lib/kowloon-knockout/render/governor';

const TARGET_FPS = 50;
const BUDGET_MS = 1000 / TARGET_FPS;   // 20ms
const WINDOW = 90;                      // ~1.5s at 60fps
const FPS_PUBLISH_EVERY = 20;           // throttle store writes

/** Adaptive FPS governor: in Auto mode, steps the render tier down one level
 *  when the rolling-average frametime stays over budget (never raises). Always
 *  publishes a smoothed FPS to the store for the menu readout. Renders nothing. */
export default function Governor() {
    const { preference, downscale } = useRenderTier();
    const setFps = useGraphicsStore((s) => s.setFps);
    const monitor = useMemo(() => new FrametimeMonitor(WINDOW), []);
    const frameCount = useRef(0);

    useFrame((_, deltaRaw) => {
        const deltaMs = Math.min(100, deltaRaw * 1000); // clamp tab-stalls
        monitor.push(deltaMs);

        frameCount.current++;
        if (frameCount.current % FPS_PUBLISH_EVERY === 0) {
            const avg = monitor.averageMs();
            if (avg > 0) setFps(Math.round(1000 / avg));
        }

        if (preference !== 'auto') return;
        if (shouldDownscale(monitor, BUDGET_MS)) {
            downscale();
            monitor.reset(); // cooldown: re-sample a full window before stepping again
        }
    });

    return null;
}
```

- [ ] **Step 2: Mount in `Arena3D.tsx`**

In `components/kowloon-knockout/arena/Arena3D.tsx`, add `import Governor from './Governor';` and render `<Governor />` inside `<RenderTierProvider>` (e.g. right after `<Lighting />`).

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Governor.tsx components/kowloon-knockout/arena/Arena3D.tsx`
Expected: clean.

- [ ] **Step 4: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → match. Expected: with `preference='auto'` on a struggling machine, after ~1.5 s of sub-50 FPS the tier steps down one level (visible: post/particles/shadows simplify), and it does NOT oscillate back up. On a healthy machine nothing changes. The store's `fps` updates (verify via the panel in Task 5). Force a manual tier (Task 5) → no governor stepping.

- [ ] **Step 5: Commit**

```bash
git add components/kowloon-knockout/arena/Governor.tsx components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "feat(kowloon): in-Canvas adaptive FPS governor (downscale-only)"
```

---

### Task 5: `GraphicsSettings.tsx` + MainMenu button (RUN-OBSERVE)

**Files:**
- Create: `components/kowloon-knockout/GraphicsSettings.tsx`
- Modify: `components/kowloon-knockout/MainMenu.tsx`

**Interfaces:**
- Consumes: `useGraphicsStore` (`preference`, `setPreference`, `fps`) (Task 2); `TierPreference` (Task 2).
- Produces: `<GraphicsSettings />` panel; a "Graphics" toggle button in `MainMenu`.

- [ ] **Step 1: Build the panel**

Create `components/kowloon-knockout/GraphicsSettings.tsx`. Five preset buttons bound to `preference` (active highlighted), and a recent-FPS readout. Reuse the existing neon button classes; large tap targets for touch.

```tsx
'use client';

import { useGraphicsStore, type TierPreference } from '@/lib/kowloon-knockout/render/graphicsStore';

const PRESETS: { value: TierPreference; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'ultra', label: 'Ultra' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

/** Main-menu graphics settings: quality preset + recent-match FPS readout.
 *  'Auto' enables the adaptive downscale governor; a specific tier locks it.
 *  FPS reflects the most recent gameplay (updated in-match by the Governor). */
export default function GraphicsSettings() {
    const preference = useGraphicsStore((s) => s.preference);
    const setPreference = useGraphicsStore((s) => s.setPreference);
    const fps = useGraphicsStore((s) => s.fps);

    return (
        <div className="kk-graphics-panel">
            <h2 className="controls-title">GRAPHICS</h2>
            <div className="kk-graphics-presets">
                {PRESETS.map((p) => (
                    <button
                        key={p.value}
                        className={`neon-button neon-button-controls${preference === p.value ? ' is-active' : ''}`}
                        onClick={() => setPreference(p.value)}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="kk-graphics-fps">
                {fps > 0 ? `Recent FPS: ${fps}` : 'Recent FPS: —'}
            </div>
            <p className="kk-graphics-hint">
                Auto adapts quality to keep the frame rate smooth. Pick a level to lock it.
            </p>
        </div>
    );
}
```

Add minimal styles to `components/kowloon-knockout/kowloon-knockout.css` (mirror the existing controls-panel look; ensure tap targets ≥44px):

```css
.kk-graphics-panel { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
.kk-graphics-presets { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; }
.kk-graphics-presets .neon-button { min-width: 96px; min-height: 44px; }
.neon-button.is-active { outline: 2px solid #33ccff; box-shadow: 0 0 12px #33ccff; }
.kk-graphics-fps { font-variant-numeric: tabular-nums; opacity: 0.85; }
.kk-graphics-hint { font-size: 0.85rem; opacity: 0.6; max-width: 22rem; text-align: center; }
```

> Read the existing `kowloon-knockout.css` controls/combos panel rules first and match their container/spacing conventions rather than these defaults if they differ; the goal is visual consistency with the existing menu panels.

- [ ] **Step 2: Wire the button + panel into `MainMenu.tsx`**

In `components/kowloon-knockout/MainMenu.tsx`: add `import GraphicsSettings from './GraphicsSettings';`; add state `const [showGraphics, setShowGraphics] = useState(false);`; add a "Graphics" button alongside the existing Controls/Combos buttons (same `neon-button neon-button-controls` style) whose `onClick` toggles `showGraphics` and closes the others (`setShowControls(false); setShowCombos(false);`); and ensure the Controls/Combos buttons also `setShowGraphics(false)` so only one panel shows. Render `{showGraphics && <GraphicsSettings />}` in the same place the other panels render.

```tsx
// button (mirror the existing neon-button-controls buttons):
<motion.button
    className="neon-button neon-button-controls"
    onClick={() => { setShowGraphics(!showGraphics); setShowControls(false); setShowCombos(false); }}
>
    GRAPHICS
</motion.button>

// panel (next to the existing showControls/showCombos panels):
{showGraphics && <GraphicsSettings />}
```

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/GraphicsSettings.tsx components/kowloon-knockout/MainMenu.tsx`
Expected: clean.

- [ ] **Step 4: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → main menu → Graphics. Expected: the panel opens (others close); picking Ultra/High/Medium/Low locks that quality (visible next match) and disables the governor; Auto re-enables it; the choice **persists across reload** (localStorage `kk-graphics`); after a match the FPS readout shows a recent number. On mobile/touch the buttons are tappable. Force WebGL2 → menu + panel work, game runs on CPU paths.

- [ ] **Step 5: Commit**

```bash
git add components/kowloon-knockout/GraphicsSettings.tsx components/kowloon-knockout/MainMenu.tsx components/kowloon-knockout/kowloon-knockout.css
git commit -m "feat(kowloon): main-menu graphics settings panel (quality + recent FPS)"
```

---

## Final integration

After all tasks:
- Full unit run: `node_modules/.bin/vitest run lib/kowloon-knockout/render` — governor + graphicsStore (+ prior render suites) pass.
- **[SMOKE] (user):** Auto governor downscales on a struggling machine without oscillating; manual tiers lock; preference persists across reload; FPS readout reflects recent play; mobile renders `low` with a touch-usable panel; forced WebGL2 runs with no compute/crash.
- `senior-swe-reviewer` pass on the branch diff before opening the PR.

This is the final phase of the Kowloon Knockout graphics overhaul (Phases 0–5).
