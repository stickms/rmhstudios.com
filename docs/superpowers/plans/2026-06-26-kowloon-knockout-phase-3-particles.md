# Kowloon Knockout Phase 3 — GPU Compute Particles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a beautiful cyberpunk particle layer — ambient neon rain + drifting ground fog at thousands of GPU-simulated particles, plus dramatically beefed event bursts (debris/smoke/sparks/KO blowouts) — all tier-gated, building on the merged Phase 0–2 WebGPU/TSL render path.

**Architecture:** Approach 2 (layered per-effect passes). Three pure, unit-tested generators under `lib/kowloon-knockout/render/particles/` feed three self-gating render layers under `components/kowloon-knockout/arena/`. GPU compute (TSL `instancedArray` + `Fn().compute()` + `renderer.computeAsync`) drives rain + fog on ultra/high; the CPU instanced pool drives rain on medium and bursts on every tier. Ambient particles procedurally recycle (wrap-around) — no GPU emission/atomics. The combat sim, net, input, and HUD are untouched; the render layer only reads the per-frame snapshot and the FX event stream.

**Tech Stack:** React Three Fiber `^9.6.1`, three.js `^0.183.2` (`three/webgpu`: `InstancedMesh`, `SpriteNodeMaterial`; `three/tsl`: `instancedArray`, `instanceIndex`, `Fn`, `deltaTime`, `mx_noise_vec3`, `If`, `hash`, `uniform`), Vite, Vitest `^4.1.8` (node env).

## Global Constraints

- **three stays at `^0.183.2`.** Verified-present exports used here: `three/tsl` → `instancedArray`, `instanceIndex`, `Fn`, `deltaTime`, `time`, `uniform`, `vec3`, `float`, `If`, `hash`, `mx_noise_vec3`, `mix`, `smoothstep`, `clamp`; `three/webgpu` → `InstancedMesh`, `SpriteNodeMaterial`, `MeshBasicNodeMaterial`. `instancedArray(typedArray, 'vec3')` accepts a seeded `Float32Array`; `Fn(()=>{})().compute(count)` builds a compute node; `renderer.computeAsync(node)` dispatches.
- **All geometry/sprites procedural.** No textures, HDRIs, or GLBs. Soft sprites use a node-material radial alpha falloff, not an image.
- **Out of scope — do not edit:** `lib/kowloon-knockout/game/**`, `net/**`, `game/input.ts`, HUD, lobby, `PostFx.tsx` passes, and the Phase 2 environment files except `Arena3D.tsx` (mount points only).
- **Tier-gating is mandatory.** Compute layers are instantiated ONLY when `flags.gpuParticles && backend === 'WebGPU'`. `gpuParticles` is already `true` only on ultra/high. Medium = CPU rain + bursts, no fog. Low/WebGL2 = bursts only, today's look preserved.
- **WebGL2 safety:** never touch a compute API unless the backend is WebGPU — guard every compute layer behind the backend check so WebGL2 cannot crash.
- **Naming:** new arena components match the existing `'use client'` + named-default-export style; pure modules live under `lib/kowloon-knockout/render/particles/`.

## Verification approach (read before starting)

Same split as Phase 0–2:
- **(UNIT)** — the pure generators (`budget.ts`, `seed.ts`, `burst.ts`): real Vitest TDD in node env. Run `node_modules/.bin/vitest run lib/kowloon-knockout/render`.
- **(RUN-OBSERVE)** — all rendering and compute. Cannot be verified headlessly. Verified by the user via **[SMOKE]**. Headless implementers run `node_modules/.bin/eslint <files>` as their gate and mark visual checks "deferred to user".
- **Per project workflow:** every PR is preceded by a `senior-swe-reviewer` pass.

## How the backend/tier is read

`useRenderTier()` (from `./RenderTierContext`) returns `{ tier, flags }`. `flags.gpuParticles` is the compute gate. To detect the live backend inside a component, read the renderer: `const gl = useThree((s) => s.gl) as unknown as { backend?: { isWebGPUBackend?: boolean } };` then `const isWebGPU = !!gl.backend?.isWebGPUBackend;`. A compute layer runs its GPU path only when `flags.gpuParticles && isWebGPU`.

## Parallelization guidance (for the build)

- **Sequential foundation:** Tasks 1–3 (pure generators) are independent of each other and can be built in parallel worktrees, but all must land before the render layers.
- **Render layers:** Task 4 (Fx bursts, edits `Fx.tsx`), Task 5 (CPU rain, creates `Rain.tsx`), Task 7 (fog, creates `Fog.tsx`) touch disjoint files and are parallel-safe after the generators. Task 6 (GPU rain) edits `Rain.tsx` and MUST follow Task 5. All of 4–7 edit `Arena3D.tsx` mount points — serialize the `Arena3D.tsx` edits or do them in one worktree to avoid conflicts.

---

### Task 1: `budget.ts` — tier → particle counts (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/particles/budget.ts`
- Create: `lib/kowloon-knockout/render/particles/__tests__/budget.test.ts`

**Interfaces:**
- Consumes: `RenderTier` from `../../tier`.
- Produces:
  - `interface ParticleBudget { rain: number; fog: number; burstCap: number; }`
  - `function particleBudget(tier: RenderTier): ParticleBudget`

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/particles/__tests__/budget.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { particleBudget } from '../budget';

describe('particleBudget', () => {
    it('gives ultra the full counts', () => {
        expect(particleBudget('ultra')).toEqual({ rain: 8000, fog: 4000, burstCap: 1500 });
    });
    it('gives high reduced counts with fog', () => {
        const b = particleBudget('high');
        expect(b.fog).toBeGreaterThan(0);
        expect(b.rain).toBeLessThan(particleBudget('ultra').rain);
    });
    it('gives medium rain but no fog', () => {
        const b = particleBudget('medium');
        expect(b.rain).toBeGreaterThan(0);
        expect(b.fog).toBe(0);
    });
    it('gives low no rain and no fog, only bursts', () => {
        const b = particleBudget('low');
        expect(b.rain).toBe(0);
        expect(b.fog).toBe(0);
        expect(b.burstCap).toBeGreaterThan(0);
    });
    it('scales burst cap down from ultra to low', () => {
        expect(particleBudget('ultra').burstCap).toBeGreaterThan(particleBudget('low').burstCap);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/particles/__tests__/budget.test.ts`
Expected: FAIL — `Cannot find module '../budget'`.

- [ ] **Step 3: Implement `budget.ts`**

Create `lib/kowloon-knockout/render/particles/budget.ts`:

```ts
import type { RenderTier } from '../tier';

export interface ParticleBudget {
    /** Ambient rain particle count (0 = no rain). */
    rain: number;
    /** Ground-fog mote count (0 = no fog). */
    fog: number;
    /** Max simultaneously-live CPU burst particles. */
    burstCap: number;
}

/** Per-tier particle budgets. Counts are intentionally conservative starting
 *  points — bump during browser sign-off until dense without dropping frames.
 *  rain/fog>0 only matters on compute tiers (ultra/high) except medium, which
 *  runs `rain` on the CPU path. */
const BUDGETS: Record<RenderTier, ParticleBudget> = {
    ultra:  { rain: 8000, fog: 4000, burstCap: 1500 },
    high:   { rain: 5000, fog: 2500, burstCap: 1000 },
    medium: { rain: 2000, fog: 0,    burstCap: 600 },
    low:    { rain: 0,    fog: 0,    burstCap: 300 },
};

export function particleBudget(tier: RenderTier): ParticleBudget {
    return BUDGETS[tier];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/particles/__tests__/budget.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/render/particles/budget.ts lib/kowloon-knockout/render/particles/__tests__/budget.test.ts
git add lib/kowloon-knockout/render/particles/budget.ts lib/kowloon-knockout/render/particles/__tests__/budget.test.ts
git commit -m "feat(kowloon): per-tier particle budget"
```

---

### Task 2: `seed.ts` — deterministic rain/fog field seeders (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/particles/seed.ts`
- Create: `lib/kowloon-knockout/render/particles/__tests__/seed.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ParticleBounds { radius: number; floor: number; ceiling: number; }`
  - `interface SeededField { positions: Float32Array; velocities: Float32Array; }` — each length `count * 3` (xyz interleaved).
  - `function seedRain(count: number, bounds: ParticleBounds, seed?: number): SeededField` — positions uniformly in the cylinder (`hypot(x,z) ≤ radius`, `y ∈ [floor, ceiling]`); velocities downward (`vy < 0`) with slight horizontal wind.
  - `function seedFog(count: number, bounds: ParticleBounds, seed?: number): SeededField` — positions in a near-floor band (`y ∈ [floor, ceiling]`, ceiling small); velocities small horizontal drift (`vy ≈ 0`).

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/particles/__tests__/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seedRain, seedFog, type ParticleBounds } from '../seed';

const BOUNDS: ParticleBounds = { radius: 12, floor: 0, ceiling: 18 };
const FOG_BOUNDS: ParticleBounds = { radius: 12, floor: 0, ceiling: 2.5 };

describe('seedRain', () => {
    it('returns positions and velocities of length count*3', () => {
        const f = seedRain(100, BOUNDS, 1);
        expect(f.positions).toHaveLength(300);
        expect(f.velocities).toHaveLength(300);
    });
    it('is deterministic for the same seed', () => {
        expect(Array.from(seedRain(50, BOUNDS, 7).positions))
            .toEqual(Array.from(seedRain(50, BOUNDS, 7).positions));
    });
    it('places all particles inside the cylinder and height band', () => {
        const f = seedRain(200, BOUNDS, 3);
        for (let i = 0; i < 200; i++) {
            const x = f.positions[i * 3], y = f.positions[i * 3 + 1], z = f.positions[i * 3 + 2];
            expect(Math.hypot(x, z)).toBeLessThanOrEqual(BOUNDS.radius + 1e-6);
            expect(y).toBeGreaterThanOrEqual(BOUNDS.floor);
            expect(y).toBeLessThanOrEqual(BOUNDS.ceiling);
        }
    });
    it('gives every drop a downward velocity', () => {
        const f = seedRain(200, BOUNDS, 9);
        for (let i = 0; i < 200; i++) expect(f.velocities[i * 3 + 1]).toBeLessThan(0);
    });
});

describe('seedFog', () => {
    it('keeps motes in a near-floor band', () => {
        const f = seedFog(200, FOG_BOUNDS, 2);
        for (let i = 0; i < 200; i++) {
            expect(f.positions[i * 3 + 1]).toBeLessThanOrEqual(FOG_BOUNDS.ceiling);
            expect(f.positions[i * 3 + 1]).toBeGreaterThanOrEqual(FOG_BOUNDS.floor);
        }
    });
    it('gives motes near-horizontal drift (small vy)', () => {
        const f = seedFog(200, FOG_BOUNDS, 5);
        for (let i = 0; i < 200; i++) expect(Math.abs(f.velocities[i * 3 + 1])).toBeLessThan(0.2);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/particles/__tests__/seed.test.ts`
Expected: FAIL — `Cannot find module '../seed'`.

- [ ] **Step 3: Implement `seed.ts`**

Create `lib/kowloon-knockout/render/particles/seed.ts`:

```ts
export interface ParticleBounds {
    /** Cylinder radius around arena center (x/z). */
    radius: number;
    /** Lowest y. */
    floor: number;
    /** Highest y. */
    ceiling: number;
}

export interface SeededField {
    /** xyz interleaved, length = count*3. */
    positions: Float32Array;
    /** xyz interleaved, length = count*3. */
    velocities: Float32Array;
}

/** Deterministic PRNG (mulberry32), matching render/skyline.ts. */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s |= 0; s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Uniform point in a disc of the given radius → [x, z]. */
function discXZ(rand: () => number, radius: number): [number, number] {
    const r = Math.sqrt(rand()) * radius;     // sqrt → uniform area
    const a = rand() * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
}

/** Rain: filling the cylinder, falling with light wind. */
export function seedRain(count: number, bounds: ParticleBounds, seed = 1): SeededField {
    const rand = rng(seed);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const [x, z] = discXZ(rand, bounds.radius);
        positions[i * 3] = x;
        positions[i * 3 + 1] = bounds.floor + rand() * (bounds.ceiling - bounds.floor);
        positions[i * 3 + 2] = z;
        velocities[i * 3] = (rand() - 0.5) * 1.5;          // wind x
        velocities[i * 3 + 1] = -(9 + rand() * 6);          // fall speed
        velocities[i * 3 + 2] = (rand() - 0.5) * 1.5;       // wind z
    }
    return { positions, velocities };
}

/** Fog: a near-floor band drifting slowly and horizontally. */
export function seedFog(count: number, bounds: ParticleBounds, seed = 1): SeededField {
    const rand = rng(seed);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const [x, z] = discXZ(rand, bounds.radius);
        positions[i * 3] = x;
        positions[i * 3 + 1] = bounds.floor + rand() * (bounds.ceiling - bounds.floor);
        positions[i * 3 + 2] = z;
        velocities[i * 3] = (rand() - 0.5) * 0.6;           // slow horizontal drift
        velocities[i * 3 + 1] = (rand() - 0.5) * 0.1;       // near-zero vertical
        velocities[i * 3 + 2] = (rand() - 0.5) * 0.6;
    }
    return { positions, velocities };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/particles/__tests__/seed.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/render/particles/seed.ts lib/kowloon-knockout/render/particles/__tests__/seed.test.ts
git add lib/kowloon-knockout/render/particles/seed.ts lib/kowloon-knockout/render/particles/__tests__/seed.test.ts
git commit -m "feat(kowloon): deterministic rain/fog field seeders"
```

---

### Task 3: `burst.ts` — beefed burst particle kinds + integration step (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/particles/burst.ts`
- Create: `lib/kowloon-knockout/render/particles/__tests__/burst.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type BurstKind = 'spark' | 'debris' | 'smoke'`
  - `interface BurstParticle { x; y; z; vx; vy; vz; life; maxLife; size; kind: BurstKind; active: boolean; }` (all numbers except `kind`/`active`)
  - `function stepParticle(p: BurstParticle, dt: number): void` — integrates one particle in place by its `kind` and decays life; sets `active=false` when life ≤ 0.

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/particles/__tests__/burst.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stepParticle, type BurstParticle, type BurstKind } from '../burst';

function make(kind: BurstKind, over: Partial<BurstParticle> = {}): BurstParticle {
    return { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, life: 1, maxLife: 1, size: 0.2, kind, active: true, ...over };
}

describe('stepParticle', () => {
    it('pulls sparks down under gravity', () => {
        const p = make('spark', { vy: 0 });
        stepParticle(p, 0.1);
        expect(p.vy).toBeLessThan(0);
    });
    it('bounces debris off the floor', () => {
        const p = make('debris', { y: 0.06, vy: -5 });
        stepParticle(p, 0.1);
        expect(p.y).toBeCloseTo(0.05, 5);
        expect(p.vy).toBeGreaterThan(0);          // velocity reflected upward
    });
    it('makes smoke rise and decelerate', () => {
        const p = make('smoke', { vx: 10, vy: 0 });
        stepParticle(p, 0.1);
        expect(Math.abs(p.vx)).toBeLessThan(10);  // drag
        expect(p.vy).toBeGreaterThan(0);          // buoyancy
    });
    it('expands smoke over time', () => {
        const p = make('smoke', { size: 0.2 });
        stepParticle(p, 0.1);
        expect(p.size).toBeGreaterThan(0.2);
    });
    it('deactivates a particle whose life runs out', () => {
        const p = make('spark', { life: 0.05 });
        stepParticle(p, 0.1);
        expect(p.active).toBe(false);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/particles/__tests__/burst.test.ts`
Expected: FAIL — `Cannot find module '../burst'`.

- [ ] **Step 3: Implement `burst.ts`**

Create `lib/kowloon-knockout/render/particles/burst.ts`:

```ts
export type BurstKind = 'spark' | 'debris' | 'smoke';

export interface BurstParticle {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    life: number; maxLife: number;
    size: number;
    kind: BurstKind;
    active: boolean;
}

const GRAVITY = 9;
const FLOOR_Y = 0.05;

/** Integrate one burst particle in place for `dt` seconds, by kind:
 *  - spark:  light gravity, fast fade (handled by caller via life/maxLife).
 *  - debris: full gravity + inelastic floor bounce + ground friction.
 *  - smoke:  buoyant rise, velocity drag, expands over time.
 *  Decays life and deactivates at/below zero. */
export function stepParticle(p: BurstParticle, dt: number): void {
    p.life -= dt;
    if (p.life <= 0) { p.active = false; return; }

    if (p.kind === 'smoke') {
        p.vy += 1.2 * dt;                 // buoyancy
        const drag = Math.pow(0.92, dt * 60);
        p.vx *= drag; p.vy *= drag; p.vz *= drag;
        p.size += 0.6 * dt;               // billow
    } else {
        const g = p.kind === 'debris' ? GRAVITY : GRAVITY * 0.5;
        p.vy -= g * dt;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    if (p.kind === 'debris' && p.y < FLOOR_Y) {
        p.y = FLOOR_Y;
        p.vy *= -0.4;                     // inelastic bounce
        p.vx *= 0.6; p.vz *= 0.6;         // ground friction
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/particles/__tests__/burst.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/render/particles/burst.ts lib/kowloon-knockout/render/particles/__tests__/burst.test.ts
git add lib/kowloon-knockout/render/particles/burst.ts lib/kowloon-knockout/render/particles/__tests__/burst.test.ts
git commit -m "feat(kowloon): beefed burst particle kinds + integration step"
```

---

### Task 4: Beef up `Fx.tsx` — tier burst cap + debris/smoke/spark kinds (RUN-OBSERVE)

**Files:**
- Modify: `components/kowloon-knockout/arena/Fx.tsx`

**Interfaces:**
- Consumes: `particleBudget` (Task 1); `stepParticle`, `BurstParticle`, `BurstKind` (Task 3); `useRenderTier` (`./RenderTierContext`).
- Produces: richer event bursts. No signature for later tasks.

- [ ] **Step 1: Replace the flat pool with tier-capped, kind-aware bursts**

Rewrite `components/kowloon-knockout/arena/Fx.tsx`. Read the tier for `burstCap`; give each pool slot a `kind`; route each FX event to a mix of kinds; integrate via `stepParticle`; size particles by `kind` and life. Keep the existing additive instanced-mesh rendering and the `session.drainFx()` ingestion.

```tsx
'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameSession } from '@/lib/kowloon-knockout/net/session';
import { useRenderTier } from './RenderTierContext';
import { particleBudget } from '@/lib/kowloon-knockout/render/particles/budget';
import { stepParticle, type BurstParticle, type BurstKind } from '@/lib/kowloon-knockout/render/particles/burst';

const BLACK = new THREE.Color('#000000');

/** Pooled, instanced event bursts (hit/block/KO) driven by the session FX
 *  queue. Beefed in Phase 3: debris + smoke + sparks, tier-scaled cap. Stays on
 *  the CPU — bursts are bounded, event-emitted, and momentary (the GPU-emission
 *  path is the deliberately-avoided risk; see the Phase 3 spec). */
export default function Fx({ session }: { session: GameSession }) {
    const { tier } = useRenderTier();
    const MAX = particleBudget(tier).burstCap;

    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const pool = useMemo<(BurstParticle & { color: THREE.Color })[]>(
        () => Array.from({ length: MAX }, () => ({
            x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1,
            size: 0.2, kind: 'spark' as BurstKind, active: false, color: new THREE.Color(),
        })),
        [MAX],
    );

    const spawn = (
        n: number, kind: BurstKind, x: number, y: number, z: number,
        color: THREE.Color, power: number,
    ) => {
        for (let s = 0; s < n; s++) {
            const p = pool.find((q) => !q.active);
            if (!p) return;
            const a = Math.random() * Math.PI * 2;
            const up = Math.random() * 0.8 + 0.2;
            const spd = (kind === 'smoke' ? 0.6 : 1.5) + Math.random() * power;
            p.x = x; p.y = y; p.z = z;
            p.vx = Math.cos(a) * spd;
            p.vy = up * spd;
            p.vz = Math.sin(a) * spd;
            p.kind = kind;
            p.maxLife = kind === 'smoke' ? 0.9 + Math.random() * 0.6
                : kind === 'debris' ? 0.6 + Math.random() * 0.5
                : 0.35 + Math.random() * 0.3;
            p.life = p.maxLife;
            p.size = kind === 'smoke' ? 0.3 + Math.random() * 0.3
                : kind === 'debris' ? 0.1 + Math.random() * 0.12
                : 0.12 + Math.random() * 0.12;
            p.color.copy(color);
            p.active = true;
        }
    };

    useFrame((_, deltaRaw) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const delta = Math.min(0.05, deltaRaw);

        for (const e of session.drainFx()) {
            if (e.kind === 'hit') {
                const c = new THREE.Color(e.color);
                spawn(Math.min(22, 8 + Math.round(e.power)), 'spark', e.x, e.y, e.z, c, 3.5);
                spawn(Math.min(8, 3 + Math.round(e.power * 0.5)), 'debris', e.x, e.y, e.z, c, 2.5);
                spawn(3, 'smoke', e.x, e.y, e.z, new THREE.Color('#888a96'), 0.8);
            } else if (e.kind === 'block') {
                spawn(8, 'spark', e.x, e.y, e.z, new THREE.Color('#cfe8ff'), 2);
            } else if (e.kind === 'ko') {
                spawn(40, 'spark', e.x, 1.1, e.z, new THREE.Color('#ffcc00'), 5);
                spawn(28, 'debris', e.x, 1.1, e.z, new THREE.Color('#ffcc00'), 4);
                spawn(14, 'smoke', e.x, 1.1, e.z, new THREE.Color('#9a9ca8'), 1.2);
            }
        }

        for (let i = 0; i < MAX; i++) {
            const p = pool[i];
            if (p.active) stepParticle(p, delta);
            const frac = p.active ? p.life / p.maxLife : 0;
            // smoke grows as it fades; spark/debris shrink with life.
            const s = p.kind === 'smoke' ? p.size : p.size * frac;
            dummy.position.set(p.x, p.y, p.z);
            dummy.scale.setScalar(p.active ? s : 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, p.active ? p.color : BLACK);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, MAX]} frustumCulled={false}>
            <icosahedronGeometry args={[1, 0]} />
            <meshBasicMaterial toneMapped={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
        </instancedMesh>
    );
}
```

> Note: `Fx.tsx` already imports from `'three'` (not `three/webgpu`) and is mounted inside the R3F canvas — keep that import as-is for parity with the shipped file. The `color` field is appended to the pooled `BurstParticle` locally (intersection type) so `stepParticle` stays color-agnostic.

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Fx.tsx`
Expected: clean.

- [ ] **Step 3: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → local match. Expected: hits throw sparks + small debris + a smoke puff; KO produces a big debris/spark/smoke blowout. No console errors. Force `low` (fewer particles, capped at 300) → still smooth.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/Fx.tsx
git commit -m "feat(kowloon): beefed event bursts — debris, smoke, sparks, tier cap"
```

---

### Task 5: `Rain.tsx` — CPU instanced rain (medium + universal fallback) (RUN-OBSERVE)

**Files:**
- Create: `components/kowloon-knockout/arena/Rain.tsx`
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx` (mount `<Rain />`)

**Interfaces:**
- Consumes: `particleBudget` (Task 1); `seedRain`, `ParticleBounds` (Task 2); `useRenderTier`.
- Produces: `<Rain />` (no props). A `RAIN_BOUNDS` const and CPU integration that Task 6 will conditionally replace with a compute path on ultra/high.

- [ ] **Step 1: Build the CPU rain layer**

Create `components/kowloon-knockout/arena/Rain.tsx`. Render `budget.rain` thin additive instances; integrate fall + wind on the CPU each frame, wrapping a drop back to the ceiling when it passes the floor. Render nothing when `budget.rain === 0` (low tier). This path runs on every tier with rain for now; Task 6 swaps in compute on ultra/high.

```tsx
'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRenderTier } from './RenderTierContext';
import { particleBudget } from '@/lib/kowloon-knockout/render/particles/budget';
import { seedRain, type ParticleBounds } from '@/lib/kowloon-knockout/render/particles/seed';

export const RAIN_BOUNDS: ParticleBounds = { radius: 16, floor: 0, ceiling: 18 };
const RAIN_COLOR = new THREE.Color('#7fd4ff'); // cool neon drizzle

/** Ambient neon rain. CPU instanced integration (medium tier + the fallback for
 *  ultra/high when compute is unavailable). Drops fall + drift and wrap back to
 *  the ceiling at the floor. */
export default function Rain() {
    const { tier } = useRenderTier();
    const count = particleBudget(tier).rain;

    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const field = useMemo(() => (count > 0 ? seedRain(count, RAIN_BOUNDS, 5150) : null), [count]);

    useFrame((_, deltaRaw) => {
        const mesh = meshRef.current;
        if (!mesh || !field) return;
        const dt = Math.min(0.05, deltaRaw);
        const { positions, velocities } = field;
        for (let i = 0; i < count; i++) {
            let y = positions[i * 3 + 1] + velocities[i * 3 + 1] * dt;
            let x = positions[i * 3] + velocities[i * 3] * dt;
            let z = positions[i * 3 + 2] + velocities[i * 3 + 2] * dt;
            if (y < RAIN_BOUNDS.floor) { y = RAIN_BOUNDS.ceiling; }   // recycle
            positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
            dummy.position.set(x, y, z);
            dummy.scale.set(0.02, 0.5, 0.02);                        // thin vertical streak
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    if (count === 0) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={RAIN_COLOR} toneMapped={false} transparent opacity={0.5}
                blending={THREE.AdditiveBlending} depthWrite={false} />
        </instancedMesh>
    );
}
```

- [ ] **Step 2: Mount in `Arena3D.tsx`**

In `components/kowloon-knockout/arena/Arena3D.tsx`, add `import Rain from './Rain';` and render `<Rain />` inside the provider, after `<Atmosphere />`.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Rain.tsx components/kowloon-knockout/arena/Arena3D.tsx`
Expected: clean.

- [ ] **Step 4: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → local match. Expected: falling neon drizzle filling the arena volume, recycling at the top. Force `low` → no rain. No console errors.

- [ ] **Step 5: Commit**

```bash
git add components/kowloon-knockout/arena/Rain.tsx components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "feat(kowloon): CPU instanced neon rain (medium + fallback)"
```

---

### Task 6: GPU compute rain on ultra/high (RUN-OBSERVE, spike-first)

**Files:**
- Modify: `components/kowloon-knockout/arena/Rain.tsx`

**Interfaces:**
- Consumes: everything in Task 5; `useThree`; `instancedArray`, `instanceIndex`, `Fn`, `deltaTime`, `If`, `float`, `vec3` from `three/tsl`; `SpriteNodeMaterial`/`InstancedMesh` from `three/webgpu`.
- Produces: compute-driven rain on ultra/high; the Task-5 CPU path remains as the medium/fallback branch.

- [ ] **Step 1: Add a compute branch, gated on WebGPU + gpuParticles**

In `Rain.tsx`, when `flags.gpuParticles && isWebGPU`, drive the same drops with a GPU compute kernel instead of the CPU loop. Seed a storage buffer from `seedRain`, advance it each frame with a kernel (fall + wind + wrap), and render an `InstancedMesh` whose `positionNode` reads the buffer. Wrap setup in try/catch — on failure, fall back to the CPU branch from Task 5.

Add a `RainGPU` subcomponent and branch in `Rain()`:

```tsx
import { useThree } from '@react-three/fiber';
import * as WEBGPU from 'three/webgpu';
import { instancedArray, instanceIndex, Fn, deltaTime, If, float, vec3, positionLocal } from 'three/tsl';

function RainGPU({ count }: { count: number }) {
    const gl = useThree((s) => s.gl) as unknown as WEBGPU.WebGPURenderer;

    const { mesh, update } = useMemo(() => {
        const seeded = seedRain(count, RAIN_BOUNDS, 5150);
        const positions = instancedArray(seeded.positions, 'vec3');
        const velocities = instancedArray(seeded.velocities, 'vec3');

        // Per-frame kernel: integrate + wrap at the floor.
        const update = Fn(() => {
            const pos = positions.element(instanceIndex);
            const vel = velocities.element(instanceIndex);
            pos.addAssign(vel.mul(deltaTime));
            If(pos.y.lessThan(float(RAIN_BOUNDS.floor)), () => {
                pos.y.assign(float(RAIN_BOUNDS.ceiling));
            });
        })().compute(count);

        const material = new WEBGPU.MeshBasicNodeMaterial();
        material.color = RAIN_COLOR;   // base tint; no colorNode so .color applies
        material.toneMapped = false;
        material.transparent = true;
        material.opacity = 0.5;
        material.blending = WEBGPU.AdditiveBlending;
        material.depthWrite = false;
        // Offset each instance's local vertices by its buffer position.
        material.positionNode = positionLocal.mul(vec3(0.02, 0.5, 0.02)).add(positions.toAttribute());

        const geometry = new WEBGPU.BoxGeometry(1, 1, 1);
        const mesh = new WEBGPU.InstancedMesh(geometry, material, count);
        mesh.frustumCulled = false;
        return { mesh, update };
    }, [count, gl]);

    useFrame(() => { void gl.computeAsync(update); });

    return <primitive object={mesh} />;
}
```

Then branch in `Rain()` (replace the bottom `return`):

```tsx
    const { tier, flags } = useRenderTier();
    const gl = useThree((s) => s.gl) as unknown as { backend?: { isWebGPUBackend?: boolean } };
    const isWebGPU = !!gl.backend?.isWebGPUBackend;
    const count = particleBudget(tier).rain;
    const useGPU = flags.gpuParticles && isWebGPU && count > 0;
    // ...keep the CPU field/useFrame above, but guard it to only run when !useGPU...
    if (count === 0) return null;
    if (useGPU) {
        try { return <RainGPU count={count} />; }
        catch (e) { console.warn('[Rain] compute path failed, using CPU rain:', e); }
    }
    return ( /* the Task-5 CPU instancedMesh */ );
```

> **Hook-order note:** keep all hooks (`useMemo` field, the CPU `useFrame`) declared unconditionally at the top of `Rain()`. Guard the CPU `useFrame` body with `if (useGPU) return;` so it no-ops when the GPU path is active, rather than conditionally registering the hook. `RainGPU` owns its own hooks.

> **Spike gate:** the `positionNode = positionLocal.mul(scale).add(positions.toAttribute())` instance-offset wiring and `gl.computeAsync(update)` dispatch are the novel bits and are browser-only verifiable. Get *any* GPU-driven drops moving first (even untinted), confirm no crash and that the CPU path still works when forced, then refine color/streak. If the compute attribute wiring cannot be made to render after a genuine attempt, ship the CPU rain on all tiers (Task 5) and note the GPU path deferred — do NOT ship broken rain. The tier gate means only ultra/high touch this.

> **Wet-floor splash (refinement, after base GPU rain renders):** the spec calls for a splash fade tying into the Phase 2 reflective floor. Land it as a sign-off refinement — in the kernel, when a drop crosses `floor`, briefly flatten/scale it before recycling (e.g. store a small per-drop "splash timer" in a third `instancedArray` and drive `scaleNode` from it), OR keep it simple and fade opacity in the last fraction of the fall. Do not block base rain on the splash; if it complicates the kernel, ship plain recycling and note splash deferred.

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Rain.tsx`
Expected: clean.

- [ ] **Step 3: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` on a WebGPU desktop (ultra). Expected: dense GPU rain (thousands of drops) at a steady frame rate; no console errors. Force medium → CPU rain still renders. Force WebGL2 (`forceWebGL` in `render/webgpu.ts`, then revert) → CPU rain, no compute calls, no crash.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/Rain.tsx
git commit -m "feat(kowloon): GPU compute rain on ultra/high (CPU fallback intact)"
```

---

### Task 7: `Fog.tsx` — GPU compute ground fog on ultra/high (RUN-OBSERVE, spike-first)

**Files:**
- Create: `components/kowloon-knockout/arena/Fog.tsx`
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx` (mount `<Fog />`)

**Interfaces:**
- Consumes: `particleBudget` (Task 1); `seedFog`, `ParticleBounds` (Task 2); `useRenderTier`; `useThree`; `instancedArray`, `instanceIndex`, `Fn`, `deltaTime`, `time`, `mx_noise_vec3`, `vec3`, `float`, `positionLocal`, `uv`, `smoothstep` from `three/tsl`; `three/webgpu` materials.
- Produces: `<Fog />` (no props).

- [ ] **Step 1: Build the compute fog layer**

Create `components/kowloon-knockout/arena/Fog.tsx`. Render nothing unless `flags.gpuParticles && isWebGPU` and `budget.fog > 0` (ultra/high). Seed a storage buffer with `seedFog`; advect motes along a curl-ish flow field sampled with `mx_noise_vec3(pos * scale + time)`; render large soft additive sprites (radial alpha via `SpriteNodeMaterial.opacityNode` from `uv`). Wrap motes within the fog volume. try/catch the setup; on failure render nothing (fog has no CPU fallback by design).

```tsx
'use client';

import { useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
    instancedArray, instanceIndex, Fn, deltaTime, time, mx_noise_vec3,
    vec3, float, uv, smoothstep,
} from 'three/tsl';
import { useRenderTier } from './RenderTierContext';
import { particleBudget } from '@/lib/kowloon-knockout/render/particles/budget';
import { seedFog, type ParticleBounds } from '@/lib/kowloon-knockout/render/particles/seed';

const FOG_BOUNDS: ParticleBounds = { radius: 13, floor: 0.1, ceiling: 2.5 };
const FOG_COLOR = new THREE.Color('#3a2f5a'); // dim violet haze

function FogGPU({ count }: { count: number }) {
    const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;

    const { mesh, update } = useMemo(() => {
        const seeded = seedFog(count, FOG_BOUNDS, 909);
        const positions = instancedArray(seeded.positions, 'vec3');

        // Advect along a slow curl-ish noise flow, wrap within the fog cylinder height.
        const update = Fn(() => {
            const pos = positions.element(instanceIndex);
            const flow = mx_noise_vec3(pos.mul(0.15).add(vec3(time.mul(0.05), 0, time.mul(0.04))));
            pos.addAssign(flow.mul(0.4).mul(deltaTime));
            // wrap vertically inside the band
            pos.y.assign(pos.y.sub(FOG_BOUNDS.floor).mod(FOG_BOUNDS.ceiling - FOG_BOUNDS.floor).add(FOG_BOUNDS.floor));
        })().compute(count);

        const material = new THREE.SpriteNodeMaterial();
        material.color = FOG_COLOR;
        material.toneMapped = false;
        material.transparent = true;
        material.depthWrite = false;
        material.blending = THREE.AdditiveBlending;
        material.positionNode = positions.toAttribute();
        material.scaleNode = float(3.5);                       // large soft motes
        // radial soft alpha: fade from center (0.0) to edge (0.5) of the sprite uv
        material.opacityNode = smoothstep(0.5, 0.0, uv().sub(0.5).length()).mul(0.06);

        const mesh = new THREE.Sprite(material);
        mesh.count = count;                                    // instanced sprite draw
        mesh.frustumCulled = false;
        return { mesh, update };
    }, [count, gl]);

    useFrame(() => { void gl.computeAsync(update); });

    return <primitive object={mesh} />;
}

/** Ambient ground fog — drifting violet haze. Compute-only (ultra/high); no CPU
 *  fallback by design (medium/low get no fog). */
export default function Fog() {
    const { tier, flags } = useRenderTier();
    const gl = useThree((s) => s.gl) as unknown as { backend?: { isWebGPUBackend?: boolean } };
    const isWebGPU = !!gl.backend?.isWebGPUBackend;
    const count = particleBudget(tier).fog;

    if (!(flags.gpuParticles && isWebGPU) || count === 0) return null;
    try { return <FogGPU count={count} />; }
    catch (e) { console.warn('[Fog] compute path failed, skipping fog:', e); return null; }
}
```

> **Spike gate:** `SpriteNodeMaterial` with `positionNode = positions.toAttribute()` + `mesh.count = count` for an instanced-sprite draw, and `mx_noise_vec3` advection, are the novel bits — browser-only verifiable. Get motes *visible and drifting* first (even hard-alpha), confirm no crash, then tune `scaleNode`/`opacityNode`/noise scale for soft volumetric haze. If the sprite-count or noise wiring misbehaves after a genuine attempt, render nothing (the `return null` fallback already does this) and note fog deferred — do NOT ship broken fog. If `mesh.count` is not the right instanced-sprite API in this three build, substitute an `InstancedMesh(PlaneGeometry, material, count)` with the same `positionNode`, matching the Task-6 rain pattern.

- [ ] **Step 2: Mount in `Arena3D.tsx`**

Add `import Fog from './Fog';` and render `<Fog />` inside the provider, after `<Rain />`.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Fog.tsx components/kowloon-knockout/arena/Arena3D.tsx`
Expected: clean.

- [ ] **Step 4: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` on a WebGPU desktop (ultra/high). Expected: a low, slow-drifting violet haze near the floor, lit by the neon/light-shafts, combat stays readable. Force medium/low/WebGL2 → no fog, no compute calls, no crash.

- [ ] **Step 5: Commit**

```bash
git add components/kowloon-knockout/arena/Fog.tsx components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "feat(kowloon): GPU compute ground fog on ultra/high"
```

---

## Final integration

After all tasks:
- Full unit run: `node_modules/.bin/vitest run lib/kowloon-knockout/render` — budget + seed + burst (plus existing tier/skyline/signage) all pass.
- Multiplayer smoke test (host + guest): confirm sim/net unaffected and both clients show rain/fog/bursts.
- Per-tier browser SMOKE matrix: ultra (GPU rain + fog + big KO), high (same, lighter), medium (CPU rain + bursts, no fog), low (bursts only), forced WebGL2 (no crash, bursts only).
- `senior-swe-reviewer` pass on the branch diff before opening the PR.

## Escape hatch (post-merge, only if needed)

If the ~1.5k CPU burst cap makes KO spectacle feel weak in-browser, add a single isolated GPU-emission burst pass as a contained Phase 3.5 (see the spec's "Escape hatch" and the `kowloon-phase-3-particles` memory) — do not rewrite the feature into a unified engine wholesale.
