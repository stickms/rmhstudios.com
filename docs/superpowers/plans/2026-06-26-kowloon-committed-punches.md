# Kowloon Knockout — Animation-Committed Punches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Phase-4 T-pose/spam by making punches animation-committed — the fighter locks into a punch for its full window (snappy hit + recovery), a buffered punch fires on recovery, and every one-shot clip (punch/hit/KO) is driven by sim progress so it always plays fully.

**Architecture:** Deterministic sim changes (per-punch commit window, early hit frame, one-punch input buffer) in `game/combat` + `game/fighters` + `game/world`; a pure `actionProgress` helper exposed through the render snapshot (`RenderFighter.actionProgress`) computed identically in both `getRenderFighters` paths; and the skeletal renderer drives one-shot clip time from `actionProgress`. The combat sim stays deterministic and identical on both networked clients.

**Tech Stack:** TypeScript, the existing Kowloon combat sim (60 Hz fixed step), React Three Fiber + three.js `^0.183.2` (`AnimationAction`), Vitest `^4.1.8` (node env).

## Global Constraints

- **Sim is deterministic netcode — both host and guest run identical logic.** All new timing is pure constants/functions; `actionProgress` is derived only from already-synced snapshot fields. A divergence desyncs the two players.
- **three stays at `^0.183.2`.**
- **No net-protocol change.** `actionProgress` is computed from `state`/`punch`/`punchFrame`/`stateFrame`, which both snapshot paths already carry.
- **Tunable starting values (60 Hz):** `PUNCH_COMMIT_FRAMES = { jab: 28, cross: 31, hook: 34, uppercut: 37 }`; hit frame `= floor(commit * 0.25)`; `HIT_FRAMES = 12`; `KO_FRAMES = 35`. These are tuning constants for browser sign-off.
- **Test runner:** `node_modules/.bin/vitest run <path>` (node env). **Lint:** `node_modules/.bin/eslint <files>`.
- **Out of scope — do not change:** block/stun durations, damage, stamina costs, AI, combos, the net protocol, or any file not listed in a task.

## Verification approach

- **(UNIT)** — `punches.ts` constants/helper, `actionProgress.ts`, and the sim timing/buffer in `fighter.ts` are pure and node-testable: real Vitest TDD. Run `node_modules/.bin/vitest run lib/kowloon-knockout`.
- **(RUN-OBSERVE)** — `world.ts` wiring and `SkeletalFighter.tsx` rendering: browser-only, **[SMOKE]** deferred to user; `eslint` is the headless gate.
- **Per project workflow:** a `senior-swe-reviewer` pass before the PR (this is deterministic combat — extra important).

## Parallelization guidance

Tasks 1 and 2 are independent pure modules. Task 3 depends on Task 1. Task 4 depends on Task 3 (the `bufferedPunch` field). Task 5 depends on Task 2. Task 6 depends on Task 5 (the `actionProgress` field). Build 1→2→3→4→5→6 (or 1,2 in parallel then the rest in order).

---

### Task 1: `punches.ts` — commit window + hit frame (UNIT, TDD)

**Files:**
- Modify: `lib/kowloon-knockout/game/combat/punches.ts`
- Create: `lib/kowloon-knockout/game/combat/__tests__/punches.test.ts`

**Interfaces:**
- Consumes: `PunchType` from `../fighters/types`.
- Produces:
  - `const PUNCH_COMMIT_FRAMES: Record<PunchType, number>` — total frames a fighter stays in `punching`.
  - `function punchHitFrame(punch: PunchType): number` — the single active hit frame (early/snappy).

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/game/combat/__tests__/punches.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PUNCH_COMMIT_FRAMES, punchHitFrame } from '../punches';
import type { PunchType } from '../../fighters/types';

const TYPES: PunchType[] = ['jab', 'cross', 'hook', 'uppercut'];

describe('PUNCH_COMMIT_FRAMES', () => {
    it('preserves the jab < cross < hook < uppercut ordering', () => {
        const c = PUNCH_COMMIT_FRAMES;
        expect(c.jab).toBeLessThan(c.cross);
        expect(c.cross).toBeLessThan(c.hook);
        expect(c.hook).toBeLessThan(c.uppercut);
    });
    it('uses windows around half a second at 60Hz (24..40 frames)', () => {
        for (const t of TYPES) {
            expect(PUNCH_COMMIT_FRAMES[t]).toBeGreaterThanOrEqual(24);
            expect(PUNCH_COMMIT_FRAMES[t]).toBeLessThanOrEqual(40);
        }
    });
});

describe('punchHitFrame', () => {
    it('lands early in the window (snappy) and before it ends', () => {
        for (const t of TYPES) {
            const hit = punchHitFrame(t);
            expect(hit).toBeGreaterThan(0);
            expect(hit).toBeLessThan(PUNCH_COMMIT_FRAMES[t]);
            expect(hit).toBeLessThanOrEqual(10); // ~0.16s startup max
        }
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/game/combat/__tests__/punches.test.ts`
Expected: FAIL — `PUNCH_COMMIT_FRAMES`/`punchHitFrame` are not exported.

- [ ] **Step 3: Implement in `punches.ts`**

Append to `lib/kowloon-knockout/game/combat/punches.ts` (keep the existing `PUNCH_DEFS`, `calculateDamage`, `calculatePunchSpeed`, `getStaleMoveMultiplier` as-is):

```ts
/** Total frames a fighter is committed to a punch (locked out of new actions)
 *  at the sim's 60Hz step. The animation plays across this whole window, so the
 *  fighter reads as committed and can't spam. Tunable; preserves the
 *  jab<cross<hook<uppercut speed ordering. */
export const PUNCH_COMMIT_FRAMES: Record<PunchType, number> = {
    jab: 28, cross: 31, hook: 34, uppercut: 37,
};

/** The single frame a punch becomes active (connects). Kept early in the commit
 *  window so hits stay snappy — only the recovery/lock is extended. */
export function punchHitFrame(punch: PunchType): number {
    return Math.floor(PUNCH_COMMIT_FRAMES[punch] * 0.25);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/game/combat/__tests__/punches.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/game/combat/punches.ts lib/kowloon-knockout/game/combat/__tests__/punches.test.ts
git add lib/kowloon-knockout/game/combat/punches.ts lib/kowloon-knockout/game/combat/__tests__/punches.test.ts
git commit -m "feat(kowloon): per-punch commit window + early hit frame"
```

---

### Task 2: `actionProgress.ts` — one-shot progress helper (UNIT, TDD)

**Files:**
- Create: `lib/kowloon-knockout/game/combat/actionProgress.ts`
- Create: `lib/kowloon-knockout/game/combat/__tests__/actionProgress.test.ts`

**Interfaces:**
- Consumes: `PUNCH_COMMIT_FRAMES` (Task 1); `PunchType` from `../fighters/types`.
- Produces:
  - `const HIT_FRAMES = 12`, `const KO_FRAMES = 35`.
  - `interface ActionProgressInput { state: string; punch: PunchType | null; punchFrame: number; stateFrame: number; }`
  - `function actionProgress(f: ActionProgressInput): number` → `[0,1]`, how far through the current one-shot (punch/hit/KO); 0 for looping states.

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/game/combat/__tests__/actionProgress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { actionProgress, HIT_FRAMES, KO_FRAMES } from '../actionProgress';
import { PUNCH_COMMIT_FRAMES } from '../punches';

const base = { state: 'idle', punch: null as 'jab' | null, punchFrame: 0, stateFrame: 0 };

describe('actionProgress', () => {
    it('is 0 for looping states (idle/walk/block/stunned)', () => {
        for (const state of ['idle', 'walking', 'blocking', 'stunned']) {
            expect(actionProgress({ ...base, state })).toBe(0);
        }
    });
    it('tracks punch progress over the commit window', () => {
        const half = Math.round(PUNCH_COMMIT_FRAMES.jab / 2);
        expect(actionProgress({ state: 'punching', punch: 'jab', punchFrame: 0, stateFrame: 0 })).toBe(0);
        expect(actionProgress({ state: 'punching', punch: 'jab', punchFrame: half, stateFrame: 0 }))
            .toBeCloseTo(half / PUNCH_COMMIT_FRAMES.jab, 5);
    });
    it('clamps punch progress to 1 past the window', () => {
        expect(actionProgress({ state: 'punching', punch: 'jab', punchFrame: 999, stateFrame: 0 })).toBe(1);
    });
    it('is 0 for a punching state with no punch type', () => {
        expect(actionProgress({ state: 'punching', punch: null, punchFrame: 5, stateFrame: 0 })).toBe(0);
    });
    it('tracks hit and KO progress and clamps at 1', () => {
        expect(actionProgress({ ...base, state: 'hit', stateFrame: HIT_FRAMES / 2 })).toBeCloseTo(0.5, 5);
        expect(actionProgress({ ...base, state: 'hit', stateFrame: HIT_FRAMES + 9 })).toBe(1);
        expect(actionProgress({ ...base, state: 'knockedOut', stateFrame: KO_FRAMES })).toBe(1);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/game/combat/__tests__/actionProgress.test.ts`
Expected: FAIL — `Cannot find module '../actionProgress'`.

- [ ] **Step 3: Implement `actionProgress.ts`**

Create `lib/kowloon-knockout/game/combat/actionProgress.ts`:

```ts
import type { PunchType } from '../fighters/types';
import { PUNCH_COMMIT_FRAMES } from './punches';

/** Hit-reaction state duration in frames (matches updateFighter's `hit` case). */
export const HIT_FRAMES = 12;
/** KO topple window in frames (matches the StickFighter KO fall). */
export const KO_FRAMES = 35;

export interface ActionProgressInput {
    state: string;
    punch: PunchType | null;
    punchFrame: number;
    stateFrame: number;
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** How far through the current one-shot action (punch/hit/KO) a fighter is, in
 *  [0,1]. Looping states return 0. Pure and derived only from snapshot-carried
 *  fields, so host and guest compute it identically. The renderer uses it to
 *  drive one-shot clip time so the animation always plays fully. */
export function actionProgress(f: ActionProgressInput): number {
    switch (f.state) {
        case 'punching':
            return f.punch ? clamp01(f.punchFrame / PUNCH_COMMIT_FRAMES[f.punch]) : 0;
        case 'hit':
            return clamp01(f.stateFrame / HIT_FRAMES);
        case 'knockedOut':
            return clamp01(f.stateFrame / KO_FRAMES);
        default:
            return 0;
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/game/combat/__tests__/actionProgress.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/game/combat/actionProgress.ts lib/kowloon-knockout/game/combat/__tests__/actionProgress.test.ts
git add lib/kowloon-knockout/game/combat/actionProgress.ts lib/kowloon-knockout/game/combat/__tests__/actionProgress.test.ts
git commit -m "feat(kowloon): actionProgress helper for one-shot animation sync"
```

---

### Task 3: `fighter.ts` + `types.ts` — commit window, snappy hit, input buffer (UNIT, TDD)

**Files:**
- Modify: `lib/kowloon-knockout/game/fighters/types.ts` (add `bufferedPunch`)
- Modify: `lib/kowloon-knockout/game/fighters/fighter.ts`
- Create: `lib/kowloon-knockout/game/fighters/__tests__/committedPunch.test.ts`

**Interfaces:**
- Consumes: `PUNCH_COMMIT_FRAMES`, `punchHitFrame` (Task 1); `createFighter`, `startPunch`, `updateFighter`, `isHitFrame` (existing).
- Produces: `Fighter.bufferedPunch: PunchType | null`; punching now lasts `PUNCH_COMMIT_FRAMES[type]`; `isHitFrame` fires at `punchHitFrame`; a buffered punch auto-starts on return to idle.

- [ ] **Step 1: Write the failing test**

Create `lib/kowloon-knockout/game/fighters/__tests__/committedPunch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createFighter, startPunch, updateFighter, isHitFrame } from '../fighter';
import { PUNCH_COMMIT_FRAMES, punchHitFrame } from '../../combat/punches';

function fresh() {
    const f = createFighter({ seat: 0, className: 'stone_tiger', team: 0, isAI: false, isLocal: true, x: 0, z: 5, displayName: 'P1' });
    f.stamina = 100; // ample for back-to-back punches in the test
    return f;
}

describe('committed punch timing', () => {
    it('stays in punching for the full commit window then returns to idle', () => {
        const f = fresh();
        expect(startPunch(f, 'jab')).toBe(true);
        for (let i = 1; i < PUNCH_COMMIT_FRAMES.jab; i++) {
            updateFighter(f);
            expect(f.state).toBe('punching');
        }
        updateFighter(f); // frame === commit
        expect(f.state).toBe('idle');
    });
    it('fires isHitFrame once, early, at punchHitFrame', () => {
        const f = fresh();
        startPunch(f, 'jab');
        const hits: number[] = [];
        for (let frame = 1; frame <= PUNCH_COMMIT_FRAMES.jab; frame++) {
            updateFighter(f);
            if (f.state === 'punching' && isHitFrame(f)) hits.push(f.punchFrame);
        }
        expect(hits).toEqual([punchHitFrame('jab')]);
    });
    it('starts a buffered punch on the frame it returns to idle', () => {
        const f = fresh();
        startPunch(f, 'jab');
        // advance partway, then buffer a cross (as world.ts would when busy)
        for (let i = 0; i < 5; i++) updateFighter(f);
        f.bufferedPunch = 'cross';
        // advance to the end of the jab window
        while (f.currentPunch?.type === 'jab') updateFighter(f);
        expect(f.state).toBe('punching');
        expect(f.currentPunch?.type).toBe('cross');
        expect(f.bufferedPunch).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/game/fighters/__tests__/committedPunch.test.ts`
Expected: FAIL — `bufferedPunch` not on the fighter / punch reverts to idle too early.

- [ ] **Step 3a: Add `bufferedPunch` to the `Fighter` type**

In `lib/kowloon-knockout/game/fighters/types.ts`, in the `Fighter` interface, add after `punchFrame: number;` (line ~72):

```ts
  /** A punch pressed during the current punch's commit window, fired on the
   *  frame the fighter returns to idle (one-slot input buffer). */
  bufferedPunch: PunchType | null;
```

- [ ] **Step 3b: Initialize and reset `bufferedPunch`**

In `lib/kowloon-knockout/game/fighters/fighter.ts`:
- In `createFighter`'s returned object, after `punchFrame: 0,` (line ~45) add: `bufferedPunch: null,`.
- In `resetFighter`, after `fighter.punchFrame = 0;` add: `fighter.bufferedPunch = null;`.

- [ ] **Step 3c: Use the commit window + snappy hit frame, and consume the buffer**

In `fighter.ts`, update the import (line 11) to bring in the new helpers and drop the now-unused `calculatePunchSpeed`:

```ts
import { PUNCH_DEFS, calculateDamage, PUNCH_COMMIT_FRAMES, punchHitFrame } from '../combat/punches';
```

Replace the `punching` case body in `updateFighter` (currently lines ~215-227) with:

```ts
        case 'punching': {
            if (!fighter.currentPunch) { fighter.state = 'idle'; break; }
            const dur = PUNCH_COMMIT_FRAMES[fighter.currentPunch.type];
            fighter.punchFrame++;
            if (fighter.punchFrame >= dur) {
                if (!fighter.punchConnected) fighter.comboHistory = [];
                fighter.state = 'idle';
                fighter.currentPunch = null;
                fighter.punchFrame = 0;
                fighter.stateFrame = 0;
                fighter.punchConnected = false;
                // Fire a buffered punch immediately so it feels responsive.
                if (fighter.bufferedPunch) {
                    const queued = fighter.bufferedPunch;
                    fighter.bufferedPunch = null;
                    startPunch(fighter, queued);
                }
            }
            break;
        }
```

Replace the body of `isHitFrame` (currently lines ~259-264) with:

```ts
export function isHitFrame(attacker: Fighter): boolean {
    if (attacker.state !== 'punching' || !attacker.currentPunch) return false;
    return attacker.punchFrame === punchHitFrame(attacker.currentPunch.type);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest run lib/kowloon-knockout/game/fighters/__tests__/committedPunch.test.ts`
Expected: PASS (3 tests). Also run the existing fighter suite to confirm no regression: `node_modules/.bin/vitest run lib/kowloon-knockout/game`.

- [ ] **Step 5: Lint + commit**

```bash
node_modules/.bin/eslint lib/kowloon-knockout/game/fighters/fighter.ts lib/kowloon-knockout/game/fighters/types.ts lib/kowloon-knockout/game/fighters/__tests__/committedPunch.test.ts
git add lib/kowloon-knockout/game/fighters/fighter.ts lib/kowloon-knockout/game/fighters/types.ts lib/kowloon-knockout/game/fighters/__tests__/committedPunch.test.ts
git commit -m "feat(kowloon): committed punch window + snappy hit + input buffer slot"
```

---

### Task 4: `world.ts` — buffer a punch pressed while busy (RUN-OBSERVE)

**Files:**
- Modify: `lib/kowloon-knockout/game/world.ts`

**Interfaces:**
- Consumes: `Fighter.bufferedPunch` (Task 3).
- Produces: a punch command pressed mid-`punching` is stored in `bufferedPunch` (instead of dropped).

- [ ] **Step 1: Buffer instead of drop**

In `lib/kowloon-knockout/game/world.ts`, replace the punch-apply block (currently lines ~152-154):

```ts
        if (cmd.punch && (f.state === 'idle' || f.state === 'walking' || f.state === 'blocking')) {
            startPunch(f, cmd.punch);
        }
```

with:

```ts
        if (cmd.punch) {
            if (f.state === 'idle' || f.state === 'walking' || f.state === 'blocking') {
                startPunch(f, cmd.punch);
            } else if (f.state === 'punching') {
                // Locked into the current punch — buffer this one (latest wins);
                // updateFighter fires it on the frame the window ends.
                f.bufferedPunch = cmd.punch;
            }
        }
```

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint lib/kowloon-knockout/game/world.ts`
Expected: clean.

- [ ] **Step 3: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → local match. Expected: punches commit (you can't mash out a second punch mid-swing); a punch pressed during a swing fires once, right as the swing ends. Deferred to user.

- [ ] **Step 4: Commit**

```bash
git add lib/kowloon-knockout/game/world.ts
git commit -m "feat(kowloon): buffer a punch pressed mid-swing instead of dropping it"
```

---

### Task 5: `session.ts` — expose `actionProgress` in the snapshot (RUN-OBSERVE)

**Files:**
- Modify: `lib/kowloon-knockout/net/session.ts`

**Interfaces:**
- Consumes: `actionProgress` (Task 2).
- Produces: `RenderFighter.actionProgress: number`, set in both `getRenderFighters` paths.

- [ ] **Step 1: Add the field + compute it in both paths**

In `lib/kowloon-knockout/net/session.ts`:

1. Add the import near the other game imports: `import { actionProgress } from '@/lib/kowloon-knockout/game/combat/actionProgress';`
2. In the `RenderFighter` interface (after `stateFrame: number;`, line ~43) add: `actionProgress: number;`
3. In the **local-sim** `getRenderFighters` (line ~237-245), add to the returned object (next to `punchFrame`/`stateFrame`):

```ts
                actionProgress: actionProgress({ state: f.state, punch: f.currentPunch?.type ?? null, punchFrame: f.punchFrame, stateFrame: f.stateFrame }),
```

4. In the **net** `getRenderFighters` (line ~416-423), add to the returned object:

```ts
                actionProgress: actionProgress({ state: nf.state, punch: nf.punch, punchFrame: nf.punchFrame, stateFrame: nf.stateFrame }),
```

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint lib/kowloon-knockout/net/session.ts`
Expected: clean. (If `nf.punch` is typed as `PunchType | null` already — it is per the existing `punch: nf.punch` mapping — no cast is needed.)

- [ ] **Step 3: Commit**

```bash
git add lib/kowloon-knockout/net/session.ts
git commit -m "feat(kowloon): expose actionProgress on the render snapshot"
```

---

### Task 6: `SkeletalFighter.tsx` — drive one-shots from `actionProgress` + harden crossfade (RUN-OBSERVE)

**Files:**
- Modify: `components/kowloon-knockout/arena/SkeletalFighter.tsx`

**Interfaces:**
- Consumes: `RenderFighter.actionProgress` (Task 5).
- Produces: one-shot clips play fully, synced to the sim; no T-pose.

- [ ] **Step 1: Sync one-shot clip time to actionProgress; harden the crossfade**

Read the current `SkeletalFighter.tsx` useFrame crossfade block first. It currently selects a clip via `resolveClip`, and on a clip change does `next.reset()` (for one-shots) + `next.fadeIn(fade).play()` + `prev.fadeOut(fade)`, then `mixer.update(delta)`.

Make two changes inside `useFrame`, keeping the existing dance-override and the rest of the body:

1. **Harden the crossfade** so the incoming action always has weight before the outgoing loses it (no bind-pose gap). When the clip changes:

```tsx
        // clip already resolved above (with the dance override) as `clip`
        const next = actions[clip];
        if (next && currentClip.current !== clip) {
            const prev = currentClip.current ? actions[currentClip.current] : undefined;
            if (!CLIPS[clip].loop) next.reset();
            next.enabled = true;
            next.play();
            if (prev && prev !== next) {
                next.crossFadeFrom(prev, CLIPS[clip].fade, false); // prev→next weight ramp, no gap
            } else {
                next.setEffectiveWeight(1);
            }
            currentClip.current = clip;
        }
```

2. **Drive one-shot time from the sim** so the punch/hit/KO clip is a pure function of sim progress (never cut off / T-posed). After the crossfade block and before `mixer.update(delta)`:

```tsx
        // One-shot clips (punch/hit/ko) are positioned by sim progress so they
        // always play fully across the action window regardless of its length.
        const active = actions[clip];
        if (active && !CLIPS[clip].loop) {
            active.paused = true;                 // we set time manually
            active.time = rf.actionProgress * active.getClip().duration;
        } else if (active) {
            active.paused = false;                // looping clips advance with the mixer
        }
        mixer.update(delta);
```

> **Spike notes (browser-only verifiable):**
> - Setting `action.paused = true` + `action.time = …` and still calling `mixer.update(delta)` is the documented way to scrub an action manually; confirm the one-shots track the sim (a slow jab should visibly play start→finish over its window) and that switching back to a looping clip un-pauses it.
> - `crossFadeFrom` requires both actions enabled with weight; the block above sets `next.enabled`/weight before fading. If a first-ever clip has no `prev`, it just `play()`s. Confirm no bind-pose flash remains between idle and punches.
> - `rf.actionProgress` is 0 for looping states, so the `else` branch keeps idle/walk/etc. advancing normally.

- [ ] **Step 2: Lint**

Run: `node_modules/.bin/eslint components/kowloon-knockout/arena/SkeletalFighter.tsx`
Expected: clean.

- [ ] **Step 3: [SMOKE] (RUN-OBSERVE, deferred to user)**

`pnpm dev` → match on a WebGPU desktop with the FBX assets present. Expected: punches play as full, committed swings synced to the hit; hit and KO reactions play fully; **no T-pose flashes**; mashing produces no extra punches. Deferred to user.

- [ ] **Step 4: Commit**

```bash
git add components/kowloon-knockout/arena/SkeletalFighter.tsx
git commit -m "feat(kowloon): drive one-shot fighter clips from sim actionProgress; harden crossfade"
```

---

## Final integration

After all tasks:
- Full unit run: `node_modules/.bin/vitest run lib/kowloon-knockout` — punches + actionProgress + committedPunch + all prior suites pass.
- **[SMOKE] (user, WebGPU desktop, assets present):** punches are committed/weighty and synced; no T-pose; no spam; buffered punch fires on recovery; hit/KO play fully. Tune `PUNCH_COMMIT_FRAMES` if the pace feels off.
- Multiplayer smoke test (host + guest): confirm both clients show identical committed punches and stay in sync (determinism).
- `senior-swe-reviewer` pass on the branch diff before opening the PR — emphasize the deterministic-sim timing and the buffer logic.
