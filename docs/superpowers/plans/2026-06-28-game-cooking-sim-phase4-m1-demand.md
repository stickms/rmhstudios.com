# "Game" (cookgame) — Phase 4 M1 (Dynamic Demand) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static buyers with a living market — each buyer has demand that depletes when you sell to them and restocks over time, a reputation that rises with sales, and a preference that occasionally drifts — all feeding the sale price and a live sell-overlay readout.

**Architecture:** A new pure lib `lib/cookgame/demand.ts` owns all demand/reputation/drift math (no React, no clocks, no RNG — time deltas and random rolls are passed in). The save bumps v3→v4 with a new `buyerState` map. The store holds `buyerState`, advances it from the existing `WorldTicker` (`tickDemand`), and folds demand+reputation multipliers into `sellUnit` (which also depletes demand and grants reputation). `SellOverlay` shows each buyer's live demand/reputation/wanted-effect.

**Tech Stack:** TypeScript, Zustand, react-three-fiber DOM overlay, Vitest (pure-lib + store unit tests, node — no DOM env).

## Global Constraints

- **Internal slug:** `cookgame`. Display title "Game". Tone: satirical/fictional.
- **Pure libs** (`lib/cookgame/*.ts`) export plain functions + `const` data only — no React, no `Date.now()`, no `Math.random()` (time deltas and random rolls are passed in by callers). Vitest-tested in node.
- **R3F/UI** is typecheck + lint + manual only (no DOM test env). Every `.tsx` file starts with `"use client";`.
- **Save bumps v3→v4** (this milestone). `CURRENT_VERSION = 4`. The migration chain becomes v1→v2→v3→v4; `migrateV3` defaults the new `buyerState`. v4 is **forward-compatible**: later Phase-4 milestones (M2 `deals`, M3 `employees`) add their fields by defaulting them when absent in `parseSave` — **no further version bump**. Do not add `deals`/`employees` in this milestone.
- **Backward compatible:** existing pure-lib signatures unchanged; `buyerOffer`'s `priceMult` stays a single optional multiplier (the store multiplies demand/rep into it). Phases 1–3 tests stay green.
- **Buyers:** `BuyerId = 'doug' | 'kim' | 'pablo' | 'marcus' | 'vera' | 'silas'` (6 buyers in `content.ts` `BUYERS`, each with a static `preferredEffect`, `preferenceBonus`, `basePriceFactor`).
- **`EffectId`** (10): energizing, calming, gingeritis, sneaky, spicy, euphoric, focused, jittery, glowing, sedating.
- **Tuning constants** (exact values below, all in `demand.ts`): `RESTOCK_PER_MS = 1/45000` (≈2.22e-5; full recovery over ~45s real ≈ a few in-game hours on the M4 6-min day), `DEPLETE_PER_UNIT = 0.08`, `demandPriceMult` maps demand→`0.6 + demand*0.7` (0.6–1.3), `reputationPriceMult` = `1 + rep*0.15` (1.0–1.15), `REP_PER_SALE = 0.02`, `REP_PREF_BONUS = 0.03` (extra when the product carries the buyer's current preferred effect), `DRIFT_CHANCE = 0.0008` per tick.
- **Verification gates (Task 7):** `vitest run lib/cookgame` green, `tsc -p tsconfig.json --noEmit` clean, `eslint components/cookgame lib/cookgame` clean, `vite build` exit 0 (then `git checkout origin/main -- app/routeTree.gen.ts` to drop the build's route-tree regen). Use `./node_modules/.bin/<tool>`.
- **Branch:** `feat/cookgame-phase-4-m1`. `senior-swe-reviewer` (opus) whole-branch review before the PR to `main`.

---

### Task 1: `demand.ts` — state shape, restock/deplete, price multipliers, reputation

**Files:**
- Create: `lib/cookgame/demand.ts`
- Modify: `lib/cookgame/types.ts` (add `BuyerDynamicState` interface)
- Test: `lib/cookgame/__tests__/demand.test.ts`

**Interfaces:**
- Consumes: `BuyerId`, `EffectId` from `types.ts`; `BUYERS` from `content.ts`.
- Produces:
  - `types.ts`: `export interface BuyerDynamicState { demand: number; reputation: number; preferredEffect: EffectId; }`
  - `demand.ts`: constants `RESTOCK_PER_MS`, `DEPLETE_PER_UNIT`, `REP_PER_SALE`, `REP_PREF_BONUS`.
  - `restockDemand(demand: number, dtMs: number): number` — `min(1, demand + RESTOCK_PER_MS*dtMs)`, never above 1.
  - `depleteDemand(demand: number, units: number): number` — `max(0, demand - DEPLETE_PER_UNIT*units)`.
  - `demandPriceMult(demand: number): number` — `0.6 + clamp(demand,0,1)*0.7`.
  - `reputationPriceMult(rep: number): number` — `1 + clamp(rep,0,1)*0.15`.
  - `gainReputation(rep: number, delta: number): number` — `clamp(rep + delta, 0, 1)`.
  - `initialBuyerStates(): Record<string, BuyerDynamicState>` — one entry per `BUYERS` member: `{ demand: 1, reputation: 0, preferredEffect: buyer.preferredEffect }`.

- [ ] **Step 1: Add the type to `types.ts`**

Add after the existing `Buyer` interface (it already imports `EffectId`):

```ts
export interface BuyerDynamicState { demand: number; reputation: number; preferredEffect: EffectId; }
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/cookgame/__tests__/demand.test.ts
import { describe, it, expect } from 'vitest';
import {
  restockDemand, depleteDemand, demandPriceMult, reputationPriceMult,
  gainReputation, initialBuyerStates, RESTOCK_PER_MS, DEPLETE_PER_UNIT,
} from '../demand';
import { BUYERS } from '../content';

describe('restockDemand', () => {
  it('regenerates toward 1 and clamps', () => {
    expect(restockDemand(0, 1000)).toBeCloseTo(RESTOCK_PER_MS * 1000, 9);
    expect(restockDemand(1, 999999)).toBe(1);
    expect(restockDemand(0.9999, 100000)).toBe(1); // clamps, never above 1
  });
});

describe('depleteDemand', () => {
  it('drops by DEPLETE_PER_UNIT per unit and clamps at 0', () => {
    expect(depleteDemand(1, 1)).toBeCloseTo(1 - DEPLETE_PER_UNIT, 9);
    expect(depleteDemand(0.05, 3)).toBe(0);
  });
});

describe('demandPriceMult', () => {
  it('maps demand 0..1 to ~0.6..1.3', () => {
    expect(demandPriceMult(0)).toBeCloseTo(0.6, 9);
    expect(demandPriceMult(1)).toBeCloseTo(1.3, 9);
    expect(demandPriceMult(0.5)).toBeCloseTo(0.95, 9);
  });
});

describe('reputationPriceMult', () => {
  it('rises from 1.0 to 1.15', () => {
    expect(reputationPriceMult(0)).toBeCloseTo(1.0, 9);
    expect(reputationPriceMult(1)).toBeCloseTo(1.15, 9);
  });
});

describe('gainReputation', () => {
  it('adds and clamps to [0,1]', () => {
    expect(gainReputation(0.5, 0.02)).toBeCloseTo(0.52, 9);
    expect(gainReputation(0.99, 0.5)).toBe(1);
    expect(gainReputation(0.1, -0.5)).toBe(0);
  });
});

describe('initialBuyerStates', () => {
  it('seeds every buyer at full demand, zero rep, base preference', () => {
    const s = initialBuyerStates();
    expect(Object.keys(s).sort()).toEqual(BUYERS.map((b) => b.id).sort());
    for (const b of BUYERS) {
      expect(s[b.id]).toEqual({ demand: 1, reputation: 0, preferredEffect: b.preferredEffect });
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/demand.test.ts`
Expected: FAIL — `Cannot find module '../demand'`.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/cookgame/demand.ts
import type { BuyerDynamicState } from './types';
import { BUYERS } from './content';

export const RESTOCK_PER_MS = 1 / 45000; // full recovery over ~45s real (~a few in-game hours)
export const DEPLETE_PER_UNIT = 0.08;     // each unit sold saturates the buyer a little
export const REP_PER_SALE = 0.02;         // reputation gained per unit sold
export const REP_PREF_BONUS = 0.03;       // extra reputation when the product matches their preference

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Demand regenerates toward 1.0 over time. */
export function restockDemand(demand: number, dtMs: number): number {
  return Math.min(1, demand + RESTOCK_PER_MS * dtMs);
}

/** Each unit sold to a buyer lowers their demand. */
export function depleteDemand(demand: number, units: number): number {
  return Math.max(0, demand - DEPLETE_PER_UNIT * units);
}

/** Scarce buyer pays a premium; saturated buyer discounts. ~0.6..1.3. */
export function demandPriceMult(demand: number): number {
  return 0.6 + clamp01(demand) * 0.7;
}

/** Small premium that rises with reputation. 1.0..1.15. */
export function reputationPriceMult(rep: number): number {
  return 1 + clamp01(rep) * 0.15;
}

/** Add to reputation, clamped to [0,1]. */
export function gainReputation(rep: number, delta: number): number {
  return clamp01(rep + delta);
}

/** Fresh dynamic state for every buyer (full demand, no reputation, base preference). */
export function initialBuyerStates(): Record<string, BuyerDynamicState> {
  const out: Record<string, BuyerDynamicState> = {};
  for (const b of BUYERS) out[b.id] = { demand: 1, reputation: 0, preferredEffect: b.preferredEffect };
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/demand.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/cookgame/demand.ts lib/cookgame/types.ts lib/cookgame/__tests__/demand.test.ts
git commit -m "feat(cookgame): demand pure lib — restock/deplete/price/reputation (P4 M1)"
```

---

### Task 2: `demand.ts` — preference drift

**Files:**
- Modify: `lib/cookgame/demand.ts`
- Test: `lib/cookgame/__tests__/demand.test.ts` (append)

**Interfaces:**
- Consumes: `EFFECTS` from `content.ts`; `BuyerDynamicState`.
- Produces:
  - `DRIFT_CHANCE = 0.0008`.
  - `driftPreference(state: BuyerDynamicState, roll: number): BuyerDynamicState` — when `roll < DRIFT_CHANCE`, returns a **new** state whose `preferredEffect` is a different `EffectId` chosen deterministically from `roll`; otherwise returns the **same reference**.

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to lib/cookgame/__tests__/demand.test.ts
import { driftPreference, DRIFT_CHANCE } from '../demand';
import type { BuyerDynamicState } from '../types';

describe('driftPreference', () => {
  const base: BuyerDynamicState = { demand: 0.5, reputation: 0.2, preferredEffect: 'energizing' };

  it('returns the same reference when roll is above the drift chance', () => {
    expect(driftPreference(base, 0.5)).toBe(base);
  });

  it('drifts to a different effect when roll is below the drift chance', () => {
    const out = driftPreference(base, 0); // 0 < DRIFT_CHANCE
    expect(out).not.toBe(base);
    expect(out.preferredEffect).not.toBe('energizing');
    expect(out.demand).toBe(0.5);        // other fields preserved
    expect(out.reputation).toBe(0.2);
  });

  it('is deterministic for a given roll', () => {
    expect(driftPreference(base, 0).preferredEffect).toBe(driftPreference(base, 0).preferredEffect);
  });

  it('drift chance boundary is exclusive', () => {
    expect(driftPreference(base, DRIFT_CHANCE)).toBe(base); // roll === DRIFT_CHANCE → no drift
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/demand.test.ts -t driftPreference`
Expected: FAIL — `driftPreference` not exported.

- [ ] **Step 3: Implement (append to `demand.ts`)**

```ts
// append to lib/cookgame/demand.ts — add EFFECTS to the content import at the top:
//   import { BUYERS, EFFECTS } from './content';
import type { EffectId } from './types';

export const DRIFT_CHANCE = 0.0008; // per drift-tick chance a buyer's preference shifts

const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];

/**
 * Occasionally shift a buyer's preferred effect. Deterministic from `roll ∈ [0,1)`:
 * no drift unless roll < DRIFT_CHANCE; the sub-range then selects the new (different) effect.
 * Returns the same reference when no drift occurs.
 */
export function driftPreference(state: BuyerDynamicState, roll: number): BuyerDynamicState {
  if (roll >= DRIFT_CHANCE) return state;
  const others = EFFECT_IDS.filter((e) => e !== state.preferredEffect);
  const idx = Math.min(others.length - 1, Math.floor((roll / DRIFT_CHANCE) * others.length));
  return { ...state, preferredEffect: others[idx] };
}
```

> Note: `demand.ts`'s top import line becomes `import { BUYERS, EFFECTS } from './content';` and the type import adds `EffectId` (`import type { BuyerDynamicState, EffectId } from './types';`). Adjust the existing import lines rather than adding duplicate import statements.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/demand.test.ts`
Expected: PASS (all demand tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/demand.ts lib/cookgame/__tests__/demand.test.ts
git commit -m "feat(cookgame): demand preference drift (P4 M1)"
```

---

### Task 3: Save v3→v4 — `buyerState`

**Files:**
- Modify: `lib/cookgame/saveSystem.ts`
- Test: `lib/cookgame/__tests__/saveSystem.test.ts` (append)

**Interfaces:**
- Consumes: `initialBuyerStates` (Task 1), `BuyerDynamicState` (Task 1).
- Produces:
  - `CURRENT_VERSION = 4`.
  - `SaveV4` = `SaveV3`'s fields with `version: 4` + `buyerState: Record<string, BuyerDynamicState>`. `SaveState = SaveV4`.
  - `migrateV3(p): SaveV4 | null` — validates a v3 payload and returns it as v4 with `buyerState` defaulted via `initialBuyerStates()`.
  - `parseSave` handles v1→v2→v3→v4 and validates the v4 shape (incl. `buyerState` is a non-array object). `createNewSave` seeds `buyerState`.

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to lib/cookgame/__tests__/saveSystem.test.ts
import { initialBuyerStates } from '../demand';

describe('save v4 (buyerState)', () => {
  it('new save seeds buyerState for every buyer', () => {
    const s = createNewSave();
    expect(s.version).toBe(4);
    expect(s.buyerState).toEqual(initialBuyerStates());
  });

  it('migrates a v3 save by defaulting buyerState', () => {
    const v3 = { ...createNewSave(), version: 3 } as Record<string, unknown>;
    delete v3.buyerState;
    const out = parseSave(JSON.stringify(v3));
    expect(out).not.toBeNull();
    expect(out!.version).toBe(4);
    expect(out!.buyerState).toEqual(initialBuyerStates());
  });

  it('rejects a v4 save whose buyerState is not an object', () => {
    const bad = { ...createNewSave(), buyerState: [] as unknown };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
});
```

> The test file already imports `createNewSave`/`parseSave` (it tests the save system). Reuse those imports; add only the `initialBuyerStates` import at the top.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/saveSystem.test.ts -t "save v4"`
Expected: FAIL — `version` is 3 / `buyerState` undefined.

- [ ] **Step 3: Implement in `saveSystem.ts`**

a) Update imports + version:

```ts
import type { InventoryState, BaseStockEntry, RecipeMeta, BuyerDynamicState } from './types';
import { emptyPlot } from './cultivation';
import { initialBuyerStates } from './demand';
```
```ts
export const CURRENT_VERSION = 4 as const;
```

b) Rename the save interface to `SaveV4` (keep all v3 fields, bump `version`, add `buyerState`) and repoint `SaveState`:

```ts
export interface SaveV4 {
  version: 4;
  cash: number;
  heat: number;
  xp: number;
  ownedPropertyTier: number;
  keys: string[];
  clock: number;
  discoveredEffects: string[];
  recipeMeta: Record<string, RecipeMeta>;
  currentDistrict: string;
  buyerState: Record<string, BuyerDynamicState>;
  inventory: InventoryState;
  discoveredRecipes: string[];
}
export type SaveState = SaveV4;
```

c) Add `buyerState` to the defaults helper (rename `PHASE3_DEFAULTS` → `PHASE_DEFAULTS` is optional; keep the name to minimize churn but add the field):

```ts
const PHASE3_DEFAULTS = () => ({
  xp: 0, ownedPropertyTier: 0, keys: [] as string[], clock: 0,
  discoveredEffects: [] as string[],
  recipeMeta: {} as Record<string, RecipeMeta>,
  currentDistrict: 'suburbs',
  buyerState: initialBuyerStates(),
});
```

d) `createNewSave` already spreads `...PHASE3_DEFAULTS()` and sets `version: CURRENT_VERSION` — no change needed there beyond the constant bump.

e) Change `migrateV2`'s return `version: CURRENT_VERSION` stays valid (it spreads `PHASE3_DEFAULTS()`, which now includes `buyerState`), so a v2 save migrates straight to v4 with `buyerState` defaulted. Add a `migrateV3`:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV3(p: any): SaveV4 | null {
  // v3 shape was already validated when written; re-validate the load-bearing fields.
  if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
  if (typeof p.xp !== 'number' || typeof p.clock !== 'number' || typeof p.ownedPropertyTier !== 'number') return null;
  if (!Array.isArray(p.keys) || !Array.isArray(p.discoveredEffects) || !Array.isArray(p.discoveredRecipes)) return null;
  if (typeof p.recipeMeta !== 'object' || p.recipeMeta === null || Array.isArray(p.recipeMeta)) return null;
  if (typeof p.currentDistrict !== 'string') return null;
  const inv = p.inventory;
  if (!inv || !Array.isArray(inv.baseStock) || !Array.isArray(inv.plots) || !Array.isArray(inv.dryingRack)) return null;
  if (typeof inv.inputs !== 'object' || inv.inputs === null || Array.isArray(inv.inputs)) return null;
  if (typeof inv.additives !== 'object' || inv.additives === null || Array.isArray(inv.additives)) return null;
  return { ...p, version: CURRENT_VERSION, buyerState: initialBuyerStates() } as SaveV4;
}
```

f) Update `parseSave`'s version routing + v4 validation:

```ts
export function parseSave(raw: string | null): SaveV4 | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p.version === 1) { const v2 = migrateV1(p); return v2 ? migrateV2(v2) : null; }
    if (p.version === 2) return migrateV2(p);
    if (p.version === 3) return migrateV3(p);
    if (p.version !== CURRENT_VERSION) return null;
    // v4 validation
    if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
    if (typeof p.xp !== 'number' || typeof p.clock !== 'number' || typeof p.ownedPropertyTier !== 'number') return null;
    if (!Array.isArray(p.keys) || !Array.isArray(p.discoveredEffects) || !Array.isArray(p.discoveredRecipes)) return null;
    if (typeof p.recipeMeta !== 'object' || p.recipeMeta === null || Array.isArray(p.recipeMeta)) return null;
    if (typeof p.currentDistrict !== 'string') return null;
    if (typeof p.buyerState !== 'object' || p.buyerState === null || Array.isArray(p.buyerState)) return null;
    const inv = p.inventory;
    if (!inv || !Array.isArray(inv.baseStock) || !Array.isArray(inv.plots) || !Array.isArray(inv.dryingRack)) return null;
    if (typeof inv.inputs !== 'object' || inv.inputs === null || Array.isArray(inv.inputs)) return null;
    if (typeof inv.additives !== 'object' || inv.additives === null || Array.isArray(inv.additives)) return null;
    return p as SaveV4;
  } catch {
    return null;
  }
}
```

g) Update the remaining `SaveV3` references in this file (the two migrate functions' return-type annotations and `createNewSave`/`serializeSave`/`saveGame`/`loadGame` signatures) to `SaveV4`. The `migrateV2` body returning v4-shaped data via `PHASE3_DEFAULTS()` is correct; only its return-type annotation needs to read `SaveV4`.

> Note: `migrateV2` previously returned `SaveV3`; since `PHASE3_DEFAULTS()` now includes `buyerState`, its object is a valid `SaveV4` — change its annotation to `SaveV4 | null`. Confirm via `tsc` (Step 4 below) that no `SaveV3` identifier remains.

- [ ] **Step 4: Update the existing v3-era assertions in `saveSystem.test.ts`**

Three existing tests hard-code v3 and **will fail** under v4 — update them:

1. `expect(CURRENT_VERSION).toBe(3);` → `expect(CURRENT_VERSION).toBe(4);` (and the surrounding `describe('save v3', ...)` / "createNewSave is v3" labels may read "v4" for clarity — cosmetic).
2. The v2-migration test asserting `expect(out.version).toBe(3);` → `expect(out.version).toBe(4);` (v2 now migrates straight to v4 via `PHASE3_DEFAULTS()`).
3. The unknown-version rejection test `expect(parseSave(JSON.stringify({ ...createNewSave(), version: 4 }))).toBeNull();` → change the override to **`version: 5`** (4 is now the current, valid version, so it would no longer be rejected; 5 is the unknown-future version that must still be rejected).

Leave the other rejection tests (`keys: 'not-an-array'`, etc.) as-is — they still hold for v4.

- [ ] **Step 5: Run the tests + typecheck**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/saveSystem.test.ts`
Expected: PASS (new v4 tests + the updated existing tests).

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -iE 'saveSystem|SaveV3' || echo "clean"`
Expected: `clean` (no dangling `SaveV3`).

- [ ] **Step 6: Commit**

```bash
git add lib/cookgame/saveSystem.ts lib/cookgame/__tests__/saveSystem.test.ts
git commit -m "feat(cookgame): save v3->v4 with buyerState (P4 M1)"
```

---

### Task 4: Store — `buyerState`, `tickDemand`, demand-aware `sellUnit`

**Files:**
- Modify: `lib/cookgame/store.ts`
- Test: `lib/cookgame/__tests__/store.test.ts` (append)

**Interfaces:**
- Consumes: `restockDemand`, `depleteDemand`, `demandPriceMult`, `reputationPriceMult`, `gainReputation`, `driftPreference`, `REP_PER_SALE`, `REP_PREF_BONUS` (Tasks 1-2); `buyerOffer` (existing).
- Produces:
  - state field `buyerState: Record<string, BuyerDynamicState>` (in interface, `fromSave`, `saveNow`, `resetGame`).
  - `tickDemand: (dtMs: number) => void` — restocks every buyer's demand and rolls `driftPreference`; writes only when something changed (avoid idle churn).
  - `sellUnit` now: applies `demandPriceMult(demand) * reputationPriceMult(rep)` to the offer (composed with the existing `perk.priceMult`), depletes the buyer's demand by 1 unit, and grants reputation (`REP_PER_SALE`, plus `REP_PREF_BONUS` when the product carries that buyer's current `preferredEffect`).

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to lib/cookgame/__tests__/store.test.ts
import { DEPLETE_PER_UNIT } from '../demand';

describe('dynamic demand', () => {
  beforeEach(reset);

  function giveSellable() {
    // One packaged unit with no effects (so it never matches a preference) sold to 'doug'.
    useCookgameStore.setState((s) => ({
      inventory: { ...s.inventory, packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: 1 }] },
    }));
  }

  it('selling depletes the buyer demand and grants reputation', () => {
    giveSellable();
    const before = useCookgameStore.getState().buyerState['doug'];
    expect(before.demand).toBe(1);
    expect(before.reputation).toBe(0);
    useCookgameStore.getState().sellUnit('doug', 0, 1);
    const after = useCookgameStore.getState().buyerState['doug'];
    expect(after.demand).toBeCloseTo(1 - DEPLETE_PER_UNIT, 9);
    expect(after.reputation).toBeGreaterThan(0);
  });

  it('a saturated buyer pays less than a fresh buyer for the same product', () => {
    giveSellable();
    const fresh = useCookgameStore.getState().sellUnit('doug', 0, 1);
    // Saturate doug, then sell an identical unit.
    useCookgameStore.setState((s) => ({
      buyerState: { ...s.buyerState, doug: { ...s.buyerState['doug'], demand: 0 } },
      inventory: { ...s.inventory, packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: 1 }] },
    }));
    const saturated = useCookgameStore.getState().sellUnit('doug', 0, 1);
    expect(saturated).toBeLessThan(fresh);
  });

  it('tickDemand restocks a depleted buyer over time', () => {
    useCookgameStore.setState((s) => ({
      buyerState: { ...s.buyerState, doug: { ...s.buyerState['doug'], demand: 0 } },
    }));
    useCookgameStore.getState().tickDemand(10000);
    expect(useCookgameStore.getState().buyerState['doug'].demand).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t "dynamic demand"`
Expected: FAIL — `tickDemand` not a function / demand unchanged.

- [ ] **Step 3: Implement in `store.ts`**

a) Add the import:

```ts
import {
  restockDemand, depleteDemand, demandPriceMult, reputationPriceMult,
  gainReputation, driftPreference, REP_PER_SALE, REP_PREF_BONUS,
} from './demand';
```

b) Add the type to the `types` import line (it already imports several names): add `BuyerDynamicState`.

c) Add the state field to the `CookgameState` interface (near `recipeMeta`):

```ts
  buyerState: Record<string, BuyerDynamicState>;
```

and the action signature (near `tickPassiveIncome`):

```ts
  tickDemand: (dtMs: number) => void;
```

d) Add `buyerState` to `fromSave`:

```ts
const fromSave = (s: SaveState) => ({
  cash: s.cash, heat: s.heat, inventory: s.inventory, discoveredRecipes: s.discoveredRecipes,
  xp: s.xp, ownedPropertyTier: s.ownedPropertyTier, keys: s.keys, clock: s.clock,
  discoveredEffects: s.discoveredEffects, recipeMeta: s.recipeMeta, currentDistrict: s.currentDistrict,
  buyerState: s.buyerState,
});
```

e) Add `buyerState` to the `saveNow` destructure + payload (the line that reads all fields and calls `saveGame({ version: CURRENT_VERSION, ... })`): include `buyerState` in both.

f) Replace the `sellUnit` body's offer + set with demand-aware logic:

```ts
  sellUnit: (buyerId, packagedIndex, variance) => {
    const { inventory, cash, heat, xp, buyerState } = get();
    const stack = inventory.packaged[packagedIndex];
    const buyer = BUYERS.find((b) => b.id === buyerId);
    if (!stack || stack.units <= 0 || !buyer) return 0;
    if (buyer.timeWindow && !isOpenAt(buyer.timeWindow, get().clock)) return 0;
    const bs = buyerState[buyerId] ?? { demand: 1, reputation: 0, preferredEffect: buyer.preferredEffect };
    const perk = perksAtRank(rankForXp(xp).rank);
    const priceMult = perk.priceMult * demandPriceMult(bs.demand) * reputationPriceMult(bs.reputation);
    const offer = buyerOffer(stack.product, buyer, heat, variance, priceMult);
    const matchesPref = stack.product.effects.includes(bs.preferredEffect);
    const nextBs = {
      ...bs,
      demand: depleteDemand(bs.demand, 1),
      reputation: gainReputation(bs.reputation, REP_PER_SALE + (matchesPref ? REP_PREF_BONUS : 0)),
    };
    const packaged = inventory.packaged
      .map((s, i) => (i === packagedIndex ? { ...s, units: s.units - 1 } : s))
      .filter((s) => s.units > 0);
    set({
      cash: cash + offer,
      heat: applyHeatOnSale(heat, perk.heatMult),
      inventory: { ...inventory, packaged },
      xp: xp + xpForSale(offer),
      buyerState: { ...buyerState, [buyerId]: nextBs },
    });
    return offer;
  },
```

g) Add the `tickDemand` action (next to `tickHeat`/`tickPassiveIncome`). It restocks + drifts every buyer; to keep it cheap and avoid idle churn, it writes only when at least one buyer's demand was below 1 or a drift fired:

```ts
  tickDemand: (dtMs) => {
    const { buyerState } = get();
    let changed = false;
    const next: Record<string, BuyerDynamicState> = {};
    for (const id of Object.keys(buyerState)) {
      const bs = buyerState[id];
      const restocked = bs.demand < 1 ? restockDemand(bs.demand, dtMs) : bs.demand;
      const afterRestock = restocked === bs.demand ? bs : { ...bs, demand: restocked };
      const drifted = driftPreference(afterRestock, Math.random());
      if (drifted !== bs) changed = true;
      next[id] = drifted;
    }
    if (changed) set({ buyerState: next });
  },
```

> `driftPreference` and `restockDemand` return the same reference / value on no-op, so `changed` stays false on a fully-stocked, non-drifting tick — no state write, no autosave churn (matching `tickHeat`'s idle guard). `Math.random()` is allowed in the store (used by `startCook`); the pure lib stays RNG-free.

h) Add `buyerState` reset in `resetGame` — it already spreads `...fromSave(createNewSave())`, which now includes `buyerState`, so no change is needed (confirm `createNewSave()` seeds it via Task 3).

- [ ] **Step 4: Run the test + full suite**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t "dynamic demand"`
Expected: PASS.

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all green (existing sell tests still pass — at full demand `demandPriceMult(1)=1.3`, so offers rose; if a prior test asserted an exact offer number, update it to account for the demand/rep mults, or set that buyer's demand so the mult is 1.0).

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): demand-aware sellUnit + tickDemand store wiring (P4 M1)"
```

---

### Task 5: Wire `tickDemand` into the world ticker

**Files:**
- Modify: `components/cookgame/CookGameGame.tsx` (the `WorldTicker` component + autosave field list)

**Interfaces:**
- Consumes: `tickDemand` (Task 4).
- Produces: per-frame advance of demand. No new exports.

- [ ] **Step 1: Add the tick call**

In `WorldTicker`'s `useFrame((_, delta) => { ... })`, add after the existing `s.tickClock(delta * 1000)`:

```tsx
    s.tickDemand(delta * 1000); // delta is seconds; demand restock is in ms
```

- [ ] **Step 2: Keep autosave from churning on demand-only ticks**

The autosave subscriber compares persisted non-clock fields by reference. Demand restock now mutates `buyerState` continuously while any buyer is below full demand, which SHOULD autosave (it's real progress) but must not churn when all buyers are full. `tickDemand` already returns without `set()` when nothing changed, so a fully-stocked idle tab writes nothing. Add `buyerState` to the autosave snapshot's compared fields so a demand change does schedule a save:

In the autosave `useEffect`, add `buyerState` to BOTH the `prev` initial snapshot and the in-listener comparison + snapshot update (mirroring the existing `discoveredEffects`/`recipeMeta` entries):

```tsx
// in the initial `prev = { ... }`:
      buyerState: initState.buyerState,
// in the `if (...)` reference comparison, add a conjunct:
        s.buyerState === prev.buyerState &&
// in the post-change `prev = { ... }` update:
        buyerState: s.buyerState,
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i CookGameGame || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): advance buyer demand from the world ticker (P4 M1)"
```

---

### Task 6: SellOverlay — live demand, reputation, wanted effect

**Files:**
- Modify: `components/cookgame/npc/SellOverlay.tsx`

**Interfaces:**
- Consumes: `buyerState` from the store; `demandPriceMult` (for an optional "price" hint — not required); `EFFECTS` from `content.ts`.
- Produces: a readout block in the sell overlay showing the buyer's demand (a meter), reputation (a 0–5 star rating), and current wanted effect. No export change.

- [ ] **Step 1: Add the readout**

In `components/cookgame/npc/SellOverlay.tsx`:

a) Add a selector (after the existing `heat` selector). Quantize nothing — `buyerState` only changes on sales/ticks, not every frame, but the restock tick can update it ~continuously; select just this buyer's slice to limit re-renders:

```tsx
  const buyerState = useCookgameStore((s) => s.buyerState);
```

b) After the existing `const buyer = BUYERS.find((b) => b.id === activeOverlay); if (!buyer) return null;` and `closed` computation, derive the dynamic slice:

```tsx
  const bs = buyerState[buyer.id] ?? { demand: 1, reputation: 0, preferredEffect: buyer.preferredEffect };
  const demandPct = Math.round(bs.demand * 100);
  const stars = Math.round(bs.reputation * 5);
  const wanted = EFFECTS[bs.preferredEffect];
```

c) Import `EFFECTS` (the file already imports from `content`): change the existing content import to include `EFFECTS` if it doesn't already.

d) Render a block near the top of the overlay body (after the title/`Prefers:` row), before the packaged list:

```tsx
      <div className="mb-3 grid grid-cols-3 gap-2 rounded bg-neutral-800/60 px-3 py-2 font-mono text-[11px]">
        <div>
          <div className="uppercase tracking-widest text-neutral-500">Wants</div>
          <div className="mt-0.5">
            <span className="rounded-full px-2 py-0.5 text-black" style={{ backgroundColor: wanted.color }}>
              {wanted.name}
            </span>
          </div>
        </div>
        <div>
          <div className="uppercase tracking-widest text-neutral-500">Demand</div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
            <div className="h-full rounded-full bg-lime-400" style={{ width: `${demandPct}%` }} />
          </div>
          <div className="mt-0.5 text-neutral-500">{demandPct}%</div>
        </div>
        <div>
          <div className="uppercase tracking-widest text-neutral-500">Rep</div>
          <div className="mt-0.5 text-amber-400">{'★'.repeat(stars)}<span className="text-neutral-700">{'★'.repeat(5 - stars)}</span></div>
        </div>
      </div>
```

> The existing `Prefers:` row reflects the *static* `buyer.preferredEffect`; the new "Wants" reflects the *current* (possibly drifted) `bs.preferredEffect`. Replace the old `Prefers:` row's effect with `wanted` so the two don't disagree — or remove the old row since this block supersedes it. Pick one and keep the overlay consistent.

- [ ] **Step 2: Typecheck + lint**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i SellOverlay || echo "clean"`
Expected: `clean`.

Run: `./node_modules/.bin/eslint components/cookgame/npc/SellOverlay.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cookgame/npc/SellOverlay.tsx
git commit -m "feat(cookgame): live demand/reputation/wanted in sell overlay (P4 M1)"
```

---

### Task 7: Full verification + milestone wrap-up

**Files:** none (verification only).

- [ ] **Step 1: Full cookgame unit suite**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all green — including the pre-existing progression/property/districts/timeOfDay/shops/journal/store/economy suites (the new field is additive; `buyerOffer` signature unchanged).

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -iE 'cookgame|demand' || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Lint**

Run: `./node_modules/.bin/eslint components/cookgame lib/cookgame`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `./node_modules/.bin/vite build`
Expected: exit 0. Then drop the build's route-tree regen: `git checkout origin/main -- app/routeTree.gen.ts` (only if it shows as modified).

- [ ] **Step 5: Manual checklist** (browser — record results in the PR description)

- Open a buyer's sell overlay → see Wants / Demand meter / Rep stars.
- Sell several units to one buyer → demand meter visibly drops and the per-unit offer falls; reputation stars tick up.
- Wait (or idle a minute) → demand recovers; offers rise again.
- Sell to a buyer whose wanted effect your product carries → reputation rises faster.
- Reload → buyer demand/reputation/preference persist (save v4); a pre-v4 (v3) save still loads with buyers defaulted to full demand.

- [ ] **Step 6: Senior review + PR**

- Dispatch the `senior-swe-reviewer` (opus) over the branch diff vs `main`; address findings.
- Open the PR to `main` titled `feat(cookgame): Phase 4 M1 — dynamic demand`, summarizing the demand/reputation/drift model, the v3→v4 save bump, and the sell-overlay readout, with the manual checklist. Note this is the first of Phase 4's three milestones.

---

## Self-Review Notes

- **Spec coverage (§3):** per-buyer `BuyerDynamicState` (Task 1); restock/deplete/price-mult/reputation (Task 1); preference drift, deterministic, no-op same-ref (Task 2); save v3→v4 with `buyerState` defaulted (Task 3); store `tickDemand` + demand-aware `sellUnit` with reputation gain (Task 4); world-ticker wiring (Task 5); SellOverlay demand/reputation/wanted UI (Task 6). Testing per §7: demand clamps/curves/drift, save migration, store flows all covered.
- **Save strategy (§2/§6):** one bump v3→v4 this milestone; v4 is forward-compatible so M2 `deals` / M3 `employees` add fields by defaulting-when-absent in `parseSave` with no further bump. This milestone deliberately does NOT add `deals`/`employees` (YAGNI — their types are designed in M2/M3).
- **Backward compatibility:** `buyerOffer` signature unchanged (the store composes demand/rep into its existing `priceMult` arg); `restockDemand`/`driftPreference` return same value/reference on no-op so `tickDemand` doesn't churn the store or autosave on an idle, fully-stocked tab (matching `tickHeat`). Phases 1–3 suites stay green; any existing exact-offer assertion is updated for the demand mult (Task 4 Step 4 note).
- **Type consistency:** `BuyerDynamicState`, `restockDemand`, `depleteDemand`, `demandPriceMult`, `reputationPriceMult`, `gainReputation`, `driftPreference`, `initialBuyerStates`, `tickDemand`, `REP_PER_SALE`, `REP_PREF_BONUS`, `DEPLETE_PER_UNIT`, `DRIFT_CHANCE`, `SaveV4` referenced with identical names/shapes across tasks.
