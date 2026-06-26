# Kowloon Knockout Phase 4 — Skeletal Characters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedural `StickFighter` with a Mixamo Y-Bot skeletal character that plays motion clips driven by the existing sim state machine (idle/walk/4 punches/block/hit/stun/KO) crossfaded, on the higher tiers — with `StickFighter` retained as the low-tier path and the universal fallback when assets are missing/loading/failed.

**Architecture:** A pure, unit-tested core (`render/fighter/`: clip manifest, sim-state→clip resolver, root-motion strip, rig helpers) feeds a `SkeletalFighter` R3F component that loads the shared GLBs once (drei `useGLTF`), clones the rig per seat (`SkeletonUtils.clone`), runs a per-fighter `AnimationMixer`, and drives everything imperatively from the `RenderFighter` snapshot. A `Fighter` dispatcher picks `SkeletalFighter` vs `StickFighter` by tier, with `StickFighter` as the Suspense + ErrorBoundary fallback. The combat sim/net/input/HUD are untouched.

**Tech Stack:** React Three Fiber `^9.6.1`, three.js `^0.183.2` (`three/examples/jsm/utils/SkeletonUtils.js` `clone`; `AnimationMixer`, `AnimationClip`), `@react-three/drei` (`useGLTF`, `Html`), Vite, Vitest `^4.1.8` (node env).

## Global Constraints

- **three stays at `^0.183.2`.** Verified available: drei `useGLTF`/`useAnimations`; `SkeletonUtils.clone` from `three/examples/jsm/utils/SkeletonUtils.js`; three `AnimationClip`/`VectorKeyframeTrack` instantiate and expose `.tracks[i].values` in node (so the pure helpers are node-testable).
- **Asset contract (user-supplied, separate GLBs):** `public/kowloon/fighter/` holds `ybot.glb` + `idle.glb walk.glb jab.glb cross.glb hook.glb uppercut.glb block.glb hit.glb stunned.glb ko.glb`. Until present, every fighter must fall back to `StickFighter` (no regression). Mixamo `mixamorig:` skeleton; clips downloaded "Without Skin"; bone names may appear as `mixamorig:Hips` or `mixamorigHips` depending on conversion — match tolerantly.
- **Out of scope — do not edit:** `lib/kowloon-knockout/game/**`, `net/**`, `game/input.ts`, HUD, lobby, `PostFx.tsx`, and the Phase 2/3 arena files except `Arena3D.tsx` (the seat-map mount) and `StickFighter.tsx` (only to factor its nameplate/shadow into `FighterTrappings`).
- **No React state in the per-frame fighter path** — drive transforms/mixer imperatively from `framesRef.current`, matching `StickFighter`.
- **Naming:** new arena components use `'use client'` + named-default-export; pure modules live under `lib/kowloon-knockout/render/fighter/`.

## Verification approach (read before starting)

- **(UNIT)** — the pure core (`clips.ts`, `stateMachine.ts`, `rootMotion.ts`, `fighterRig.ts`): real Vitest TDD in node env. Run `node_modules/.bin/vitest run lib/kowloon-knockout/render`.
- **(RUN-OBSERVE)** — all rendering. Browser-only, and the skeletal path additionally needs the user to have added the GLBs. Verified by **[SMOKE]**, two-stage: (1) before assets — `StickFighter` still renders everywhere (no regression); (2) after assets — Y-Bot loads/scales/faces/animates. Headless implementers run `node_modules/.bin/eslint <files>` and mark visual checks "deferred to user".
- **Per project workflow:** every PR is preceded by a `senior-swe-reviewer` pass.

## Parallelization guidance

- Tasks 1–4 (pure core) are independent and can be built in any order before the render layer.
- Task 5 (`FighterTrappings`, edits `StickFighter.tsx`) is independent of the pure core.
- Task 6 (`SkeletalFighter`) consumes Tasks 1–5; Task 7 (`Fighter` + `Arena3D`) consumes Task 6. Keep 6→7 sequential.

---

### Task 1: `clips.ts` — clip manifest (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/fighter/clips.ts`
- Create: `lib/kowloon-knockout/render/fighter/__tests__/clips.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ClipKey = 'idle'|'walk'|'jab'|'cross'|'hook'|'uppercut'|'block'|'hit'|'stunned'|'ko'`
  - `interface ClipDef { file: string; loop: boolean; fade: number; }`
  - `const CLIP_KEYS: ClipKey[]`, `const CLIPS: Record<ClipKey, ClipDef>`
  - `const FIGHTER_ASSET_DIR = '/kowloon/fighter'`, `const RIG_FILE = 'ybot.glb'`

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/fighter/__tests__/clips.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CLIP_KEYS, CLIPS, type ClipKey } from '../clips';

describe('CLIPS manifest', () => {
    it('has a definition for every clip key', () => {
        for (const k of CLIP_KEYS) expect(CLIPS[k]).toBeDefined();
        expect(CLIP_KEYS).toHaveLength(10);
    });
    it('gives every clip a unique .glb file', () => {
        const files = CLIP_KEYS.map((k) => CLIPS[k].file);
        expect(new Set(files).size).toBe(files.length);
        for (const f of files) expect(f.endsWith('.glb')).toBe(true);
    });
    it('loops locomotion/hold clips and one-shots the strikes/reactions', () => {
        const loops: ClipKey[] = ['idle', 'walk', 'block', 'stunned'];
        const oneShots: ClipKey[] = ['jab', 'cross', 'hook', 'uppercut', 'hit', 'ko'];
        for (const k of loops) expect(CLIPS[k].loop).toBe(true);
        for (const k of oneShots) expect(CLIPS[k].loop).toBe(false);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/fighter/__tests__/clips.test.ts`
Expected: FAIL — `Cannot find module '../clips'`.

- [ ] **Step 3: Implement `clips.ts`**

Create `lib/kowloon-knockout/render/fighter/clips.ts`:

```ts
/** Animation clip identity. Punch keys (jab/cross/hook/uppercut) deliberately
 *  match the sim's PunchType so the state machine can use rf.punch directly. */
export type ClipKey =
    | 'idle' | 'walk'
    | 'jab' | 'cross' | 'hook' | 'uppercut'
    | 'block' | 'hit' | 'stunned' | 'ko';

export interface ClipDef {
    /** GLB filename under FIGHTER_ASSET_DIR. */
    file: string;
    /** true = looping clip; false = one-shot (LoopOnce + clamp). */
    loop: boolean;
    /** Crossfade duration into this clip, seconds. */
    fade: number;
}

export const CLIP_KEYS: ClipKey[] = [
    'idle', 'walk', 'jab', 'cross', 'hook', 'uppercut', 'block', 'hit', 'stunned', 'ko',
];

export const CLIPS: Record<ClipKey, ClipDef> = {
    idle:     { file: 'idle.glb',     loop: true,  fade: 0.2 },
    walk:     { file: 'walk.glb',     loop: true,  fade: 0.15 },
    jab:      { file: 'jab.glb',      loop: false, fade: 0.08 },
    cross:    { file: 'cross.glb',    loop: false, fade: 0.08 },
    hook:     { file: 'hook.glb',     loop: false, fade: 0.08 },
    uppercut: { file: 'uppercut.glb', loop: false, fade: 0.08 },
    block:    { file: 'block.glb',    loop: true,  fade: 0.12 },
    hit:      { file: 'hit.glb',      loop: false, fade: 0.1 },
    stunned:  { file: 'stunned.glb',  loop: true,  fade: 0.15 },
    ko:       { file: 'ko.glb',       loop: false, fade: 0.15 },
};

export const FIGHTER_ASSET_DIR = '/kowloon/fighter';
export const RIG_FILE = 'ybot.glb';
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/fighter/__tests__/clips.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/render/fighter/clips.ts lib/kowloon-knockout/render/fighter/__tests__/clips.test.ts
git add lib/kowloon-knockout/render/fighter/clips.ts lib/kowloon-knockout/render/fighter/__tests__/clips.test.ts
git commit -m "feat(kowloon): fighter animation clip manifest"
```

---

### Task 2: `stateMachine.ts` — sim state → clip resolver (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/fighter/stateMachine.ts`
- Create: `lib/kowloon-knockout/render/fighter/__tests__/stateMachine.test.ts`

**Interfaces:**
- Consumes: `ClipKey`, `CLIPS` (Task 1); `RenderFighter` from `@/lib/kowloon-knockout/net/session`.
- Produces: `function resolveClip(rf: Pick<RenderFighter, 'state' | 'punch'>): { clip: ClipKey; loop: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/fighter/__tests__/stateMachine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveClip } from '../stateMachine';

const rf = (state: string, punch: 'jab' | 'cross' | 'hook' | 'uppercut' | null = null) =>
    ({ state, punch }) as Parameters<typeof resolveClip>[0];

describe('resolveClip', () => {
    it('maps the looping locomotion/hold states', () => {
        expect(resolveClip(rf('idle'))).toEqual({ clip: 'idle', loop: true });
        expect(resolveClip(rf('walking'))).toEqual({ clip: 'walk', loop: true });
        expect(resolveClip(rf('blocking'))).toEqual({ clip: 'block', loop: true });
        expect(resolveClip(rf('stunned'))).toEqual({ clip: 'stunned', loop: true });
    });
    it('maps the one-shot reactions', () => {
        expect(resolveClip(rf('hit'))).toEqual({ clip: 'hit', loop: false });
        expect(resolveClip(rf('knockedOut'))).toEqual({ clip: 'ko', loop: false });
    });
    it('maps each punch to its own clip', () => {
        expect(resolveClip(rf('punching', 'jab')).clip).toBe('jab');
        expect(resolveClip(rf('punching', 'cross')).clip).toBe('cross');
        expect(resolveClip(rf('punching', 'hook')).clip).toBe('hook');
        expect(resolveClip(rf('punching', 'uppercut')).clip).toBe('uppercut');
        expect(resolveClip(rf('punching', 'jab')).loop).toBe(false);
    });
    it('defaults a punch with no subtype to jab', () => {
        expect(resolveClip(rf('punching', null)).clip).toBe('jab');
    });
    it('falls back to idle for an unknown state', () => {
        expect(resolveClip(rf('teleporting'))).toEqual({ clip: 'idle', loop: true });
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/fighter/__tests__/stateMachine.test.ts`
Expected: FAIL — `Cannot find module '../stateMachine'`.

- [ ] **Step 3: Implement `stateMachine.ts`**

Create `lib/kowloon-knockout/render/fighter/stateMachine.ts`:

```ts
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { CLIPS, type ClipKey } from './clips';

/** Map a fighter's sim state to the animation clip it should be playing.
 *  Pure: same snapshot → same clip. The renderer crossfades to this each frame
 *  and (re)triggers one-shots on state-entry. */
export function resolveClip(rf: Pick<RenderFighter, 'state' | 'punch'>): { clip: ClipKey; loop: boolean } {
    let clip: ClipKey;
    switch (rf.state) {
        case 'walking':    clip = 'walk'; break;
        case 'punching':   clip = rf.punch ?? 'jab'; break; // PunchType ⊂ ClipKey
        case 'blocking':   clip = 'block'; break;
        case 'hit':        clip = 'hit'; break;
        case 'stunned':    clip = 'stunned'; break;
        case 'knockedOut': clip = 'ko'; break;
        case 'idle':
        default:           clip = 'idle'; break;
    }
    return { clip, loop: CLIPS[clip].loop };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/fighter/__tests__/stateMachine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/render/fighter/stateMachine.ts lib/kowloon-knockout/render/fighter/__tests__/stateMachine.test.ts
git add lib/kowloon-knockout/render/fighter/stateMachine.ts lib/kowloon-knockout/render/fighter/__tests__/stateMachine.test.ts
git commit -m "feat(kowloon): sim-state to animation-clip resolver"
```

---

### Task 3: `rootMotion.ts` — strip hips XZ translation (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/fighter/rootMotion.ts`
- Create: `lib/kowloon-knockout/render/fighter/__tests__/rootMotion.test.ts`

**Interfaces:**
- Consumes: `THREE.AnimationClip` from `three`.
- Produces: `function stripRootMotionXZ(clip: THREE.AnimationClip): void` — mutates in place; zeroes X and Z of any hips `.position` track, keeps Y, leaves all other tracks untouched.

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/fighter/__tests__/rootMotion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stripRootMotionXZ } from '../rootMotion';

describe('stripRootMotionXZ', () => {
    it('zeroes X and Z of the hips position track but keeps Y', () => {
        const hips = new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [1, 2, 3, 4, 5, 6]);
        const clip = new THREE.AnimationClip('walk', 1, [hips]);
        stripRootMotionXZ(clip);
        expect(Array.from(clip.tracks[0].values)).toEqual([0, 2, 0, 0, 5, 0]);
    });
    it('handles the colon bone-name variant', () => {
        const hips = new THREE.VectorKeyframeTrack('mixamorig:Hips.position', [0], [9, 8, 7]);
        const clip = new THREE.AnimationClip('walk', 1, [hips]);
        stripRootMotionXZ(clip);
        expect(Array.from(clip.tracks[0].values)).toEqual([0, 8, 0]);
    });
    it('leaves non-hips and non-position tracks untouched', () => {
        const spine = new THREE.VectorKeyframeTrack('mixamorigSpine.position', [0], [1, 2, 3]);
        const quat = new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0], [0, 0, 0, 1]);
        const clip = new THREE.AnimationClip('x', 1, [spine, quat]);
        stripRootMotionXZ(clip);
        expect(Array.from(clip.tracks[0].values)).toEqual([1, 2, 3]);
        expect(Array.from(clip.tracks[1].values)).toEqual([0, 0, 0, 1]);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/fighter/__tests__/rootMotion.test.ts`
Expected: FAIL — `Cannot find module '../rootMotion'`.

- [ ] **Step 3: Implement `rootMotion.ts`**

Create `lib/kowloon-knockout/render/fighter/rootMotion.ts`:

```ts
import type * as THREE from 'three';

/** Zero the X/Z translation of the hips ("root") position track so the sim
 *  stays the sole owner of a fighter's ground position; vertical (Y) motion is
 *  kept so crouches and the KO topple still read. Matches the Mixamo hips bone
 *  under either `mixamorigHips` or `mixamorig:Hips` naming. Mutates in place. */
export function stripRootMotionXZ(clip: THREE.AnimationClip): void {
    for (const track of clip.tracks) {
        if (!track.name.endsWith('.position')) continue;
        if (!track.name.includes('Hips')) continue;
        const v = track.values; // [x,y,z, x,y,z, ...]
        for (let i = 0; i < v.length; i += 3) {
            v[i] = 0;       // x
            v[i + 2] = 0;   // z
        }
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/fighter/__tests__/rootMotion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/render/fighter/rootMotion.ts lib/kowloon-knockout/render/fighter/__tests__/rootMotion.test.ts
git add lib/kowloon-knockout/render/fighter/rootMotion.ts lib/kowloon-knockout/render/fighter/__tests__/rootMotion.test.ts
git commit -m "feat(kowloon): strip hips XZ root motion from fighter clips"
```

---

### Task 4: `fighterRig.ts` — rig helpers (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/render/fighter/fighterRig.ts`
- Create: `lib/kowloon-knockout/render/fighter/__tests__/fighterRig.test.ts`

**Interfaces:**
- Consumes: `three`.
- Produces:
  - `function autoScaleToHeight(obj: THREE.Object3D, targetHeight: number): number` — scales `obj` uniformly so its bounding-box height equals `targetHeight`; returns the applied scale. No-op (returns 1) if the box is empty/zero-height.
  - `function findBone(root: THREE.Object3D, names: string[]): THREE.Object3D | undefined` — first descendant whose `name` matches any candidate.

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/render/fighter/__tests__/fighterRig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { autoScaleToHeight, findBone } from '../fighterRig';

describe('autoScaleToHeight', () => {
    it('scales an object so its bbox height matches the target', () => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)); // 2 units tall
        const s = autoScaleToHeight(mesh, 1.8);
        expect(s).toBeCloseTo(0.9, 5);
        const h = new THREE.Box3().setFromObject(mesh);
        expect(h.max.y - h.min.y).toBeCloseTo(1.8, 4);
    });
    it('returns 1 and does nothing for a zero-height object', () => {
        const empty = new THREE.Group();
        expect(autoScaleToHeight(empty, 1.8)).toBe(1);
    });
});

describe('findBone', () => {
    it('finds a descendant by any candidate name', () => {
        const root = new THREE.Object3D();
        const head = new THREE.Bone(); head.name = 'mixamorigHead';
        root.add(head);
        expect(findBone(root, ['mixamorig:Head', 'mixamorigHead'])).toBe(head);
    });
    it('returns undefined when no candidate matches', () => {
        expect(findBone(new THREE.Object3D(), ['nope'])).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/fighter/__tests__/fighterRig.test.ts`
Expected: FAIL — `Cannot find module '../fighterRig'`.

- [ ] **Step 3: Implement `fighterRig.ts`**

Create `lib/kowloon-knockout/render/fighter/fighterRig.ts`:

```ts
import * as THREE from 'three';

/** Uniformly scale `obj` so its world-space bounding-box height becomes
 *  `targetHeight`. Robust to whatever units the Mixamo FBX→GLB conversion
 *  produced. Returns the scale applied (1 if the box has no height). */
export function autoScaleToHeight(obj: THREE.Object3D, targetHeight: number): number {
    const box = new THREE.Box3().setFromObject(obj);
    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || height <= 0) return 1;
    const s = targetHeight / height;
    obj.scale.multiplyScalar(s);
    return s;
}

/** First descendant of `root` whose name equals any of `names` (handles the
 *  `mixamorigHips` vs `mixamorig:Hips` conversion variants). */
export function findBone(root: THREE.Object3D, names: string[]): THREE.Object3D | undefined {
    for (const n of names) {
        const found = root.getObjectByName(n);
        if (found) return found;
    }
    return undefined;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/render/fighter/__tests__/fighterRig.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/render/fighter/fighterRig.ts lib/kowloon-knockout/render/fighter/__tests__/fighterRig.test.ts
git add lib/kowloon-knockout/render/fighter/fighterRig.ts lib/kowloon-knockout/render/fighter/__tests__/fighterRig.test.ts
git commit -m "feat(kowloon): fighter rig helpers (auto-scale, bone lookup)"
```

---

### Task 5: `FighterTrappings.tsx` — shared nameplate + blob shadow (RUN-OBSERVE, parity)

**Files:**
- Create: `components/kowloon-knockout/arena/FighterTrappings.tsx`
- Modify: `components/kowloon-knockout/arena/StickFighter.tsx` (use the shared component)

**Interfaces:**
- Consumes: `Html` from `@react-three/drei`; `THREE` from `three`.
- Produces: `<FighterTrappings showNameplate plateColor plateLabel shadowRef />` rendering the floating nameplate + blob shadow exactly as `StickFighter` does today.

- [ ] **Step 1: Create `FighterTrappings.tsx` by moving the markup verbatim**

Read `StickFighter.tsx` first and move its nameplate `<Html>…</Html>` block and its blob-shadow `<mesh ref={shadow}>…</mesh>` into the new component unchanged. Create `components/kowloon-knockout/arena/FighterTrappings.tsx`:

```tsx
'use client';

import type { RefObject } from 'react';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';

/** Per-fighter decorations shared by StickFighter and SkeletalFighter: the
 *  floating ▼ + P-number nameplate and the soft blob shadow. The parent owns
 *  `shadowRef` so it can scale the shadow per state (e.g. larger on KO). */
export default function FighterTrappings({
    showNameplate, plateColor, plateLabel, shadowRef,
}: {
    showNameplate: boolean;
    plateColor: string;
    plateLabel: string;
    shadowRef: RefObject<THREE.Mesh | null>;
}) {
    return (
        <>
            {showNameplate && (
                <Html position={[0, 2.5, 0]} center distanceFactor={9} occlude={false} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                    <div className="kk-nameplate" style={{ color: plateColor }}>
                        <div className="kk-nameplate-tag">{plateLabel}</div>
                        <div className="kk-nameplate-tri">▼</div>
                    </div>
                </Html>
            )}
            <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <circleGeometry args={[0.42, 16]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.35} />
            </mesh>
        </>
    );
}
```

- [ ] **Step 2: Use it in `StickFighter.tsx`**

In `StickFighter.tsx`: add `import FighterTrappings from './FighterTrappings';`. Delete the inline `<Html>…</Html>` nameplate block and the `<mesh ref={shadow}>…</mesh>` blob-shadow block from the returned JSX, and replace them with, as the first children inside the root `<group ref={root}>`:

```tsx
            <FighterTrappings showNameplate={showNameplate} plateColor={plateColor} plateLabel={plateLabel} shadowRef={shadow} />
```

Keep the `shadow` ref declaration and the `useFrame` line that scales `shadow.current` — only the JSX markup moves. Remove the now-unused `Html` import from `StickFighter.tsx` if nothing else uses it.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/FighterTrappings.tsx components/kowloon-knockout/arena/StickFighter.tsx`
Expected: clean.

- [ ] **Step 4: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → local match. Expected: fighters look **identical** to current `main` — same nameplate, same blob shadow that still grows on KO. This is the regression gate for the extraction.

- [ ] **Step 5: Commit**

```bash
git add components/kowloon-knockout/arena/FighterTrappings.tsx components/kowloon-knockout/arena/StickFighter.tsx
git commit -m "refactor(kowloon): extract shared FighterTrappings (nameplate + shadow)"
```

---

### Task 6: `SkeletalFighter.tsx` — Y-Bot skeletal renderer (RUN-OBSERVE, spike-first)

**Files:**
- Create: `components/kowloon-knockout/arena/SkeletalFighter.tsx`

**Interfaces:**
- Consumes: `CLIPS`, `CLIP_KEYS`, `FIGHTER_ASSET_DIR`, `RIG_FILE`, `ClipKey` (Task 1); `resolveClip` (Task 2); `stripRootMotionXZ` (Task 3); `autoScaleToHeight`, `findBone` (Task 4); `FighterTrappings` (Task 5); `useGLTF` (drei); `SkeletonUtils.clone`. Reads `RenderFighter` via `framesRef`. (Tier selection is the dispatcher's job — this component does not read the tier.)
- Produces: `<SkeletalFighter seat framesRef showNameplate? />` — same prop shape as `StickFighter`.

- [ ] **Step 1: Implement the skeletal renderer**

Create `components/kowloon-knockout/arena/SkeletalFighter.tsx`. The structure mirrors `StickFighter` (imperative per-frame from `framesRef`, damped root, shared `FighterTrappings`), but the pose comes from an `AnimationMixer` crossfading clips chosen by `resolveClip`.

```tsx
'use client';

import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { CLIPS, CLIP_KEYS, FIGHTER_ASSET_DIR, RIG_FILE, type ClipKey } from '@/lib/kowloon-knockout/render/fighter/clips';
import { resolveClip } from '@/lib/kowloon-knockout/render/fighter/stateMachine';
import { stripRootMotionXZ } from '@/lib/kowloon-knockout/render/fighter/rootMotion';
import { autoScaleToHeight, findBone } from '@/lib/kowloon-knockout/render/fighter/fighterRig';
import FighterTrappings from './FighterTrappings';

type FramesRef = MutableRefObject<RenderFighter[]>;

const TARGET_HEIGHT = 1.8;
const MODEL_YAW_OFFSET = 0;          // tune in browser if Y-Bot faces away from +Z
const HEAD_BONES = ['mixamorigHead', 'mixamorig:Head'];
const HIPS_BONES = ['mixamorigHips', 'mixamorig:Hips'];
const FLASH = new THREE.Color('#ff2244');

const RIG_URL = `${FIGHTER_ASSET_DIR}/${RIG_FILE}`;
const CLIP_URLS = CLIP_KEYS.map((k) => `${FIGHTER_ASSET_DIR}/${CLIPS[k].file}`);

/** Shortest-path angle damp (shared convention with StickFighter). */
function dampAngle(current: number, target: number, t: number): number {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return current + d * t;
}

export default function SkeletalFighter({ seat, framesRef, showNameplate = true }: { seat: number; framesRef: FramesRef; showNameplate?: boolean }) {
    // Shared, cached loads. useGLTF suspends; a missing file throws → the
    // Fighter dispatcher's ErrorBoundary falls back to StickFighter.
    const rig = useGLTF(RIG_URL);
    const clipGltfs = useGLTF(CLIP_URLS); // array, one per CLIP_URLS entry

    const initial = framesRef.current.find((f) => f.seat === seat);
    const colorHex = initial?.color ?? '#cccccc';
    const accentHex = initial?.accent ?? '#ffffff';
    const plateColor = initial?.isLocal ? '#ffcc00' : accentHex;
    const plateLabel = `P${seat + 1}`;

    const root = useRef<THREE.Group>(null);
    const shadow = useRef<THREE.Mesh>(null);

    // Per-seat clone of the rig + its own mixer + actions, built once.
    const { model, mixer, actions, bodyMats } = useMemo(() => {
        const model = cloneSkeleton(rig.scene) as THREE.Group;
        autoScaleToHeight(model, TARGET_HEIGHT);

        // Identity: tint every skinned-mesh material (cloned so seats differ).
        const baseColor = new THREE.Color(colorHex);
        const bodyMats: THREE.MeshStandardMaterial[] = [];
        model.traverse((o) => {
            const sm = o as THREE.SkinnedMesh;
            if (sm.isSkinnedMesh) {
                const mat = (sm.material as THREE.MeshStandardMaterial).clone();
                mat.color.copy(baseColor);
                sm.material = mat;
                bodyMats.push(mat);
            }
        });

        // Procedural accessories parented to bones (skip if bone missing).
        const head = findBone(model, HEAD_BONES);
        if (head) {
            const band = new THREE.Mesh(
                new THREE.TorusGeometry(0.12, 0.03, 6, 12),
                new THREE.MeshStandardMaterial({ color: accentHex }),
            );
            band.rotation.x = Math.PI / 2;
            head.add(band);
        }
        const hips = findBone(model, HIPS_BONES);
        if (hips) {
            const belt = new THREE.Mesh(
                new THREE.TorusGeometry(0.16, 0.04, 6, 12),
                new THREE.MeshStandardMaterial({ color: accentHex }),
            );
            belt.rotation.x = Math.PI / 2;
            hips.add(belt);
        }

        // Mixer + one action per clip, with root motion stripped.
        const mixer = new THREE.AnimationMixer(model);
        const actions = {} as Record<ClipKey, THREE.AnimationAction>;
        CLIP_KEYS.forEach((key, i) => {
            const clip = clipGltfs[i].animations[0];
            if (!clip) return;
            stripRootMotionXZ(clip);
            const action = mixer.clipAction(clip);
            if (!CLIPS[key].loop) {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
            }
            actions[key] = action;
        });
        return { model, mixer, actions, bodyMats };
    }, [rig.scene, clipGltfs, colorHex, accentHex]);

    const currentClip = useRef<ClipKey | null>(null);

    useFrame((state, deltaRaw) => {
        const rf = framesRef.current.find((f) => f.seat === seat);
        const r = root.current;
        if (!rf || !r) return;
        const delta = Math.min(0.05, deltaRaw);

        // Position + facing (damped), reusing StickFighter's conventions.
        r.position.x += (rf.x - r.position.x) * 0.5;
        r.position.z += (rf.z - r.position.z) * 0.5;
        const faceY = Math.atan2(Math.cos(rf.yaw), Math.sin(rf.yaw));
        r.rotation.y = dampAngle(r.rotation.y, faceY, 0.4);

        // Clip selection + crossfade.
        const { clip } = resolveClip(rf);
        const next = actions[clip];
        if (next && currentClip.current !== clip) {
            const prev = currentClip.current ? actions[currentClip.current] : undefined;
            if (!CLIPS[clip].loop) next.reset();
            next.fadeIn(CLIPS[clip].fade).play();
            if (prev) prev.fadeOut(CLIPS[clip].fade);
            currentClip.current = clip;
        }
        mixer.update(delta);

        // Hit flash → emissive pulse; dim when down.
        const flash = rf.hitFlash > 0 ? Math.min(1, rf.hitFlash / 8) : 0;
        const dim = rf.alive ? 1 : 0.4;
        for (const mat of bodyMats) {
            mat.emissive.copy(FLASH).multiplyScalar(flash * 0.9);
            mat.color.setStyle(colorHex).multiplyScalar(dim);
        }

        if (shadow.current) shadow.current.scale.setScalar(rf.state === 'knockedOut' ? 1.4 : 1);
    });

    return (
        <group ref={root}>
            <FighterTrappings showNameplate={showNameplate} plateColor={plateColor} plateLabel={plateLabel} shadowRef={shadow} />
            <group rotation={[0, MODEL_YAW_OFFSET, 0]}>
                <primitive object={model} />
            </group>
        </group>
    );
}
```

> **Spike notes (browser-only verifiable; can't test until the user adds the GLBs):**
> - `useGLTF(CLIP_URLS)` with an array returns an array of gltf results — confirm shape in-browser; if drei returns a single object for arrays in this version, switch to mapping individual `useGLTF` calls (one per clip) at the top level (fixed-length `CLIP_URLS`, so hook order is stable).
> - `SkeletonUtils.clone` is the documented way to clone a skinned mesh with an independent skeleton — verify each of the (≤4) fighters animates independently.
> - `MODEL_YAW_OFFSET` and `TARGET_HEIGHT` are tuning constants — adjust during sign-off if the model faces the wrong way or is the wrong size.
> - Mixamo clips export the mesh too when not "Without Skin"; we only read `animations[0]`, so extra meshes in a clip GLB are ignored.
> - Do NOT preload via `useGLTF.preload` here — preloading a missing asset would throw outside the ErrorBoundary.

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/SkeletalFighter.tsx`
Expected: clean. (If TS complains `clipGltfs` could be non-array, narrow with `const gltfs = Array.isArray(clipGltfs) ? clipGltfs : [clipGltfs];` and map over that.)

- [ ] **Step 3: [SMOKE] (RUN-OBSERVE, deferred to user — needs assets)**

After the user adds `public/kowloon/fighter/*.glb`: `pnpm dev` → match on a WebGPU desktop. Expected: Y-Bot fighters at the right size/facing, idling, walking, throwing the four punches, blocking, reacting to hits, and toppling on KO, each animating independently with neon tint + accessories. Mark deferred to user.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/SkeletalFighter.tsx
git commit -m "feat(kowloon): Y-Bot skeletal fighter renderer"
```

---

### Task 7: `Fighter.tsx` dispatcher + mount in `Arena3D` (RUN-OBSERVE)

**Files:**
- Create: `components/kowloon-knockout/arena/Fighter.tsx`
- Modify: `components/kowloon-knockout/arena/Arena3D.tsx`

**Interfaces:**
- Consumes: `useRenderTier` (`./RenderTierContext`); `StickFighter`; `SkeletalFighter` (Task 6); React `Suspense`, `Component`.
- Produces: `<Fighter seat framesRef />` — drop-in for the old `<StickFighter>` in the seat map.

- [ ] **Step 1: Implement the dispatcher with fallback**

Create `components/kowloon-knockout/arena/Fighter.tsx`. Low tier → `StickFighter`. Otherwise render `SkeletalFighter` wrapped in a Suspense (fallback `StickFighter` while GLBs load) and a class ErrorBoundary (fallback `StickFighter` if the assets are missing or fail to load — the default state until the user adds them).

```tsx
'use client';

import { Suspense, Component, type ReactNode, type MutableRefObject } from 'react';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { useRenderTier } from './RenderTierContext';
import StickFighter from './StickFighter';
import SkeletalFighter from './SkeletalFighter';

type FramesRef = MutableRefObject<RenderFighter[]>;

/** Renders `fallback` if anything under it throws (e.g. a missing/failed
 *  fighter GLB) — keeps the match alive on the procedural StickFighter. */
class FighterBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { error: boolean }> {
    state = { error: false };
    static getDerivedStateFromError() { return { error: true }; }
    componentDidCatch(error: unknown, info: { componentStack?: string }) {
        console.warn('[Fighter] skeletal load failed, using StickFighter:', error, info?.componentStack);
    }
    render() {
        if (this.state.error) return this.props.fallback;
        return this.props.children;
    }
}

/** Per-seat fighter: skeletal Y-Bot on medium/high/ultra, procedural
 *  StickFighter on low and as the universal fallback (missing/loading/failed
 *  assets). */
export default function Fighter({ seat, framesRef }: { seat: number; framesRef: FramesRef }) {
    const { tier } = useRenderTier();
    const stick = <StickFighter seat={seat} framesRef={framesRef} />;
    if (tier === 'low') return stick;
    return (
        <FighterBoundary fallback={stick}>
            <Suspense fallback={stick}>
                <SkeletalFighter seat={seat} framesRef={framesRef} />
            </Suspense>
        </FighterBoundary>
    );
}
```

- [ ] **Step 2: Mount in `Arena3D.tsx`**

In `components/kowloon-knockout/arena/Arena3D.tsx`: replace `import StickFighter from './StickFighter';` with `import Fighter from './Fighter';`, and change the seat map (around line 51-53) from `<StickFighter key={seat} seat={seat} framesRef={framesRef} />` to `<Fighter key={seat} seat={seat} framesRef={framesRef} />`.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/Fighter.tsx components/kowloon-knockout/arena/Arena3D.tsx`
Expected: clean.

- [ ] **Step 4: [SMOKE] (RUN-OBSERVE, deferred to user) — the no-asset regression gate**

With NO `public/kowloon/fighter/` assets present (the current state): `pnpm dev` → match. Expected: every fighter renders as the **StickFighter** exactly as before, on all tiers, with no console errors beyond the one-time `[Fighter] skeletal load failed` warning per seat. This proves the fallback path. (After the user adds assets, medium/high/ultra switch to Y-Bot; low stays StickFighter.)

- [ ] **Step 5: Commit**

```bash
git add components/kowloon-knockout/arena/Fighter.tsx components/kowloon-knockout/arena/Arena3D.tsx
git commit -m "feat(kowloon): Fighter dispatcher — skeletal with StickFighter fallback"
```

---

## Final integration

After all tasks:
- Full unit run: `node_modules/.bin/vitest run lib/kowloon-knockout/render` — clips + stateMachine + rootMotion + fighterRig (plus all prior phases) pass.
- **[SMOKE] without assets (ships now):** every fighter is StickFighter across tiers, no regression — this is the merge gate.
- **[SMOKE] with assets (after the user adds the GLBs):** Y-Bot loads, scales/faces correctly, all clips play + crossfade per state; low tier + asset-error still fall back to StickFighter.
- `senior-swe-reviewer` pass on the branch diff before opening the PR.

## Phase 5 (not in this plan)

Tier UI + adaptive FPS governor + mobile/WebGL2 validation. Its own brainstorm → spec → plan.
