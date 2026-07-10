# "Game" (cookgame) — Phase 3 M4 (Day–Night Cycle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time day–night cycle that advances a persisted clock, animates the sun/sky/lighting, and selectively gates a night-only shop and buyer — without disturbing the core buy→mix→sell loop.

**Architecture:** A new pure lib `lib/cookgame/timeOfDay.ts` owns all time math (clock advance + wrap, day fraction, phase-of-day, sun direction, and `isOpenAt` window checks). The store already persists `clock` (provisioned in save v3 by M1) and gains a `tickClock` action; an in-`<Canvas>` ticker advances it each frame (mirroring `HeatTicker`). `Lighting.tsx` reads a 1-second-quantized clock from the store and recomputes sun position, light intensity/color, and sky tint declaratively. Time-gating reuses the existing `visibleItems` filter (shops) and `sellUnit` guard (buyers), surfaced in `ShopOverlay`/`SellOverlay` and the HUD clock readout.

**Tech Stack:** TypeScript, Zustand, react-three-fiber + drei (`<Sky>`), Rapier (unaffected), Vitest (pure-lib unit tests, node — no DOM env).

## Global Constraints

- **Internal slug:** `cookgame`. Display title "Game". Tone: satirical/fictional.
- **Pure libs** (`lib/cookgame/*.ts`) export plain functions + `const` data only — no React, no store imports, no `Date.now()`/`Math.random()` in tested paths (pass time in). Vitest-tested in node.
- **R3F/UI** is typecheck + lint + manual only (no DOM test env). Every `.tsx` file starts with `"use client";`.
- **Backward compatible:** existing pure-lib signatures stay callable as-is. `visibleItems(shop, rank)` gains an **optional** `clock` param (defaults to "always open") so existing call sites and tests keep passing.
- **No save bump.** `clock` already exists in `SaveV3` (defaulted to 0). M4 adds no new persisted fields. Do **not** change `CURRENT_VERSION`.
- **Day length:** `DAY_LENGTH_MS = 360_000` (6 real minutes per in-game day).
- **Phase boundaries** (by day fraction `f = clock / DAY_LENGTH_MS`, `f ∈ [0,1)`): `night` for `f < 0.20` or `f ≥ 0.80`; `dawn` for `0.20 ≤ f < 0.30`; `day` for `0.30 ≤ f < 0.70`; `dusk` for `0.70 ≤ f < 0.80`. `f = 0` is midnight, `f = 0.5` is noon.
- **Verification gates (Task 8):** `vitest run lib/cookgame` green, `tsc -p tsconfig.json --noEmit` clean, `eslint components/cookgame lib/cookgame` clean, `vite build` exit 0. Use `./node_modules/.bin/<tool>` wrappers (pnpm wrappers are blocked here).
- **Branch:** `feat/cookgame-phase-3-m4`. `senior-swe-reviewer` agent before the PR to `main`.

---

### Task 1: `timeOfDay.ts` — clock advance, day fraction, phase

**Files:**
- Create: `lib/cookgame/timeOfDay.ts`
- Test: `lib/cookgame/__tests__/timeOfDay.test.ts`

**Interfaces:**
- Consumes: nothing (leaf pure lib).
- Produces:
  - `export const DAY_LENGTH_MS = 360_000;`
  - `export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';`
  - `export function advanceClock(clock: number, dtMs: number): number` — returns `(clock + dtMs)` wrapped into `[0, DAY_LENGTH_MS)`. Handles `dtMs` larger than a full day and small negative drift.
  - `export function dayFraction(clock: number): number` — `clock / DAY_LENGTH_MS`, in `[0, 1)`.
  - `export function phaseOfDay(clock: number): DayPhase` — per the Global Constraints boundaries.

- [ ] **Step 1: Write the failing test**

```ts
// lib/cookgame/__tests__/timeOfDay.test.ts
import { describe, it, expect } from 'vitest';
import { DAY_LENGTH_MS, advanceClock, dayFraction, phaseOfDay } from '../timeOfDay';

describe('advanceClock', () => {
  it('advances within the day', () => {
    expect(advanceClock(0, 1000)).toBe(1000);
  });
  it('wraps at day length', () => {
    expect(advanceClock(DAY_LENGTH_MS - 500, 1000)).toBe(500);
  });
  it('wraps multiple days in one big step', () => {
    expect(advanceClock(0, DAY_LENGTH_MS * 2 + 250)).toBe(250);
  });
  it('keeps result in [0, DAY_LENGTH_MS) for negative drift', () => {
    const r = advanceClock(100, -300);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(DAY_LENGTH_MS);
  });
});

describe('dayFraction', () => {
  it('is 0 at midnight and 0.5 at noon', () => {
    expect(dayFraction(0)).toBe(0);
    expect(dayFraction(DAY_LENGTH_MS / 2)).toBeCloseTo(0.5, 6);
  });
});

describe('phaseOfDay', () => {
  const at = (f: number) => phaseOfDay(f * DAY_LENGTH_MS);
  it('maps fractions to phases', () => {
    expect(at(0.0)).toBe('night');
    expect(at(0.1)).toBe('night');
    expect(at(0.25)).toBe('dawn');
    expect(at(0.5)).toBe('day');
    expect(at(0.75)).toBe('dusk');
    expect(at(0.85)).toBe('night');
  });
  it('uses half-open boundaries', () => {
    expect(at(0.20)).toBe('dawn');
    expect(at(0.30)).toBe('day');
    expect(at(0.70)).toBe('dusk');
    expect(at(0.80)).toBe('night');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/timeOfDay.test.ts`
Expected: FAIL — `Cannot find module '../timeOfDay'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cookgame/timeOfDay.ts
export const DAY_LENGTH_MS = 360_000; // 6 real minutes per in-game day

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

/** Advance the day clock by dtMs, wrapping into [0, DAY_LENGTH_MS). Robust to large/negative dt. */
export function advanceClock(clock: number, dtMs: number): number {
  const next = (clock + dtMs) % DAY_LENGTH_MS;
  return next < 0 ? next + DAY_LENGTH_MS : next;
}

/** Fraction of the day elapsed, in [0, 1). 0 = midnight, 0.5 = noon. */
export function dayFraction(clock: number): number {
  return clock / DAY_LENGTH_MS;
}

/** Coarse phase of day used by lighting and flavor. Boundaries are half-open. */
export function phaseOfDay(clock: number): DayPhase {
  const f = dayFraction(clock);
  if (f < 0.2 || f >= 0.8) return 'night';
  if (f < 0.3) return 'dawn';
  if (f < 0.7) return 'day';
  return 'dusk';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/timeOfDay.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/timeOfDay.ts lib/cookgame/__tests__/timeOfDay.test.ts
git commit -m "feat(cookgame): timeOfDay clock advance + phase (M4)"
```

---

### Task 2: `timeOfDay.ts` — sun direction + `isOpenAt` windows

**Files:**
- Modify: `lib/cookgame/timeOfDay.ts`
- Test: `lib/cookgame/__tests__/timeOfDay.test.ts` (append)

**Interfaces:**
- Consumes: `dayFraction` (Task 1).
- Produces:
  - `export type TimeWindow = { from: number; to: number };` — both in day-fraction `[0, 1)`. `from < to` is a same-day window; `from > to` wraps past midnight (e.g. night `{ from: 0.8, to: 0.2 }`).
  - `export const NIGHT_WINDOW: TimeWindow = { from: 0.80, to: 0.20 };` — the canonical night window, defined here (the cycle-free leaf module) so both `shops.ts` and `content.ts` can import it without forming an import cycle (`shops.ts` already imports from `content.ts`).
  - `export function sunDirection(clock: number): [number, number, number]` — a normalized direction toward the sun. `y > 0` above horizon (day), `y < 0` below (night); `x` swings east(+)→west(−) across the day; fixed south tilt on `z`. At noon `y` is near its max; at dawn/dusk `y ≈ 0`.
  - `export function isOpenAt(window: TimeWindow, clock: number): boolean` — true when the current day-fraction falls in the (possibly wrap-around) window. Half-open `[from, to)`.

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
// append to lib/cookgame/__tests__/timeOfDay.test.ts
import { sunDirection, isOpenAt } from '../timeOfDay';
import type { TimeWindow } from '../timeOfDay';

describe('sunDirection', () => {
  const at = (f: number) => sunDirection(f * DAY_LENGTH_MS);
  it('is a unit vector', () => {
    const [x, y, z] = at(0.5);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
  });
  it('is high at noon and below the horizon at midnight', () => {
    expect(at(0.5)[1]).toBeGreaterThan(0.8);   // noon: well above horizon
    expect(at(0.0)[1]).toBeLessThan(0);         // midnight: below horizon
  });
  it('swings east to west across the day', () => {
    expect(at(0.25)[0]).toBeGreaterThan(0.5);   // dawn: eastern sky (+x)
    expect(at(0.75)[0]).toBeLessThan(-0.5);     // dusk: western sky (-x)
    expect(Math.abs(at(0.25)[1])).toBeLessThan(0.2); // dawn near horizon
  });
});

describe('isOpenAt', () => {
  const DAY: TimeWindow = { from: 0.30, to: 0.75 };
  const NIGHT: TimeWindow = { from: 0.80, to: 0.20 }; // wraps midnight
  it('same-day window', () => {
    expect(isOpenAt(DAY, 0.5 * DAY_LENGTH_MS)).toBe(true);
    expect(isOpenAt(DAY, 0.9 * DAY_LENGTH_MS)).toBe(false);
    expect(isOpenAt(DAY, 0.30 * DAY_LENGTH_MS)).toBe(true);  // inclusive from
    expect(isOpenAt(DAY, 0.75 * DAY_LENGTH_MS)).toBe(false); // exclusive to
  });
  it('wrap-around (night) window', () => {
    expect(isOpenAt(NIGHT, 0.9 * DAY_LENGTH_MS)).toBe(true);  // late night
    expect(isOpenAt(NIGHT, 0.1 * DAY_LENGTH_MS)).toBe(true);  // early morning
    expect(isOpenAt(NIGHT, 0.5 * DAY_LENGTH_MS)).toBe(false); // midday closed
    expect(isOpenAt(NIGHT, 0.80 * DAY_LENGTH_MS)).toBe(true); // inclusive from
    expect(isOpenAt(NIGHT, 0.20 * DAY_LENGTH_MS)).toBe(false);// exclusive to
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/timeOfDay.test.ts`
Expected: FAIL — `sunDirection`/`isOpenAt` not exported.

- [ ] **Step 3: Write minimal implementation (append to `timeOfDay.ts`)**

```ts
// append to lib/cookgame/timeOfDay.ts
export type TimeWindow = { from: number; to: number };

// Canonical night window (wraps midnight). Lives here — the cycle-free leaf
// module — so shops.ts and content.ts share one definition without an import cycle.
export const NIGHT_WINDOW: TimeWindow = { from: 0.80, to: 0.20 };

const SUN_Z_TILT = 0.4; // constant south tilt so shadows fall at a pleasant angle

/** Normalized direction toward the sun for the given clock. */
export function sunDirection(clock: number): [number, number, number] {
  // theta = 0 at dawn (f=0.25, due east), PI/2 at noon (overhead), PI at dusk (due west).
  const theta = (dayFraction(clock) - 0.25) * 2 * Math.PI;
  const x = Math.cos(theta);
  const y = Math.sin(theta);
  const z = SUN_Z_TILT;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/** Is the (possibly wrap-around) window open at the given clock? Half-open [from, to). */
export function isOpenAt(window: TimeWindow, clock: number): boolean {
  const f = dayFraction(clock);
  const { from, to } = window;
  if (from <= to) return f >= from && f < to;
  return f >= from || f < to; // wraps past midnight
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/timeOfDay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/timeOfDay.ts lib/cookgame/__tests__/timeOfDay.test.ts
git commit -m "feat(cookgame): timeOfDay sunDirection + isOpenAt windows (M4)"
```

---

### Task 3: Store — `tickClock` action

**Files:**
- Modify: `lib/cookgame/store.ts` (interface near line 60–61; action body near `tickHeat` ~line 215)
- Test: `lib/cookgame/__tests__/store.test.ts` (append a `tickClock` describe block)

**Interfaces:**
- Consumes: `advanceClock`, `DAY_LENGTH_MS` (Task 1).
- Produces: `tickClock: (dtMs: number) => void` on the store — advances `clock` by `dtMs`, wrapping at day length. (`clock` field already exists in state, save payload, and `fromSave`; no save changes.)

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/cookgame/__tests__/store.test.ts
import { DAY_LENGTH_MS } from '../timeOfDay';

describe('tickClock', () => {
  beforeEach(() => useCookgameStore.getState().resetGame());

  it('advances the clock by dtMs', () => {
    useCookgameStore.getState().tickClock(1500);
    expect(useCookgameStore.getState().clock).toBe(1500);
  });

  it('wraps at the end of the day', () => {
    useCookgameStore.setState({ clock: DAY_LENGTH_MS - 200 });
    useCookgameStore.getState().tickClock(500);
    expect(useCookgameStore.getState().clock).toBe(300);
  });
});
```

> If `store.test.ts` does not already import `useCookgameStore`/`describe`/`beforeEach`, reuse the file's existing imports — do not duplicate them. (The file already exercises the store, so they are present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t tickClock`
Expected: FAIL — `tickClock is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/cookgame/store.ts`:

a) Add the import (extend the existing import group near the top):

```ts
import { advanceClock } from './timeOfDay';
```

b) Add to the `CookgameState` interface, right after the `tickPassiveIncome` line (~line 61):

```ts
  tickClock: (dtMs: number) => void;
```

c) Add the action implementation, right after the `tickPassiveIncome` action block (after line 228, before `setNearbyInteractable`):

```ts
  tickClock: (dtMs) => set({ clock: advanceClock(get().clock, dtMs) }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t tickClock`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): store tickClock action (M4)"
```

---

### Task 4: Clock ticker wired into the canvas

**Files:**
- Modify: `components/cookgame/CookGameGame.tsx` (the `HeatTicker` component ~lines 43–50, and its mount ~line 84)

**Interfaces:**
- Consumes: `tickClock` (Task 3).
- Produces: a per-frame driver that calls `tickClock(delta * 1000)` (r3f `delta` is seconds; the clock is in ms). No new exports.

> Implementation note: fold the clock advance into the existing `HeatTicker` rather than adding a second `useFrame` component — one frame loop, less overhead. Rename it to `WorldTicker` for clarity since it now drives heat, income, and time.

- [ ] **Step 1: Update `HeatTicker` → `WorldTicker`**

Replace the `HeatTicker` definition (lines 43–50) with:

```tsx
// Drives heat decay, passive income, and the day clock each frame
// (lives inside <Canvas> for useFrame access).
function WorldTicker() {
  useFrame((_, delta) => {
    const s = useCookgameStore.getState();
    s.tickHeat(delta);
    s.tickPassiveIncome(delta);
    s.tickClock(delta * 1000); // delta is seconds; clock is ms
  });
  return null;
}
```

- [ ] **Step 2: Update the mount**

Change the JSX mount inside `<Physics>` (line 84) from `<HeatTicker />` to:

```tsx
          <WorldTicker />
```

- [ ] **Step 3: Typecheck the change**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame/CookGameGame || echo "clean"`
Expected: `clean` (no errors referencing this file).

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): advance day clock from the world ticker (M4)"
```

---

### Task 5: Animated lighting reads the clock

**Files:**
- Modify: `components/cookgame/models/Lighting.tsx`

**Interfaces:**
- Consumes: `phaseOfDay`, `sunDirection` (Tasks 1–2), `useCookgameStore`.
- Produces: a `<Lighting>` that animates sun position, key-light intensity/color, ambient/hemisphere fill, and sky sun position from the store clock. No new exports (default export unchanged).

> Why quantize: subscribing to raw `clock` re-renders this component every frame. Selecting a 1-second-quantized clock caps re-renders at ~1 Hz — the sun moves ~1° per second over the 360 s day, smooth enough and far cheaper. Lighting is presentational, so phase→look constants live here (not in the pure lib).

- [ ] **Step 1: Rewrite `Lighting.tsx`**

```tsx
"use client";

import { Sky } from '@react-three/drei';
import { useCookgameStore } from '@/lib/cookgame/store';
import { phaseOfDay, sunDirection, type DayPhase } from '@/lib/cookgame/timeOfDay';
import { PALETTE } from './palette';

const SUN_DIST = 22; // matches the shadow camera extent

// Per-phase lighting look. Key = warm sun, ambient/hemi = fill, sky tints via sunPosition height.
const PHASE_LOOK: Record<DayPhase, { key: number; keyColor: string; ambient: number; hemi: number }> = {
  dawn:  { key: 0.9, keyColor: '#ffd2a6', ambient: 0.28, hemi: 0.5 },
  day:   { key: 1.4, keyColor: '#fff4e0', ambient: 0.25, hemi: 0.6 },
  dusk:  { key: 0.8, keyColor: '#ffb07a', ambient: 0.26, hemi: 0.45 },
  night: { key: 0.18, keyColor: '#9fb4ff', ambient: 0.12, hemi: 0.22 },
};

/**
 * Day–night lighting rig for CookGame. Reads a 1-second-quantized day clock
 * from the store and recomputes sun position, key intensity/color, and fill.
 */
export default function Lighting() {
  // Quantize to whole seconds to cap re-renders at ~1 Hz (sun moves ~1°/s).
  const clockSec = useCookgameStore((s) => Math.floor(s.clock / 1000));
  const clock = clockSec * 1000;

  const phase = phaseOfDay(clock);
  const look = PHASE_LOOK[phase];
  const [dx, dy, dz] = sunDirection(clock);
  // Clamp the sky/light sun above the horizon so drei's <Sky> stays lit at night
  // (the key intensity, not the sun height, is what darkens the world).
  const sun: [number, number, number] = [dx * SUN_DIST, Math.max(dy, 0.05) * SUN_DIST, dz * SUN_DIST];

  return (
    <>
      {/* Procedural sky — sun tracks the key light */}
      <Sky sunPosition={sun} />

      {/* Hemisphere fill: warm sky overhead, earthy ground bounce */}
      <hemisphereLight color={PALETTE.skyTop} groundColor={PALETTE.grass} intensity={look.hemi} />

      {/* Soft fill so shadow faces aren't pure black */}
      <ambientLight intensity={look.ambient} />

      {/* Sun key light */}
      <directionalLight
        position={sun}
        intensity={look.key}
        color={look.keyColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck + lint the change**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i Lighting || echo "clean"`
Expected: `clean`.

Run: `./node_modules/.bin/eslint components/cookgame/models/Lighting.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cookgame/models/Lighting.tsx
git commit -m "feat(cookgame): animate lighting from the day clock (M4)"
```

---

### Task 6: Time-gate the after-hours shop (night-only)

**Files:**
- Modify: `lib/cookgame/shops.ts` (`ShopItem` type + `visibleItems` + after-hours items)
- Modify: `components/cookgame/stations/ShopOverlay.tsx` (pass clock; closed banner)
- Test: `lib/cookgame/__tests__/shops.test.ts` (append; create the file if absent)

**Interfaces:**
- Consumes: `isOpenAt`, `TimeWindow` (Task 2).
- Produces:
  - `ShopItem` gains optional `timeWindow?: TimeWindow`.
  - `visibleItems(shop: Shop, rank: number, clock?: number): ShopItem[]` — filters by rank, then (when `clock` is provided and the item has a `timeWindow`) by `isOpenAt`. Omitting `clock` keeps an item visible regardless of window (backward compatible).
  - `NIGHT_WINDOW` re-exported from `shops.ts` (defined in `timeOfDay.ts`, Task 2) so existing shop-facing callers/tests can import it from `./shops`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/cookgame/__tests__/shops.test.ts
import { describe, it, expect } from 'vitest';
import { SHOPS, visibleItems, NIGHT_WINDOW } from '../shops';
import { DAY_LENGTH_MS } from '../timeOfDay';

describe('after-hours time gating', () => {
  const NOON = 0.5 * DAY_LENGTH_MS;
  const NIGHT = 0.9 * DAY_LENGTH_MS;

  it('after-hours items are night-windowed', () => {
    expect(SHOPS.afterhours.items.every((i) => i.timeWindow === NIGHT_WINDOW)).toBe(true);
  });

  it('hides after-hours items at noon (rank high enough)', () => {
    expect(visibleItems(SHOPS.afterhours, 9, NOON)).toHaveLength(0);
  });

  it('shows after-hours items at night (rank high enough)', () => {
    expect(visibleItems(SHOPS.afterhours, 9, NIGHT).length).toBeGreaterThan(0);
  });

  it('without a clock, time gating is ignored (backward compatible)', () => {
    expect(visibleItems(SHOPS.afterhours, 9).length).toBeGreaterThan(0);
  });

  it('still respects rank within the open window', () => {
    expect(visibleItems(SHOPS.afterhours, 0, NIGHT)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/shops.test.ts`
Expected: FAIL — `NIGHT_WINDOW`/`timeWindow` not present.

- [ ] **Step 3: Implement in `shops.ts`**

a) Add the import and re-export at the top (after the existing imports). `NIGHT_WINDOW` is defined in `timeOfDay.ts` (Task 2); re-export it here so shop-facing callers/tests can import it from `./shops`:

```ts
import { isOpenAt, NIGHT_WINDOW, type TimeWindow } from './timeOfDay';

export { NIGHT_WINDOW };
```

b) Extend the `ShopItem` interface:

```ts
export interface ShopItem { kind: ShopItemKind; refId: string; rankReq: number; timeWindow?: TimeWindow; }
```

c) Tag every after-hours item with `timeWindow: NIGHT_WINDOW` (the docks come alive at night):

```ts
  afterhours: {
    id: 'afterhours', name: 'After-Hours Stall',
    items: [
      { kind: 'additive', refId: 'battery', rankReq: 3, timeWindow: NIGHT_WINDOW },
      { kind: 'additive', refId: 'energydrink', rankReq: 3, timeWindow: NIGHT_WINDOW },
      { kind: 'additive', refId: 'donut', rankReq: 4, timeWindow: NIGHT_WINDOW },
    ],
  },
```

d) Replace `visibleItems`:

```ts
export function visibleItems(shop: Shop, rank: number, clock?: number): ShopItem[] {
  return shop.items.filter((i) => {
    if (rank < i.rankReq) return false;
    if (clock !== undefined && i.timeWindow && !isOpenAt(i.timeWindow, clock)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/shops.test.ts`
Expected: PASS.

- [ ] **Step 5: Surface "closed" in `ShopOverlay.tsx`**

In `components/cookgame/stations/ShopOverlay.tsx`:

a) Add a clock selector after the existing `xp` selector (~line 14):

```tsx
  const clock = useCookgameStore((s) => s.clock);
```

b) Change the items computation (lines 21–23) to pass the clock and detect a time-closed shop:

```tsx
  const rank = rankForXp(xp).rank;
  const items = visibleItems(shop, rank, clock);
  const rankItems = visibleItems(shop, rank); // rank-eligible, ignoring time
  const hasLocked = items.length < shop.items.length;
  const timeClosed = items.length === 0 && rankItems.length > 0; // hidden purely by time-of-day
```

c) Add a closed banner just inside `<OverlayFrame>`, before the `$cash` line:

```tsx
      {timeClosed && (
        <p className="mb-4 rounded bg-indigo-950/60 px-3 py-2 text-sm text-indigo-200">
          Closed for now — this stall only opens after dark.
        </p>
      )}
```

- [ ] **Step 6: Typecheck + lint the overlay**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -iE 'shops|ShopOverlay' || echo "clean"`
Expected: `clean`.

Run: `./node_modules/.bin/eslint lib/cookgame/shops.ts components/cookgame/stations/ShopOverlay.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/cookgame/shops.ts components/cookgame/stations/ShopOverlay.tsx lib/cookgame/__tests__/shops.test.ts
git commit -m "feat(cookgame): night-only after-hours stall gating (M4)"
```

---

### Task 7: Time-gate the Vera buyer + HUD clock readout

**Files:**
- Modify: `lib/cookgame/types.ts` (`Buyer` interface)
- Modify: `lib/cookgame/content.ts` (`vera` entry)
- Modify: `lib/cookgame/store.ts` (`sellUnit` guard)
- Modify: `components/cookgame/npc/SellOverlay.tsx` (closed message + disable)
- Modify: `components/cookgame/ui/HUD.tsx` (clock/phase readout)
- Test: `lib/cookgame/__tests__/store.test.ts` (append a Vera-closed selling test)

**Interfaces:**
- Consumes: `isOpenAt`, `phaseOfDay`, `NIGHT_WINDOW` (Tasks 2, 6).
- Produces:
  - `Buyer` gains optional `timeWindow?: TimeWindow`.
  - `sellUnit` returns `0` (no-op) when the buyer has a `timeWindow` that is closed at the current `clock`.
  - HUD renders the current phase + `HH:MM` clock.

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/cookgame/__tests__/store.test.ts
// NOTE: `DAY_LENGTH_MS` is already imported by the Task 3 block — do NOT re-import it
// (duplicate import is a compile error). Add only the NIGHT_WINDOW import here.
import { NIGHT_WINDOW } from '../shops';

describe('Vera night-only selling', () => {
  beforeEach(reset); // reuse the file's existing `reset` helper

  it('vera is night-windowed', async () => {
    const { BUYERS } = await import('../content');
    expect(BUYERS.find((b) => b.id === 'vera')?.timeWindow).toEqual(NIGHT_WINDOW);
  });

  it('refuses to sell to vera during the day', () => {
    // Give the player a packaged unit to sell.
    useCookgameStore.setState((s) => ({
      clock: 0.5 * DAY_LENGTH_MS, // noon
      inventory: {
        ...s.inventory,
        packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: 1 }],
      },
    }));
    const proceeds = useCookgameStore.getState().sellUnit('vera', 0, 1);
    expect(proceeds).toBe(0);
    expect(useCookgameStore.getState().inventory.packaged[0].units).toBe(1); // unchanged
  });

  it('sells to vera at night', () => {
    useCookgameStore.setState((s) => ({
      clock: 0.9 * DAY_LENGTH_MS, // night
      inventory: {
        ...s.inventory,
        packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: 1 }],
      },
    }));
    const proceeds = useCookgameStore.getState().sellUnit('vera', 0, 1);
    expect(proceeds).toBeGreaterThan(0);
  });
});
```

> Match the `packaged` stack shape to the project's existing `PackagedStack`/`Product` types — if the real shape differs from `{ product, units }`, copy it from an existing store test in the same file rather than the placeholder above.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t "Vera night-only"`
Expected: FAIL — `vera.timeWindow` undefined / sale not blocked.

- [ ] **Step 3: Extend the `Buyer` type** (`lib/cookgame/types.ts`, lines 17–21)

```ts
export interface Buyer {
  id: BuyerId; name: string; preferredEffect: EffectId;
  preferenceBonus: number;   // multiplicative bonus when product has preferredEffect, e.g. 0.25 = +25%
  basePriceFactor: number;   // baseline willingness, e.g. 0.9
  timeWindow?: TimeWindow;   // when set, this buyer only deals during the window (M4)
}
```

Add the import at the top of `types.ts` if `TimeWindow` is not already imported:

```ts
import type { TimeWindow } from './timeOfDay';
```

> `timeOfDay.ts` does not import from `types.ts`, so this introduces no cycle.

- [ ] **Step 4: Tag Vera as night-only** (`lib/cookgame/content.ts`, line 72)

```ts
  { id: 'vera',   name: 'Vera',   preferredEffect: 'glowing',  preferenceBonus: 0.4,  basePriceFactor: 1.3, timeWindow: NIGHT_WINDOW },
```

Add the import near the top of `content.ts`. Import from `./timeOfDay` (the leaf module), **not** `./shops` — `shops.ts` imports from `content.ts`, so importing back from `shops.ts` would form a cycle:

```ts
import { NIGHT_WINDOW } from './timeOfDay';
```

- [ ] **Step 5: Guard `sellUnit`** (`lib/cookgame/store.ts`, ~line 196)

Add the import to the `timeOfDay` import line (extend Task 3's import):

```ts
import { advanceClock, isOpenAt } from './timeOfDay';
```

In `sellUnit`, after resolving `buyer` and the null check (after line 200), add:

```ts
    if (buyer.timeWindow && !isOpenAt(buyer.timeWindow, get().clock)) return 0;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t "Vera night-only"`
Expected: PASS.

- [ ] **Step 7: Surface "closed" in `SellOverlay.tsx`**

In `components/cookgame/npc/SellOverlay.tsx`:

a) Add selectors + closed check after the existing selectors (~line 27):

```tsx
  const clock = useCookgameStore((s) => s.clock);
```

b) After the `buyer` null check (line 30), compute:

```tsx
  const closed = buyer.timeWindow ? !isOpenAt(buyer.timeWindow, clock) : false;
```

c) Add the imports at the top:

```tsx
import { isOpenAt } from '@/lib/cookgame/timeOfDay';
```

d) When `closed`, render a message instead of the sell list. Replace the `packaged.length === 0 ? (...) : (...)` block's outer condition so a closed buyer short-circuits:

```tsx
      {closed ? (
        <p className="text-sm text-indigo-300">Vera only deals after dark. Come back at night.</p>
      ) : packaged.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing packaged to sell.</p>
      ) : (
        /* ...existing sell list unchanged... */
      )}
```

- [ ] **Step 8: HUD clock readout** (`components/cookgame/ui/HUD.tsx`)

a) Add the import:

```tsx
import { phaseOfDay, dayFraction } from '@/lib/cookgame/timeOfDay';
```

b) Add a clock selector after `currentDistrict` (~line 13):

```tsx
  const clock = useCookgameStore((s) => s.clock);
```

c) Compute a readable time (24h clock mapped from the day fraction) before the `return`:

```tsx
  const phase = phaseOfDay(clock);
  const minutesOfDay = Math.floor(dayFraction(clock) * 24 * 60);
  const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, '0');
  const mm = String(minutesOfDay % 60).padStart(2, '0');
```

d) Add a readout block right after the District readout block (after line 61):

```tsx
        {/* Time of day */}
        <div className="rounded-md border border-neutral-700 bg-neutral-900/80 px-3 py-2">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            <span>Time</span>
            <span className="capitalize text-lime-300">{phase}</span>
          </div>
          <div className="font-mono text-sm text-neutral-200">{hh}:{mm}</div>
        </div>
```

- [ ] **Step 9: Typecheck + lint the batch**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -iE 'cookgame' || echo "clean"`
Expected: `clean`.

Run: `./node_modules/.bin/eslint lib/cookgame components/cookgame/npc/SellOverlay.tsx components/cookgame/ui/HUD.tsx`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/cookgame/types.ts lib/cookgame/content.ts lib/cookgame/store.ts \
        components/cookgame/npc/SellOverlay.tsx components/cookgame/ui/HUD.tsx \
        lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): night-only Vera buyer + HUD clock readout (M4)"
```

---

### Task 8: Full verification + milestone wrap-up

**Files:** none (verification only).

- [ ] **Step 1: Full cookgame unit suite**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all green — including the pre-existing progression/property/districts/store/economy suites (perk defaults unchanged; `visibleItems`'s new param is optional).

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -iE 'cookgame|timeOfDay' || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Lint**

Run: `./node_modules/.bin/eslint components/cookgame lib/cookgame`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `./node_modules/.bin/vite build`
Expected: exit 0. (If the route tree needs regen first, follow the project's verify-commands quirk noted in repo memory.)

- [ ] **Step 5: Manual checklist** (browser — record results in the PR description)

- Load `/cookgame`; the HUD shows a Time readout (phase + HH:MM) that advances; over ~6 minutes the sun visibly arcs and the world dims into night and back.
- Walk to the After-Hours Stall during daytime → overlay shows the "closed after dark" banner with no buyable items; at night the items appear and are buyable (rank permitting).
- Talk to Vera during daytime → "only deals after dark" message, selling blocked; at night selling works and pays out.
- Reload mid-day → the clock resumes near where it was (persisted in save v3), lighting matches.
- Confirm the core loop (supplier buy → mix → package → sell to a suburbs buyer) works at any time of day.

- [ ] **Step 6: Senior review + PR**

- Dispatch the `senior-swe-reviewer` agent over the branch diff vs `main`; address findings.
- Open the PR to `main` titled `feat(cookgame): Phase 3 M4 — day–night cycle`, summarizing the day clock, animated lighting, and night-only after-hours stall + Vera gating, with the manual checklist results.

---

## Self-Review Notes

- **Spec coverage (§7):** `DAY_LENGTH_MS` + persisted `clock` + `advanceClock` ticker (Tasks 1, 3, 4); `phaseOfDay` + `sunDirection` driving `Lighting.tsx` (Tasks 1, 2, 5); `isOpenAt(window, clock)` with a night-only shop and buyer, "closed until…" UX (Tasks 6, 7). Save persistence already covered by v3 — no bump (matches §9 "clock 0" default). Testing per §10: `advanceClock` wrap, `phaseOfDay`, `isOpenAt` incl. wrap-around night all covered (Tasks 1, 2, 6, 7).
- **Scoped out (deliberate):** district-gate time windows. The spec lists districts only as an example ("e.g. … districts carry a timeWindow"); gating a district gate risks the map-escape regressions M3 fought (jamb walls, corridor floors). Shop + buyer gating fully satisfies "selective open/closed gating." Note this in the PR.
- **Backward compatibility:** `visibleItems` gains an *optional* `clock`; all existing call sites/tests pass `(shop, rank)` and keep working. No save version change. No existing pure-lib signature altered.
- **Type consistency:** `TimeWindow`, `isOpenAt`, `NIGHT_WINDOW`, `phaseOfDay`, `sunDirection`, `advanceClock`, `tickClock`, `DayPhase` are referenced with identical names/shapes across tasks.
