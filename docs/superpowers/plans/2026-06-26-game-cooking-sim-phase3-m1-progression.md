# cookgame Phase 3 · Milestone 1 (Progression) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the rank/XP progression spine: XP from selling/discovering-recipes/completing-production, a rank curve with cumulative passive perks (price/heat) wired into the economy, a rank+XP HUD, and a one-time save bump to v3 that establishes all Phase-3 save fields (defaulted).

**Architecture:** A new PURE `progression.ts` (xp formulas + `RANKS` + perks) is the tested core; `economy` gains optional, neutral-default perk parameters; the Zustand `store` tracks `xp`, derives rank, applies perks in `sellUnit`, and grants XP from the loop; `saveSystem` bumps v2→v3 (forward-migrating losslessly); the HUD shows rank + XP. Strictly additive — Phases 1–2 behavior is unchanged when perks default to neutral.

**Tech Stack:** TypeScript, react-three-fiber/DOM (HUD), Zustand, vitest. Build/test via `./node_modules/.bin/*` wrappers.

## Global Constraints

- **Internal slug `cookgame`**; satirical/fictional tone.
- **Backward compatibility:** existing pure-lib signatures stay backward-compatible — perk params are OPTIONAL and default to neutral (`priceMult 1`, `heatMult 1`), so all Phase 1/2 economy/store tests pass unchanged.
- **One save version bump for all of Phase 3:** M1 sets `CURRENT_VERSION = 3` and SaveV3 carries every Phase-3 top-level field (`xp`, `ownedPropertyTier`, `keys`, `clock`, `discoveredEffects`, `recipeMeta`, `currentDistrict`), all defaulted. Only `xp` has behavior in M1; the rest are inert placeholders that round-trip, so M2–M5 add behavior without re-bumping the version. v2 saves migrate forward losslessly.
- **No DOM test env:** vitest in node. Pure logic + store are unit-tested; the HUD is typecheck+lint+manual. Run tests via `./node_modules/.bin/vitest run <path>` (pnpm wrappers blocked).
- **Branch:** `feat/cookgame-phase-3` (M1 is the first of 5 milestones; PR/merge to `main` when M1 is reviewed, like #229/#239).
- **Run `senior-swe-reviewer` before the M1 PR.**
- Spec of record: `docs/superpowers/specs/2026-06-26-game-cooking-sim-phase3-design.md` (§2 milestones, §3 progression, §9 save).

---

## File Structure

```
lib/cookgame/
  progression.ts   # CREATE: xpForSale/Recipe/Production, RANKS, rankForXp, xpToNextRank, perksAtRank  [PURE]
  economy.ts       # MODIFY: buyerOffer(+priceMult?), applyHeatOnSale(+heatMult?) — optional neutral defaults
  saveSystem.ts    # MODIFY: CURRENT_VERSION=3, SaveV3 + v2→v3 migration (all Phase-3 fields defaulted)
  store.ts         # MODIFY: xp state + gainXp + rank-perk wiring in sellUnit + XP from sell/mix/harvest/cook
  __tests__/
    progression.test.ts  # CREATE
    economy.test.ts      # MODIFY (append perk tests)
    saveSystem.test.ts   # MODIFY (v3 + v2→v3 migration)
    store.test.ts        # MODIFY (xp/rank/perk flows)

components/cookgame/ui/
  HUD.tsx          # MODIFY: add rank name + XP-to-next-rank bar
```

---

## Task 1: Progression core (`progression.ts`)

**Files:**
- Create: `lib/cookgame/progression.ts`
- Test: `lib/cookgame/__tests__/progression.test.ts`

**Interfaces:**
- Produces:
  - `xpForSale(saleValue: number): number` — `max(1, round(saleValue / 4))`.
  - `xpForRecipe(): number` = `XP_PER_RECIPE` (25). `xpForProduction(): number` = `XP_PER_PRODUCTION` (10).
  - `interface Perk { priceMult: number; heatMult: number; cooldownMult: number }`
  - `interface Rank { rank: number; name: string; xpThreshold: number; perk: Perk }`
  - `RANKS: Rank[]` (ordered by `xpThreshold` ascending, rank 0 at threshold 0).
  - `rankForXp(xp: number): Rank` — the highest rank whose `xpThreshold <= xp`.
  - `xpToNextRank(xp: number): number` — `nextThreshold - xp`, or `0` at max rank.
  - `perksAtRank(rank: number): Perk` — clamps to valid range.
  > Later milestones (M2/M3) extend `Rank` with `shopTier`/`propertyTierUnlocked`/`buyersUnlocked`; M1 keeps it to `{rank,name,xpThreshold,perk}` to avoid referencing ids that don't exist yet.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/progression.test.ts
import { describe, it, expect } from 'vitest';
import {
  xpForSale, xpForRecipe, xpForProduction, rankForXp, xpToNextRank, perksAtRank, RANKS,
} from '../progression';

describe('xp sources', () => {
  it('xpForSale scales with value, floored at 1', () => {
    expect(xpForSale(40)).toBe(10);
    expect(xpForSale(0)).toBe(1);
    expect(xpForSale(2)).toBe(1);
  });
  it('recipe and production are fixed positive amounts', () => {
    expect(xpForRecipe()).toBeGreaterThan(0);
    expect(xpForProduction()).toBeGreaterThan(0);
  });
});

describe('RANKS table', () => {
  it('is ordered, starts at rank 0 / threshold 0, perks are sane', () => {
    expect(RANKS[0].rank).toBe(0);
    expect(RANKS[0].xpThreshold).toBe(0);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].xpThreshold).toBeGreaterThan(RANKS[i - 1].xpThreshold);
      expect(RANKS[i].rank).toBe(i);
    }
    for (const r of RANKS) {
      expect(r.perk.priceMult).toBeGreaterThanOrEqual(1);   // price only improves
      expect(r.perk.heatMult).toBeLessThanOrEqual(1);        // heat only improves
      expect(r.perk.cooldownMult).toBeLessThanOrEqual(1);
    }
  });
});

describe('rankForXp / xpToNextRank', () => {
  it('maps xp to the highest reached rank', () => {
    expect(rankForXp(0).rank).toBe(0);
    expect(rankForXp(RANKS[1].xpThreshold).rank).toBe(1);
    expect(rankForXp(RANKS[1].xpThreshold - 1).rank).toBe(0);
    expect(rankForXp(99_999_999).rank).toBe(RANKS[RANKS.length - 1].rank);
  });
  it('xpToNextRank is remaining xp, 0 at max', () => {
    expect(xpToNextRank(0)).toBe(RANKS[1].xpThreshold);
    expect(xpToNextRank(99_999_999)).toBe(0);
  });
});

describe('perksAtRank', () => {
  it('returns that rank perk and clamps out-of-range', () => {
    expect(perksAtRank(0)).toEqual(RANKS[0].perk);
    expect(perksAtRank(-5)).toEqual(RANKS[0].perk);
    expect(perksAtRank(999)).toEqual(RANKS[RANKS.length - 1].perk);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/progression.test.ts`
Expected: FAIL — cannot resolve `../progression`.

- [ ] **Step 3: Implement `progression.ts`**

```ts
// lib/cookgame/progression.ts
export const XP_PER_RECIPE = 25;
export const XP_PER_PRODUCTION = 10;

export function xpForSale(saleValue: number): number {
  return Math.max(1, Math.round(saleValue / 4));
}
export function xpForRecipe(): number { return XP_PER_RECIPE; }
export function xpForProduction(): number { return XP_PER_PRODUCTION; }

export interface Perk { priceMult: number; heatMult: number; cooldownMult: number; }
export interface Rank { rank: number; name: string; xpThreshold: number; perk: Perk; }

export const RANKS: Rank[] = [
  { rank: 0, name: 'Nobody',     xpThreshold: 0,    perk: { priceMult: 1.00, heatMult: 1.00, cooldownMult: 1.00 } },
  { rank: 1, name: 'Corner Kid', xpThreshold: 100,  perk: { priceMult: 1.02, heatMult: 0.98, cooldownMult: 0.98 } },
  { rank: 2, name: 'Runner',     xpThreshold: 300,  perk: { priceMult: 1.05, heatMult: 0.95, cooldownMult: 0.95 } },
  { rank: 3, name: 'Dealer',     xpThreshold: 700,  perk: { priceMult: 1.08, heatMult: 0.92, cooldownMult: 0.92 } },
  { rank: 4, name: 'Supplier',   xpThreshold: 1500, perk: { priceMult: 1.12, heatMult: 0.88, cooldownMult: 0.88 } },
  { rank: 5, name: 'Kingpin',    xpThreshold: 3000, perk: { priceMult: 1.16, heatMult: 0.84, cooldownMult: 0.85 } },
  { rank: 6, name: 'Legend',     xpThreshold: 6000, perk: { priceMult: 1.20, heatMult: 0.80, cooldownMult: 0.82 } },
];

export function rankForXp(xp: number): Rank {
  let result = RANKS[0];
  for (const r of RANKS) {
    if (xp >= r.xpThreshold) result = r;
    else break;
  }
  return result;
}

export function xpToNextRank(xp: number): number {
  const current = rankForXp(xp);
  const next = RANKS[current.rank + 1];
  return next ? next.xpThreshold - xp : 0;
}

export function perksAtRank(rank: number): Perk {
  const i = Math.max(0, Math.min(RANKS.length - 1, rank));
  return RANKS[i].perk;
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/progression.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/progression.ts lib/cookgame/__tests__/progression.test.ts
git commit -m "feat(cookgame): progression core — xp curve, ranks, perks"
```

---

## Task 2: Economy perk hooks (`economy.ts`)

**Files:**
- Modify: `lib/cookgame/economy.ts`
- Test: `lib/cookgame/__tests__/economy.test.ts`

**Interfaces:**
- `buyerOffer(product, buyer, heat, variance, priceMult = 1)` — multiplies the rounded offer base by `priceMult` (applied before rounding).
- `applyHeatOnSale(heat, heatMult = 1)` — adds `HEAT_PER_SALE * heatMult` (clamped to `MAX_HEAT`).
- Both new params are OPTIONAL with neutral defaults → all existing call sites and tests are unaffected.

- [ ] **Step 1: Append failing perk tests**

Append to `lib/cookgame/__tests__/economy.test.ts`:

```ts
describe('perk hooks', () => {
  const doug = BUYERS.find((b) => b.id === 'doug')!;
  const p: Product = { baseId: 'greenstart', effects: ['energizing'] };
  it('buyerOffer scales with priceMult (default 1 unchanged)', () => {
    const base = buyerOffer(p, doug, 0, 1.0);
    const boosted = buyerOffer(p, doug, 0, 1.0, 1.2);
    expect(boosted).toBe(Math.round(base * 1.2));
    expect(buyerOffer(p, doug, 0, 1.0)).toBe(base); // default neutral
  });
  it('applyHeatOnSale scales the heat increment with heatMult', () => {
    expect(applyHeatOnSale(0)).toBe(HEAT_PER_SALE);             // default neutral
    expect(applyHeatOnSale(0, 0.5)).toBe(HEAT_PER_SALE * 0.5);
  });
});
```

(Ensure `Product`, `BUYERS`, `HEAT_PER_SALE` are imported at the top of the file — they already are from the Phase-1 tests; if not, add them.)

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/economy.test.ts`
Expected: FAIL — `priceMult`/`heatMult` args have no effect yet.

- [ ] **Step 3: Edit `economy.ts`**

```ts
export function buyerOffer(product: Product, buyer: Buyer, heat: number, variance: number, priceMult = 1): number {
  const base = productValue(product);
  const pref = product.effects.includes(buyer.preferredEffect) ? 1 + buyer.preferenceBonus : 1;
  return Math.round(base * buyer.basePriceFactor * pref * heatPenaltyFactor(heat) * variance * priceMult);
}

export function applyHeatOnSale(heat: number, heatMult = 1): number {
  return Math.min(MAX_HEAT, heat + HEAT_PER_SALE * heatMult);
}
```

(Keep `decayHeat`, `packageProduct`, `heatPenaltyFactor`, constants unchanged.)

- [ ] **Step 4: Run; expect pass (incl. all Phase-1/2 cases)**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/economy.test.ts`
Expected: PASS — prior assertions unaffected (defaults neutral).

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/economy.ts lib/cookgame/__tests__/economy.test.ts
git commit -m "feat(cookgame): optional perk multipliers in buyerOffer/applyHeatOnSale"
```

---

## Task 3: Save v2 → v3 (`saveSystem.ts`)

**Files:**
- Modify: `lib/cookgame/saveSystem.ts`
- Test: `lib/cookgame/__tests__/saveSystem.test.ts`

**Interfaces:**
- `CURRENT_VERSION = 3`. `interface SaveV3` adds top-level Phase-3 fields to the v2 shape:
  `xp: number; ownedPropertyTier: number; keys: string[]; clock: number; discoveredEffects: string[];
   recipeMeta: Record<string, { name?: string; favorite?: boolean; bestValue?: number }>; currentDistrict: string;`
  (`SaveState = SaveV3`.)
- `createNewSave()` defaults them (`xp 0`, `ownedPropertyTier 0`, `keys []`, `clock 0`, `discoveredEffects []`, `recipeMeta {}`, `currentDistrict 'suburbs'`).
- `parseSave` accepts v3 (validates the new field types), migrates a valid **v2** forward (`migrateV2`), and chains **v1 → v2 → v3** (existing `migrateV1` now feeds `migrateV2`). Rejects null/garbage/version>3/bad shape.

- [ ] **Step 1: Replace the save tests**

```ts
// lib/cookgame/__tests__/saveSystem.test.ts
import { describe, it, expect } from 'vitest';
import { serializeSave, parseSave, createNewSave, CURRENT_VERSION } from '../saveSystem';

const validV2 = () => ({
  version: 2, cash: 150, heat: 0,
  inventory: { additives: {}, inputs: {}, baseStock: [], plots: [], dryingRack: [], workProduct: null, packaged: [] },
  discoveredRecipes: [],
});

describe('save v3', () => {
  it('createNewSave is v3 with defaulted Phase-3 fields', () => {
    const s = createNewSave();
    expect(s.version).toBe(CURRENT_VERSION);
    expect(CURRENT_VERSION).toBe(3);
    expect(s.xp).toBe(0);
    expect(s.ownedPropertyTier).toBe(0);
    expect(s.keys).toEqual([]);
    expect(s.clock).toBe(0);
    expect(s.discoveredEffects).toEqual([]);
    expect(s.recipeMeta).toEqual({});
    expect(s.currentDistrict).toBe('suburbs');
  });
  it('round-trips through serialize/parse', () => {
    const s = createNewSave();
    s.xp = 420; s.keys = ['docks']; s.currentDistrict = 'downtown';
    expect(parseSave(serializeSave(s))).toEqual(s);
  });
  it('rejects null/garbage/too-new', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('nope')).toBeNull();
    expect(parseSave(JSON.stringify({ ...createNewSave(), version: 4 }))).toBeNull();
  });
  it('rejects v3 with a bad new-field type', () => {
    const bad = { ...createNewSave(), keys: 'not-an-array' };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
});

describe('v2 -> v3 migration', () => {
  it('upgrades a valid v2 save, defaulting the new fields and preserving the rest', () => {
    const v2 = { ...validV2(), cash: 999, discoveredRecipes: ['energizing'] };
    const out = parseSave(JSON.stringify(v2))!;
    expect(out.version).toBe(3);
    expect(out.cash).toBe(999);
    expect(out.discoveredRecipes).toEqual(['energizing']);
    expect(out.xp).toBe(0);
    expect(out.ownedPropertyTier).toBe(0);
    expect(out.keys).toEqual([]);
    expect(out.clock).toBe(0);
    expect(out.discoveredEffects).toEqual([]);
    expect(out.recipeMeta).toEqual({});
    expect(out.currentDistrict).toBe('suburbs');
  });
  it('still chains a v1 save forward to v3', () => {
    const v1 = JSON.stringify({
      version: 1, cash: 200, heat: 5,
      inventory: { additives: { cuke: 1 }, rawBases: { greenstart: 2 }, workProduct: null, packaged: [] },
      discoveredRecipes: [],
    });
    const out = parseSave(v1)!;
    expect(out.version).toBe(3);
    expect(out.xp).toBe(0);
    expect(out.inventory.baseStock).toEqual([{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: 2 }]);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/saveSystem.test.ts`
Expected: FAIL — version still 2; v3 fields absent.

- [ ] **Step 3: Edit `saveSystem.ts`**

Bump the version, extend the interface, default in `createNewSave`, add the v2→v3 default helper, and rewire `parseSave`. Replace the version/interface/createNewSave/migrate/parse sections with:

```ts
export const CURRENT_VERSION = 3 as const;

export interface SaveV3 {
  version: 3;
  cash: number;
  heat: number;
  xp: number;
  ownedPropertyTier: number;
  keys: string[];
  clock: number;
  discoveredEffects: string[];
  recipeMeta: Record<string, { name?: string; favorite?: boolean; bestValue?: number }>;
  currentDistrict: string;
  inventory: InventoryState;
  discoveredRecipes: string[];
}
export type SaveState = SaveV3;

const PHASE3_DEFAULTS = () => ({
  xp: 0, ownedPropertyTier: 0, keys: [] as string[], clock: 0,
  discoveredEffects: [] as string[],
  recipeMeta: {} as Record<string, { name?: string; favorite?: boolean; bestValue?: number }>,
  currentDistrict: 'suburbs',
});

export function createNewSave(): SaveV3 {
  return {
    version: CURRENT_VERSION,
    cash: 150,
    heat: 0,
    ...PHASE3_DEFAULTS(),
    inventory: {
      additives: {}, inputs: {}, baseStock: [],
      plots: [emptyPlot(), emptyPlot(), emptyPlot()],
      dryingRack: [], workProduct: null, packaged: [],
    },
    discoveredRecipes: [],
  };
}
```

`serializeSave`/`saveGame`/`loadGame` keep their bodies but their parameter type becomes `SaveV3` (or `SaveState`). Change `migrateV1` to return the v2-shaped object as today but typed `any`/`SaveV2-like` and feed it through `migrateV2`. Add `migrateV2` and rewrite `parseSave`:

```ts
// migrateV1 stays as-is but is no longer the final step — it produces v2 content.
// (Keep its body; only ensure it returns the v2-shaped object.)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV2(p: any): SaveV3 | null {
  if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
  if (!p.inventory || !Array.isArray(p.discoveredRecipes)) return null;
  const inv = p.inventory;
  if (!Array.isArray(inv.baseStock) || !Array.isArray(inv.plots) || !Array.isArray(inv.dryingRack)) return null;
  if (typeof inv.inputs !== 'object' || inv.inputs === null || Array.isArray(inv.inputs)) return null;
  if (typeof inv.additives !== 'object' || inv.additives === null || Array.isArray(inv.additives)) return null;
  return {
    version: CURRENT_VERSION,
    cash: p.cash, heat: p.heat,
    ...PHASE3_DEFAULTS(),
    inventory: inv,
    discoveredRecipes: p.discoveredRecipes,
  };
}

export function parseSave(raw: string | null): SaveV3 | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p.version === 1) { const v2 = migrateV1(p); return v2 ? migrateV2(v2) : null; }
    if (p.version === 2) return migrateV2(p);
    if (p.version !== CURRENT_VERSION) return null;
    // v3 validation
    if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
    if (typeof p.xp !== 'number' || typeof p.clock !== 'number' || typeof p.ownedPropertyTier !== 'number') return null;
    if (!Array.isArray(p.keys) || !Array.isArray(p.discoveredEffects) || !Array.isArray(p.discoveredRecipes)) return null;
    if (typeof p.recipeMeta !== 'object' || p.recipeMeta === null || Array.isArray(p.recipeMeta)) return null;
    if (typeof p.currentDistrict !== 'string') return null;
    const inv = p.inventory;
    if (!inv || !Array.isArray(inv.baseStock) || !Array.isArray(inv.plots) || !Array.isArray(inv.dryingRack)) return null;
    if (typeof inv.inputs !== 'object' || inv.inputs === null || Array.isArray(inv.inputs)) return null;
    if (typeof inv.additives !== 'object' || inv.additives === null || Array.isArray(inv.additives)) return null;
    return p as SaveV3;
  } catch {
    return null;
  }
}
```

> `migrateV1` currently returns `SaveV2`; keep its body but change its return type annotation to `any` (or a local type) so it can feed `migrateV2`. Its existing `version: CURRENT_VERSION` line should become `version: 2` (it produces v2 content that `migrateV2` then upgrades).

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/saveSystem.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/saveSystem.ts lib/cookgame/__tests__/saveSystem.test.ts
git commit -m "feat(cookgame): save v3 — Phase 3 fields + v2->v3 migration"
```

---

## Task 4: Store — xp, rank perks, XP sources

**Files:**
- Modify: `lib/cookgame/store.ts`
- Test: `lib/cookgame/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `progression` (`xpForSale`, `xpForRecipe`, `xpForProduction`, `rankForXp`, `perksAtRank`), `economy` (perk params).
- Produces: state fields `xp`, `ownedPropertyTier`, `keys`, `clock`, `discoveredEffects`, `recipeMeta`, `currentDistrict` (all from save; only `xp` is mutated in M1); action `gainXp(amount: number)`. `sellUnit` applies rank perks and grants sale XP; `mixIn` grants recipe XP on a NEW recipe; `harvestPlot` and `submitCook` grant production XP.

- [ ] **Step 1: Add failing store tests**

Append to `lib/cookgame/__tests__/store.test.ts`:

```ts
import { rankForXp, xpForRecipe } from '../progression';

describe('cookgame store — progression', () => {
  beforeEach(reset);

  it('starts at xp 0 / rank 0 and the new save fields are defaulted', () => {
    const s = useCookgameStore.getState();
    expect(s.xp).toBe(0);
    expect(rankForXp(s.xp).rank).toBe(0);
    expect(s.ownedPropertyTier).toBe(0);
    expect(s.keys).toEqual([]);
    expect(s.currentDistrict).toBe('suburbs');
  });

  it('gainXp accumulates', () => {
    useCookgameStore.getState().gainXp(150);
    expect(useCookgameStore.getState().xp).toBe(150);
    expect(rankForXp(useCookgameStore.getState().xp).rank).toBe(1);
  });

  it('selling grants sale XP and applies the rank price perk', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench(0);
    st.buyAdditive('cuke'); st.mixIn('cuke');
    st.packageBench();
    // jump to a rank with a price perk so the offer reflects it
    useCookgameStore.setState({ xp: 3000 }); // Kingpin: priceMult 1.16
    const offer = useCookgameStore.getState().sellUnit('doug', 0, 1.0);
    const after = useCookgameStore.getState();
    expect(offer).toBeGreaterThan(0);
    expect(after.xp).toBeGreaterThan(3000); // sale XP added on top
  });

  it('discovering a NEW recipe grants recipe XP; a repeat does not', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10); st.loadBaseToBench(0);
    st.buyAdditive('cuke');
    const before = useCookgameStore.getState().xp;
    st.mixIn('cuke'); // discovers 'energizing'
    const afterNew = useCookgameStore.getState().xp;
    expect(afterNew).toBe(before + xpForRecipe());
    // mixing the same additive again yields the same effect set (no new recipe) → no recipe XP
    st.buyAdditive('cuke');
    const afterRepeat0 = useCookgameStore.getState().xp;
    st.mixIn('cuke');
    expect(useCookgameStore.getState().xp).toBe(afterRepeat0);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: FAIL — `xp`/`gainXp`/new fields undefined.

- [ ] **Step 3: Edit `store.ts`**

Add imports:

```ts
import { xpForSale, xpForRecipe, xpForProduction, rankForXp, perksAtRank } from './progression';
```

Add to the `CookgameState` interface (near `discoveredRecipes`):

```ts
  xp: number;
  ownedPropertyTier: number;
  keys: string[];
  clock: number;
  discoveredEffects: string[];
  recipeMeta: Record<string, { name?: string; favorite?: boolean; bestValue?: number }>;
  currentDistrict: string;
  gainXp: (amount: number) => void;
```

Extend `fromSave` to copy the new fields:

```ts
const fromSave = (s: SaveState) => ({
  cash: s.cash, heat: s.heat, inventory: s.inventory, discoveredRecipes: s.discoveredRecipes,
  xp: s.xp, ownedPropertyTier: s.ownedPropertyTier, keys: s.keys, clock: s.clock,
  discoveredEffects: s.discoveredEffects, recipeMeta: s.recipeMeta, currentDistrict: s.currentDistrict,
});
```

(The initial state `...fromSave(createNewSave())` and `resetGame`/`loadOrNew` now carry the new fields automatically.)

Add the `gainXp` action:

```ts
  gainXp: (amount) => set({ xp: get().xp + amount }),
```

Rewrite `sellUnit` to apply perks + grant sale XP:

```ts
  sellUnit: (buyerId, packagedIndex, variance) => {
    const { inventory, cash, heat, xp } = get();
    const stack = inventory.packaged[packagedIndex];
    const buyer = BUYERS.find((b) => b.id === buyerId);
    if (!stack || stack.units <= 0 || !buyer) return 0;
    const perk = perksAtRank(rankForXp(xp).rank);
    const offer = buyerOffer(stack.product, buyer, heat, variance, perk.priceMult);
    const packaged = inventory.packaged
      .map((s, i) => (i === packagedIndex ? { ...s, units: s.units - 1 } : s))
      .filter((s) => s.units > 0);
    set({
      cash: cash + offer,
      heat: applyHeatOnSale(heat, perk.heatMult),
      inventory: { ...inventory, packaged },
      xp: xp + xpForSale(offer),
    });
    return offer;
  },
```

In `mixIn`, grant recipe XP when the recipe is new. The current body records `discoveredRecipes` if `!includes(key)`; capture that and add XP. Read `xp` at the top and include in the `set`:

```ts
  mixIn: (additiveId) => {
    const { inventory, discoveredRecipes, xp } = get();
    if (!inventory.workProduct) return false;
    if ((inventory.additives[additiveId] ?? 0) <= 0) return false;
    const next: Product = mix(inventory.workProduct, additiveId);
    const key = effectSetKey(next.effects);
    const isNew = !discoveredRecipes.includes(key);
    set({
      inventory: {
        ...inventory,
        additives: { ...inventory.additives, [additiveId]: inventory.additives[additiveId] - 1 },
        workProduct: next,
      },
      discoveredRecipes: isNew ? [...discoveredRecipes, key] : discoveredRecipes,
      xp: xp + (isNew ? xpForRecipe() : 0),
    });
    return true;
  },
```

In `harvestPlot`, on the successful branch (after `cHarvest` returns a result), include `xp: get().xp + xpForProduction()` in its `set`. In `submitCook`, on the successful (session exists) branch, include `xp: get().xp + xpForProduction()` in its `set`. (Add `xp` to each action's `get()` destructure or read `get().xp` in the set; keep each a single atomic `set`.)

- [ ] **Step 4: Run; expect pass + full suite**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all suites PASS (Phase 1/2 unaffected; new progression flows pass).

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): store xp/rank perks + XP from sell/mix/harvest/cook"
```

---

## Task 5: Rank + XP HUD

**Files:**
- Modify: `components/cookgame/ui/HUD.tsx`

**Interfaces:**
- Consumes: `useCookgameStore` (`xp`), `progression` (`rankForXp`, `xpToNextRank`).

- [ ] **Step 1: Add a rank/XP readout to the HUD**

Read the existing `HUD.tsx` first to match its style (it already shows cash + heat bar + packaged count via selectors). Add a compact rank block (e.g. top-left, under cash): subscribe `const xp = useCookgameStore((s) => s.xp);`, compute `const rank = rankForXp(xp); const toNext = xpToNextRank(xp);`, and render the rank name + a thin XP progress bar toward the next rank (full bar at max rank). Use the same font-mono / lime accent styling as the rest of the HUD; the rank block is display-only (no actions). Keep it `pointer-events-none` consistent with the HUD's existing wrapper pattern.

- [ ] **Step 2: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK` → OK.
Run: `./node_modules/.bin/eslint components/cookgame/ui/HUD.tsx` → clean.
Manual: HUD shows the rank name + XP bar; selling/mixing/harvesting visibly fills it and it advances rank at thresholds.

- [ ] **Step 3: Commit**

```bash
git add components/cookgame/ui/HUD.tsx
git commit -m "feat(cookgame): rank + XP HUD readout"
```

---

## Task 6: M1 verification

**Files:** none (verification only; fix forward only if a gate fails).

- [ ] **Step 1: Full gates**

Run, expecting all green:
```bash
./node_modules/.bin/vitest run lib/cookgame                        # all suites pass (Phase 1/2 + progression)
./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK
./node_modules/.bin/eslint components/cookgame lib/cookgame
./node_modules/.bin/vite build                                     # exit 0; revert pnpm-workspace.yaml noise, don't commit it
```

- [ ] **Step 2: Manual sanity**

On `/cookgame`: sell/mix/harvest → XP rises and rank advances at thresholds; at a higher rank, offers are slightly higher and heat per sale slightly lower. Reload → xp persists (v3); a pre-existing v2 save migrates (xp 0).

- [ ] **Step 3: Commit any gate fixes**

```bash
git add -A && git commit -m "fix(cookgame): M1 progression verification"
```

---

## Self-Review Notes (coverage vs spec §3, §9)

- §3 XP sources → Task 1 (`xpForSale/Recipe/Production`) + Task 4 (wired into sell/mix/harvest/cook). RANKS + `rankForXp`/`perksAtRank` → Task 1. Perks applied read-only in economy → Tasks 2+4. (cooldownMult is defined in the Perk but consumed in M2 with property station-upgrades — noted, no consumer in M1.)
- §9 save v2→v3, all Phase-3 fields defaulted, lossless migration → Task 3 (+ chained v1→v2→v3). Store carries the fields → Task 4.
- Backward compatibility (neutral perk defaults) → Tasks 2/4; full `lib/cookgame` suite stays green (Task 4 step 4, Task 6).
- HUD rank/XP → Task 5. R3F/UI verified by typecheck+lint+manual (no DOM tests), per repo constraint.
- Deferred to later M's: shop/property/buyer rank-unlock fields on `Rank`, cooldownMult consumption, districts, day-night, journal depth.
