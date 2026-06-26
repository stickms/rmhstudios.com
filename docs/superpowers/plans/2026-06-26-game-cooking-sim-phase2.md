# "Game" (cookgame) — Phase 2 Implementation Plan — Production Pipelines

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production to the cook-and-deal sim — grow strains across 3 parallel plots (tend + real-time cooldown), cook a premium base via a ratio-balancing mini-game, and feed the resulting **quality-bearing** base products into the existing Phase 1 mixer/economy.

**Architecture:** Three new PURE, R3F-free libs (`cultivation`, `chemistry`, `production`) are the tested core; `effects`/`economy`/`saveSystem`/`store` are extended; thin R3F/DOM components render the new stations and overlays as views over the store. Time-dependent logic takes `now` (ms) as a parameter (mirroring Phase 1's injected price `variance`), so it stays deterministic in node tests.

**Tech Stack:** TypeScript, react-three-fiber, `@react-three/rapier`, `@react-three/drei`, Zustand, TanStack Router, Tailwind v4, vitest. Build/test via `./node_modules/.bin/*` wrappers.

## Global Constraints

- **Internal slug is `cookgame`** everywhere. Display title is **"Game"**.
- **Tone:** satirical/fictional only. All strains, the cooked product, reagents, and the cook mini-game are invented and abstract. Model **NO** real-world chemistry, quantities, ratios, temperatures, or procedures.
- **No DOM test environment:** vitest runs in node. Only unit-test pure logic and the Zustand store. Never put `localStorage`/`window`/DOM/R3F in a vitest test. Time-dependent store actions accept an injected `now: number` so tests are deterministic; React components pass `Date.now()`.
- **Run tests with** `./node_modules/.bin/vitest run <path>` (pnpm wrappers are blocked).
- **Branch:** continue on `feat/cookgame-phase-1` (project PR strategy: all phases accumulate on the branch, ONE big PR at the very end). Do NOT push or open a PR.
- **Run the `senior-swe-reviewer` agent before the eventual big PR.**
- Match existing style: `"use client"` first line on game components; overlays self-gate on `activeOverlay` and render via `OverlayFrame`; raw `window` keydown listeners (not drei `KeyboardControls`).
- Spec of record: `docs/superpowers/specs/2026-06-26-game-cooking-sim-phase2-design.md`.

---

## File Structure

```
lib/cookgame/
  types.ts        # MODIFY: expand BaseId; add InputId, GrowStage, PlotState, WetBatch,
                  #         BaseStockEntry, CookSession; Product gains qualityMult; InventoryState v2
  content.ts      # MODIFY: add strains + cooked base (+bonusEffect), INPUTS, GROWABLE, COOKABLE_BASES
  production.ts   # CREATE: quality → {valueMult, units, bonusEffects}  [PURE]
  effects.ts      # MODIFY: mix() & productValue() honor qualityMult
  economy.ts      # MODIFY: packageProduct() preserves qualityMult
  cultivation.ts  # CREATE: plot stage machine + drying  [PURE]
  chemistry.ts    # CREATE: cookQuality / feedbackBand  [PURE]
  saveSystem.ts   # MODIFY: SaveV2 + v1→v2 migration
  store.ts        # MODIFY: baseStock unification + grow/cook actions + cookSession
  __tests__/
    content.test.ts     # MODIFY
    effects.test.ts      # MODIFY
    economy.test.ts      # MODIFY
    production.test.ts   # CREATE
    cultivation.test.ts  # CREATE
    chemistry.test.ts    # CREATE
    saveSystem.test.ts   # MODIFY
    store.test.ts        # MODIFY

components/cookgame/
  world/TownScene.tsx               # MODIFY: anchors + meshes for 3 plots, drying rack, chem station
  CookGameGame.tsx                  # MODIFY: mount new Interactables + overlays
  stations/SupplierShopOverlay.tsx  # MODIFY: Inputs section
  stations/MixingStationOverlay.tsx # MODIFY: load base from baseStock (quality/bonus aware)
  stations/PackagingOverlay.tsx     # MODIFY: show quality on stacks (value already honors it)
  stations/GrowPlotOverlay.tsx      # CREATE: per-plot stage/tend/plant/harvest
  stations/DryingRackOverlay.tsx    # CREATE: wet batches + collect
  stations/ChemistryStationOverlay.tsx # CREATE: 3-dial ratio mini-game
```

**Content values used across tasks (canonical — keep consistent):**

| Effect ids (Phase 1, reused) | energizing, calming, gingeritis, sneaky, spicy, euphoric, focused, jittery, glowing, sedating |
|---|---|
| Bases | `greenstart` (buy, $10, value 35, no bonus), `couchlock` (grow, value 55, bonus `sedating`), `zoomhaze` (grow, value 60, bonus `focused`), `glimmerdust` (cook, value 95, bonus `glowing`) |
| Inputs | `seed_couchlock` ($6), `seed_zoomhaze` ($6), `nutrient` ($3), `reagent` ($15) |

---

## Task 1: Types + content extensions

**Files:**
- Modify: `lib/cookgame/types.ts`
- Modify: `lib/cookgame/content.ts`
- Test: `lib/cookgame/__tests__/content.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `BaseId = 'greenstart' | 'couchlock' | 'zoomhaze' | 'glimmerdust'`
  - `InputId = 'seed_couchlock' | 'seed_zoomhaze' | 'nutrient' | 'reagent'`
  - `GrowStage = 'empty' | 'seedling' | 'vegetative' | 'flowering'`
  - `interface Base { id: BaseId; name: string; baseValue: number; bonusEffect?: EffectId; }`
  - `interface Input { id: InputId; name: string; cost: number; }`
  - `interface Product { baseId: BaseId; effects: EffectId[]; qualityMult?: number; }`
  - `interface PlotState { baseId: BaseId | null; stage: GrowStage; plantedAt: number | null; lastAdvancedAt: number | null; careAccum: number; }`
  - `interface WetBatch { baseId: BaseId; quality: number; dryStartedAt: number; }`
  - `interface BaseStockEntry { baseId: BaseId; qualityMult: number; bonusEffects: EffectId[]; units: number; }`
  - `interface CookSession { baseId: BaseId; target: number[]; dials: number[]; }`
  - `interface InventoryState { additives: Record<string, number>; inputs: Record<string, number>; baseStock: BaseStockEntry[]; plots: PlotState[]; dryingRack: WetBatch[]; workProduct: Product | null; packaged: Array<{ product: Product; units: number }>; }`
- Produces (`content.ts`): `INPUTS: Record<InputId, Input>`, `GROWABLE: Record<string, { baseId: BaseId; seedId: InputId }>`, `COOKABLE_BASES: BaseId[]`, plus the expanded `BASES`. Existing `EFFECTS`, `ADDITIVES`, `TRANSFORM_RULES`, `BUYERS`, `MAX_EFFECTS`, `getEffect/getAdditive/getBase` remain.

- [ ] **Step 1: Write the failing content-integrity additions**

Replace `lib/cookgame/__tests__/content.test.ts` with (keeps Phase 1 assertions, adds Phase 2):

```ts
// lib/cookgame/__tests__/content.test.ts
import { describe, it, expect } from 'vitest';
import {
  EFFECTS, ADDITIVES, BASES, TRANSFORM_RULES, BUYERS, MAX_EFFECTS,
  INPUTS, GROWABLE, COOKABLE_BASES,
} from '../content';

describe('cookgame content (phase 1 invariants)', () => {
  it('every additive baseEffect exists in EFFECTS', () => {
    for (const a of Object.values(ADDITIVES)) expect(EFFECTS[a.baseEffect]).toBeDefined();
  });
  it('every transform rule references valid ids', () => {
    for (const r of TRANSFORM_RULES) {
      expect(ADDITIVES[r.additive]).toBeDefined();
      expect(EFFECTS[r.from]).toBeDefined();
      expect(EFFECTS[r.to]).toBeDefined();
    }
  });
  it('every buyer preferredEffect exists', () => {
    for (const b of BUYERS) expect(EFFECTS[b.preferredEffect]).toBeDefined();
  });
  it('MAX_EFFECTS is 8', () => expect(MAX_EFFECTS).toBe(8));
});

describe('cookgame content (phase 2 production)', () => {
  it('has greenstart plus 3 production bases', () => {
    for (const id of ['greenstart', 'couchlock', 'zoomhaze', 'glimmerdust']) {
      expect(BASES[id as keyof typeof BASES], id).toBeDefined();
    }
  });
  it('every base bonusEffect (if any) is a real effect', () => {
    for (const b of Object.values(BASES)) {
      if (b.bonusEffect) expect(EFFECTS[b.bonusEffect], b.id).toBeDefined();
    }
  });
  it('greenstart has no bonus effect; production bases do', () => {
    expect(BASES.greenstart.bonusEffect).toBeUndefined();
    expect(BASES.couchlock.bonusEffect).toBe('sedating');
    expect(BASES.zoomhaze.bonusEffect).toBe('focused');
    expect(BASES.glimmerdust.bonusEffect).toBe('glowing');
  });
  it('every GROWABLE seedId exists in INPUTS and baseId in BASES', () => {
    for (const g of Object.values(GROWABLE)) {
      expect(INPUTS[g.seedId], g.seedId).toBeDefined();
      expect(BASES[g.baseId], g.baseId).toBeDefined();
    }
  });
  it('every COOKABLE base exists', () => {
    for (const id of COOKABLE_BASES) expect(BASES[id]).toBeDefined();
  });
  it('every input cost is positive and id matches its key', () => {
    for (const [k, i] of Object.entries(INPUTS)) {
      expect(i.id).toBe(k);
      expect(i.cost).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/content.test.ts`
Expected: FAIL — `INPUTS`/`GROWABLE`/`COOKABLE_BASES` not exported; new bases undefined.

- [ ] **Step 3: Edit `types.ts`**

Replace the `BaseId`, `Base`, `Product`, and `InventoryState` declarations and add the new types:

```ts
// lib/cookgame/types.ts
export type EffectId =
  | 'energizing' | 'calming' | 'gingeritis' | 'sneaky' | 'spicy'
  | 'euphoric' | 'focused' | 'jittery' | 'glowing' | 'sedating';
export type AdditiveId =
  | 'cuke' | 'banana' | 'paracetamol' | 'chili' | 'mouthwash'
  | 'battery' | 'donut' | 'energydrink';
export type BaseId = 'greenstart' | 'couchlock' | 'zoomhaze' | 'glimmerdust';
export type InputId = 'seed_couchlock' | 'seed_zoomhaze' | 'nutrient' | 'reagent';
export type BuyerId = 'doug' | 'kim' | 'pablo';
export type GrowStage = 'empty' | 'seedling' | 'vegetative' | 'flowering';

export interface Effect { id: EffectId; name: string; multiplier: number; tier: 1 | 2 | 3; color: string; }
export interface Additive { id: AdditiveId; name: string; cost: number; baseEffect: EffectId; }
export interface Base { id: BaseId; name: string; baseValue: number; bonusEffect?: EffectId; }
export interface Input { id: InputId; name: string; cost: number; }
export interface TransformRule { additive: AdditiveId; from: EffectId; to: EffectId; }
export interface Buyer { id: BuyerId; name: string; preferredEffect: EffectId; preferenceBonus: number; basePriceFactor: number; }

export interface Product { baseId: BaseId; effects: EffectId[]; qualityMult?: number; }

export interface PlotState {
  baseId: BaseId | null;        // strain being grown (null when empty)
  stage: GrowStage;
  plantedAt: number | null;     // ms epoch
  lastAdvancedAt: number | null;// ms epoch when current stage began (cooldown anchor)
  careAccum: number;            // accumulated care credit
}
export interface WetBatch { baseId: BaseId; quality: number; dryStartedAt: number; }
export interface BaseStockEntry { baseId: BaseId; qualityMult: number; bonusEffects: EffectId[]; units: number; }
export interface CookSession { baseId: BaseId; target: number[]; dials: number[]; }

export interface InventoryState {
  additives: Record<string, number>;
  inputs: Record<string, number>;
  baseStock: BaseStockEntry[];
  plots: PlotState[];
  dryingRack: WetBatch[];
  workProduct: Product | null;
  packaged: Array<{ product: Product; units: number }>;
}
```

- [ ] **Step 4: Edit `content.ts`**

Keep `EFFECTS`, `ADDITIVES`, `TRANSFORM_RULES`, `BUYERS`, `MAX_EFFECTS`, helpers unchanged. Replace `BASES` and add the new tables + the `Input` import:

```ts
// at top, extend the type import:
import type { Effect, Additive, Base, Input, TransformRule, Buyer, EffectId, AdditiveId, BaseId, InputId } from './types';

// replace the BASES block:
export const BASES: Record<BaseId, Base> = {
  greenstart:  { id: 'greenstart',  name: 'Green Start',  baseValue: 35 },
  couchlock:   { id: 'couchlock',   name: 'Couch-Lock',   baseValue: 55, bonusEffect: 'sedating' },
  zoomhaze:    { id: 'zoomhaze',    name: 'Zoom Haze',    baseValue: 60, bonusEffect: 'focused' },
  glimmerdust: { id: 'glimmerdust', name: 'Glimmer Dust', baseValue: 95, bonusEffect: 'glowing' },
};

export const INPUTS: Record<InputId, Input> = {
  seed_couchlock: { id: 'seed_couchlock', name: 'Couch-Lock Seeds', cost: 6 },
  seed_zoomhaze:  { id: 'seed_zoomhaze',  name: 'Zoom Haze Seeds',  cost: 6 },
  nutrient:       { id: 'nutrient',       name: 'Nutrient Mix',     cost: 3 },
  reagent:        { id: 'reagent',        name: 'Reagent Pack',     cost: 15 },
};

// growable strains keyed by their base id
export const GROWABLE: Record<string, { baseId: BaseId; seedId: InputId }> = {
  couchlock: { baseId: 'couchlock', seedId: 'seed_couchlock' },
  zoomhaze:  { baseId: 'zoomhaze',  seedId: 'seed_zoomhaze' },
};

export const COOKABLE_BASES: BaseId[] = ['glimmerdust'];

export const getInput = (id: InputId): Input => INPUTS[id];
```

- [ ] **Step 5: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/content.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/cookgame/types.ts lib/cookgame/content.ts lib/cookgame/__tests__/content.test.ts
git commit -m "feat(cookgame): phase 2 types + content (strains, cooked base, inputs)"
```

---

## Task 2: Quality → reward mapping (`production.ts`)

**Files:**
- Create: `lib/cookgame/production.ts`
- Test: `lib/cookgame/__tests__/production.test.ts`

**Interfaces:**
- Consumes: `content` (`BASES`), `types` (`BaseId`, `EffectId`).
- Produces:
  - `BONUS_THRESHOLD = 0.8`, `GROW_YIELD = { min: 3, max: 9 }`, `COOK_YIELD = { min: 2, max: 6 }`.
  - `qualityValueMult(q: number): number` — `0.7 + 0.6 * clamp(q,0,1)` (→ 0.7..1.3).
  - `qualityYield(q: number, range: { min: number; max: number }): number` — `round(min + clamp(q)*(max-min))`.
  - `qualityBonusEffects(baseId: BaseId, q: number): EffectId[]` — `[bonusEffect]` if `q >= BONUS_THRESHOLD` and base has one, else `[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/production.test.ts
import { describe, it, expect } from 'vitest';
import {
  qualityValueMult, qualityYield, qualityBonusEffects,
  BONUS_THRESHOLD, GROW_YIELD, COOK_YIELD,
} from '../production';

describe('qualityValueMult', () => {
  it('is 0.7 at q=0 and 1.3 at q=1', () => {
    expect(qualityValueMult(0)).toBeCloseTo(0.7, 5);
    expect(qualityValueMult(1)).toBeCloseTo(1.3, 5);
  });
  it('clamps out-of-range input', () => {
    expect(qualityValueMult(-5)).toBeCloseTo(0.7, 5);
    expect(qualityValueMult(5)).toBeCloseTo(1.3, 5);
  });
});

describe('qualityYield', () => {
  it('maps q across the range and rounds', () => {
    expect(qualityYield(0, GROW_YIELD)).toBe(3);
    expect(qualityYield(1, GROW_YIELD)).toBe(9);
    expect(qualityYield(0.5, GROW_YIELD)).toBe(6);
    expect(qualityYield(1, COOK_YIELD)).toBe(6);
  });
});

describe('qualityBonusEffects', () => {
  it('grants the base bonus effect at/above threshold', () => {
    expect(qualityBonusEffects('couchlock', BONUS_THRESHOLD)).toEqual(['sedating']);
    expect(qualityBonusEffects('glimmerdust', 1)).toEqual(['glowing']);
  });
  it('grants nothing below threshold', () => {
    expect(qualityBonusEffects('couchlock', BONUS_THRESHOLD - 0.01)).toEqual([]);
  });
  it('grants nothing for a base without a bonus effect', () => {
    expect(qualityBonusEffects('greenstart', 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/production.test.ts`
Expected: FAIL — cannot resolve `../production`.

- [ ] **Step 3: Implement `production.ts`**

```ts
// lib/cookgame/production.ts
import type { BaseId, EffectId } from './types';
import { BASES } from './content';

export const BONUS_THRESHOLD = 0.8;
export const GROW_YIELD = { min: 3, max: 9 } as const;
export const COOK_YIELD = { min: 2, max: 6 } as const;

const clamp01 = (q: number) => Math.max(0, Math.min(1, q));

export function qualityValueMult(q: number): number {
  return 0.7 + 0.6 * clamp01(q);
}

export function qualityYield(q: number, range: { min: number; max: number }): number {
  return Math.round(range.min + clamp01(q) * (range.max - range.min));
}

export function qualityBonusEffects(baseId: BaseId, q: number): EffectId[] {
  const bonus = BASES[baseId].bonusEffect;
  return q >= BONUS_THRESHOLD && bonus ? [bonus] : [];
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/production.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/production.ts lib/cookgame/__tests__/production.test.ts
git commit -m "feat(cookgame): pure quality->reward mapping (value/yield/bonus)"
```

---

## Task 3: qualityMult plumbing (`effects.ts` + `economy.ts`)

**Files:**
- Modify: `lib/cookgame/effects.ts`
- Modify: `lib/cookgame/economy.ts`
- Test: `lib/cookgame/__tests__/effects.test.ts`, `lib/cookgame/__tests__/economy.test.ts`

**Interfaces:**
- `mix(product, additiveId)` preserves `product.qualityMult` on the returned product.
- `productValue(product)` multiplies by `product.qualityMult ?? 1`.
- `packageProduct(product)` preserves `qualityMult` on the copied product.

- [ ] **Step 1: Add failing tests**

Append to `lib/cookgame/__tests__/effects.test.ts`:

```ts
describe('qualityMult', () => {
  it('productValue multiplies by qualityMult when present', () => {
    const p: Product = { baseId: 'greenstart', effects: ['energizing'], qualityMult: 1.3 };
    const expected = Math.round(35 * EFFECTS.energizing.multiplier * 1.3);
    expect(productValue(p)).toBe(expected);
  });
  it('productValue treats missing qualityMult as 1', () => {
    const p: Product = { baseId: 'greenstart', effects: [] };
    expect(productValue(p)).toBe(BASES.greenstart.baseValue);
  });
  it('mix preserves qualityMult', () => {
    const p: Product = { baseId: 'couchlock', effects: [], qualityMult: 1.2 };
    expect(mix(p, 'cuke').qualityMult).toBe(1.2);
  });
});
```

Append to `lib/cookgame/__tests__/economy.test.ts`:

```ts
describe('packageProduct qualityMult', () => {
  it('preserves qualityMult on packaged product', () => {
    const p: Product = { baseId: 'glimmerdust', effects: ['glowing'], qualityMult: 1.25 };
    expect(packageProduct(p).product.qualityMult).toBe(1.25);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/effects.test.ts lib/cookgame/__tests__/economy.test.ts`
Expected: FAIL — qualityMult undefined / value mismatch.

- [ ] **Step 3: Edit `effects.ts`**

In `mix`, change the return to carry qualityMult:

```ts
  return { baseId: product.baseId, effects: result, qualityMult: product.qualityMult };
```

In `productValue`, fold in qualityMult:

```ts
export function productValue(product: Product): number {
  const base = BASES[product.baseId].baseValue;
  const mult = product.effects.reduce((acc, e) => acc * EFFECTS[e].multiplier, 1);
  return Math.round(base * mult * (product.qualityMult ?? 1));
}
```

- [ ] **Step 4: Edit `economy.ts`**

In `packageProduct`, preserve qualityMult on the copied product:

```ts
export function packageProduct(product: Product): { product: Product; units: number } {
  return {
    product: { baseId: product.baseId, effects: [...product.effects], qualityMult: product.qualityMult },
    units: UNITS_PER_BATCH,
  };
}
```

- [ ] **Step 5: Run; expect pass (incl. all Phase 1 cases)**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/effects.test.ts lib/cookgame/__tests__/economy.test.ts`
Expected: PASS — Phase 1 assertions unchanged (missing qualityMult → ×1).

- [ ] **Step 6: Commit**

```bash
git add lib/cookgame/effects.ts lib/cookgame/economy.ts lib/cookgame/__tests__/effects.test.ts lib/cookgame/__tests__/economy.test.ts
git commit -m "feat(cookgame): thread qualityMult through mix/value/packaging"
```

---

## Task 4: Cultivation engine (`cultivation.ts`)

**Files:**
- Create: `lib/cookgame/cultivation.ts`
- Test: `lib/cookgame/__tests__/cultivation.test.ts`

**Interfaces:**
- Consumes: `types` (`PlotState`, `WetBatch`, `BaseStockEntry`, `BaseId`, `GrowStage`), `production` (`qualityValueMult`, `qualityYield`, `qualityBonusEffects`, `GROW_YIELD`).
- Produces:
  - Constants: `TEND_COOLDOWN_MS = 30000`, `WILT_GRACE_MS = 60000`, `DRY_COOLDOWN_MS = 60000`, `CARE_MAX = 2`, `GROW_SEQUENCE: GrowStage[] = ['seedling','vegetative','flowering']`.
  - `emptyPlot(): PlotState`
  - `plantPlot(plot: PlotState, baseId: BaseId, now: number): PlotState` — only from `empty`; → `seedling`.
  - `canTend(plot: PlotState, now: number): boolean` — true iff stage is `seedling`/`vegetative` and `now - lastAdvancedAt >= TEND_COOLDOWN_MS`.
  - `tendPlot(plot: PlotState, now: number): PlotState` — advances one stage, adds care credit (`1` on time, `0.5` if wilted past `TEND_COOLDOWN_MS + WILT_GRACE_MS`); no-op (returns same ref) if `!canTend`.
  - `plotQuality(plot: PlotState): number` — `clamp(careAccum / CARE_MAX, 0, 1)`.
  - `harvestPlot(plot: PlotState, now: number): { wet: WetBatch; plot: PlotState } | null` — only from `flowering`; returns wet batch (`dryStartedAt = now`) + reset empty plot; null otherwise.
  - `canCollect(batch: WetBatch, now: number): boolean` — `now - dryStartedAt >= DRY_COOLDOWN_MS`.
  - `collectDried(batch: WetBatch): BaseStockEntry` — via production mapping with `GROW_YIELD`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/cultivation.test.ts
import { describe, it, expect } from 'vitest';
import {
  emptyPlot, plantPlot, canTend, tendPlot, plotQuality, harvestPlot, canCollect, collectDried,
  TEND_COOLDOWN_MS, WILT_GRACE_MS, DRY_COOLDOWN_MS,
} from '../cultivation';

const T0 = 1_000_000;

describe('plant', () => {
  it('plants only from empty and sets seedling', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    expect(p.stage).toBe('seedling');
    expect(p.baseId).toBe('couchlock');
    expect(p.lastAdvancedAt).toBe(T0);
  });
});

describe('tend cooldown', () => {
  it('cannot tend before cooldown elapses', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    expect(canTend(p, T0 + TEND_COOLDOWN_MS - 1)).toBe(false);
    expect(canTend(p, T0 + TEND_COOLDOWN_MS)).toBe(true);
  });
  it('tendPlot is a no-op before cooldown', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    expect(tendPlot(p, T0 + 1)).toBe(p);
  });
});

describe('grow to harvest', () => {
  it('advances seedling -> vegetative -> flowering on time with full care', () => {
    let p = plantPlot(emptyPlot(), 'couchlock', T0);
    p = tendPlot(p, T0 + TEND_COOLDOWN_MS);
    expect(p.stage).toBe('vegetative');
    p = tendPlot(p, T0 + 2 * TEND_COOLDOWN_MS);
    expect(p.stage).toBe('flowering');
    expect(plotQuality(p)).toBeCloseTo(1, 5);
  });
  it('wilted tends reduce quality', () => {
    let p = plantPlot(emptyPlot(), 'couchlock', T0);
    const late = TEND_COOLDOWN_MS + WILT_GRACE_MS + 1;
    p = tendPlot(p, T0 + late);              // wilted -> 0.5
    p = tendPlot(p, T0 + late + late);       // wilted -> 0.5
    expect(p.stage).toBe('flowering');
    expect(plotQuality(p)).toBeCloseTo(0.5, 5);
  });
});

describe('harvest + dry', () => {
  it('harvest only from flowering, produces wet batch and empties plot', () => {
    let p = plantPlot(emptyPlot(), 'zoomhaze', T0);
    p = tendPlot(p, T0 + TEND_COOLDOWN_MS);
    p = tendPlot(p, T0 + 2 * TEND_COOLDOWN_MS);
    const h = harvestPlot(p, T0 + 3 * TEND_COOLDOWN_MS);
    expect(h).not.toBeNull();
    expect(h!.wet.baseId).toBe('zoomhaze');
    expect(h!.wet.quality).toBeCloseTo(1, 5);
    expect(h!.plot.stage).toBe('empty');
  });
  it('harvest returns null when not flowering', () => {
    const p = plantPlot(emptyPlot(), 'zoomhaze', T0);
    expect(harvestPlot(p, T0)).toBeNull();
  });
  it('drying respects the dry cooldown then yields a stock entry', () => {
    const wet = { baseId: 'glimmerdust' as const, quality: 1, dryStartedAt: T0 };
    expect(canCollect(wet, T0 + DRY_COOLDOWN_MS - 1)).toBe(false);
    expect(canCollect(wet, T0 + DRY_COOLDOWN_MS)).toBe(true);
    const entry = collectDried(wet);
    expect(entry.baseId).toBe('glimmerdust');
    expect(entry.qualityMult).toBeCloseTo(1.3, 5);
    expect(entry.units).toBe(9);                 // q=1 -> GROW_YIELD.max
    expect(entry.bonusEffects).toEqual(['glowing']);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/cultivation.test.ts`
Expected: FAIL — cannot resolve `../cultivation`.

- [ ] **Step 3: Implement `cultivation.ts`**

```ts
// lib/cookgame/cultivation.ts
import type { PlotState, WetBatch, BaseStockEntry, BaseId, GrowStage } from './types';
import { qualityValueMult, qualityYield, qualityBonusEffects, GROW_YIELD } from './production';

export const TEND_COOLDOWN_MS = 30_000;
export const WILT_GRACE_MS = 60_000;
export const DRY_COOLDOWN_MS = 60_000;
export const CARE_MAX = 2;
export const GROW_SEQUENCE: GrowStage[] = ['seedling', 'vegetative', 'flowering'];

export function emptyPlot(): PlotState {
  return { baseId: null, stage: 'empty', plantedAt: null, lastAdvancedAt: null, careAccum: 0 };
}

export function plantPlot(plot: PlotState, baseId: BaseId, now: number): PlotState {
  if (plot.stage !== 'empty') return plot;
  return { baseId, stage: 'seedling', plantedAt: now, lastAdvancedAt: now, careAccum: 0 };
}

const isTendable = (stage: GrowStage) => stage === 'seedling' || stage === 'vegetative';

export function canTend(plot: PlotState, now: number): boolean {
  if (!isTendable(plot.stage) || plot.lastAdvancedAt === null) return false;
  return now - plot.lastAdvancedAt >= TEND_COOLDOWN_MS;
}

export function tendPlot(plot: PlotState, now: number): PlotState {
  if (!canTend(plot, now)) return plot;
  const elapsed = now - (plot.lastAdvancedAt as number);
  const credit = elapsed <= TEND_COOLDOWN_MS + WILT_GRACE_MS ? 1 : 0.5;
  const idx = GROW_SEQUENCE.indexOf(plot.stage);
  const nextStage = GROW_SEQUENCE[idx + 1];
  return { ...plot, stage: nextStage, lastAdvancedAt: now, careAccum: plot.careAccum + credit };
}

export function plotQuality(plot: PlotState): number {
  return Math.max(0, Math.min(1, plot.careAccum / CARE_MAX));
}

export function harvestPlot(plot: PlotState, now: number): { wet: WetBatch; plot: PlotState } | null {
  if (plot.stage !== 'flowering' || plot.baseId === null) return null;
  const wet: WetBatch = { baseId: plot.baseId, quality: plotQuality(plot), dryStartedAt: now };
  return { wet, plot: emptyPlot() };
}

export function canCollect(batch: WetBatch, now: number): boolean {
  return now - batch.dryStartedAt >= DRY_COOLDOWN_MS;
}

export function collectDried(batch: WetBatch): BaseStockEntry {
  return {
    baseId: batch.baseId,
    qualityMult: qualityValueMult(batch.quality),
    bonusEffects: qualityBonusEffects(batch.baseId, batch.quality),
    units: qualityYield(batch.quality, GROW_YIELD),
  };
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/cultivation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/cultivation.ts lib/cookgame/__tests__/cultivation.test.ts
git commit -m "feat(cookgame): pure cultivation engine (plant/tend/harvest/dry)"
```

---

## Task 5: Chemistry engine (`chemistry.ts`)

**Files:**
- Create: `lib/cookgame/chemistry.ts`
- Test: `lib/cookgame/__tests__/chemistry.test.ts`

**Interfaces:**
- Consumes: `types` (`BaseStockEntry`, `BaseId`), `production` (`qualityValueMult`, `qualityYield`, `qualityBonusEffects`, `COOK_YIELD`).
- Produces:
  - `DIAL_COUNT = 3`, `MAXDIST = Math.sqrt(DIAL_COUNT)`.
  - `cookQuality(dials: number[], target: number[]): number` — `clamp(1 - euclidean(dials,target)/MAXDIST, 0, 1)`.
  - `feedbackBand(dials: number[], target: number[]): 'hot' | 'warm' | 'cold'` — from quality: `>=0.85` hot, `>=0.6` warm, else cold.
  - `cookOutput(baseId: BaseId, quality: number): BaseStockEntry` — via production mapping with `COOK_YIELD`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/chemistry.test.ts
import { describe, it, expect } from 'vitest';
import { cookQuality, feedbackBand, cookOutput, DIAL_COUNT } from '../chemistry';

describe('cookQuality', () => {
  it('is 1 for a perfect match', () => {
    expect(cookQuality([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBeCloseTo(1, 5);
  });
  it('is 0 for the worst-case opposite', () => {
    expect(cookQuality([0, 0, 0], [1, 1, 1])).toBeCloseTo(0, 5);
  });
  it('decreases as distance grows (monotonic)', () => {
    const near = cookQuality([0.5, 0.5, 0.5], [0.55, 0.5, 0.5]);
    const far = cookQuality([0.5, 0.5, 0.5], [0.9, 0.5, 0.5]);
    expect(near).toBeGreaterThan(far);
  });
});

describe('feedbackBand', () => {
  it('reports hot near the target and cold far away', () => {
    expect(feedbackBand([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBe('hot');
    expect(feedbackBand([0, 0, 0], [1, 1, 1])).toBe('cold');
  });
});

describe('cookOutput', () => {
  it('maps quality to a cooked stock entry', () => {
    const e = cookOutput('glimmerdust', 1);
    expect(e.baseId).toBe('glimmerdust');
    expect(e.qualityMult).toBeCloseTo(1.3, 5);
    expect(e.units).toBe(6);              // q=1 -> COOK_YIELD.max
    expect(e.bonusEffects).toEqual(['glowing']);
  });
  it('low quality -> no bonus, fewer units, reduced value', () => {
    const e = cookOutput('glimmerdust', 0);
    expect(e.bonusEffects).toEqual([]);
    expect(e.units).toBe(2);              // COOK_YIELD.min
    expect(e.qualityMult).toBeCloseTo(0.7, 5);
  });
  it('exposes DIAL_COUNT of 3', () => expect(DIAL_COUNT).toBe(3));
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/chemistry.test.ts`
Expected: FAIL — cannot resolve `../chemistry`.

- [ ] **Step 3: Implement `chemistry.ts`**

```ts
// lib/cookgame/chemistry.ts
import type { BaseStockEntry, BaseId } from './types';
import { qualityValueMult, qualityYield, qualityBonusEffects, COOK_YIELD } from './production';

export const DIAL_COUNT = 3;
export const MAXDIST = Math.sqrt(DIAL_COUNT);

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < DIAL_COUNT; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function cookQuality(dials: number[], target: number[]): number {
  const q = 1 - euclidean(dials, target) / MAXDIST;
  return Math.max(0, Math.min(1, q));
}

export function feedbackBand(dials: number[], target: number[]): 'hot' | 'warm' | 'cold' {
  const q = cookQuality(dials, target);
  if (q >= 0.85) return 'hot';
  if (q >= 0.6) return 'warm';
  return 'cold';
}

export function cookOutput(baseId: BaseId, quality: number): BaseStockEntry {
  return {
    baseId,
    qualityMult: qualityValueMult(quality),
    bonusEffects: qualityBonusEffects(baseId, quality),
    units: qualityYield(quality, COOK_YIELD),
  };
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/chemistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/chemistry.ts lib/cookgame/__tests__/chemistry.test.ts
git commit -m "feat(cookgame): pure chemistry engine (ratio cook quality)"
```

---

## Task 6: Save v1 → v2 migration (`saveSystem.ts`)

**Files:**
- Modify: `lib/cookgame/saveSystem.ts`
- Test: `lib/cookgame/__tests__/saveSystem.test.ts`

**Interfaces:**
- Consumes: `types` (`InventoryState`, `BaseStockEntry`, `PlotState`), `cultivation` (`emptyPlot`).
- Produces: `CURRENT_VERSION = 2`; `interface SaveV2 { version: 2; cash: number; heat: number; inventory: InventoryState; discoveredRecipes: string[]; }` (exported as `SaveV1` alias removed → rename usages to `SaveV2`; keep `SaveState = SaveV2` type export for the store). `createNewSave()` returns v2 with 3 empty plots. `parseSave(raw)` accepts v2, migrates a valid v1 forward, else null.

> The store imports the save type as `SaveState`. This task adds `export type SaveState = SaveV2;` so the store import is stable across versions.

- [ ] **Step 1: Replace the save tests**

```ts
// lib/cookgame/__tests__/saveSystem.test.ts
import { describe, it, expect } from 'vitest';
import { serializeSave, parseSave, createNewSave, CURRENT_VERSION } from '../saveSystem';

describe('save v2', () => {
  it('createNewSave is version 2 with 3 empty plots and empty stock', () => {
    const s = createNewSave();
    expect(s.version).toBe(CURRENT_VERSION);
    expect(CURRENT_VERSION).toBe(2);
    expect(s.cash).toBe(150);
    expect(s.inventory.plots).toHaveLength(3);
    expect(s.inventory.plots.every((p) => p.stage === 'empty')).toBe(true);
    expect(s.inventory.baseStock).toEqual([]);
    expect(s.inventory.dryingRack).toEqual([]);
    expect(s.inventory.inputs).toEqual({});
  });
  it('round-trips through serialize/parse', () => {
    const s = createNewSave();
    s.cash = 999;
    s.inventory.baseStock = [{ baseId: 'couchlock', qualityMult: 1.3, bonusEffects: ['sedating'], units: 4 }];
    expect(parseSave(serializeSave(s))).toEqual(s);
  });
  it('rejects null/garbage/old-by-one-too-new', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('not json')).toBeNull();
    expect(parseSave(JSON.stringify({ version: 3, cash: 1, heat: 0, inventory: {}, discoveredRecipes: [] }))).toBeNull();
  });
});

describe('v1 -> v2 migration', () => {
  it('upgrades a valid v1 save: rawBases -> baseStock, adds plots/rack/inputs', () => {
    const v1 = JSON.stringify({
      version: 1, cash: 200, heat: 5,
      inventory: { additives: { cuke: 2 }, rawBases: { greenstart: 3 }, workProduct: null, packaged: [] },
      discoveredRecipes: ['energizing'],
    });
    const out = parseSave(v1)!;
    expect(out.version).toBe(2);
    expect(out.cash).toBe(200);
    expect(out.inventory.baseStock).toEqual([
      { baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: 3 },
    ]);
    expect(out.inventory.plots).toHaveLength(3);
    expect(out.inventory.inputs).toEqual({});
    expect(out.inventory.additives).toEqual({ cuke: 2 });
    expect(out.discoveredRecipes).toEqual(['energizing']);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/saveSystem.test.ts`
Expected: FAIL — version still 1; no migration.

- [ ] **Step 3: Rewrite `saveSystem.ts`**

```ts
// lib/cookgame/saveSystem.ts
import type { InventoryState, BaseStockEntry } from './types';
import { emptyPlot } from './cultivation';

export const STORAGE_KEY = 'cookgame-save-v1'; // storage key unchanged; payload self-describes version
export const CURRENT_VERSION = 2 as const;
const MAX_PAYLOAD = 200 * 1024;

export interface SaveV2 {
  version: 2;
  cash: number;
  heat: number;
  inventory: InventoryState;
  discoveredRecipes: string[];
}
export type SaveState = SaveV2;

export function createNewSave(): SaveV2 {
  return {
    version: CURRENT_VERSION,
    cash: 150,
    heat: 0,
    inventory: {
      additives: {}, inputs: {}, baseStock: [],
      plots: [emptyPlot(), emptyPlot(), emptyPlot()],
      dryingRack: [], workProduct: null, packaged: [],
    },
    discoveredRecipes: [],
  };
}

export function serializeSave(save: SaveV2): string {
  return JSON.stringify(save);
}

function migrateV1(p: any): SaveV2 | null {
  if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
  if (!p.inventory || !Array.isArray(p.discoveredRecipes)) return null;
  const rawBases: Record<string, number> = p.inventory.rawBases ?? {};
  const baseStock: BaseStockEntry[] = Object.entries(rawBases)
    .filter(([, n]) => (n as number) > 0)
    .map(([baseId, n]) => ({ baseId: baseId as BaseStockEntry['baseId'], qualityMult: 1, bonusEffects: [], units: n as number }));
  return {
    version: CURRENT_VERSION,
    cash: p.cash,
    heat: p.heat,
    inventory: {
      additives: p.inventory.additives ?? {},
      inputs: {},
      baseStock,
      plots: [emptyPlot(), emptyPlot(), emptyPlot()],
      dryingRack: [],
      workProduct: p.inventory.workProduct ?? null,
      packaged: p.inventory.packaged ?? [],
    },
    discoveredRecipes: p.discoveredRecipes,
  };
}

export function parseSave(raw: string | null): SaveV2 | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p.version === 1) return migrateV1(p);
    if (p.version !== CURRENT_VERSION) return null;
    if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
    if (!p.inventory || !Array.isArray(p.discoveredRecipes)) return null;
    return p as SaveV2;
  } catch {
    return null;
  }
}

export function saveGame(save: SaveV2): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const json = serializeSave(save);
    if (json.length > MAX_PAYLOAD) return false;
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch { return false; }
}

export function loadGame(): SaveV2 | null {
  if (typeof localStorage === 'undefined') return null;
  return parseSave(localStorage.getItem(STORAGE_KEY));
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/saveSystem.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/saveSystem.ts lib/cookgame/__tests__/saveSystem.test.ts
git commit -m "feat(cookgame): save v2 with v1->v2 migration (baseStock/plots/inputs)"
```

---

## Task 7: Store — baseStock unification

**Files:**
- Modify: `lib/cookgame/store.ts`
- Test: `lib/cookgame/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `saveSystem` (`SaveState`, `createNewSave`, `saveGame`, `loadGame`), `effects`, `economy`, `content`, `types`.
- Produces (changed signatures): inventory uses the v2 `InventoryState`; `buyBase(id, price)` pushes/merges a `baseStock` entry; `loadBaseToBench(stockIndex: number)` pulls one unit from `baseStock[stockIndex]` (was `loadBaseToBench(id)`); a `mergeStock(stock, entry)` helper merges entries with identical `baseId`+`qualityMult`+`bonusEffects`.

- [ ] **Step 1: Update the existing store tests for baseStock**

Replace the Phase 1 base/load assertions in `lib/cookgame/__tests__/store.test.ts`. Replace the whole file with:

```ts
// lib/cookgame/__tests__/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCookgameStore } from '../store';

const reset = () => useCookgameStore.getState().resetGame();

describe('cookgame store — baseStock core', () => {
  beforeEach(reset);

  it('starts with starting cash and empty bench/stock', () => {
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(150);
    expect(s.inventory.workProduct).toBeNull();
    expect(s.inventory.baseStock).toEqual([]);
    expect(s.inventory.plots).toHaveLength(3);
  });

  it('buyBase adds/merges a baseStock entry', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.buyBase('greenstart', 10);
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(130);
    expect(s.inventory.baseStock).toEqual([{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: 2 }]);
  });

  it('buyAdditive deducts cost and adds inventory', () => {
    expect(useCookgameStore.getState().buyAdditive('cuke')).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(148);
    expect(s.inventory.additives.cuke).toBe(1);
  });

  it('loadBaseToBench pulls one unit from a stock entry, seeding bonus effects + qualityMult', () => {
    const st = useCookgameStore.getState();
    // inject a quality couchlock stack
    useCookgameStore.setState((s) => ({
      inventory: { ...s.inventory, baseStock: [{ baseId: 'couchlock', qualityMult: 1.3, bonusEffects: ['sedating'], units: 2 }] },
    }));
    expect(st.loadBaseToBench(0)).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.inventory.workProduct).toEqual({ baseId: 'couchlock', effects: ['sedating'], qualityMult: 1.3 });
    expect(s.inventory.baseStock[0].units).toBe(1);
  });

  it('mix flow: buy base, load bench, mix additive, record recipe', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench(0);
    st.buyAdditive('cuke');
    expect(st.mixIn('cuke')).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.inventory.workProduct!.effects).toContain('energizing');
    expect(s.discoveredRecipes).toContain('energizing');
  });

  it('package + sell increases cash and heat, decrements units', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench(0);
    st.buyAdditive('cuke'); st.mixIn('cuke');
    st.packageBench();
    const before = useCookgameStore.getState();
    expect(before.inventory.packaged[0].units).toBe(5);
    const offer = st.sellUnit('doug', 0, 1.0);
    const after = useCookgameStore.getState();
    expect(offer).toBeGreaterThan(0);
    expect(after.cash).toBe(before.cash + offer);
    expect(after.heat).toBeGreaterThan(before.heat);
    expect(after.inventory.packaged[0].units).toBe(4);
  });

  it('tickHeat decays heat toward 0', () => {
    const st = useCookgameStore.getState();
    useCookgameStore.setState({ heat: 10 });
    st.tickHeat(4);
    expect(useCookgameStore.getState().heat).toBe(8);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: FAIL — `baseStock` undefined; `loadBaseToBench` signature mismatch.

- [ ] **Step 3: Edit `store.ts` — replace base handling**

Update the import and `CookgameState` interface: inventory is the new `InventoryState`; change `buyBase` to merge into `baseStock`; change `loadBaseToBench` to take a stock index. Add a `mergeStock` helper near the top:

```ts
import type { AdditiveId, BaseId, BuyerId, InventoryState, Product, BaseStockEntry } from './types';
import { SaveState, CURRENT_VERSION, createNewSave, saveGame, loadGame } from './saveSystem';

function sameStock(a: BaseStockEntry, b: BaseStockEntry): boolean {
  return a.baseId === b.baseId && a.qualityMult === b.qualityMult &&
    a.bonusEffects.length === b.bonusEffects.length &&
    a.bonusEffects.every((e, i) => e === b.bonusEffects[i]);
}

function mergeStock(stock: BaseStockEntry[], entry: BaseStockEntry): BaseStockEntry[] {
  const i = stock.findIndex((s) => sameStock(s, entry));
  if (i === -1) return [...stock, entry];
  return stock.map((s, idx) => (idx === i ? { ...s, units: s.units + entry.units } : s));
}
```

In the `CookgameState` interface change:

```ts
  buyBase: (id: BaseId, price: number) => boolean;
  loadBaseToBench: (stockIndex: number) => boolean;
```

Replace the `buyBase` and `loadBaseToBench` action bodies:

```ts
  buyBase: (id, price) => {
    const { cash, inventory } = get();
    if (cash < price) return false;
    set({
      cash: cash - price,
      inventory: { ...inventory, baseStock: mergeStock(inventory.baseStock, { baseId: id, qualityMult: 1, bonusEffects: [], units: 1 }) },
    });
    return true;
  },

  loadBaseToBench: (stockIndex) => {
    const { inventory } = get();
    if (inventory.workProduct) return false;
    const entry = inventory.baseStock[stockIndex];
    if (!entry || entry.units <= 0) return false;
    const baseStock = inventory.baseStock
      .map((s, i) => (i === stockIndex ? { ...s, units: s.units - 1 } : s))
      .filter((s) => s.units > 0);
    set({
      inventory: {
        ...inventory,
        baseStock,
        workProduct: { baseId: entry.baseId, effects: [...entry.bonusEffects], qualityMult: entry.qualityMult },
      },
    });
    return true;
  },
```

Update two more spots so the store compiles and saves the right version under SaveV2:
- Retype the `fromSave` helper from `(s: SaveV1)` to `(s: SaveState)` (the existing `...fromSave(createNewSave())` initial state then spreads the full v2 inventory unchanged).
- In `saveNow`, build the payload with the current version instead of a hardcoded `1`:

```ts
  saveNow: () => {
    const { cash, heat, inventory, discoveredRecipes } = get();
    saveGame({ version: CURRENT_VERSION, cash, heat, inventory, discoveredRecipes });
  },
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): unify base stock into quality-bearing baseStock"
```

---

## Task 8: Store — grow actions

**Files:**
- Modify: `lib/cookgame/store.ts`
- Test: `lib/cookgame/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `cultivation` (`plantPlot`, `canTend`, `tendPlot`, `harvestPlot`, `canCollect`, `collectDried`), `content` (`INPUTS`, `GROWABLE`), `mergeStock` (Task 7).
- Produces actions:
  - `buyInput(id: InputId): boolean` — deduct `INPUTS[id].cost`, +1 input.
  - `plantPlot(plotIndex: number, strainKey: string, now: number): boolean` — requires plot empty + 1 seed + 1 nutrient; consumes both; plants.
  - `tendPlot(plotIndex: number, now: number): boolean` — applies cultivation `tendPlot` if `canTend`.
  - `harvestPlot(plotIndex: number, now: number): boolean` — moves wet batch to `dryingRack`, empties plot.
  - `collectDried(batchIndex: number, now: number): boolean` — if `canCollect`, merges a `baseStock` entry, removes the batch.

- [ ] **Step 1: Add failing grow-flow tests**

Append to `lib/cookgame/__tests__/store.test.ts`:

```ts
import { TEND_COOLDOWN_MS, DRY_COOLDOWN_MS } from '../cultivation';

describe('cookgame store — grow flow', () => {
  beforeEach(reset);

  const stockInputs = () => {
    useCookgameStore.setState((s) => ({
      inventory: { ...s.inventory, inputs: { seed_couchlock: 1, nutrient: 1 } },
    }));
  };

  it('buyInput deducts cost and adds an input', () => {
    expect(useCookgameStore.getState().buyInput('nutrient')).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(147); // 150 - 3
    expect(s.inventory.inputs.nutrient).toBe(1);
  });

  it('plant requires seed + nutrient and consumes them', () => {
    const st = useCookgameStore.getState();
    expect(st.plantPlot(0, 'couchlock', 1000)).toBe(false); // no inputs yet
    stockInputs();
    expect(useCookgameStore.getState().plantPlot(0, 'couchlock', 1000)).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.inventory.plots[0].stage).toBe('seedling');
    expect(s.inventory.inputs.seed_couchlock ?? 0).toBe(0);
    expect(s.inventory.inputs.nutrient ?? 0).toBe(0);
  });

  it('full grow: plant -> tend x2 -> harvest -> dry -> collect into baseStock', () => {
    stockInputs();
    const st = useCookgameStore.getState();
    st.plantPlot(0, 'couchlock', 0);
    expect(st.tendPlot(0, 1)).toBe(false); // too soon
    st.tendPlot(0, TEND_COOLDOWN_MS);
    st.tendPlot(0, 2 * TEND_COOLDOWN_MS);
    expect(useCookgameStore.getState().inventory.plots[0].stage).toBe('flowering');
    expect(st.harvestPlot(0, 3 * TEND_COOLDOWN_MS)).toBe(true);
    let s = useCookgameStore.getState();
    expect(s.inventory.plots[0].stage).toBe('empty');
    expect(s.inventory.dryingRack).toHaveLength(1);
    const dryAt = 3 * TEND_COOLDOWN_MS;
    expect(st.collectDried(0, dryAt + DRY_COOLDOWN_MS - 1)).toBe(false);
    expect(st.collectDried(0, dryAt + DRY_COOLDOWN_MS)).toBe(true);
    s = useCookgameStore.getState();
    expect(s.inventory.dryingRack).toHaveLength(0);
    expect(s.inventory.baseStock[0].baseId).toBe('couchlock');
    expect(s.inventory.baseStock[0].units).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: FAIL — grow actions undefined.

- [ ] **Step 3: Edit `store.ts` — add grow actions**

Add to imports:

```ts
import type { InputId } from './types';
import { INPUTS, GROWABLE } from './content';
import {
  plantPlot as cPlant, canTend, tendPlot as cTend,
  harvestPlot as cHarvest, canCollect, collectDried as cCollect,
} from './cultivation';
```

Add to the `CookgameState` interface:

```ts
  buyInput: (id: InputId) => boolean;
  plantPlot: (plotIndex: number, strainKey: string, now: number) => boolean;
  tendPlot: (plotIndex: number, now: number) => boolean;
  harvestPlot: (plotIndex: number, now: number) => boolean;
  collectDried: (batchIndex: number, now: number) => boolean;
```

Add the action implementations:

```ts
  buyInput: (id) => {
    const { cash, inventory } = get();
    const cost = INPUTS[id].cost;
    if (cash < cost) return false;
    set({
      cash: cash - cost,
      inventory: { ...inventory, inputs: { ...inventory.inputs, [id]: (inventory.inputs[id] ?? 0) + 1 } },
    });
    return true;
  },

  plantPlot: (plotIndex, strainKey, now) => {
    const { inventory } = get();
    const g = GROWABLE[strainKey];
    const plot = inventory.plots[plotIndex];
    if (!g || !plot || plot.stage !== 'empty') return false;
    if ((inventory.inputs[g.seedId] ?? 0) <= 0 || (inventory.inputs.nutrient ?? 0) <= 0) return false;
    const plots = inventory.plots.map((p, i) => (i === plotIndex ? cPlant(p, g.baseId, now) : p));
    set({
      inventory: {
        ...inventory, plots,
        inputs: { ...inventory.inputs, [g.seedId]: inventory.inputs[g.seedId] - 1, nutrient: inventory.inputs.nutrient - 1 },
      },
    });
    return true;
  },

  tendPlot: (plotIndex, now) => {
    const { inventory } = get();
    const plot = inventory.plots[plotIndex];
    if (!plot || !canTend(plot, now)) return false;
    const plots = inventory.plots.map((p, i) => (i === plotIndex ? cTend(p, now) : p));
    set({ inventory: { ...inventory, plots } });
    return true;
  },

  harvestPlot: (plotIndex, now) => {
    const { inventory } = get();
    const plot = inventory.plots[plotIndex];
    if (!plot) return false;
    const res = cHarvest(plot, now);
    if (!res) return false;
    const plots = inventory.plots.map((p, i) => (i === plotIndex ? res.plot : p));
    set({ inventory: { ...inventory, plots, dryingRack: [...inventory.dryingRack, res.wet] } });
    return true;
  },

  collectDried: (batchIndex, now) => {
    const { inventory } = get();
    const batch = inventory.dryingRack[batchIndex];
    if (!batch || !canCollect(batch, now)) return false;
    const entry = cCollect(batch);
    const dryingRack = inventory.dryingRack.filter((_, i) => i !== batchIndex);
    set({ inventory: { ...inventory, dryingRack, baseStock: mergeStock(inventory.baseStock, entry) } });
    return true;
  },
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): store grow actions (buy input/plant/tend/harvest/collect)"
```

---

## Task 9: Store — cook actions

**Files:**
- Modify: `lib/cookgame/store.ts`
- Test: `lib/cookgame/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `chemistry` (`cookQuality`, `cookOutput`, `DIAL_COUNT`), `mergeStock`.
- Produces:
  - State field `cookSession: CookSession | null` (top-level).
  - `startCook(baseId: BaseId): boolean` — consumes 1 `reagent`; sets `cookSession` with a fresh random target (length `DIAL_COUNT`, each in `[0,1]`) and dials all `0`.
  - `setDial(i: number, value: number): void` — clamps `value` to `[0,1]`, updates the dial.
  - `submitCook(): number` — computes quality, merges a `cookOutput` entry into `baseStock`, clears `cookSession`, returns quality (0 if no session).

- [ ] **Step 1: Add failing cook-flow tests**

Append to `lib/cookgame/__tests__/store.test.ts`:

```ts
describe('cookgame store — cook flow', () => {
  beforeEach(reset);

  it('startCook requires a reagent and opens a session', () => {
    const st = useCookgameStore.getState();
    expect(st.startCook('glimmerdust')).toBe(false); // no reagent
    useCookgameStore.setState((s) => ({ inventory: { ...s.inventory, inputs: { reagent: 1 } } }));
    expect(useCookgameStore.getState().startCook('glimmerdust')).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.cookSession?.baseId).toBe('glimmerdust');
    expect(s.cookSession?.dials).toHaveLength(3);
    expect(s.inventory.inputs.reagent).toBe(0);
  });

  it('a perfectly matched submit yields a max-quality cooked stock entry', () => {
    useCookgameStore.setState((s) => ({ inventory: { ...s.inventory, inputs: { reagent: 1 } } }));
    const st = useCookgameStore.getState();
    st.startCook('glimmerdust');
    const target = useCookgameStore.getState().cookSession!.target;
    target.forEach((v, i) => st.setDial(i, v)); // dial exactly onto target
    const q = st.submitCook();
    expect(q).toBeCloseTo(1, 5);
    const s = useCookgameStore.getState();
    expect(s.cookSession).toBeNull();
    expect(s.inventory.baseStock[0].baseId).toBe('glimmerdust');
    expect(s.inventory.baseStock[0].bonusEffects).toEqual(['glowing']);
  });

  it('setDial clamps to [0,1]', () => {
    useCookgameStore.setState((s) => ({ inventory: { ...s.inventory, inputs: { reagent: 1 } } }));
    const st = useCookgameStore.getState();
    st.startCook('glimmerdust');
    st.setDial(0, 5); st.setDial(1, -3);
    const d = useCookgameStore.getState().cookSession!.dials;
    expect(d[0]).toBe(1);
    expect(d[1]).toBe(0);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: FAIL — cook actions / `cookSession` undefined.

- [ ] **Step 3: Edit `store.ts` — add cook state + actions**

Add to imports:

```ts
import type { CookSession } from './types';
import { cookQuality, cookOutput, DIAL_COUNT } from './chemistry';
```

Add to `CookgameState` interface:

```ts
  cookSession: CookSession | null;
  startCook: (baseId: BaseId) => boolean;
  setDial: (i: number, value: number) => void;
  submitCook: () => number;
```

Add `cookSession: null,` to the initial state (next to `nearbyInteractable`/`activeOverlay`). Add the actions:

```ts
  startCook: (baseId) => {
    const { inventory } = get();
    if ((inventory.inputs.reagent ?? 0) <= 0) return false;
    const target = Array.from({ length: DIAL_COUNT }, () => Math.random());
    set({
      inventory: { ...inventory, inputs: { ...inventory.inputs, reagent: inventory.inputs.reagent - 1 } },
      cookSession: { baseId, target, dials: Array.from({ length: DIAL_COUNT }, () => 0) },
    });
    return true;
  },

  setDial: (i, value) => {
    const { cookSession } = get();
    if (!cookSession) return;
    const v = Math.max(0, Math.min(1, value));
    set({ cookSession: { ...cookSession, dials: cookSession.dials.map((d, idx) => (idx === i ? v : d)) } });
  },

  submitCook: () => {
    const { cookSession, inventory } = get();
    if (!cookSession) return 0;
    const q = cookQuality(cookSession.dials, cookSession.target);
    set({
      cookSession: null,
      inventory: { ...inventory, baseStock: mergeStock(inventory.baseStock, cookOutput(cookSession.baseId, q)) },
    });
    return q;
  },
```

Also add `cookSession: null` to the `resetGame` set payload so a reset clears any open session.

- [ ] **Step 4: Run; expect pass + whole suite**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): store cook actions (start/setDial/submit ratio cook)"
```

---

## Task 10: World — stations + interactables

**Files:**
- Modify: `components/cookgame/world/TownScene.tsx`
- Modify: `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Produces: new exported anchors `PLOT_POSITIONS: [number,number,number][]` (length 3), `DRYING_POSITION`, `CHEM_POSITION` from `TownScene`. New `Interactable`s mounted in `CookGameGame` with ids `plot:0`,`plot:1`,`plot:2`,`drying`,`chem`.
- Consumes: existing `Interactable`, `STATION_POSITIONS`/`BUYER_POSITIONS` pattern.

- [ ] **Step 1: Add anchors + meshes in `TownScene.tsx`**

Add near the existing position exports:

```tsx
export const PLOT_POSITIONS: [number, number, number][] = [
  [-4, 0, -8], [0, 0, -8], [4, 0, -8],
];
export const DRYING_POSITION: [number, number, number] = [-9, 0, 2];
export const CHEM_POSITION: [number, number, number] = [12, 0, -3];
```

Inside the `TownScene` `group`, add low-poly station markers (reuse the existing station-marker mesh style):
- For each `PLOT_POSITIONS[i]`: a brown "pot" box (e.g. `boxGeometry [1.2,0.6,1.2]`, color `#7c4a2d`) at `y 0.3`.
- Drying rack: a tall thin frame box at `DRYING_POSITION` (color `#9ca3af`).
- Chemistry station: a box at `CHEM_POSITION` (color `#22d3ee`).

- [ ] **Step 2: Mount interactables in `CookGameGame.tsx`**

Import the new anchors and add inside `<Physics>` (alongside existing station interactables):

```tsx
{PLOT_POSITIONS.map((pos, i) => (
  <Interactable key={`plot:${i}`} id={`plot:${i}`} position={pos} />
))}
<Interactable id="drying" position={DRYING_POSITION} />
<Interactable id="chem" position={CHEM_POSITION} />
```

Add the new ids to the `LABELS` map in `InteractionPrompt.tsx`: `'plot:0':'Grow Plot 1'`, `'plot:1':'Grow Plot 2'`, `'plot:2':'Grow Plot 3'`, `drying:'Drying Rack'`, `chem:'Chemistry Station'`.

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK`
Expected: OK (no cookgame errors).
Manual: walk to each new station; "Press E — Grow Plot 1" etc. appears by proximity.

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/world/TownScene.tsx components/cookgame/CookGameGame.tsx components/cookgame/world/InteractionPrompt.tsx
git commit -m "feat(cookgame): grow plots, drying rack, chem station + interactables"
```

---

## Task 11: Supplier inputs + mixing baseStock UI

**Files:**
- Modify: `components/cookgame/stations/SupplierShopOverlay.tsx`
- Modify: `components/cookgame/stations/MixingStationOverlay.tsx`
- Modify: `components/cookgame/stations/PackagingOverlay.tsx`

**Interfaces:**
- Consumes: `content` (`INPUTS`, `BASES`), store (`buyInput`, `baseStock`, `loadBaseToBench(stockIndex)`).

- [ ] **Step 1: Supplier — add an Inputs section**

In `SupplierShopOverlay.tsx`, after the Additives section, add an **Inputs** section listing `Object.values(INPUTS)`: each row shows name + cost; button "Buy ($cost)" → `useCookgameStore.getState().buyInput(i.id)`, disabled when `cash < i.cost`; show owned count from `inventory.inputs[i.id] ?? 0`. (Greenstart base buy row stays as-is.)

- [ ] **Step 2: Mixing — load from baseStock**

In `MixingStationOverlay.tsx`, replace the single "Load Green Start" affordance with a list of `inventory.baseStock` entries (when no `workProduct`): each row shows `BASES[entry.baseId].name`, `×entry.units`, a quality badge (e.g. `Q ${Math.round(entry.qualityMult*100)}%`), and its `bonusEffects` as chips; button "Load" → `loadBaseToBench(index)`. Empty-state: "No base stock — buy Green Start at the Supplier or grow/cook your own." The rest of the mixing UI (effect chips, additive previews, package button) is unchanged and already shows the quality-boosted value via `productValue`.

- [ ] **Step 3: Packaging — surface quality**

In `PackagingOverlay.tsx`, where each bench/packaged product is shown, add a small quality badge when `product.qualityMult` is present and `!== 1` (e.g. `Q ${Math.round(qualityMult*100)}%`). Value already reflects it.

- [ ] **Step 4: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK`
Expected: OK.
Manual: buy inputs at supplier; with a baseStock entry present, load it at the bench and confirm bonus effect + higher value appear.

- [ ] **Step 5: Commit**

```bash
git add components/cookgame/stations/SupplierShopOverlay.tsx components/cookgame/stations/MixingStationOverlay.tsx components/cookgame/stations/PackagingOverlay.tsx
git commit -m "feat(cookgame): supplier inputs + baseStock-aware mixing/packaging UI"
```

---

## Task 12: Grow plot + drying rack overlays

**Files:**
- Create: `components/cookgame/stations/GrowPlotOverlay.tsx`
- Create: `components/cookgame/stations/DryingRackOverlay.tsx`
- Modify: `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Consumes: store (`plots`, `dryingRack`, `inputs`, `plantPlot`, `tendPlot`, `harvestPlot`, `collectDried`), `content` (`GROWABLE`, `BASES`), `cultivation` (`canTend`, `canCollect`, `TEND_COOLDOWN_MS`, `DRY_COOLDOWN_MS`).
- Produces: `GrowPlotOverlay` self-gating on `activeOverlay?.startsWith('plot:')` (parses index); `DryingRackOverlay` self-gating on `activeOverlay === 'drying'`.

- [ ] **Step 1: `GrowPlotOverlay.tsx`**

Self-gate: read `activeOverlay`; if it doesn't match `/^plot:(\d+)$/`, return null; else `plotIndex = Number(match[1])`. Maintain a ticking `now` for live cooldown display:

```tsx
const [now, setNow] = useState(() => Date.now());
useEffect(() => {
  const t = setInterval(() => setNow(Date.now()), 500);
  return () => clearInterval(t);
}, []);
```

Render in `OverlayFrame title={`Grow Plot ${plotIndex + 1}`}`:
- If `plot.stage === 'empty'`: a strain picker — for each `GROWABLE` key, a button `Plant ${BASES[g.baseId].name}` → `plantPlot(plotIndex, key, Date.now())`; disable when missing seed or nutrient; show a hint of required inputs (1 seed + 1 nutrient).
- If `seedling`/`vegetative`: show stage name + a care indicator; a "Tend (Water/Light)" button → `tendPlot(plotIndex, Date.now())`; when `!canTend(plot, now)` disable it and show a countdown `Math.ceil((TEND_COOLDOWN_MS - (now - plot.lastAdvancedAt))/1000)s`.
- If `flowering`: "Harvest" button → `harvestPlot(plotIndex, Date.now())`.

Read store slices with selectors so the overlay re-renders on plot changes.

- [ ] **Step 2: `DryingRackOverlay.tsx`**

Self-gate on `activeOverlay === 'drying'`. Same ticking `now`. Render in `OverlayFrame title="Drying Rack"`: list `dryingRack`; each row shows `BASES[batch.baseId].name`, a quality hint, and either a "Collect" button (when `canCollect(batch, now)`) → `collectDried(index, Date.now())`, or a countdown `Math.ceil((DRY_COOLDOWN_MS - (now - batch.dryStartedAt))/1000)s`. Empty-state: "Nothing drying."

- [ ] **Step 3: Mount in `CookGameGame.tsx`**

Add `<GrowPlotOverlay />` and `<DryingRackOverlay />` as DOM siblings alongside the other overlays.

- [ ] **Step 4: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK`
Expected: OK.
Manual: plant a plot (consumes inputs), watch the tend cooldown count down, tend twice, harvest, then collect at the rack after drying.

- [ ] **Step 5: Commit**

```bash
git add components/cookgame/stations/GrowPlotOverlay.tsx components/cookgame/stations/DryingRackOverlay.tsx components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): grow plot + drying rack overlays"
```

---

## Task 13: Chemistry station overlay (cook mini-game)

**Files:**
- Create: `components/cookgame/stations/ChemistryStationOverlay.tsx`
- Modify: `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Consumes: store (`cookSession`, `inputs`, `startCook`, `setDial`, `submitCook`), `content` (`COOKABLE_BASES`, `BASES`), `chemistry` (`feedbackBand`).
- Produces: `ChemistryStationOverlay` self-gating on `activeOverlay === 'chem'`.

- [ ] **Step 1: `ChemistryStationOverlay.tsx`**

Self-gate on `activeOverlay === 'chem'`. Render in `OverlayFrame title="Chemistry Station"`:
- If no `cookSession`: for each id in `COOKABLE_BASES`, a button `Start Cook — ${BASES[id].name}` → `startCook(id)`, disabled when `(inputs.reagent ?? 0) <= 0`; show reagent count + a "needs 1 Reagent Pack" hint.
- If a `cookSession` is open: three range sliders (`<input type="range" min={0} max={1} step={0.01}>`), each bound to `cookSession.dials[i]`, `onChange` → `setDial(i, Number(e.target.value))`. Above them show a single feedback chip from `feedbackBand(cookSession.dials, cookSession.target)` — color it (HOT red/orange, WARM amber, COLD blue) with text only (never reveal the numeric target). A "Cook!" button → `const q = submitCook();` then show a transient result line "Quality {Math.round(q*100)}%". 

Note: the target is intentionally hidden — feedback band is the only signal.

- [ ] **Step 2: Mount in `CookGameGame.tsx`**

Add `<ChemistryStationOverlay />` as a DOM sibling with the other overlays.

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK`
Expected: OK.
Manual: start a cook (consumes a reagent), nudge sliders watching HOT/WARM/COLD, submit, and confirm a glimmerdust stock entry appears (load it at the bench to see glowing + high value).

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/stations/ChemistryStationOverlay.tsx components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): chemistry station ratio-balancing cook mini-game"
```

---

## Task 14: Full-loop verification + suite/build

**Files:**
- Modify: `components/cookgame/CookGameGame.tsx` (only if wiring gaps surface)

- [ ] **Step 1: Full pure suite + typecheck + lint + build**

Run, expecting all green:
```bash
./node_modules/.bin/vitest run lib/cookgame
./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK
./node_modules/.bin/eslint components/cookgame lib/cookgame
./node_modules/.bin/vite build  # regenerates route tree; revert any pnpm-workspace.yaml noise
```

- [ ] **Step 2: Manual end-to-end**

On `/cookgame`: buy seeds+nutrient at the supplier → plant a plot → tend across cooldowns (wilt one to compare) → harvest → collect from the drying rack → load the quality base at the bench (see bonus effect + boosted value) → cook a glimmerdust at the chem station → mix/package/sell. Reload mid-grow → cooldowns resume. Confirm a pre-existing Phase 1 v1 save (if present) migrates without data loss.

- [ ] **Step 3: Senior review (studio convention — before the eventual big PR)**

Dispatch the `senior-swe-reviewer` agent on the branch diff; address findings. (Do not push or open a PR — Phase 2 accumulates on `feat/cookgame-phase-1` for one big PR at the end.)

- [ ] **Step 4: Commit any wiring fixes**

```bash
git add components/cookgame
git commit -m "fix(cookgame): phase 2 end-to-end wiring + review fixes"
```

---

## Self-Review Notes (coverage vs spec)

- Spec §2 keystones → growth model (Task 4 cooldowns via injected `now`), multiple plots (Tasks 8/12), ratio cook (Tasks 5/13), quality levers (Task 2 + threaded through Tasks 3/4/5/7).
- Spec §3 grow pipeline → Tasks 4 (engine), 8 (store), 12 (UI). §4 cook → Tasks 5/9/13. §5 quality→reward → Task 2 (+ Tasks 3,4,5). §6 state/save → Tasks 6 (save), 7–9 (store). §7 world/components → Tasks 10–13. §8 testing → tests in Tasks 1–9, typecheck/manual in 10–14.
- Pure logic (Tasks 1–9) fully TDD'd in node (no DOM). R3F/UI (Tasks 10–14) use typecheck + lint + manual, per the no-DOM-test constraint.
- Deliberate Phase 1 touch-up (spec §6.1): `rawBases` → `baseStock` lands in Task 7 with updated store tests; save migration covers old `rawBases` payloads in Task 6.
- Deferred to later phases (spec §9): day/night cycle, rank/XP, more shops, property, customer demand, employees/dealers, police/cartel, mobile.
