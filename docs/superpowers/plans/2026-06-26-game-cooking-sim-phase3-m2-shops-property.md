# cookgame Phase 3 · Milestone 2 (Shops & Property) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the economy sinks & throughput levers: a data-driven, rank-gated shop catalog (generalizing the Supplier) and buyable/upgradeable property tiers that grant more grow plots, faster tend/dry cooldowns, a stash capacity cap, and passive income.

**Architecture:** Two new PURE libs — `property.ts` (tiers + effects + stash count) and `shops.ts` (catalog + price/visibility helpers) — are the tested core; `cultivation` gains an optional `cooldownMult` parameter (neutral default) finally consuming the rank perk + property upgrade; the `store` adds `buyProperty`, wires cooldownMult into tend/collect, enforces the stash cap, and ticks passive income; a generalized `ShopOverlay` replaces the bespoke supplier overlay and a new `PropertyOverlay` manages tiers.

**Tech Stack:** TypeScript, react-three-fiber/DOM overlays, Zustand, vitest. Build/test via `./node_modules/.bin/*` wrappers.

## Global Constraints

- **Internal slug `cookgame`**; satirical/fictional tone. **No DOM test env:** pure logic + store are unit-tested; overlays are typecheck+lint+manual. Run tests via `./node_modules/.bin/vitest run <path>` (pnpm wrappers blocked).
- **Backward compatibility:** `cultivation`'s new `cooldownMult` param is OPTIONAL, default `1` → Phase 2 cultivation tests pass unchanged. M1 progression stays green.
- **Save unchanged:** M2 uses fields already in SaveV3 (`ownedPropertyTier`, defaulted 0 by M1). NO version bump.
- **Stash cap** (new constraint): `stashCount(inventory) = Σ baseStock units + Σ packaged units` (the bench `workProduct` is NOT counted). Actions that ADD stash (`buyBase`, `collectDried`, `packageBench`, `submitCook`) refuse (return false / 0) when the result would exceed `propertyEffects(ownedPropertyTier).stashCap`.
- **cooldownMult composition:** effective grow/dry cooldown multiplier = `perksAtRank(rank).cooldownMult * propertyEffects(ownedPropertyTier).cooldownMult` (both ≤ 1 → faster). Lower = faster.
- **Property tiers are the single upgrade axis** (plots + cooldownMult + stashCap + passiveIncome bundled per tier; bought strictly in ascending order, one tier at a time). No separate per-station upgrade purchase (simplification of the spec's `upgradeStation`).
- **Branch:** `feat/cookgame-phase-3-m2` (M2 of 5; PR/merge to `main` when reviewed). Run `senior-swe-reviewer` before the PR.
- Spec of record: `docs/superpowers/specs/2026-06-26-game-cooking-sim-phase3-design.md` (§5 shops, §6 property).

---

## File Structure

```
lib/cookgame/
  property.ts     # CREATE: PROPERTY_TIERS, propertyEffects(tier), stashCount(inventory)  [PURE]
  shops.ts        # CREATE: SHOPS catalog, ShopItem, shopItemPrice, visibleItems, BASE_PRICE  [PURE]
  cultivation.ts  # MODIFY: canTend/tendPlot/canCollect gain optional cooldownMult = 1
  store.ts        # MODIFY: buyProperty + cooldownMult wiring + stash-cap enforcement + tickPassiveIncome
  __tests__/
    property.test.ts     # CREATE
    shops.test.ts        # CREATE
    cultivation.test.ts  # MODIFY (append cooldownMult cases)
    store.test.ts        # MODIFY (buyProperty, cap, income, cooldown)

components/cookgame/
  stations/ShopOverlay.tsx       # CREATE: generalized data-driven shop (replaces SupplierShopOverlay)
  stations/SupplierShopOverlay.tsx  # DELETE (logic moves to ShopOverlay)
  stations/PropertyOverlay.tsx   # CREATE: buy/upgrade property tiers
  world/TownScene.tsx            # MODIFY: 'property' interactable on the lab building (+ keep colliders)
  world/InteractionPrompt.tsx    # MODIFY: add 'property' label
  CookGameGame.tsx               # MODIFY: mount ShopOverlay + PropertyOverlay; passive-income ticker
```

**Current shapes (verified):** `cultivation` exports `canTend(plot, now)`, `tendPlot(plot, now)`, `canCollect(batch, now)`, `emptyPlot()`, consts `TEND_COOLDOWN_MS=30000`/`DRY_COOLDOWN_MS=60000`. Store has `ownedPropertyTier` (0), `xp`, `inventory.{baseStock,packaged,plots,workProduct}`, actions `buyBase(id,price)`/`buyAdditive`/`buyInput`/`packageBench`/`submitCook`/`tendPlot(i,now)`/`collectDried(i,now)`; `perksAtRank`/`rankForXp` already imported from `progression`. Content: `ADDITIVES`/`BASES`/`INPUTS` records (each value has `.cost` except BASES). Existing `SupplierShopOverlay` self-gates `activeOverlay==='supplier'`, uses a local `BASE_PRICE=10`, and calls `buyBase(id, BASE_PRICE)`/`buyAdditive(id)`/`buyInput(id)`.

---

## Task 1: Property tiers (`property.ts`)

**Files:**
- Create: `lib/cookgame/property.ts`
- Test: `lib/cookgame/__tests__/property.test.ts`

**Interfaces:**
- Consumes: `types` (`InventoryState`).
- Produces:
  - `interface PropertyTier { tier: number; name: string; cost: number; rankReq: number; plots: number; cooldownMult: number; stashCap: number; passiveIncomePerSec: number }`
  - `PROPERTY_TIERS: PropertyTier[]` (ordered, tier 0 = starting Rented Lot: cost 0, rankReq 0, plots 3, cooldownMult 1, stashCap 60, income 0).
  - `interface PropertyEffects { plots: number; cooldownMult: number; stashCap: number; passiveIncomePerSec: number }`
  - `propertyEffects(tier: number): PropertyEffects` — clamps `tier` to range, returns that tier's effect values.
  - `stashCount(inventory: InventoryState): number` — `Σ baseStock[].units + Σ packaged[].units` (excludes `workProduct`).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/property.test.ts
import { describe, it, expect } from 'vitest';
import { PROPERTY_TIERS, propertyEffects, stashCount } from '../property';
import type { InventoryState } from '../types';

const inv = (baseUnits: number[], packagedUnits: number[]): InventoryState => ({
  additives: {}, inputs: {},
  baseStock: baseUnits.map((u) => ({ baseId: 'greenstart' as const, qualityMult: 1, bonusEffects: [], units: u })),
  plots: [], dryingRack: [],
  workProduct: { baseId: 'greenstart', effects: ['energizing'] }, // must NOT be counted
  packaged: packagedUnits.map((u) => ({ product: { baseId: 'greenstart' as const, effects: [] }, units: u })),
});

describe('PROPERTY_TIERS', () => {
  it('tier 0 is the free starting lot with 3 plots', () => {
    expect(PROPERTY_TIERS[0]).toMatchObject({ tier: 0, cost: 0, rankReq: 0, plots: 3 });
  });
  it('is ordered: ascending tier, non-decreasing plots/stashCap, non-increasing cooldownMult', () => {
    for (let i = 1; i < PROPERTY_TIERS.length; i++) {
      expect(PROPERTY_TIERS[i].tier).toBe(i);
      expect(PROPERTY_TIERS[i].plots).toBeGreaterThanOrEqual(PROPERTY_TIERS[i - 1].plots);
      expect(PROPERTY_TIERS[i].stashCap).toBeGreaterThanOrEqual(PROPERTY_TIERS[i - 1].stashCap);
      expect(PROPERTY_TIERS[i].cooldownMult).toBeLessThanOrEqual(PROPERTY_TIERS[i - 1].cooldownMult);
      expect(PROPERTY_TIERS[i].cost).toBeGreaterThan(PROPERTY_TIERS[i - 1].cost);
    }
  });
});

describe('propertyEffects', () => {
  it('returns the tier effects and clamps out-of-range', () => {
    expect(propertyEffects(0)).toEqual({
      plots: PROPERTY_TIERS[0].plots, cooldownMult: PROPERTY_TIERS[0].cooldownMult,
      stashCap: PROPERTY_TIERS[0].stashCap, passiveIncomePerSec: PROPERTY_TIERS[0].passiveIncomePerSec,
    });
    expect(propertyEffects(-1)).toEqual(propertyEffects(0));
    expect(propertyEffects(999)).toEqual(propertyEffects(PROPERTY_TIERS.length - 1));
  });
});

describe('stashCount', () => {
  it('sums baseStock + packaged units, ignoring workProduct', () => {
    expect(stashCount(inv([3, 2], [5, 4]))).toBe(14);
    expect(stashCount(inv([], []))).toBe(0);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/property.test.ts`
Expected: FAIL — cannot resolve `../property`.

- [ ] **Step 3: Implement `property.ts`**

```ts
// lib/cookgame/property.ts
import type { InventoryState } from './types';

export interface PropertyTier {
  tier: number; name: string; cost: number; rankReq: number;
  plots: number; cooldownMult: number; stashCap: number; passiveIncomePerSec: number;
}

export const PROPERTY_TIERS: PropertyTier[] = [
  { tier: 0, name: 'Rented Lot',   cost: 0,    rankReq: 0, plots: 3,  cooldownMult: 1.0,  stashCap: 60,  passiveIncomePerSec: 0 },
  { tier: 1, name: 'The Lockup',   cost: 500,  rankReq: 1, plots: 6,  cooldownMult: 0.9,  stashCap: 150, passiveIncomePerSec: 0.5 },
  { tier: 2, name: 'The Bungalow', cost: 2000, rankReq: 3, plots: 9,  cooldownMult: 0.8,  stashCap: 350, passiveIncomePerSec: 1.5 },
  { tier: 3, name: 'The Warehouse',cost: 6000, rankReq: 5, plots: 12, cooldownMult: 0.7,  stashCap: 800, passiveIncomePerSec: 4 },
];

export interface PropertyEffects { plots: number; cooldownMult: number; stashCap: number; passiveIncomePerSec: number; }

export function propertyEffects(tier: number): PropertyEffects {
  const i = Math.max(0, Math.min(PROPERTY_TIERS.length - 1, tier));
  const t = PROPERTY_TIERS[i];
  return { plots: t.plots, cooldownMult: t.cooldownMult, stashCap: t.stashCap, passiveIncomePerSec: t.passiveIncomePerSec };
}

export function stashCount(inventory: InventoryState): number {
  const base = inventory.baseStock.reduce((n, e) => n + e.units, 0);
  const pkg = inventory.packaged.reduce((n, s) => n + s.units, 0);
  return base + pkg;
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/property.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/property.ts lib/cookgame/__tests__/property.test.ts
git commit -m "feat(cookgame): property tiers — effects + stash count"
```

---

## Task 2: Cultivation cooldown multiplier

**Files:**
- Modify: `lib/cookgame/cultivation.ts`
- Test: `lib/cookgame/__tests__/cultivation.test.ts`

**Interfaces:**
- `canTend(plot, now, cooldownMult = 1)` — gate becomes `now - lastAdvancedAt >= TEND_COOLDOWN_MS * cooldownMult`.
- `tendPlot(plot, now, cooldownMult = 1)` — uses `canTend(plot, now, cooldownMult)` for its no-op guard; passes the same mult.
- `canCollect(batch, now, cooldownMult = 1)` — `now - dryStartedAt >= DRY_COOLDOWN_MS * cooldownMult`.
- All new params optional, default `1` → existing behavior unchanged. (The wilt-credit window in `tendPlot` stays absolute; only the advance gate scales.)

- [ ] **Step 1: Append failing tests**

Append to `lib/cookgame/__tests__/cultivation.test.ts`:

```ts
describe('cooldownMult', () => {
  it('canTend gate scales with cooldownMult (faster when < 1)', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    // at 0.5x, half the base cooldown is enough
    expect(canTend(p, T0 + TEND_COOLDOWN_MS / 2, 0.5)).toBe(true);
    expect(canTend(p, T0 + TEND_COOLDOWN_MS / 2)).toBe(false); // default 1x not yet
  });
  it('tendPlot respects the scaled gate', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    expect(tendPlot(p, T0 + TEND_COOLDOWN_MS / 2, 0.5).stage).toBe('vegetative');
    expect(tendPlot(p, T0 + TEND_COOLDOWN_MS / 2)).toBe(p); // default 1x: no-op
  });
  it('canCollect gate scales with cooldownMult', () => {
    const wet = { baseId: 'glimmerdust' as const, quality: 1, dryStartedAt: T0 };
    expect(canCollect(wet, T0 + DRY_COOLDOWN_MS / 2, 0.5)).toBe(true);
    expect(canCollect(wet, T0 + DRY_COOLDOWN_MS / 2)).toBe(false);
  });
});
```

(Ensure `plantPlot`, `emptyPlot`, `canTend`, `tendPlot`, `canCollect`, `TEND_COOLDOWN_MS`, `DRY_COOLDOWN_MS`, and `T0` are imported/defined at the top — the Phase-2 cultivation test already has them.)

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/cultivation.test.ts`
Expected: FAIL — extra arg has no effect.

- [ ] **Step 3: Edit `cultivation.ts`**

```ts
export function canTend(plot: PlotState, now: number, cooldownMult = 1): boolean {
  if (!isTendable(plot.stage) || plot.lastAdvancedAt === null) return false;
  return now - plot.lastAdvancedAt >= TEND_COOLDOWN_MS * cooldownMult;
}

export function tendPlot(plot: PlotState, now: number, cooldownMult = 1): PlotState {
  if (!canTend(plot, now, cooldownMult)) return plot;
  const elapsed = now - (plot.lastAdvancedAt as number);
  const credit = elapsed <= TEND_COOLDOWN_MS + WILT_GRACE_MS ? 1 : 0.5;
  const idx = GROW_SEQUENCE.indexOf(plot.stage);
  const nextStage = GROW_SEQUENCE[idx + 1];
  return { ...plot, stage: nextStage, lastAdvancedAt: now, careAccum: plot.careAccum + credit };
}

export function canCollect(batch: WetBatch, now: number, cooldownMult = 1): boolean {
  return now - batch.dryStartedAt >= DRY_COOLDOWN_MS * cooldownMult;
}
```

(`isTendable`, the constants, `plotQuality`, `harvestPlot`, `collectDried`, `plantPlot`, `emptyPlot` unchanged.)

- [ ] **Step 4: Run; expect pass (incl. all Phase-2 cases)**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/cultivation.test.ts`
Expected: PASS — defaults neutral.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/cultivation.ts lib/cookgame/__tests__/cultivation.test.ts
git commit -m "feat(cookgame): optional cooldownMult on tend/collect gates"
```

---

## Task 3: Shop catalog (`shops.ts`)

**Files:**
- Create: `lib/cookgame/shops.ts`
- Test: `lib/cookgame/__tests__/shops.test.ts`

**Interfaces:**
- Consumes: `content` (`ADDITIVES`, `INPUTS`), `types` (`AdditiveId`, `InputId`).
- Produces:
  - `BASE_PRICE = 10`.
  - `type ShopItemKind = 'additive' | 'base' | 'input'`
  - `interface ShopItem { kind: ShopItemKind; refId: string; rankReq: number }`
  - `interface Shop { id: string; name: string; items: ShopItem[] }`
  - `SHOPS: Record<string, Shop>` — for M2, the `supplier` shop with rank-gated items (basic gear at rank 0, premium additives/strain seeds/reagent gated at higher ranks).
  - `shopItemPrice(item: ShopItem): number` — `BASE_PRICE` for base; `ADDITIVES[refId].cost` / `INPUTS[refId].cost` otherwise.
  - `visibleItems(shop: Shop, rank: number): ShopItem[]` — items with `rank >= rankReq`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/shops.test.ts
import { describe, it, expect } from 'vitest';
import { SHOPS, shopItemPrice, visibleItems, BASE_PRICE } from '../shops';
import { ADDITIVES, INPUTS, BASES } from '../content';

describe('SHOPS catalog', () => {
  it('has a supplier shop whose items all reference valid content + non-negative rankReq', () => {
    const supplier = SHOPS.supplier;
    expect(supplier).toBeDefined();
    for (const item of supplier.items) {
      expect(item.rankReq).toBeGreaterThanOrEqual(0);
      if (item.kind === 'base') expect(BASES[item.refId as keyof typeof BASES]).toBeDefined();
      if (item.kind === 'additive') expect(ADDITIVES[item.refId as keyof typeof ADDITIVES]).toBeDefined();
      if (item.kind === 'input') expect(INPUTS[item.refId as keyof typeof INPUTS]).toBeDefined();
    }
  });
  it('has at least one rank-gated (rankReq > 0) item to drive progression', () => {
    expect(SHOPS.supplier.items.some((i) => i.rankReq > 0)).toBe(true);
  });
});

describe('shopItemPrice', () => {
  it('uses BASE_PRICE for base and content cost otherwise', () => {
    expect(shopItemPrice({ kind: 'base', refId: 'greenstart', rankReq: 0 })).toBe(BASE_PRICE);
    expect(shopItemPrice({ kind: 'additive', refId: 'cuke', rankReq: 0 })).toBe(ADDITIVES.cuke.cost);
    expect(shopItemPrice({ kind: 'input', refId: 'nutrient', rankReq: 0 })).toBe(INPUTS.nutrient.cost);
  });
});

describe('visibleItems', () => {
  it('filters by rank', () => {
    const shop = { id: 's', name: 'S', items: [
      { kind: 'additive' as const, refId: 'cuke', rankReq: 0 },
      { kind: 'additive' as const, refId: 'battery', rankReq: 2 },
    ] };
    expect(visibleItems(shop, 0).map((i) => i.refId)).toEqual(['cuke']);
    expect(visibleItems(shop, 2).map((i) => i.refId)).toEqual(['cuke', 'battery']);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/shops.test.ts`
Expected: FAIL — cannot resolve `../shops`.

- [ ] **Step 3: Implement `shops.ts`**

```ts
// lib/cookgame/shops.ts
import type { AdditiveId, InputId } from './types';
import { ADDITIVES, INPUTS } from './content';

export const BASE_PRICE = 10;

export type ShopItemKind = 'additive' | 'base' | 'input';
export interface ShopItem { kind: ShopItemKind; refId: string; rankReq: number; }
export interface Shop { id: string; name: string; items: ShopItem[]; }

export const SHOPS: Record<string, Shop> = {
  supplier: {
    id: 'supplier', name: 'Supplier',
    items: [
      { kind: 'base', refId: 'greenstart', rankReq: 0 },
      { kind: 'input', refId: 'nutrient', rankReq: 0 },
      { kind: 'additive', refId: 'cuke', rankReq: 0 },
      { kind: 'additive', refId: 'banana', rankReq: 0 },
      { kind: 'additive', refId: 'paracetamol', rankReq: 0 },
      { kind: 'additive', refId: 'chili', rankReq: 0 },
      { kind: 'input', refId: 'seed_couchlock', rankReq: 1 },
      { kind: 'additive', refId: 'mouthwash', rankReq: 1 },
      { kind: 'additive', refId: 'donut', rankReq: 2 },
      { kind: 'input', refId: 'seed_zoomhaze', rankReq: 2 },
      { kind: 'additive', refId: 'battery', rankReq: 3 },
      { kind: 'additive', refId: 'energydrink', rankReq: 3 },
      { kind: 'input', refId: 'reagent', rankReq: 3 },
    ],
  },
};

export function shopItemPrice(item: ShopItem): number {
  if (item.kind === 'base') return BASE_PRICE;
  if (item.kind === 'additive') return ADDITIVES[item.refId as AdditiveId].cost;
  return INPUTS[item.refId as InputId].cost;
}

export function visibleItems(shop: Shop, rank: number): ShopItem[] {
  return shop.items.filter((i) => rank >= i.rankReq);
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/shops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/shops.ts lib/cookgame/__tests__/shops.test.ts
git commit -m "feat(cookgame): rank-gated shop catalog + price/visibility helpers"
```

---

## Task 4: Store — buyProperty + cooldownMult wiring

**Files:**
- Modify: `lib/cookgame/store.ts`
- Test: `lib/cookgame/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `property` (`PROPERTY_TIERS`, `propertyEffects`), `cultivation` (`canTend`/`tendPlot`/`canCollect` now accept cooldownMult; `emptyPlot`), `progression` (`rankForXp`, `perksAtRank`).
- Produces: `buyProperty(tier: number): boolean` — buys the NEXT tier only (`tier === ownedPropertyTier + 1`), gated by `rankForXp(xp).rank >= rankReq` and `cash >= cost`; deducts cash, sets `ownedPropertyTier`, grows `inventory.plots` to `propertyEffects(tier).plots` (appending `emptyPlot()`s). `tendPlot`/`collectDried` apply the combined cooldownMult.

- [ ] **Step 1: Add failing tests**

Append to `lib/cookgame/__tests__/store.test.ts`:

```ts
import { PROPERTY_TIERS, propertyEffects } from '../property';
import { TEND_COOLDOWN_MS } from '../cultivation';

describe('cookgame store — property', () => {
  beforeEach(reset);

  it('buyProperty buys the next tier only, gated by rank + cash, and grows plots', () => {
    const st = useCookgameStore.getState();
    // tier 1 needs rank 1 (xp 100) + 500 cash
    expect(st.buyProperty(1)).toBe(false); // rank 0, no cash
    useCookgameStore.setState({ xp: 100, cash: 1000 });
    expect(useCookgameStore.getState().buyProperty(2)).toBe(false); // can't skip to tier 2
    expect(useCookgameStore.getState().buyProperty(1)).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.ownedPropertyTier).toBe(1);
    expect(s.cash).toBe(500);
    expect(s.inventory.plots.length).toBe(propertyEffects(1).plots); // grew to 6
  });

  it('owning a faster-cooldown property lets a plot be tended sooner', () => {
    useCookgameStore.setState((s) => ({ inventory: { ...s.inventory, inputs: { seed_couchlock: 1, nutrient: 1 } } }));
    const st = useCookgameStore.getState();
    st.plantPlot(0, 'couchlock', 0);
    // tier 0 (cooldownMult 1): half cooldown is not enough
    expect(st.tendPlot(0, TEND_COOLDOWN_MS / 2)).toBe(false);
    // jump to a property tier with cooldownMult <= 0.5-ish via tier 3 (0.7) won't be enough at half;
    // instead verify the wiring by setting tier 3 and using a smaller elapsed that 0.7x permits:
    useCookgameStore.setState({ ownedPropertyTier: 3 }); // cooldownMult 0.7
    expect(st.tendPlot(0, TEND_COOLDOWN_MS * 0.7)).toBe(true); // 0.7x gate met exactly
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: FAIL — `buyProperty` undefined / cooldown not wired.

- [ ] **Step 3: Edit `store.ts`**

Add imports:

```ts
import { PROPERTY_TIERS, propertyEffects, stashCount } from './property';
import { emptyPlot } from './cultivation'; // if not already imported
```

(Note: `canTend`/`tendPlot`/`canCollect` are already imported as `canTend`/`cTend`/`canCollect` per the Phase-2 aliases — reuse those.)

Add `buyProperty` to the `CookgameState` interface:

```ts
  buyProperty: (tier: number) => boolean;
```

Add the action:

```ts
  buyProperty: (tier) => {
    const { cash, ownedPropertyTier, inventory, xp } = get();
    const t = PROPERTY_TIERS[tier];
    if (!t || tier !== ownedPropertyTier + 1) return false;       // next tier only
    if (rankForXp(xp).rank < t.rankReq) return false;
    if (cash < t.cost) return false;
    const plots = [...inventory.plots];
    while (plots.length < t.plots) plots.push(emptyPlot());
    set({ cash: cash - t.cost, ownedPropertyTier: tier, inventory: { ...inventory, plots } });
    return true;
  },
```

Define a small local cooldown helper near the actions (or inline in both): the combined multiplier is `perksAtRank(rankForXp(xp).rank).cooldownMult * propertyEffects(ownedPropertyTier).cooldownMult`. Wire it into `tendPlot` and `collectDried`:

```ts
  tendPlot: (plotIndex, now) => {
    const { inventory, xp, ownedPropertyTier } = get();
    const plot = inventory.plots[plotIndex];
    const cd = perksAtRank(rankForXp(xp).rank).cooldownMult * propertyEffects(ownedPropertyTier).cooldownMult;
    if (!plot || !canTend(plot, now, cd)) return false;
    const plots = inventory.plots.map((p, i) => (i === plotIndex ? cTend(p, now, cd) : p));
    set({ inventory: { ...inventory, plots } });
    return true;
  },

  collectDried: (batchIndex, now) => {
    const { inventory, xp, ownedPropertyTier } = get();
    const batch = inventory.dryingRack[batchIndex];
    const cd = perksAtRank(rankForXp(xp).rank).cooldownMult * propertyEffects(ownedPropertyTier).cooldownMult;
    if (!batch || !canCollect(batch, now, cd)) return false;
    const entry = cCollect(batch);
    const dryingRack = inventory.dryingRack.filter((_, i) => i !== batchIndex);
    set({ inventory: { ...inventory, dryingRack, baseStock: mergeStock(inventory.baseStock, entry) } });
    return true;
  },
```

> `collectDried` grants NO XP (M1 grants production XP in `harvestPlot`/`submitCook`, not here) — preserve that. This task changes ONLY the guard: compute `cd` and pass it to `canCollect`. The `set(...)` payload stays exactly as M1 left it. (Stash-cap enforcement is layered onto this same action in Task 5.)

- [ ] **Step 4: Run; expect pass + full suite**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all PASS (Phase 2 cultivation/store unaffected at tier 0 / rank 0 where cd = 1).

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): buyProperty + cooldownMult wiring into tend/collect"
```

---

## Task 5: Store — stash cap + passive income

**Files:**
- Modify: `lib/cookgame/store.ts`
- Test: `lib/cookgame/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `property` (`propertyEffects`, `stashCount`).
- Produces: stash-cap enforcement in `buyBase` / `collectDried` / `packageBench` / `submitCook` (refuse when the add would exceed `propertyEffects(ownedPropertyTier).stashCap`); `tickPassiveIncome(dtSeconds: number): void` adds `propertyEffects(tier).passiveIncomePerSec * dt` to cash.

- [ ] **Step 1: Add failing tests**

Append to `lib/cookgame/__tests__/store.test.ts`:

```ts
describe('cookgame store — stash cap + income', () => {
  beforeEach(reset);

  it('buyBase refuses when it would exceed the stash cap', () => {
    const cap = propertyEffects(0).stashCap; // 60 at tier 0
    // fill baseStock to the cap
    useCookgameStore.setState((s) => ({
      cash: 99999,
      inventory: { ...s.inventory, baseStock: [{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: cap }] },
    }));
    expect(useCookgameStore.getState().buyBase('greenstart', 10)).toBe(false);
    expect(useCookgameStore.getState().inventory.baseStock[0].units).toBe(cap);
  });

  it('a higher property tier raises the cap so the same buy succeeds', () => {
    const cap = propertyEffects(0).stashCap;
    useCookgameStore.setState((s) => ({
      cash: 99999, ownedPropertyTier: 1, // cap 150
      inventory: { ...s.inventory, baseStock: [{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: cap }] },
    }));
    expect(useCookgameStore.getState().buyBase('greenstart', 10)).toBe(true);
  });

  it('tickPassiveIncome adds cash only when the tier has income', () => {
    const st = useCookgameStore.getState();
    st.tickPassiveIncome(10);
    expect(useCookgameStore.getState().cash).toBe(150); // tier 0: no income
    useCookgameStore.setState({ ownedPropertyTier: 1, cash: 0 }); // 0.5/s
    useCookgameStore.getState().tickPassiveIncome(10);
    expect(useCookgameStore.getState().cash).toBe(5); // 0.5 * 10
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: FAIL — cap not enforced / `tickPassiveIncome` undefined.

- [ ] **Step 3: Edit `store.ts`**

Add `tickPassiveIncome` to the interface:

```ts
  tickPassiveIncome: (dtSeconds: number) => void;
```

Add the cap check at the start of the stash-adding actions (right after their existing guards), e.g. in `buyBase`:

```ts
  buyBase: (id, price) => {
    const { cash, inventory, ownedPropertyTier } = get();
    if (cash < price) return false;
    if (stashCount(inventory) + 1 > propertyEffects(ownedPropertyTier).stashCap) return false;
    set({ cash: cash - price, inventory: { ...inventory, baseStock: mergeStock(inventory.baseStock, { baseId: id, qualityMult: 1, bonusEffects: [], units: 1 }) } });
    return true;
  },
```

In `collectDried` (after computing `entry`, before the `set`): `if (stashCount(inventory) + entry.units > propertyEffects(ownedPropertyTier).stashCap) return false;` (read `ownedPropertyTier` from `get()`).
In `packageBench` (after the `workProduct` guard): `if (stashCount(inventory) + UNITS_PER_BATCH > propertyEffects(get().ownedPropertyTier).stashCap) return false;` (import `UNITS_PER_BATCH` from `./economy` if not present, or read `packageProduct(...).units`).
In `submitCook` (after computing the `cookOutput` entry, before the `set`): refuse if `stashCount(inventory) + entry.units` exceeds the cap (return `0`).

Add the income action:

```ts
  tickPassiveIncome: (dtSeconds) => {
    const rate = propertyEffects(get().ownedPropertyTier).passiveIncomePerSec;
    if (rate <= 0) return;
    set({ cash: get().cash + rate * dtSeconds });
  },
```

- [ ] **Step 4: Run; expect pass + full suite**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all PASS (tier-0 cap 60 is high enough that existing Phase-2 flow tests, which add only a few units, are unaffected).

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): stash cap enforcement + passive income tick"
```

---

## Task 6: Generalized ShopOverlay

**Files:**
- Create: `components/cookgame/stations/ShopOverlay.tsx`
- Delete: `components/cookgame/stations/SupplierShopOverlay.tsx`
- Modify: `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Consumes: `useCookgameStore` (`activeOverlay`, `cash`, `xp`, `inventory`, `buyBase`/`buyAdditive`/`buyInput`), `shops` (`SHOPS`, `shopItemPrice`, `visibleItems`, `BASE_PRICE`), `progression` (`rankForXp`), `content` (`ADDITIVES`/`BASES`/`INPUTS` for display names), `OverlayFrame`.

- [ ] **Step 1: Implement `ShopOverlay.tsx`**

`"use client";`. Self-gate: `const activeOverlay = useCookgameStore((s)=>s.activeOverlay); const shop = activeOverlay ? SHOPS[activeOverlay] : undefined; if (!shop) return null;` (so it renders for any shop id; the supplier interactable id `'supplier'` matches `SHOPS.supplier`). Subscribe `cash`, `xp`, `inventory.additives`, `inventory.inputs`, `inventory.baseStock` via selectors. Compute `const rank = rankForXp(xp).rank;` and `const items = visibleItems(shop, rank);`. In `OverlayFrame title={shop.name}` render the visible items: each row shows the display name (`BASES[refId].name` / `ADDITIVES[refId].name` / `INPUTS[refId].name`), `shopItemPrice(item)`, owned count where relevant, and a Buy button disabled when `cash < price`; on click call `buyBase(refId, BASE_PRICE)` / `buyAdditive(refId)` / `buyInput(refId)` by `item.kind` (read the action via `useCookgameStore.getState()`). Show current cash + a small "more unlocks at higher ranks" hint when some items are still rank-locked. Mirror the existing overlay styling (the old `SupplierShopOverlay` is your reference for layout/classes).

- [ ] **Step 2: Swap in CookGameGame + delete the old overlay**

In `CookGameGame.tsx` replace the `<SupplierShopOverlay />` mount + import with `<ShopOverlay />`. Delete `components/cookgame/stations/SupplierShopOverlay.tsx`. (The supplier `Interactable id="supplier"` is unchanged — it now opens `ShopOverlay` because `SHOPS.supplier` exists.)

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK` → OK.
Run: `./node_modules/.bin/eslint components/cookgame/stations/ShopOverlay.tsx components/cookgame/CookGameGame.tsx` → clean.
Manual: at the Supplier, only rank-0 items show at rank 0; ranking up reveals more; buying still works and respects the stash cap.

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/stations/ShopOverlay.tsx components/cookgame/CookGameGame.tsx
git rm components/cookgame/stations/SupplierShopOverlay.tsx
git commit -m "feat(cookgame): generalized rank-gated ShopOverlay (replaces SupplierShopOverlay)"
```

---

## Task 7: PropertyOverlay + entry point + income ticker

**Files:**
- Create: `components/cookgame/stations/PropertyOverlay.tsx`
- Modify: `components/cookgame/world/TownScene.tsx`, `components/cookgame/world/InteractionPrompt.tsx`, `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Consumes: `useCookgameStore` (`activeOverlay`, `cash`, `xp`, `ownedPropertyTier`, `buyProperty`, `tickPassiveIncome`), `property` (`PROPERTY_TIERS`, `propertyEffects`), `progression` (`rankForXp`), `OverlayFrame`.

- [ ] **Step 1: Implement `PropertyOverlay.tsx`**

`"use client";`. Self-gate `activeOverlay === 'property'`. Show the **current** tier (`PROPERTY_TIERS[ownedPropertyTier]` name + `propertyEffects(ownedPropertyTier)`: plots, stash cap, income/sec, cooldown shown as a "+X% speed" via `1 - cooldownMult`). If a next tier exists, show it with cost + rankReq + its effect deltas and a "Buy / Upgrade" button → `buyProperty(ownedPropertyTier + 1)`, disabled when `rankForXp(xp).rank < nextTier.rankReq` (label "Reach <rank> to unlock") or `cash < nextTier.cost`. At max tier show "Fully upgraded." Mirror `OverlayFrame` + existing overlay styling.

- [ ] **Step 2: Add a 'property' interactable + label**

In `TownScene.tsx` add an `Interactable id="property"` at the lab building anchor (lab is at `[8,1.5,-6]`; place the interactable at ground level near it, e.g. `[8,0,-4]` so the player can reach it — keep the lab's collider/mesh unchanged). In `InteractionPrompt.tsx` add `property: 'Manage Property'` to the `LABELS` map.

- [ ] **Step 3: Mount overlay + income ticker in CookGameGame**

Mount `<PropertyOverlay />` (DOM sibling). Add a passive-income driver: in the existing in-canvas ticker (the `HeatTicker`/`useFrame` that calls `tickHeat`), also call `useCookgameStore.getState().tickPassiveIncome(delta)` (delta in seconds). (Throttling isn't required — `tickPassiveIncome` no-ops at income 0, which is the default tier.)

- [ ] **Step 4: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK` → OK.
Run: `./node_modules/.bin/eslint components/cookgame/stations/PropertyOverlay.tsx components/cookgame/world/TownScene.tsx components/cookgame/world/InteractionPrompt.tsx components/cookgame/CookGameGame.tsx` → clean.
Manual: press E at the lab → Property overlay; buying tier 1 (at rank 1 + 500 cash) adds plots that appear on the lot, raises the stash cap, speeds cooldowns, and starts an income trickle.

- [ ] **Step 5: Commit**

```bash
git add components/cookgame/stations/PropertyOverlay.tsx components/cookgame/world/TownScene.tsx components/cookgame/world/InteractionPrompt.tsx components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): property overlay + lab interactable + passive income ticker"
```

---

## Task 8: M2 verification

**Files:** none (verification; fix forward only on gate failure).

- [ ] **Step 1: Full gates**

```bash
./node_modules/.bin/vitest run lib/cookgame                        # all green (Phase 1/2 + M1 + property/shops/cooldown/cap/income)
./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK
./node_modules/.bin/eslint components/cookgame lib/cookgame
./node_modules/.bin/vite build                                     # exit 0; revert pnpm-workspace.yaml noise, don't commit it
```

- [ ] **Step 2: Manual end-to-end**

`/cookgame`: Supplier shows rank-gated stock that expands as you rank up; the stash cap blocks over-buying/over-collecting until you upgrade property; the lab Property overlay buys tiers (plots appear, cooldowns speed up, income trickles); reload persists `ownedPropertyTier` (v3). Phase 1/2 loop unaffected at tier 0.

- [ ] **Step 3: Commit any gate fixes**

```bash
git add -A && git commit -m "fix(cookgame): M2 shops/property verification"
```

---

## Self-Review Notes (coverage vs spec §5, §6)

- §5 data-driven rank-gated shop catalog + generalized overlay → Tasks 3 (`shops.ts`) + 6 (`ShopOverlay`). (Hardware-store/after-hours/key shops live in districts → deferred to M3; the catalog model supports them.)
- §6 property tiers (plots/station-upgrade-cooldown/stash-cap/passive-income), `propertyEffects`, stash-cap enforcement, `buyProperty`, income tick → Tasks 1 (`property.ts`), 4 (buyProperty + cooldown), 5 (cap + income), 7 (overlay + ticker). Station upgrades are bundled into tiers (single axis) rather than a separate `upgradeStation` — noted simplification.
- cooldownMult (defined in M1's Perk, deferred there) is consumed here → Task 2 (cultivation param) + Task 4 (rank × property composition).
- Backward-compat: cooldownMult/cap defaults are neutral/non-binding at tier 0/rank 0 → Phase 1/2 + M1 suites stay green (Tasks 2/4/5 step 4).
- Save: no bump — `ownedPropertyTier` already in SaveV3 from M1.
- Deferred to later M's: districts + the shops/buyers/property they host (M3), day-night shop/buyer time-windows (M4), journal depth (M5).
```
