# Kowloon Knockout Phase 2 — Environment Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the procedural neon-Kowloon backdrop into a wet-reflective, atmospheric, animated, multi-layer cityscape — all tier-gated — building on the merged Phase 0+1 WebGPU/TSL render path.

**Architecture:** All work lives in `components/kowloon-knockout/arena/` plus pure generators under `lib/kowloon-knockout/render/`. Two foundation tasks (rename tier flags; extract towers/signs out of `Environment.tsx`) come first; then two pure TDD generators; then four mostly-independent subsystem integrations. The combat sim, networking, input, and HUD are untouched — the render layer only reads the per-frame snapshot.

**Tech Stack:** React Three Fiber `^9.6.1`, three.js `^0.183.2` (`three/webgpu` `InstancedMesh`; `three/tsl` `reflector`/`time`/`oscSine`/`mrt`/`texture`), Vite, Vitest `^4.1.8` (node env).

## Global Constraints

- **three stays at `^0.183.2`.** Use `three/tsl` `reflector()` (the legacy WebGL `Reflector` class is absent from `three/webgpu`). These TSL exports are confirmed present: `reflector`, `time`, `oscSine`, `mrt`, `texture`; `three/webgpu` exports `InstancedMesh`.
- **Out of scope — do not edit:** `lib/kowloon-knockout/game/**`, `net/**`, `game/input.ts`, HUD, lobby, and `PostFx.tsx`'s passes (bloom/GTAO/tonemap stay as shipped).
- **All geometry stays procedural.** No texture files, HDRIs, or GLB props.
- **Tier-gating is mandatory** for expensive techniques: planar reflection = `reflection` flag (ultra only); light shafts + haze = `atmosphere` flag (ultra/high). Lower tiers must never pay for them.
- **Low-tier visual parity is a merge gate** for any task that moves existing geometry (towers/signs extraction) — the `low` tier must look identical to current `main`.
- **Naming:** new arena components match the existing `'use client'` + named-default-export style; new render-support modules live in `lib/kowloon-knockout/render/`.

## Verification approach (read before starting)

Same split as Phase 0+1:
- **(UNIT)** — pure generators (`skyline.ts`, `signage.ts`) and the tier flags: real Vitest TDD in node env. Run with `node_modules/.bin/vitest run <path>`.
- **(RUN-OBSERVE)** — rendering. Cannot be verified headlessly. Verified by the user via **[SMOKE]**: `pnpm dev` → Kowloon Knockout → local match → observe the stated criterion + screenshot; confirm no console errors. Headless implementers run `node_modules/.bin/eslint <files>` as their gate and mark visual checks "deferred to user".
- **Per the project workflow:** every task's PR is preceded by a `senior-swe-reviewer` pass.

## Parallelization guidance (for the build)

- **Sequential foundation:** Task 1 (flags) and Task 2 (extraction) must land before the subsystems.
- **Parallel-safe after foundation:** Task 3 and Task 4 (pure generators) are independent of everything and each other. Task 7 (reflection, edits `Environment.tsx` floor) and Task 8 (atmosphere, new file) are independent of the Skyline tasks.
- **Conflict:** Task 5 and Task 6 both edit `Skyline.tsx` — run them sequentially (5 then 6) or in the same worktree, not as conflicting parallel worktrees.

---

### Task 1: Rename tier flags `ssr`→`reflection`, `volumetrics`→`atmosphere`

**Files:**
- Modify: `lib/kowloon-knockout/render/tier.ts`
- Modify: `lib/kowloon-knockout/render/__tests__/tier.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TIER_FLAGS[tier].reflection: boolean` and `TIER_FLAGS[tier].atmosphere: boolean` (replacing `ssr`/`volumetrics`). Values unchanged: `reflection` true only on `ultra`; `atmosphere` true on `ultra` and `high`.

- [ ] **Step 1: Update the test to the new flag names (RED)**

In `lib/kowloon-knockout/render/__tests__/tier.test.ts`, replace the `TIER_FLAGS` assertions (currently lines ~28-29) with:

```ts
    it('enables the full stack only on ultra', () => {
        expect(TIER_FLAGS.ultra.reflection && TIER_FLAGS.ultra.atmosphere).toBe(true);
        expect(TIER_FLAGS.high.reflection).toBe(false);
    });
    it('enables atmosphere on high but not reflection', () => {
        expect(TIER_FLAGS.high.atmosphere).toBe(true);
        expect(TIER_FLAGS.high.reflection).toBe(false);
    });
    it('disables reflection and atmosphere on medium and low', () => {
        expect(TIER_FLAGS.medium.reflection).toBe(false);
        expect(TIER_FLAGS.medium.atmosphere).toBe(false);
        expect(TIER_FLAGS.low.reflection).toBe(false);
        expect(TIER_FLAGS.low.atmosphere).toBe(false);
    });
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/tier.test.ts`
Expected: FAIL — `reflection`/`atmosphere` are `undefined` (type/property errors).

- [ ] **Step 3: Rename the flags in `tier.ts`**

In `lib/kowloon-knockout/render/tier.ts`, in the `TIER_FLAGS` type and each tier row, rename `ssr`→`reflection` and `volumetrics`→`atmosphere`, keeping the same boolean values:

```ts
export const TIER_FLAGS: Record<RenderTier, {
    bloom: boolean; gtao: boolean; reflection: boolean; atmosphere: boolean;
    shadowMapSize: number; gpuParticles: boolean;
}> = {
    ultra:  { bloom: true,  gtao: true,  reflection: true,  atmosphere: true,  shadowMapSize: 4096, gpuParticles: true },
    high:   { bloom: true,  gtao: true,  reflection: false, atmosphere: true,  shadowMapSize: 2048, gpuParticles: true },
    medium: { bloom: true,  gtao: false, reflection: false, atmosphere: false, shadowMapSize: 1024, gpuParticles: false },
    low:    { bloom: false, gtao: false, reflection: false, atmosphere: false, shadowMapSize: 1024, gpuParticles: false },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/tier.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm no other read sites broke**

Run: `node_modules/.bin/eslint lib/kowloon-knockout/render/tier.ts && grep -rn "\.ssr\|\.volumetrics\|ssr:\|volumetrics:" components/kowloon-knockout lib/kowloon-knockout`
Expected: eslint clean; grep returns nothing (Phase 0+1 never consumed these flags, so there are no other read sites).

- [ ] **Step 6: Commit**

```bash
git add lib/kowloon-knockout/render/tier.ts lib/kowloon-knockout/render/__tests__/tier.test.ts
git commit -m "refactor(kowloon): rename tier flags ssr→reflection, volumetrics→atmosphere"
```

---

### Task 2: Extract towers + signs from `Environment.tsx` into `Skyline.tsx` (parity)

**Files:**
- Create: `components/kowloon-knockout/arena/Skyline.tsx`
- Modify: `components/kowloon-knockout/arena/Environment.tsx` (remove towers + signs; keep floor/rings/posts)
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx` (mount `<Skyline />`)

**Interfaces:**
- Consumes: `NEON_PALETTE` from `./materials`.
- Produces: `<Skyline />` component (no props) rendering the towers + sign strips exactly as they render today.

- [ ] **Step 1: Create `Skyline.tsx` with the towers + signs moved verbatim**

Create `components/kowloon-knockout/arena/Skyline.tsx`. Move the `towers` and `signs` `useMemo` blocks and their JSX (currently `Environment.tsx` lines ~16-45 and ~91-102) into it unchanged, so the output is byte-identical:

```tsx
'use client';

import { useMemo } from 'react';
import { NEON_PALETTE } from './materials';

const NEON = NEON_PALETTE;

/** Neon-Kowloon backdrop: skyline towers + floating sign strips.
 *  Extracted from Environment so the arena stage and the backdrop evolve
 *  independently (Phase 2). Currently a verbatim move — parity with the
 *  previous in-Environment rendering. */
export default function Skyline() {
    const towers = useMemo(() => {
        const arr: { pos: [number, number, number]; size: [number, number, number]; color: string }[] = [];
        const count = 46;
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
            const dist = 22 + Math.random() * 16;
            const h = 8 + Math.random() * 30;
            const w = 2.5 + Math.random() * 3.5;
            arr.push({
                pos: [Math.cos(a) * dist, h / 2 - 1, Math.sin(a) * dist],
                size: [w, h, w],
                color: NEON[Math.floor(Math.random() * NEON.length)],
            });
        }
        return arr;
    }, []);

    const signs = useMemo(() => {
        const arr: { pos: [number, number, number]; h: number; color: string }[] = [];
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            const dist = 14 + Math.random() * 6;
            arr.push({
                pos: [Math.cos(a) * dist, 3 + Math.random() * 9, Math.sin(a) * dist],
                h: 2 + Math.random() * 4,
                color: NEON[Math.floor(Math.random() * NEON.length)],
            });
        }
        return arr;
    }, []);

    return (
        <group>
            {towers.map((t, i) => (
                <mesh key={`t${i}`} position={t.pos}>
                    <boxGeometry args={t.size} />
                    <meshStandardMaterial color="#0a0a14" emissive={t.color} emissiveIntensity={0.5} flatShading toneMapped={false} />
                </mesh>
            ))}
            {signs.map((s, i) => (
                <mesh key={`s${i}`} position={s.pos}>
                    <boxGeometry args={[0.4, s.h, 0.1]} />
                    <meshBasicMaterial color={s.color} toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
}
```

> Read the real `Environment.tsx` first and copy the exact tower/sign JSX (materials, intensities) so this is a true verbatim move — the values above mirror the current file but confirm against it.

- [ ] **Step 2: Remove towers + signs from `Environment.tsx`**

In `Environment.tsx`, delete the `towers` and `signs` `useMemo` blocks and the two `.map(...)` JSX blocks that render them (the "Skyline towers" and "Floating neon sign strips" sections). Keep the floor, inner court line, rope-light toruses, corner posts, and the ring-pulse `useFrame`. If `NEON`/`NEON_PALETTE` is now unused in `Environment.tsx`, remove that import.

- [ ] **Step 3: Mount `<Skyline />` in `Arena3D.tsx`**

In `components/kowloon-knockout/arena/Arena3D.tsx`, add `import Skyline from './Skyline';` and render `<Skyline />` immediately after `<Environment />` (around line 41), inside the provider.

- [ ] **Step 4: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Skyline.tsx components/kowloon-knockout/arena/Environment.tsx components/kowloon-knockout/arena/Arena3D.tsx`
Expected: clean. Fix anything introduced.

- [ ] **Step 5: [SMOKE] — low-tier parity (RUN-OBSERVE, deferred to user)**

`pnpm dev` → local match. Expected: arena looks **identical** to current `main` — same towers and signs in the same places. This is the regression gate for the extraction. Headless implementer: mark deferred to user.

- [ ] **Step 6: Commit**

```bash
git add components/kowloon-knockout/arena/Skyline.tsx components/kowloon-knockout/arena/Environment.tsx components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "refactor(kowloon): extract skyline towers+signs from Environment to Skyline"
```

---

### Task 3: `skyline.ts` — deterministic layered layout generator (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/skyline.ts`
- Create: `lib/kowloon-knockout/render/__tests__/skyline.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TowerInstance { position: [number, number, number]; scale: [number, number, number]; color: [number, number, number]; }`
  - `generateSkyline(seed: number, layers: number): TowerInstance[][]` — returns one `TowerInstance[]` per layer (length === `layers`). Deterministic: same `(seed, layers)` → identical output. Outer layers are farther (larger radius), more numerous, and darker (color lerped toward black for fog depth).

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/__tests__/skyline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateSkyline } from '../skyline';

describe('generateSkyline', () => {
    it('returns one array per layer', () => {
        expect(generateSkyline(1, 3)).toHaveLength(3);
        expect(generateSkyline(1, 2)).toHaveLength(2);
    });
    it('is deterministic for the same seed+layers', () => {
        expect(generateSkyline(42, 3)).toEqual(generateSkyline(42, 3));
    });
    it('differs for different seeds', () => {
        expect(generateSkyline(1, 2)).not.toEqual(generateSkyline(2, 2));
    });
    it('places farther layers at larger radius', () => {
        const [near, , far] = generateSkyline(7, 3);
        const radius = (t: { position: [number, number, number] }) => Math.hypot(t.position[0], t.position[2]);
        const avg = (a: { position: [number, number, number] }[]) => a.reduce((s, t) => s + radius(t), 0) / a.length;
        expect(avg(far)).toBeGreaterThan(avg(near));
    });
    it('makes farther layers darker (fog depth)', () => {
        const [near, , far] = generateSkyline(7, 3);
        const lum = (a: { color: [number, number, number] }[]) => a.reduce((s, t) => s + t.color[0] + t.color[1] + t.color[2], 0) / a.length;
        expect(lum(far)).toBeLessThan(lum(near));
    });
    it('puts more buildings in farther layers', () => {
        const [near, , far] = generateSkyline(7, 3);
        expect(far.length).toBeGreaterThan(near.length);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/skyline.test.ts`
Expected: FAIL — `Cannot find module '../skyline'`.

- [ ] **Step 3: Implement `skyline.ts`**

Create `lib/kowloon-knockout/render/skyline.ts`:

```ts
export interface TowerInstance {
    position: [number, number, number];
    scale: [number, number, number];
    color: [number, number, number];
}

/** Deterministic PRNG (mulberry32) so layouts are stable per seed without
 *  Math.random (which is also banned in some of our tooling contexts). */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s |= 0; s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const NEON: [number, number, number][] = [
    [1.0, 0.2, 0.4], [0.2, 0.8, 1.0], [1.0, 0.8, 0.0],
    [0.2, 1.0, 0.6], [0.8, 0.2, 1.0], [1.0, 0.4, 0.2],
];

/** One TowerInstance[] per layer. Layer 0 is nearest; each subsequent layer is
 *  farther (larger radius), more numerous, and darker (color lerped toward
 *  black) to fake atmospheric/fog depth. */
export function generateSkyline(seed: number, layers: number): TowerInstance[][] {
    const out: TowerInstance[][] = [];
    for (let layer = 0; layer < layers; layer++) {
        const rand = rng(seed * 1000 + layer);
        const baseRadius = 22 + layer * 18;
        const count = 36 + layer * 18;
        const fog = layer / Math.max(1, layers - 1); // 0 near → 1 far
        const dim = 1 - fog * 0.7;                    // far layers up to 70% darker
        const ring: TowerInstance[] = [];
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + rand() * 0.12;
            const dist = baseRadius + rand() * 14;
            const h = 8 + rand() * (30 + layer * 18);
            const w = 2.5 + rand() * 3.5;
            const base = NEON[Math.floor(rand() * NEON.length)];
            ring.push({
                position: [Math.cos(a) * dist, h / 2 - 1, Math.sin(a) * dist],
                scale: [w, h, w],
                color: [base[0] * dim, base[1] * dim, base[2] * dim],
            });
        }
        out.push(ring);
    }
    return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/skyline.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kowloon-knockout/render/skyline.ts lib/kowloon-knockout/render/__tests__/skyline.test.ts
git commit -m "feat(kowloon): deterministic layered skyline layout generator"
```

---

### Task 4: `signage.ts` — deterministic sign-animation param generator (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/signage.ts`
- Create: `lib/kowloon-knockout/render/__tests__/signage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SignPattern = 'pulse' | 'scroll' | 'dropout'`
  - `interface SignAnim { phase: number; speed: number; pattern: SignPattern; }`
  - `signAnim(index: number): SignAnim` — deterministic per index. `phase` ∈ [0, 2π), `speed` > 0, `pattern` one of the three; different indices generally differ in phase.

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/__tests__/signage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { signAnim, type SignPattern } from '../signage';

const PATTERNS: SignPattern[] = ['pulse', 'scroll', 'dropout'];

describe('signAnim', () => {
    it('is deterministic per index', () => {
        expect(signAnim(5)).toEqual(signAnim(5));
    });
    it('returns phase in [0, 2π)', () => {
        for (let i = 0; i < 50; i++) {
            const { phase } = signAnim(i);
            expect(phase).toBeGreaterThanOrEqual(0);
            expect(phase).toBeLessThan(Math.PI * 2);
        }
    });
    it('returns positive speed', () => {
        for (let i = 0; i < 50; i++) expect(signAnim(i).speed).toBeGreaterThan(0);
    });
    it('returns a known pattern', () => {
        for (let i = 0; i < 50; i++) expect(PATTERNS).toContain(signAnim(i).pattern);
    });
    it('varies phase across indices', () => {
        const phases = new Set(Array.from({ length: 20 }, (_, i) => signAnim(i).phase));
        expect(phases.size).toBeGreaterThan(10);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/signage.test.ts`
Expected: FAIL — `Cannot find module '../signage'`.

- [ ] **Step 3: Implement `signage.ts`**

Create `lib/kowloon-knockout/render/signage.ts`:

```ts
export type SignPattern = 'pulse' | 'scroll' | 'dropout';

export interface SignAnim {
    phase: number;
    speed: number;
    pattern: SignPattern;
}

const PATTERNS: SignPattern[] = ['pulse', 'scroll', 'dropout'];

/** Deterministic hash of an integer to [0, 1). */
function hash01(n: number): number {
    let t = (n ^ 0x9e3779b9) >>> 0;
    t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
    t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** Per-sign animation parameters, stable per index so the TSL material graph
 *  in Skyline.tsx can desync each sign without storing per-frame state. */
export function signAnim(index: number): SignAnim {
    const a = hash01(index * 2 + 1);
    const b = hash01(index * 2 + 7);
    return {
        phase: a * Math.PI * 2,
        speed: 0.5 + b * 2.5,
        pattern: PATTERNS[Math.floor(hash01(index * 13 + 3) * PATTERNS.length)],
    };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/__tests__/signage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kowloon-knockout/render/signage.ts lib/kowloon-knockout/render/__tests__/signage.test.ts
git commit -m "feat(kowloon): deterministic sign-animation param generator"
```

---

### Task 5: Subsystem 4 — layered instanced skyline + procedural windows (RUN-OBSERVE)

**Files:**
- Modify: `components/kowloon-knockout/arena/Skyline.tsx`

**Interfaces:**
- Consumes: `generateSkyline`, `TowerInstance` (Task 3); `useRenderTier` (`./RenderTierContext`); `InstancedMesh` from `three/webgpu`.
- Produces: the towers rendered as tier-scaled instanced layers (no signature for later tasks).

- [ ] **Step 1: Replace per-tower meshes with tier-scaled instanced layers**

In `Skyline.tsx`, read the tier and pick layer count, then render one `instancedMesh` per layer fed by `generateSkyline`. Use a fixed seed for stability. Tier → layers: `ultra` 3, `high` 2, `medium` 1, `low` keep the **current static towers** (early-return the Task-2 verbatim block at `low`). Apply each instance's transform + color via `setMatrixAt`/`setColorAt` in a `useLayoutEffect`.

```tsx
'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { useRenderTier } from './RenderTierContext';
import { generateSkyline } from '@/lib/kowloon-knockout/render/skyline';

const TIER_LAYERS: Record<string, number> = { ultra: 3, high: 2, medium: 1, low: 0 };
const SKYLINE_SEED = 1337;

function SkylineLayer({ instances }: { instances: ReturnType<typeof generateSkyline>[number] }) {
    const ref = useRef<THREE.InstancedMesh>(null);
    const tmp = useMemo(() => new THREE.Object3D(), []);
    const color = useMemo(() => new THREE.Color(), []);

    useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh) return;
        instances.forEach((t, i) => {
            tmp.position.set(...t.position);
            tmp.scale.set(...t.scale);
            tmp.updateMatrix();
            mesh.setMatrixAt(i, tmp.matrix);
            mesh.setColorAt(i, color.setRGB(t.color[0], t.color[1], t.color[2]));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [instances, tmp, color]);

    return (
        <instancedMesh ref={ref} args={[undefined, undefined, instances.length]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial vertexColors emissiveIntensity={0.5} flatShading toneMapped={false} />
        </instancedMesh>
    );
}
```

Then branch on tier **without disturbing the existing Task-2 return** (which becomes the `low`/fallback branch — this preserves low-tier parity with zero duplication). At the top of `Skyline()`'s body, before the existing `return (<group>…</group>)`, add:

```tsx
    const { tier } = useRenderTier();
    const layerCount = TIER_LAYERS[tier] ?? 0;
    const layers = useMemo(() => generateSkyline(SKYLINE_SEED, layerCount), [layerCount]);

    // Higher tiers: instanced multi-layer skyline. The `signs` group from Task 2
    // is rendered alongside it (signs are kept as individual meshes for Task 6's
    // per-sign animation). Hooks above run every render regardless of branch.
    if (layerCount > 0) {
        return (
            <group>
                {layers.map((inst, i) => <SkylineLayer key={i} instances={inst} />)}
                {signs.map((s, i) => (
                    <mesh key={`s${i}`} position={s.pos}>
                        <boxGeometry args={[0.4, s.h, 0.1]} />
                        <meshBasicMaterial color={s.color} toneMapped={false} />
                    </mesh>
                ))}
            </group>
        );
    }
    // low tier: fall through to the existing Task-2 static towers+signs return below.
```

Leave the original Task-2 `return (<group>…towers…signs…</group>)` in place as the `low` branch. (Keep the `towers` `useMemo` — it now feeds only the low branch.) Ensure all hooks (`useRenderTier`, the two `useMemo`s) are declared before the `if`, so hook order is stable across tiers.

> **Procedural windows (ultra/high):** emissive instanced box faces with a TSL grid pattern are the intended look, but the exact TSL `positionLocal`/`uv`-grid + per-instance-index flicker expression is **not yet exercised in this codebase**. Treat windows as a **follow-up within this task only if the base instanced skyline renders correctly first**: land the instanced layers + per-layer fog-dim coloring (verifiable), then attempt the TSL window grid; if the window expression misbehaves in the browser, ship without windows (solid emissive faces) and note it — the layered depth is the primary win. Do not block the instanced skyline on the window shader.

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Skyline.tsx`
Expected: clean.

- [ ] **Step 3: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → local match on a WebGPU desktop (ultra). Expected: multiple depth rings of towers receding into fog (farther = darker/denser); parallax as the camera dollies. Force `low` (e.g. `forceWebGL: true` in `render/webgpu.ts`, then revert) → towers match current static look. No console errors.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/Skyline.tsx
git commit -m "feat(kowloon): tier-scaled layered instanced skyline"
```

---

### Task 6: Subsystem 3 — animated neon signage (RUN-OBSERVE)

**Files:**
- Modify: `components/kowloon-knockout/arena/Skyline.tsx`

**Interfaces:**
- Consumes: `signAnim` (Task 4); `time`, `oscSine` from `three/tsl`.
- Produces: animated sign emissives (no signature for later tasks).

- [ ] **Step 1: Drive sign emissive intensity with a per-sign TSL oscillator**

In `Skyline.tsx`, give each sign a `MeshBasicNodeMaterial` whose `emissiveNode`/color is modulated by `oscSine(time.mul(speed).add(phase))` from its `signAnim(index)`. Build the node once per sign (memoized) so it isn't rebuilt each render.

```tsx
import { time, oscSine } from 'three/tsl';
import { signAnim } from '@/lib/kowloon-knockout/render/signage';

// per sign i, with base color `s.color`:
const { phase, speed } = signAnim(i);
const flicker = oscSine(time.mul(speed).add(phase)).mul(0.5).add(0.5); // 0..1
// material colorNode = baseColorNode.mul(flicker)  (drop signs to near-dark on the trough)
```

Apply via a `colorNode` on the sign's node material so the strip pulses. Keep the same geometry/positions from Task 2/5.

> **TSL caveat:** `time`/`oscSine` are confirmed exports, but the exact `colorNode` wiring on `MeshBasicNodeMaterial` under R3F needs browser confirmation. If the node assignment doesn't take, fall back to a single shared animated intensity uniform updated in `useFrame` (still cheap). Land *some* visible per-sign flicker; the `dropout`/`scroll` patterns from `signAnim` are a refinement — wire `pulse` first, then the others if the graph behaves.

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Skyline.tsx`
Expected: clean.

- [ ] **Step 3: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → local match. Expected: sign strips flicker/pulse out of sync with each other; occasional darker "dead" sign. Not distracting from combat. No console errors.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/Skyline.tsx
git commit -m "feat(kowloon): animated neon signage via per-sign TSL oscillators"
```

---

### Task 7: Subsystem 1 — planar reflection wet floor (RUN-OBSERVE, spike-first)

**Files:**
- Modify: `components/kowloon-knockout/arena/Environment.tsx` (floor material)

**Interfaces:**
- Consumes: `useRenderTier` (`./RenderTierContext`); `reflector` from `three/tsl`.
- Produces: reflective floor at ultra (no signature for later tasks).

- [ ] **Step 1: Spike the reflector node in isolation**

Before wiring the full material, confirm the `reflector()` node round-trips through R3F. In `Environment.tsx`, gate on `flags.reflection` (ultra). Create the reflector and assign it as the floor material's color/environment contribution:

```tsx
import { reflector } from 'three/tsl';
import { useRenderTier } from './RenderTierContext';

// inside Environment(), ultra only:
const { flags } = useRenderTier();
const reflection = useMemo(() => (flags.reflection ? reflector() : null), [flags.reflection]);
// attach reflection.target to the floor plane orientation; add reflection.uvNode offset as needed
```

The floor mesh (currently `meshStandardMaterial color="#0d0a16" roughness={0.25} metalness={0.6}`) at ultra mixes the reflector output via a Fresnel term; at non-ultra it is unchanged.

> **Spike gate:** `reflector()` wiring under R3F is new here. First get *any* reflection visible on the floor (even full-strength mirror) and confirm no crash/recursion, then add the Fresnel + wet-roughness mix for the damp look. Configure the reflector to exclude the floor mesh itself. If `reflector()` cannot be made to render correctly under the WebGPU canvas after a genuine attempt, STOP and report — do not ship a broken floor; the non-ultra IBL fake is the fallback and the tier gate means only ultra is affected.

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Environment.tsx`
Expected: clean.

- [ ] **Step 3: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` on WebGPU desktop (ultra). Expected: the floor reflects the neon emitters/fighters as a wet rooftop (soft, not a perfect mirror). Force `low`/non-ultra → floor keeps the current metalness look, no reflection. No console errors, sustained frame rate.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/Environment.tsx
git commit -m "feat(kowloon): planar-reflection wet floor at ultra tier"
```

---

### Task 8: Subsystem 2 — Atmosphere (light shafts + ground haze) (RUN-OBSERVE)

**Files:**
- Create: `components/kowloon-knockout/arena/Atmosphere.tsx`
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx` (mount `<Atmosphere />`)

**Interfaces:**
- Consumes: `useRenderTier`; `time`, `oscSine` from `three/tsl`; `NEON_PALETTE` from `./materials`.
- Produces: `<Atmosphere />` component (no props).

- [ ] **Step 1: Build `Atmosphere.tsx` — additive light shafts + animated ground haze**

Create `components/kowloon-knockout/arena/Atmosphere.tsx`. Render nothing unless `flags.atmosphere` (ultra/high). The **light shafts are concrete and non-TSL** (additive cone meshes, opacity flickered in `useFrame` — no uncertain shader API). The **ground haze** is the one genuinely-novel TSL bit and is spike-gated.

```tsx
'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useRenderTier } from './RenderTierContext';
import { NEON_PALETTE } from './materials';

interface Shaft { pos: [number, number, number]; rot: [number, number, number]; color: string; rate: number; phase: number; }

export default function Atmosphere() {
    const { flags } = useRenderTier();
    const groupRef = useRef<THREE.Group>(null);

    // 5 deterministic shafts leaning down from neon clusters around the ring.
    const shafts = useMemo<Shaft[]>(() => {
        const out: Shaft[] = [];
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            out.push({
                pos: [Math.cos(a) * 9, 7, Math.sin(a) * 9],
                rot: [0, -a, Math.PI + 0.25],          // cone points down-and-inward
                color: NEON_PALETTE[i % NEON_PALETTE.length],
                rate: 1.5 + i * 0.4,                    // desynced flicker rate
                phase: i * 1.3,
            });
        }
        return out;
    }, []);

    // Flicker each shaft's opacity (cheap, no shader): subtle, additive.
    useFrame((state) => {
        const g = groupRef.current;
        if (!g) return;
        const t = state.clock.elapsedTime;
        g.children.forEach((child, i) => {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshBasicMaterial;
            const s = shafts[i];
            if (s) mat.opacity = 0.06 + 0.03 * (0.5 + 0.5 * Math.sin(t * s.rate + s.phase));
        });
    });

    if (!flags.atmosphere) return null;

    return (
        <>
            <group ref={groupRef}>
                {shafts.map((s, i) => (
                    <mesh key={i} position={s.pos} rotation={s.rot}>
                        {/* tall thin cone = light shaft */}
                        <coneGeometry args={[2.2, 9, 16, 1, true]} />
                        <meshBasicMaterial
                            color={s.color}
                            transparent
                            opacity={0.08}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                            side={THREE.DoubleSide}
                            toneMapped={false}
                        />
                    </mesh>
                ))}
            </group>
            {/* Ground haze — SPIKE (see note): 1–2 near-floor planes with a
                time-scrolled TSL soft-noise alpha. Add only after the shafts
                render correctly. */}
        </>
    );
}
```

> Keep opacity deliberately low — additive overlaps read as obvious geometry if too strong; tune in sign-off. The light shafts above are fully specified and should land first. The ground-haze plane (scrolling TSL noise alpha) is the novel TSL bit: attempt it after the shafts render; if the noise-alpha node misbehaves in the browser, ship shafts-only (still a strong mood win) and note haze as a follow-up. Do not block the shafts on the haze shader.

- [ ] **Step 2: Mount in `Arena3D.tsx`**

Add `import Atmosphere from './Atmosphere';` and render `<Atmosphere />` inside the provider (after `<Skyline />`, before `<Fx />`).

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Atmosphere.tsx components/kowloon-knockout/arena/Arena3D.tsx`
Expected: clean.

- [ ] **Step 4: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` on ultra/high. Expected: subtle slanted neon light cones + a low drifting haze near the floor; combat stays readable. Force medium/low → no shafts/haze, just the existing `<fog>`. No console errors.

- [ ] **Step 5: Commit**

```bash
git add components/kowloon-knockout/arena/Atmosphere.tsx components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "feat(kowloon): atmosphere — additive light shafts + animated ground haze"
```

---

## Final integration

After all tasks: multiplayer smoke test (host + guest, confirm sim/net unaffected and both clients show the new environment), and a full unit run:

```bash
node_modules/.bin/vitest run lib/kowloon-knockout/render
```
Expected: tier + skyline + signage tests all pass.

## Phases 3–5 (not in this plan)

Per the roadmap: GPU compute particles (Phase 3), skeletal characters (Phase 4), full tier UI + adaptive FPS governor + mobile/WebGL2 validation (Phase 5). Each gets its own brainstorm → spec → plan.
