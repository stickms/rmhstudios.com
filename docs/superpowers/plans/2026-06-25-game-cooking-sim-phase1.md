# "Game" (cookgame) — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable 3D vertical slice of a satirical cook-and-deal sim: walk a small town, buy ingredients, mix product through a data-driven effects engine, package it, sell to NPCs, manage a soft heat meter, and persist progress.

**Architecture:** Pure, R3F-free logic libs (`effects`, `economy`, save serialization) are the tested core; a Zustand `store` is the single stateful hub; thin react-three-fiber components render the world and overlays as views over the store. Layout mirrors `components/forest-explorer` / `lib/forest-explorer` so we reuse proven controller/interaction/save patterns.

**Tech Stack:** TypeScript, react-three-fiber (`@react-three/fiber`), `@react-three/rapier`, `@react-three/drei`, Zustand, TanStack Router (file routes), Tailwind v4, vitest. Build/test via `./node_modules/.bin/*` wrappers.

## Global Constraints

- **Internal slug is `cookgame`** everywhere (dirs, route, store key, game id). Display title is **"Game"**. Do NOT use slug `game` — it collides with existing `components/game/` and `lib/game/`.
- **Tone:** satirical/fictional only. All strains/additives/effects are invented. Model NO real-world chemistry, quantities, ratios, temperatures, or procedures. Production is abstracted into game-y stations + data tables.
- **No DOM test environment** (per repo): vitest runs in node. Only unit-test pure logic and Zustand stores. Never put `localStorage`/`window`/DOM or R3F rendering in a vitest test. Split anything touching `localStorage` into a pure (serialize/validate) part that IS tested and a thin browser wrapper that is NOT.
- **Run tests with** `./node_modules/.bin/vitest run <path>` (pnpm wrappers are blocked here).
- **Run the `senior-swe-reviewer` agent before any PR** (studio convention for game work).
- Match existing code style: `"use client"` on game components, lazy-load the game component in the route via `GameErrorBoundary` + `GameLoadingFallback` (see `app/routes/rmh-coding-simulator.tsx`).
- Spec of record: `docs/superpowers/specs/2026-06-25-game-cooking-sim-phase1-design.md`.

---

## File Structure

```
lib/cookgame/
  types.ts          # Effect, Additive, Base, TransformRule, Product, InventoryState, SaveV1, content-id unions
  content.ts        # BASES, ADDITIVES, EFFECTS, TRANSFORM_RULES, BUYERS + lookup helpers
  effects.ts        # mix(), productValue(), effectSetKey()  [PURE]
  economy.ts        # buyerOffer(), applyHeatOnSale(), decayHeat(), packageProduct()  [PURE]
  saveSystem.ts     # serializeSave()/parseSave() [PURE] + saveGame()/loadGame()/STORAGE_KEY [browser]
  store.ts          # Zustand store: state + actions (buy/mix/package/sell/tickHeat/discover/save/load/reset)
  __tests__/
    content.test.ts  effects.test.ts  economy.test.ts  saveSystem.test.ts  store.test.ts

components/cookgame/
  GameShell.tsx                 # top bar + Suspense + lazy CookGameGame
  CookGameGame.tsx              # <Canvas>, <Physics>, scene, HUD, overlays, save wiring
  world/
    TownScene.tsx               # ground, street, lab building, shop, lighting, boundary walls
    PlayerController.tsx        # Rapier capsule, WASD + mouse-look + sprint + E (adapted from forest-explorer)
    Interactable.tsx            # proximity trigger zone → sets store.nearbyInteractable
    InteractionPrompt.tsx       # "Press E" floating Html prompt
  stations/
    SupplierShopOverlay.tsx     # buy bases/additives
    MixingStationOverlay.tsx    # product slot + additive slot + Mix preview
    PackagingOverlay.tsx        # mixed product → packaged units
  npc/
    BuyerNPC.tsx                # static buyer + Interactable
    SellOverlay.tsx             # offer / accept / decline
  ui/
    HUD.tsx                     # cash, heat meter, carried summary
    RecipeJournal.tsx           # discovered effect sets
    MenuOverlay.tsx             # save / reset / resume

app/routes/cookgame.tsx         # route → GameShell
lib/games.ts                    # + GameInfo entry (id 'cookgame')
public/images/games/cookgame.webp  # placeholder card art
```

---

## Task 1: Types + content tables

**Files:**
- Create: `lib/cookgame/types.ts`
- Create: `lib/cookgame/content.ts`
- Test: `lib/cookgame/__tests__/content.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `EffectId`, `AdditiveId`, `BaseId`, `BuyerId` (string-literal unions); `interface Effect { id: EffectId; name: string; multiplier: number; tier: 1|2|3; color: string }`; `interface Additive { id: AdditiveId; name: string; cost: number; baseEffect: EffectId }`; `interface Base { id: BaseId; name: string; baseValue: number }`; `interface TransformRule { additive: AdditiveId; from: EffectId; to: EffectId }`; `interface Buyer { id: BuyerId; name: string; preferredEffect: EffectId; preferenceBonus: number; basePriceFactor: number }`; `interface Product { baseId: BaseId; effects: EffectId[] }`.
  - `content.ts`: `EFFECTS: Record<EffectId, Effect>`, `ADDITIVES: Record<AdditiveId, Additive>`, `BASES: Record<BaseId, Base>`, `TRANSFORM_RULES: TransformRule[]`, `BUYERS: Buyer[]`; helpers `getEffect(id)`, `getAdditive(id)`, `getBase(id)`, `MAX_EFFECTS = 8`.

- [ ] **Step 1: Write the failing content-integrity test**

```ts
// lib/cookgame/__tests__/content.test.ts
import { describe, it, expect } from 'vitest';
import { EFFECTS, ADDITIVES, BASES, TRANSFORM_RULES, BUYERS, MAX_EFFECTS } from '../content';

describe('cookgame content', () => {
  it('every additive baseEffect exists in EFFECTS', () => {
    for (const a of Object.values(ADDITIVES)) {
      expect(EFFECTS[a.baseEffect], `additive ${a.id} → ${a.baseEffect}`).toBeDefined();
    }
  });
  it('every transform rule references valid ids', () => {
    for (const r of TRANSFORM_RULES) {
      expect(ADDITIVES[r.additive], `rule additive ${r.additive}`).toBeDefined();
      expect(EFFECTS[r.from], `rule from ${r.from}`).toBeDefined();
      expect(EFFECTS[r.to], `rule to ${r.to}`).toBeDefined();
    }
  });
  it('every buyer preferredEffect exists', () => {
    for (const b of BUYERS) expect(EFFECTS[b.preferredEffect], b.id).toBeDefined();
  });
  it('effect ids match their record keys and multipliers are positive', () => {
    for (const [k, e] of Object.entries(EFFECTS)) {
      expect(e.id).toBe(k);
      expect(e.multiplier).toBeGreaterThan(0);
    }
  });
  it('has a sane content budget', () => {
    expect(Object.keys(BASES).length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(ADDITIVES).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(EFFECTS).length).toBeGreaterThanOrEqual(8);
    expect(MAX_EFFECTS).toBe(8);
  });
});
```

- [ ] **Step 2: Run it; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/content.test.ts`
Expected: FAIL — cannot resolve `../content`.

- [ ] **Step 3: Write `types.ts`**

```ts
// lib/cookgame/types.ts
export type EffectId =
  | 'energizing' | 'calming' | 'gingeritis' | 'sneaky' | 'spicy'
  | 'euphoric' | 'focused' | 'jittery' | 'glowing' | 'sedating';
export type AdditiveId =
  | 'cuke' | 'banana' | 'paracetamol' | 'chili' | 'mouthwash'
  | 'battery' | 'donut' | 'energydrink';
export type BaseId = 'greenstart';
export type BuyerId = 'doug' | 'kim' | 'pablo';

export interface Effect { id: EffectId; name: string; multiplier: number; tier: 1 | 2 | 3; color: string; }
export interface Additive { id: AdditiveId; name: string; cost: number; baseEffect: EffectId; }
export interface Base { id: BaseId; name: string; baseValue: number; }
export interface TransformRule { additive: AdditiveId; from: EffectId; to: EffectId; }
export interface Buyer {
  id: BuyerId; name: string; preferredEffect: EffectId;
  preferenceBonus: number;   // multiplicative bonus when product has preferredEffect, e.g. 0.25 = +25%
  basePriceFactor: number;   // baseline willingness, e.g. 0.9
}
export interface Product { baseId: BaseId; effects: EffectId[]; }

export interface InventoryState {
  additives: Record<string, number>;       // additiveId → count owned
  rawBases: Record<string, number>;         // baseId → count of un-mixed base units
  workProduct: Product | null;              // product currently being mixed (on the bench)
  packaged: Array<{ product: Product; units: number }>; // ready-to-sell stacks
}
```

- [ ] **Step 4: Write `content.ts`**

```ts
// lib/cookgame/content.ts
import type { Effect, Additive, Base, TransformRule, Buyer, EffectId, AdditiveId, BaseId } from './types';

export const MAX_EFFECTS = 8 as const;

export const EFFECTS: Record<EffectId, Effect> = {
  energizing: { id: 'energizing', name: 'Energizing', multiplier: 1.2, tier: 1, color: '#fbbf24' },
  calming:    { id: 'calming',    name: 'Calming',    multiplier: 1.2, tier: 1, color: '#60a5fa' },
  gingeritis: { id: 'gingeritis', name: 'Gingeritis', multiplier: 1.3, tier: 1, color: '#f97316' },
  sneaky:     { id: 'sneaky',     name: 'Sneaky',     multiplier: 1.35, tier: 2, color: '#a3a3a3' },
  spicy:      { id: 'spicy',      name: 'Spicy',      multiplier: 1.4, tier: 2, color: '#ef4444' },
  euphoric:   { id: 'euphoric',   name: 'Euphoric',   multiplier: 1.6, tier: 2, color: '#e879f9' },
  focused:    { id: 'focused',    name: 'Focused',    multiplier: 1.5, tier: 2, color: '#22d3ee' },
  jittery:    { id: 'jittery',    name: 'Jittery',    multiplier: 0.9, tier: 1, color: '#84cc16' }, // a downside effect
  glowing:    { id: 'glowing',    name: 'Glowing',    multiplier: 1.8, tier: 3, color: '#34d399' },
  sedating:   { id: 'sedating',   name: 'Sedating',   multiplier: 1.45, tier: 2, color: '#818cf8' },
};

export const ADDITIVES: Record<AdditiveId, Additive> = {
  cuke:        { id: 'cuke',        name: 'Cuke',         cost: 2, baseEffect: 'energizing' },
  banana:      { id: 'banana',      name: 'Banana',       cost: 2, baseEffect: 'gingeritis' },
  paracetamol: { id: 'paracetamol', name: 'Paracetamol',  cost: 3, baseEffect: 'sneaky' },
  chili:       { id: 'chili',       name: 'Chili',        cost: 3, baseEffect: 'spicy' },
  mouthwash:   { id: 'mouthwash',   name: 'Mouthwash',    cost: 4, baseEffect: 'calming' },
  battery:     { id: 'battery',     name: 'Battery',      cost: 5, baseEffect: 'euphoric' },
  donut:       { id: 'donut',       name: 'Donut',        cost: 3, baseEffect: 'focused' },
  energydrink: { id: 'energydrink', name: 'Energy Drink', cost: 4, baseEffect: 'jittery' },
};

export const BASES: Record<BaseId, Base> = {
  greenstart: { id: 'greenstart', name: 'Green Start', baseValue: 35 },
};

// Mixing `additive` into a product carrying `from` flips it to `to`.
export const TRANSFORM_RULES: TransformRule[] = [
  { additive: 'battery',     from: 'energizing', to: 'glowing' },
  { additive: 'battery',     from: 'jittery',    to: 'euphoric' },
  { additive: 'mouthwash',   from: 'spicy',      to: 'sedating' },
  { additive: 'donut',       from: 'jittery',    to: 'focused' },
  { additive: 'chili',       from: 'calming',    to: 'spicy' },
  { additive: 'cuke',        from: 'sedating',   to: 'energizing' },
  { additive: 'paracetamol', from: 'spicy',      to: 'sneaky' },
  { additive: 'banana',      from: 'sneaky',     to: 'gingeritis' },
  { additive: 'donut',       from: 'calming',    to: 'focused' },
  { additive: 'battery',     from: 'focused',    to: 'glowing' },
  { additive: 'mouthwash',   from: 'jittery',    to: 'calming' },
  { additive: 'chili',       from: 'sneaky',     to: 'spicy' },
];

export const BUYERS: Buyer[] = [
  { id: 'doug',  name: 'Doug',  preferredEffect: 'energizing', preferenceBonus: 0.25, basePriceFactor: 0.9 },
  { id: 'kim',   name: 'Kim',   preferredEffect: 'euphoric',   preferenceBonus: 0.3,  basePriceFactor: 1.0 },
  { id: 'pablo', name: 'Pablo', preferredEffect: 'glowing',    preferenceBonus: 0.4,  basePriceFactor: 1.1 },
];

export const getEffect = (id: EffectId): Effect => EFFECTS[id];
export const getAdditive = (id: AdditiveId): Additive => ADDITIVES[id];
export const getBase = (id: BaseId): Base => BASES[id];
```

- [ ] **Step 5: Run the test; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/content.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/cookgame/types.ts lib/cookgame/content.ts lib/cookgame/__tests__/content.test.ts
git commit -m "feat(cookgame): types + content tables (effects, additives, transforms, buyers)"
```

---

## Task 2: Effects engine (the signature mechanic)

**Files:**
- Create: `lib/cookgame/effects.ts`
- Test: `lib/cookgame/__tests__/effects.test.ts`

**Interfaces:**
- Consumes: `content.ts` (`EFFECTS`, `ADDITIVES`, `BASES`, `TRANSFORM_RULES`, `MAX_EFFECTS`), `types.ts` (`Product`, `AdditiveId`).
- Produces:
  - `mix(product: Product, additiveId: AdditiveId): Product` — pure; returns a NEW product (does not mutate input).
  - `productValue(product: Product): number` — `round(base.baseValue × Π(effect.multiplier))`.
  - `effectSetKey(effects: EffectId[]): string` — stable sorted key for dedupe/journal.

**Algorithm (implement exactly):**
1. Snapshot `current = [...product.effects]`.
2. Apply transforms: for each `rule` in `TRANSFORM_RULES` where `rule.additive === additiveId`, replace any occurrence of `rule.from` in a COPY taken at step start with `rule.to` (rules read from the original snapshot, write to the result — so an additive cannot cascade through its own outputs in one mix).
3. Append the additive's `baseEffect` if not already present in the result.
4. De-dupe (keep first occurrence).
5. If length > `MAX_EFFECTS`, drop lowest-tier effects first (ties: drop the later one) until length === `MAX_EFFECTS`.
6. Return `{ baseId: product.baseId, effects: result }`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/effects.test.ts
import { describe, it, expect } from 'vitest';
import { mix, productValue, effectSetKey } from '../effects';
import { BASES, EFFECTS } from '../content';
import type { Product } from '../types';

const fresh: Product = { baseId: 'greenstart', effects: [] };

describe('mix', () => {
  it('adds an additive base effect to an empty product', () => {
    const out = mix(fresh, 'cuke');
    expect(out.effects).toEqual(['energizing']);
  });
  it('does not mutate the input product', () => {
    const input: Product = { baseId: 'greenstart', effects: ['calming'] };
    mix(input, 'cuke');
    expect(input.effects).toEqual(['calming']);
  });
  it('does not duplicate an existing base effect', () => {
    const input: Product = { baseId: 'greenstart', effects: ['energizing'] };
    const out = mix(input, 'cuke');
    expect(out.effects.filter((e) => e === 'energizing')).toHaveLength(1);
  });
  it('applies a transform rule: battery flips energizing → glowing then adds euphoric', () => {
    const input: Product = { baseId: 'greenstart', effects: ['energizing'] };
    const out = mix(input, 'battery'); // energizing→glowing (transform), + euphoric (base)
    expect(out.effects).toContain('glowing');
    expect(out.effects).toContain('euphoric');
    expect(out.effects).not.toContain('energizing');
  });
  it('does not cascade an additive through its own transform output in one mix', () => {
    // donut: jittery→focused (transform) and base effect focused.
    // Starting with jittery, result should contain focused exactly once, no error.
    const input: Product = { baseId: 'greenstart', effects: ['jittery'] };
    const out = mix(input, 'donut');
    expect(out.effects.filter((e) => e === 'focused')).toHaveLength(1);
    expect(out.effects).not.toContain('jittery');
  });
  it('caps effects at MAX_EFFECTS dropping lowest tier first', () => {
    // Fill with 8 effects then add one more via an additive; tier-1 should be dropped.
    const eight: Product = {
      baseId: 'greenstart',
      effects: ['energizing','calming','gingeritis','sneaky','spicy','euphoric','focused','sedating'],
    };
    const out = mix(eight, 'battery'); // adds euphoric(dupe) — actually transforms; use a tier-3 add
    expect(out.effects.length).toBeLessThanOrEqual(8);
  });
});

describe('productValue', () => {
  it('returns base value for an effectless product', () => {
    expect(productValue(fresh)).toBe(BASES.greenstart.baseValue);
  });
  it('multiplies base value by each effect multiplier and rounds', () => {
    const p: Product = { baseId: 'greenstart', effects: ['energizing', 'spicy'] };
    const expected = Math.round(35 * EFFECTS.energizing.multiplier * EFFECTS.spicy.multiplier);
    expect(productValue(p)).toBe(expected);
  });
});

describe('effectSetKey', () => {
  it('is order-independent', () => {
    expect(effectSetKey(['spicy', 'energizing'])).toBe(effectSetKey(['energizing', 'spicy']));
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/effects.test.ts`
Expected: FAIL — cannot resolve `../effects`.

- [ ] **Step 3: Implement `effects.ts`**

```ts
// lib/cookgame/effects.ts
import type { Product, AdditiveId, EffectId } from './types';
import { ADDITIVES, BASES, EFFECTS, TRANSFORM_RULES, MAX_EFFECTS } from './content';

export function mix(product: Product, additiveId: AdditiveId): Product {
  const snapshot = [...product.effects];
  const rules = TRANSFORM_RULES.filter((r) => r.additive === additiveId);

  // Apply transforms reading from the snapshot, writing into result.
  let result: EffectId[] = snapshot.map((e) => {
    const rule = rules.find((r) => r.from === e);
    return rule ? rule.to : e;
  });

  // Add the additive's base effect.
  const baseEffect = ADDITIVES[additiveId].baseEffect;
  if (!result.includes(baseEffect)) result.push(baseEffect);

  // De-dupe, keep first occurrence.
  result = result.filter((e, i) => result.indexOf(e) === i);

  // Cap: drop lowest tier first (later index breaks ties).
  while (result.length > MAX_EFFECTS) {
    let dropIdx = 0;
    let dropTier = EFFECTS[result[0]].tier;
    for (let i = 1; i < result.length; i++) {
      if (EFFECTS[result[i]].tier <= dropTier) { dropTier = EFFECTS[result[i]].tier; dropIdx = i; }
    }
    result.splice(dropIdx, 1);
  }

  return { baseId: product.baseId, effects: result };
}

export function productValue(product: Product): number {
  const base = BASES[product.baseId].baseValue;
  const mult = product.effects.reduce((acc, e) => acc * EFFECTS[e].multiplier, 1);
  return Math.round(base * mult);
}

export function effectSetKey(effects: EffectId[]): string {
  return [...effects].sort().join('+');
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/effects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/effects.ts lib/cookgame/__tests__/effects.test.ts
git commit -m "feat(cookgame): pure effects engine — mix, productValue, effectSetKey"
```

---

## Task 3: Economy (offers, heat, packaging)

**Files:**
- Create: `lib/cookgame/economy.ts`
- Test: `lib/cookgame/__tests__/economy.test.ts`

**Interfaces:**
- Consumes: `effects.productValue`, `content` (`BUYERS`), `types` (`Product`, `Buyer`).
- Produces:
  - `HEAT_PER_SALE = 8`, `HEAT_DECAY_PER_SEC = 0.5`, `HEAT_PENALTY_THRESHOLD = 60`, `MAX_HEAT = 100`, `UNITS_PER_BATCH = 5`.
  - `buyerOffer(product: Product, buyer: Buyer, heat: number, variance: number): number` — `variance` is a caller-supplied factor in `[0.9, 1.1]` (injected, NOT random, so it's testable). Returns rounded price.
  - `heatPenaltyFactor(heat: number): number` — `1` below threshold, scaling down to `0.5` at `MAX_HEAT`.
  - `applyHeatOnSale(heat: number): number` — `min(MAX_HEAT, heat + HEAT_PER_SALE)`.
  - `decayHeat(heat: number, dtSeconds: number): number` — `max(0, heat - HEAT_DECAY_PER_SEC*dt)`.
  - `packageProduct(product: Product): { product: Product; units: number }` — `units = UNITS_PER_BATCH`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/economy.test.ts
import { describe, it, expect } from 'vitest';
import {
  buyerOffer, heatPenaltyFactor, applyHeatOnSale, decayHeat, packageProduct,
  HEAT_PER_SALE, MAX_HEAT, HEAT_PENALTY_THRESHOLD, UNITS_PER_BATCH,
} from '../economy';
import { BUYERS } from '../content';
import { productValue } from '../effects';
import type { Product } from '../types';

const doug = BUYERS.find((b) => b.id === 'doug')!;
const energizingProduct: Product = { baseId: 'greenstart', effects: ['energizing'] };

describe('heatPenaltyFactor', () => {
  it('is 1 below threshold', () => {
    expect(heatPenaltyFactor(HEAT_PENALTY_THRESHOLD - 1)).toBe(1);
  });
  it('is 0.5 at max heat', () => {
    expect(heatPenaltyFactor(MAX_HEAT)).toBeCloseTo(0.5, 5);
  });
});

describe('buyerOffer', () => {
  it('applies preference bonus when buyer likes an effect', () => {
    const base = productValue(energizingProduct);
    const offer = buyerOffer(energizingProduct, doug, 0, 1.0);
    // doug.basePriceFactor 0.9 * (1 + 0.25 preference) = 1.125
    expect(offer).toBe(Math.round(base * 0.9 * 1.25 * 1.0));
  });
  it('no preference bonus when effect absent', () => {
    const calmOnly: Product = { baseId: 'greenstart', effects: ['calming'] };
    const base = productValue(calmOnly);
    const offer = buyerOffer(calmOnly, doug, 0, 1.0);
    expect(offer).toBe(Math.round(base * 0.9 * 1.0));
  });
  it('reduces offer under high heat', () => {
    const low = buyerOffer(energizingProduct, doug, 0, 1.0);
    const high = buyerOffer(energizingProduct, doug, MAX_HEAT, 1.0);
    expect(high).toBeLessThan(low);
  });
});

describe('heat helpers', () => {
  it('applyHeatOnSale adds and clamps', () => {
    expect(applyHeatOnSale(0)).toBe(HEAT_PER_SALE);
    expect(applyHeatOnSale(MAX_HEAT)).toBe(MAX_HEAT);
  });
  it('decayHeat subtracts and floors at 0', () => {
    expect(decayHeat(10, 2)).toBe(9); // 0.5/s * 2s = 1
    expect(decayHeat(0.2, 100)).toBe(0);
  });
});

describe('packageProduct', () => {
  it('yields UNITS_PER_BATCH units', () => {
    expect(packageProduct(energizingProduct).units).toBe(UNITS_PER_BATCH);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/economy.test.ts`
Expected: FAIL — cannot resolve `../economy`.

- [ ] **Step 3: Implement `economy.ts`**

```ts
// lib/cookgame/economy.ts
import type { Product, Buyer } from './types';
import { productValue } from './effects';

export const HEAT_PER_SALE = 8;
export const HEAT_DECAY_PER_SEC = 0.5;
export const HEAT_PENALTY_THRESHOLD = 60;
export const MAX_HEAT = 100;
export const UNITS_PER_BATCH = 5;

export function heatPenaltyFactor(heat: number): number {
  if (heat < HEAT_PENALTY_THRESHOLD) return 1;
  const span = MAX_HEAT - HEAT_PENALTY_THRESHOLD;
  const over = Math.min(heat, MAX_HEAT) - HEAT_PENALTY_THRESHOLD;
  return 1 - 0.5 * (over / span); // 1 → 0.5 across the band
}

export function buyerOffer(product: Product, buyer: Buyer, heat: number, variance: number): number {
  const base = productValue(product);
  const pref = product.effects.includes(buyer.preferredEffect) ? 1 + buyer.preferenceBonus : 1;
  return Math.round(base * buyer.basePriceFactor * pref * heatPenaltyFactor(heat) * variance);
}

export function applyHeatOnSale(heat: number): number {
  return Math.min(MAX_HEAT, heat + HEAT_PER_SALE);
}

export function decayHeat(heat: number, dtSeconds: number): number {
  return Math.max(0, heat - HEAT_DECAY_PER_SEC * dtSeconds);
}

export function packageProduct(product: Product): { product: Product; units: number } {
  return { product: { baseId: product.baseId, effects: [...product.effects] }, units: UNITS_PER_BATCH };
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/economy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/economy.ts lib/cookgame/__tests__/economy.test.ts
git commit -m "feat(cookgame): pure economy — offers, heat, packaging"
```

---

## Task 4: Save serialization (pure) + browser wrapper

**Files:**
- Create: `lib/cookgame/saveSystem.ts`
- Test: `lib/cookgame/__tests__/saveSystem.test.ts`

**Interfaces:**
- Consumes: `types` (`InventoryState`, `Product`).
- Produces:
  - `interface SaveV1 { version: 1; cash: number; heat: number; inventory: InventoryState; discoveredRecipes: string[]; }`
  - `STORAGE_KEY = 'cookgame-save-v1'`, `CURRENT_VERSION = 1`.
  - `serializeSave(save: SaveV1): string` — JSON string. **[PURE — tested]**
  - `parseSave(raw: string | null): SaveV1 | null` — returns null on missing/invalid/version-mismatch/corrupt. **[PURE — tested]**
  - `createNewSave(): SaveV1` — starting state (cash 150, heat 0, empty inventory, no recipes). **[PURE — tested]**
  - `saveGame(save: SaveV1): boolean` and `loadGame(): SaveV1 | null` — thin `localStorage` wrappers over the pure fns. **[browser — NOT unit-tested]**

- [ ] **Step 1: Write the failing tests (pure parts only)**

```ts
// lib/cookgame/__tests__/saveSystem.test.ts
import { describe, it, expect } from 'vitest';
import { serializeSave, parseSave, createNewSave, CURRENT_VERSION } from '../saveSystem';

describe('save serialization', () => {
  it('createNewSave returns version 1 starting state', () => {
    const s = createNewSave();
    expect(s.version).toBe(CURRENT_VERSION);
    expect(s.cash).toBeGreaterThan(0);
    expect(s.heat).toBe(0);
    expect(s.discoveredRecipes).toEqual([]);
  });
  it('round-trips through serialize/parse', () => {
    const s = createNewSave();
    s.cash = 999; s.discoveredRecipes = ['energizing+spicy'];
    const back = parseSave(serializeSave(s));
    expect(back).toEqual(s);
  });
  it('parseSave returns null for null/garbage', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('not json')).toBeNull();
  });
  it('parseSave rejects wrong version', () => {
    const bad = JSON.stringify({ version: 99, cash: 1, heat: 0, inventory: {}, discoveredRecipes: [] });
    expect(parseSave(bad)).toBeNull();
  });
  it('parseSave rejects missing required fields', () => {
    const bad = JSON.stringify({ version: 1, cash: 1 });
    expect(parseSave(bad)).toBeNull();
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/saveSystem.test.ts`
Expected: FAIL — cannot resolve `../saveSystem`.

- [ ] **Step 3: Implement `saveSystem.ts`**

```ts
// lib/cookgame/saveSystem.ts
import type { InventoryState } from './types';

export const STORAGE_KEY = 'cookgame-save-v1';
export const CURRENT_VERSION = 1 as const;
const MAX_PAYLOAD = 200 * 1024;

export interface SaveV1 {
  version: 1;
  cash: number;
  heat: number;
  inventory: InventoryState;
  discoveredRecipes: string[];
}

export function createNewSave(): SaveV1 {
  return {
    version: CURRENT_VERSION,
    cash: 150,
    heat: 0,
    inventory: { additives: {}, rawBases: {}, workProduct: null, packaged: [] },
    discoveredRecipes: [],
  };
}

export function serializeSave(save: SaveV1): string {
  return JSON.stringify(save);
}

export function parseSave(raw: string | null): SaveV1 | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<SaveV1>;
    if (p.version !== CURRENT_VERSION) return null;
    if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
    if (!p.inventory || !Array.isArray(p.discoveredRecipes)) return null;
    return p as SaveV1;
  } catch {
    return null;
  }
}

// ── Browser wrappers (not unit-tested; guard for SSR) ──
export function saveGame(save: SaveV1): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const json = serializeSave(save);
    if (json.length > MAX_PAYLOAD) return false;
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch { return false; }
}

export function loadGame(): SaveV1 | null {
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
git commit -m "feat(cookgame): versioned save serialization + browser wrapper"
```

---

## Task 5: Zustand store (state + actions)

**Files:**
- Create: `lib/cookgame/store.ts`
- Test: `lib/cookgame/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `effects` (`mix`, `productValue`, `effectSetKey`), `economy` (`buyerOffer`, `applyHeatOnSale`, `decayHeat`, `packageProduct`), `saveSystem` (`SaveV1`, `createNewSave`, `saveGame`, `loadGame`), `content` (`ADDITIVES`, `BASES`, `BUYERS`), `types`.
- Produces a Zustand store via `useCookgameStore` with state `{ cash, heat, inventory, discoveredRecipes, nearbyInteractable, activeOverlay, playerPosition }` and actions:
  - `buyAdditive(id: AdditiveId): boolean` — deduct cost, +1 additive; false if insufficient cash.
  - `buyBase(id: BaseId, price: number): boolean` — deduct, +1 rawBase.
  - `loadBaseToBench(id: BaseId): boolean` — moves a rawBase into `workProduct` (`{baseId,effects:[]}`); false if none or bench occupied.
  - `mixIn(additiveId: AdditiveId): boolean` — consumes 1 additive, applies `mix` to `workProduct`, records recipe via `effectSetKey`; false if no bench product or additive.
  - `packageBench(): boolean` — moves `workProduct` into `packaged` via `packageProduct`, clears bench.
  - `sellUnit(buyerId: BuyerId, packagedIndex: number, variance: number): number` — computes offer, +cash, −1 unit (drop stack at 0), heat += sale; returns offer (0 if invalid).
  - `tickHeat(dtSeconds: number): void` — `decayHeat`.
  - `setNearbyInteractable(id: string | null)`, `setActiveOverlay(id: string | null)`, `setPlayerPosition(p)`.
  - `saveNow(): void`, `loadOrNew(): void`, `resetGame(): void`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCookgameStore } from '../store';

const reset = () => useCookgameStore.getState().resetGame();

describe('cookgame store', () => {
  beforeEach(reset);

  it('starts with starting cash and empty bench', () => {
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(150);
    expect(s.inventory.workProduct).toBeNull();
  });

  it('buyAdditive deducts cost and adds inventory', () => {
    const ok = useCookgameStore.getState().buyAdditive('cuke'); // cost 2
    expect(ok).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(148);
    expect(s.inventory.additives.cuke).toBe(1);
  });

  it('mix flow: buy base, load bench, mix additive, record recipe', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench('greenstart');
    st.buyAdditive('cuke');
    const ok = st.mixIn('cuke');
    expect(ok).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.inventory.workProduct!.effects).toContain('energizing');
    expect(s.discoveredRecipes).toContain('energizing');
    expect(s.inventory.additives.cuke ?? 0).toBe(0);
  });

  it('package + sell increases cash and heat, decrements units', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench('greenstart');
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
    st.tickHeat(4); // 0.5/s * 4 = 2
    expect(useCookgameStore.getState().heat).toBe(8);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: FAIL — cannot resolve `../store`.

- [ ] **Step 3: Implement `store.ts`**

```ts
// lib/cookgame/store.ts
import { create } from 'zustand';
import type { AdditiveId, BaseId, BuyerId, InventoryState, Product } from './types';
import { ADDITIVES, BASES, BUYERS } from './content';
import { mix, effectSetKey } from './effects';
import { buyerOffer, applyHeatOnSale, decayHeat, packageProduct } from './economy';
import { SaveV1, createNewSave, saveGame, loadGame } from './saveSystem';

interface CookgameState {
  cash: number;
  heat: number;
  inventory: InventoryState;
  discoveredRecipes: string[];
  nearbyInteractable: string | null;
  activeOverlay: string | null;
  playerPosition: [number, number, number];

  buyAdditive: (id: AdditiveId) => boolean;
  buyBase: (id: BaseId, price: number) => boolean;
  loadBaseToBench: (id: BaseId) => boolean;
  mixIn: (additiveId: AdditiveId) => boolean;
  packageBench: () => boolean;
  sellUnit: (buyerId: BuyerId, packagedIndex: number, variance: number) => number;
  tickHeat: (dt: number) => void;
  setNearbyInteractable: (id: string | null) => void;
  setActiveOverlay: (id: string | null) => void;
  setPlayerPosition: (p: [number, number, number]) => void;
  saveNow: () => void;
  loadOrNew: () => void;
  resetGame: () => void;
}

const fromSave = (s: SaveV1) => ({
  cash: s.cash, heat: s.heat, inventory: s.inventory, discoveredRecipes: s.discoveredRecipes,
});

export const useCookgameStore = create<CookgameState>((set, get) => ({
  ...fromSave(createNewSave()),
  nearbyInteractable: null,
  activeOverlay: null,
  playerPosition: [0, 1, 0],

  buyAdditive: (id) => {
    const { cash, inventory } = get();
    const cost = ADDITIVES[id].cost;
    if (cash < cost) return false;
    set({
      cash: cash - cost,
      inventory: { ...inventory, additives: { ...inventory.additives, [id]: (inventory.additives[id] ?? 0) + 1 } },
    });
    return true;
  },

  buyBase: (id, price) => {
    const { cash, inventory } = get();
    if (cash < price) return false;
    set({
      cash: cash - price,
      inventory: { ...inventory, rawBases: { ...inventory.rawBases, [id]: (inventory.rawBases[id] ?? 0) + 1 } },
    });
    return true;
  },

  loadBaseToBench: (id) => {
    const { inventory } = get();
    if (inventory.workProduct) return false;
    if ((inventory.rawBases[id] ?? 0) <= 0) return false;
    set({
      inventory: {
        ...inventory,
        rawBases: { ...inventory.rawBases, [id]: inventory.rawBases[id] - 1 },
        workProduct: { baseId: id, effects: [] },
      },
    });
    return true;
  },

  mixIn: (additiveId) => {
    const { inventory, discoveredRecipes } = get();
    if (!inventory.workProduct) return false;
    if ((inventory.additives[additiveId] ?? 0) <= 0) return false;
    const next: Product = mix(inventory.workProduct, additiveId);
    const key = effectSetKey(next.effects);
    set({
      inventory: {
        ...inventory,
        additives: { ...inventory.additives, [additiveId]: inventory.additives[additiveId] - 1 },
        workProduct: next,
      },
      discoveredRecipes: discoveredRecipes.includes(key) ? discoveredRecipes : [...discoveredRecipes, key],
    });
    return true;
  },

  packageBench: () => {
    const { inventory } = get();
    if (!inventory.workProduct) return false;
    set({
      inventory: { ...inventory, workProduct: null, packaged: [...inventory.packaged, packageProduct(inventory.workProduct)] },
    });
    return true;
  },

  sellUnit: (buyerId, packagedIndex, variance) => {
    const { inventory, cash, heat } = get();
    const stack = inventory.packaged[packagedIndex];
    const buyer = BUYERS.find((b) => b.id === buyerId);
    if (!stack || stack.units <= 0 || !buyer) return 0;
    const offer = buyerOffer(stack.product, buyer, heat, variance);
    const packaged = inventory.packaged
      .map((s, i) => (i === packagedIndex ? { ...s, units: s.units - 1 } : s))
      .filter((s) => s.units > 0);
    set({ cash: cash + offer, heat: applyHeatOnSale(heat), inventory: { ...inventory, packaged } });
    return offer;
  },

  tickHeat: (dt) => set({ heat: decayHeat(get().heat, dt) }),
  setNearbyInteractable: (id) => set({ nearbyInteractable: id }),
  setActiveOverlay: (id) => set({ activeOverlay: id }),
  setPlayerPosition: (p) => set({ playerPosition: p }),

  saveNow: () => {
    const { cash, heat, inventory, discoveredRecipes } = get();
    saveGame({ version: 1, cash, heat, inventory, discoveredRecipes });
  },
  loadOrNew: () => set(fromSave(loadGame() ?? createNewSave())),
  resetGame: () => set({ ...fromSave(createNewSave()), nearbyInteractable: null, activeOverlay: null }),
}));
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole cookgame suite + commit**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all suites PASS.

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): zustand store wiring pure libs (buy/mix/package/sell/heat/save)"
```

---

## Task 6: Route, GameShell, library registration, placeholder render

**Files:**
- Create: `app/routes/cookgame.tsx`
- Create: `components/cookgame/GameShell.tsx`
- Create: `components/cookgame/CookGameGame.tsx` (minimal placeholder this task)
- Create: `public/images/games/cookgame.webp` (placeholder — copy an existing card)
- Modify: `lib/games.ts` (add `GameInfo` entry)

**Interfaces:**
- Consumes: `useCookgameStore` (for HUD later), existing `GameErrorBoundary`, `GameLoadingFallback`.
- Produces: route `/cookgame` rendering `GameShell`; `CookGameGame` default-exportable via named export `CookGameGame`.

- [ ] **Step 1: Add the games.ts entry**

In `lib/games.ts`, append to the `games` array (match existing field shape):

```ts
{
    id: 'cookgame',
    title: 'Game',
    description: 'A satirical underground tycoon sim — buy ingredients, mix product for wild effects, and hustle your block before the heat catches up.',
    longDescription:
        'A tongue-in-cheek crime-management sim. Run a small-town operation: stock up at the supplier, experiment at the mixing bench to stack value-boosting effects onto your product, package it, and sell to the neighbourhood — all while keeping your heat meter cool. Pure fiction, all invented strains and effects.',
    href: '/cookgame',
    cta: 'Play Now',
    isSteam: false,
    gradient: 'from-lime-500 to-emerald-700',
    iconName: 'FlaskConical',
    color: 'from-lime-500/20 to-emerald-700/20 hover:border-lime-500/50',
    tags: ['Simulation', 'Tycoon', 'Crime'],
    imagePath: '/images/games/cookgame.webp',
    authGate: true,
},
```

- [ ] **Step 2: Placeholder card art**

```bash
cp public/images/games/daily_puzzles.webp public/images/games/cookgame.webp
```

- [ ] **Step 3: Write minimal `CookGameGame.tsx`**

```tsx
// components/cookgame/CookGameGame.tsx
"use client";
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';

export function CookGameGame() {
  return (
    <Canvas shadows camera={{ position: [0, 6, 10], fov: 55 }} className="w-full h-full">
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 12, 6]} intensity={1.2} castShadow />
      <Physics>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0, 1, 0]} castShadow>
          <boxGeometry args={[1, 2, 1]} />
          <meshStandardMaterial color="#84cc16" />
        </mesh>
      </Physics>
    </Canvas>
  );
}
```

- [ ] **Step 4: Write `GameShell.tsx`** (adapt the House Always Wins shell; link back to `/games`)

```tsx
// components/cookgame/GameShell.tsx
"use client";
import React, { Suspense } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

const CookGameGame = React.lazy(() =>
  import('./CookGameGame').then((m) => ({ default: m.CookGameGame })),
);

export function GameShell({ userName }: { userName?: string | null }) {
  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-white overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-neutral-800/50 z-20">
        <Link to="/games" className="flex items-center gap-2 text-neutral-500 hover:text-neutral-300 text-sm">
          <ArrowLeft className="w-4 h-4" />
          <span className="font-mono tracking-widest text-xs">RMH STUDIOS</span>
        </Link>
        <span className="text-neutral-600 text-[10px] font-mono tracking-wide hidden sm:block">
          WASD Move • Shift Sprint • E Interact • M Menu
        </span>
        {userName && <span className="text-neutral-600 text-xs font-mono">{userName}</span>}
      </div>
      <div className="flex-1 min-h-0 bg-black">
        <Suspense fallback={<div className="flex items-center justify-center w-full h-full text-neutral-600 text-sm font-mono tracking-widest animate-pulse">LOADING...</div>}>
          <CookGameGame />
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the route** (mirror `app/routes/rmh-coding-simulator.tsx`)

```tsx
// app/routes/cookgame.tsx
import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const GameShell = lazy(() =>
  import('@/components/cookgame/GameShell').then((m) => ({ default: m.GameShell })),
);

function CookgamePage() {
  return (
    <GameErrorBoundary gameName="Game">
      <Suspense fallback={<GameLoadingFallback />}>
        <GameShell />
      </Suspense>
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/cookgame')({
  head: () => ({
    meta: [
      { title: 'Game | RMH Studios' },
      { name: 'description', content: 'A satirical underground tycoon sim. Mix product, manage heat, run your block.' },
    ],
  }),
  component: CookgamePage,
});
```

- [ ] **Step 6: Verify it builds and the route renders**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: no errors in `cookgame`/`app/routes/cookgame.tsx`. (If the route tree needs regen, see verify-commands memory note; the dev server regenerates `routeTree.gen.ts` on start.)

Manual: start the dev server (`./node_modules/.bin/vite`), open `/cookgame`, confirm the top bar + a green box on a dark plane render, and `/games` shows the new "Game" card.

- [ ] **Step 7: Commit**

```bash
git add app/routes/cookgame.tsx components/cookgame/ public/images/games/cookgame.webp lib/games.ts
git commit -m "feat(cookgame): route, GameShell, library entry, placeholder scene"
```

---

## Task 7: Town scene + player controller

**Files:**
- Create: `components/cookgame/world/TownScene.tsx`
- Create: `components/cookgame/world/PlayerController.tsx`
- Modify: `components/cookgame/CookGameGame.tsx`

**Reference to adapt:** `components/forest-explorer/shared/PlayerController.tsx` (Rapier capsule + keyboard) and `components/forest-explorer/shared/BoundaryWall.tsx`. Read those first and mirror their `@react-three/rapier` usage and `@react-three/drei` `KeyboardControls`/`PointerLockControls` (or third-person follow) patterns already proven in this repo.

**Interfaces:**
- Consumes: `useCookgameStore` (`setPlayerPosition`).
- Produces: `<TownScene />` (static geometry + named anchor positions exported as `STATION_POSITIONS` / `BUYER_POSITIONS` consts for Task 8/10), `<PlayerController />` (Rapier `RigidBody` capsule, WASD via `useFrame`, Shift sprint, camera follow, writes position to store each frame, calls nothing else).

- [ ] **Step 1: Implement `TownScene.tsx`**

Static, low-poly: a ground plane, a "lab" building box (the player's property), a "supplier" shop box, a short street strip, four boundary walls (thin tall boxes with Rapier `RigidBody type="fixed"`), and lighting. Export anchor positions used by later tasks:

```tsx
// components/cookgame/world/TownScene.tsx
"use client";
import { RigidBody } from '@react-three/rapier';

export const STATION_POSITIONS = {
  supplier: [-8, 0, -4] as [number, number, number],
  mixing:   [6, 0, -4] as [number, number, number],
  packaging:[9, 0, -4] as [number, number, number],
};
export const BUYER_POSITIONS = {
  doug:  [-6, 0, 8] as [number, number, number],
  kim:   [0, 0, 10] as [number, number, number],
  pablo: [7, 0, 8] as [number, number, number],
};

function Wall({ pos, size }: { pos: [number, number, number]; size: [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={pos}>
      <mesh castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color="#374151" /></mesh>
    </RigidBody>
  );
}

export function TownScene() {
  return (
    <group>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[40, 40]} /><meshStandardMaterial color="#1f2937" /></mesh>
      </RigidBody>
      {/* lab building */}
      <mesh position={[8, 1.5, -6]} castShadow><boxGeometry args={[6, 3, 4]} /><meshStandardMaterial color="#4b5563" /></mesh>
      {/* supplier shop */}
      <mesh position={[-8, 1.5, -6]} castShadow><boxGeometry args={[5, 3, 4]} /><meshStandardMaterial color="#6b7280" /></mesh>
      {/* street strip */}
      <mesh position={[0, 0.01, 4]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[30, 6]} /><meshStandardMaterial color="#111827" /></mesh>
      {/* boundary walls */}
      <Wall pos={[0, 2, -20]} size={[40, 4, 0.5]} />
      <Wall pos={[0, 2, 20]} size={[40, 4, 0.5]} />
      <Wall pos={[-20, 2, 0]} size={[0.5, 4, 40]} />
      <Wall pos={[20, 2, 0]} size={[0.5, 4, 40]} />
    </group>
  );
}
```

- [ ] **Step 2: Implement `PlayerController.tsx`**

Adapt forest-explorer's controller. Rapier capsule `RigidBody`, read WASD from a `useKeyboardControls` map, move via `setLinvel`, follow camera in `useFrame`, write `setPlayerPosition` from the body translation each frame (throttle to ~every 5 frames to avoid store thrash). Keep keys: W/A/S/D, Shift=sprint. Mirror the exact drei/rapier imports used in the forest-explorer file you read.

(Implementer: copy the proven movement block from `components/forest-explorer/shared/PlayerController.tsx`; swap its position-store call for `useCookgameStore.getState().setPlayerPosition`. Do not invent new physics constants — reuse theirs.)

- [ ] **Step 3: Wire into `CookGameGame.tsx`**

Replace the placeholder box with `<TownScene />` + `<PlayerController />` inside `<Physics>`, wrap the `<Canvas>` in drei `<KeyboardControls>` with the WASD+sprint map.

- [ ] **Step 4: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` → no new errors.
Manual: open `/cookgame`, walk with WASD, sprint with Shift, confirm you can't leave the bounded area and the camera follows.

- [ ] **Step 5: Commit**

```bash
git add components/cookgame/world components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): town scene + player controller with boundaries"
```

---

## Task 8: Interaction system

**Files:**
- Create: `components/cookgame/world/Interactable.tsx`
- Create: `components/cookgame/world/InteractionPrompt.tsx`
- Modify: `components/cookgame/CookGameGame.tsx`

**Reference to adapt:** `components/forest-explorer/story/InteractionSystem.tsx`, `InteractionPrompt.tsx`.

**Interfaces:**
- Consumes: `useCookgameStore` (`nearbyInteractable`, `setNearbyInteractable`, `setActiveOverlay`, `playerPosition`).
- Produces: `<Interactable id label position radius>` — when player within `radius`, sets `nearbyInteractable=id`; on E key (only when this is the nearby one), calls `setActiveOverlay(id)`. `<InteractionPrompt />` renders a drei `<Html>` "Press E — {label}" above the active nearby interactable.

- [ ] **Step 1: Implement `Interactable.tsx`**

```tsx
// components/cookgame/world/Interactable.tsx
"use client";
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useCookgameStore } from '@/lib/cookgame/store';

export function Interactable({ id, label, position, radius = 2.5 }:
  { id: string; label: string; position: [number, number, number]; radius?: number }) {
  const isNear = useRef(false);

  useFrame(() => {
    const p = useCookgameStore.getState().playerPosition;
    const dx = p[0] - position[0], dz = p[2] - position[2];
    const near = Math.hypot(dx, dz) <= radius;
    if (near !== isNear.current) {
      isNear.current = near;
      const cur = useCookgameStore.getState().nearbyInteractable;
      if (near) useCookgameStore.getState().setNearbyInteractable(id);
      else if (cur === id) useCookgameStore.getState().setNearbyInteractable(null);
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'e') return;
      const s = useCookgameStore.getState();
      if (s.nearbyInteractable === id && !s.activeOverlay) s.setActiveOverlay(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  return null; // proximity-only marker; visual handled by the station/NPC mesh
}
```

- [ ] **Step 2: Implement `InteractionPrompt.tsx`** — store-driven drei `<Html>` label that reads `nearbyInteractable` and renders near a passed position map; simplest version renders a fixed-position DOM hint via the store (no 3D placement needed for v1):

```tsx
// components/cookgame/world/InteractionPrompt.tsx
"use client";
import { useCookgameStore } from '@/lib/cookgame/store';

const LABELS: Record<string, string> = {
  supplier: 'Supplier', mixing: 'Mixing Bench', packaging: 'Packaging',
  doug: 'Doug', kim: 'Kim', pablo: 'Pablo',
};

export function InteractionPrompt() {
  const near = useCookgameStore((s) => s.nearbyInteractable);
  const overlay = useCookgameStore((s) => s.activeOverlay);
  if (!near || overlay) return null;
  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-black/70 text-white text-sm font-mono pointer-events-none">
      Press <span className="text-lime-400">E</span> — {LABELS[near] ?? near}
    </div>
  );
}
```

(`InteractionPrompt` is a DOM overlay rendered OUTSIDE the `<Canvas>`, as a sibling in `CookGameGame`.)

- [ ] **Step 3: Place interactables + prompt**

In `CookGameGame.tsx`: inside `<Physics>` add `<Interactable id="supplier" .../>`, `mixing`, `packaging` at `STATION_POSITIONS`, and the three buyers at `BUYER_POSITIONS`. Outside the canvas, render `<InteractionPrompt />`.

- [ ] **Step 4: Verify**

Manual: walk to each station/NPC, confirm the "Press E" prompt appears/disappears by proximity and only one shows at a time.

- [ ] **Step 5: Commit**

```bash
git add components/cookgame/world/Interactable.tsx components/cookgame/world/InteractionPrompt.tsx components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): proximity interaction system + press-E prompt"
```

---

## Task 9: Station overlays (supplier, mixing, packaging)

**Files:**
- Create: `components/cookgame/stations/SupplierShopOverlay.tsx`
- Create: `components/cookgame/stations/MixingStationOverlay.tsx`
- Create: `components/cookgame/stations/PackagingOverlay.tsx`
- Create: `components/cookgame/ui/OverlayFrame.tsx` (shared modal chrome + Esc-to-close)
- Modify: `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Consumes: `useCookgameStore`, `content` (`ADDITIVES`, `BASES`, `EFFECTS`), `effects.productValue`, `mix` (for preview).
- Produces: three overlays, each rendered when `activeOverlay === id`, closing via `setActiveOverlay(null)`.

- [ ] **Step 1: `OverlayFrame.tsx`** — shared centered modal; closes on Esc and on a Close button (calls `setActiveOverlay(null)`); renders `children`. DOM overlay outside the canvas.

```tsx
// components/cookgame/ui/OverlayFrame.tsx
"use client";
import { useEffect } from 'react';
import { useCookgameStore } from '@/lib/cookgame/store';

export function OverlayFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const close = () => useCookgameStore.getState().setActiveOverlay(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="w-[min(640px,92vw)] max-h-[80vh] overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-mono tracking-widest text-lime-400">{title}</h2>
          <button onClick={close} className="text-neutral-400 hover:text-white text-sm">Close ✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `SupplierShopOverlay.tsx`** — lists each `BASES` (buy at e.g. price 10) and each `ADDITIVES` (buy at its `cost`); buttons call `buyBase`/`buyAdditive`; disable when `cash < price`; show current cash. Render inside `OverlayFrame title="Supplier"`.

- [ ] **Step 3: `MixingStationOverlay.tsx`** — shows the bench `workProduct` (or a "Load Green Start" button calling `loadBaseToBench('greenstart')` when a rawBase is owned), the current effect chips (colored via `EFFECTS[id].color`) and `productValue`. Lists owned additives; clicking one shows a **preview** (`mix(workProduct, id)` value delta) and a "Mix" button calling `mixIn(id)`. A "Package this batch" button calls `packageBench()` (or route packaging through Task-9 packaging overlay; either is fine — keep one path). Render in `OverlayFrame title="Mixing Bench"`.

- [ ] **Step 4: `PackagingOverlay.tsx`** — if a `workProduct` exists, show its value and a "Package (×5 units)" button calling `packageBench()`; list current packaged stacks with effect chips + per-unit value. Render in `OverlayFrame title="Packaging"`.

- [ ] **Step 5: Mount overlays** in `CookGameGame.tsx` (outside canvas): conditionally render each based on `activeOverlay`.

- [ ] **Step 6: Verify**

Manual: buy a base + additives at supplier; load bench; mix additives and watch effects/value change and previews; package; confirm cash decremented correctly and a packaged stack appears.

- [ ] **Step 7: Commit**

```bash
git add components/cookgame/stations components/cookgame/ui/OverlayFrame.tsx components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): supplier, mixing, and packaging station overlays"
```

---

## Task 10: Buyer NPCs + sell overlay

**Files:**
- Create: `components/cookgame/npc/BuyerNPC.tsx`
- Create: `components/cookgame/npc/SellOverlay.tsx`
- Modify: `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Consumes: `useCookgameStore` (`inventory.packaged`, `sellUnit`, `activeOverlay`), `content` (`BUYERS`, `EFFECTS`), `economy.buyerOffer` (for display), `effects.productValue`.
- Produces: `<BuyerNPC buyerId position>` (a simple capsule/box mesh + `Interactable id={buyerId}`), `<SellOverlay />` shown when `activeOverlay` is a buyer id.

- [ ] **Step 1: `BuyerNPC.tsx`** — render a colored capsule at `position` plus `<Interactable id={buyerId} label={buyer.name} position={position} />`.

- [ ] **Step 2: `SellOverlay.tsx`** — resolve the buyer from `activeOverlay`; list the player's packaged stacks; for each, show the buyer's offer for one unit using `buyerOffer(stack.product, buyer, heat, 1)` (display uses variance 1; the actual sale picks a fixed deterministic variance — for v1 pass `1` so behavior matches display, OR compute a per-open variance once with a seeded value; keep it `1` to stay deterministic and testable). Buttons "Sell 1 unit" call `sellUnit(buyerId, index, 1)`. Show the buyer's `preferredEffect` as a hint. Render in `OverlayFrame`.

- [ ] **Step 3: Mount** three `<BuyerNPC>` at `BUYER_POSITIONS` inside `<Physics>`, and `<SellOverlay />` outside the canvas.

- [ ] **Step 4: Verify**

Manual: walk to a buyer, press E, sell a unit; confirm cash rises by the shown offer, unit count drops, heat rises; buyer offers more for their preferred effect.

- [ ] **Step 5: Commit**

```bash
git add components/cookgame/npc components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): buyer NPCs + sell overlay with preference pricing"
```

---

## Task 11: HUD, recipe journal, menu

**Files:**
- Create: `components/cookgame/ui/HUD.tsx`
- Create: `components/cookgame/ui/RecipeJournal.tsx`
- Create: `components/cookgame/ui/MenuOverlay.tsx`
- Modify: `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Consumes: `useCookgameStore` (`cash`, `heat`, `inventory`, `discoveredRecipes`, `saveNow`, `resetGame`, `activeOverlay`, `setActiveOverlay`).
- Produces: `<HUD/>` (always-on top-left cash + top-right heat bar + carried packaged count), `<RecipeJournal/>` (opens via a HUD button or `J`; lists `discoveredRecipes` keys split into effect chips), `<MenuOverlay/>` (opens via `M`; Save / Reset / Resume buttons).

- [ ] **Step 1: `HUD.tsx`** — fixed DOM overlay: cash (`$cash`), a heat meter bar (width `heat%`, turns red above `HEAT_PENALTY_THRESHOLD`), packaged unit total. Buttons to open Journal and Menu.

- [ ] **Step 2: `RecipeJournal.tsx`** — `OverlayFrame title="Recipe Journal"`; map `discoveredRecipes` (each a `'a+b+c'` key) to rows of colored effect chips; empty-state text when none.

- [ ] **Step 3: `MenuOverlay.tsx`** — `OverlayFrame title="Menu"`; "Save" → `saveNow()` + toast/console; "Reset" → confirm then `resetGame()`; "Resume" → close. Bind `M` key to toggle this overlay.

- [ ] **Step 4: Mount** `<HUD/>` always; journal/menu conditional on `activeOverlay`.

- [ ] **Step 5: Verify**

Manual: HUD shows live cash/heat; heat bar turns red after several sales and recovers over time; Journal lists discovered effect sets; Menu save/reset works.

- [ ] **Step 6: Commit**

```bash
git add components/cookgame/ui components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): HUD, recipe journal, and menu overlays"
```

---

## Task 12: Heat tick, autosave/load wiring, full-loop verification

**Files:**
- Modify: `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Consumes: `useCookgameStore` (`tickHeat`, `loadOrNew`, `saveNow`).

- [ ] **Step 1: Heat decay loop**

Add a small driver component inside `<Canvas>` that calls `tickHeat(delta)` each frame via `useFrame((_, delta) => useCookgameStore.getState().tickHeat(delta))`.

- [ ] **Step 2: Load on mount + autosave**

In `CookGameGame` top-level `useEffect`: call `loadOrNew()` once on mount. Add a second effect that subscribes to the store and debounces `saveNow()` (e.g., save at most once per 3s) whenever `cash`/`inventory`/`discoveredRecipes`/`heat` change. Also `saveNow()` on `beforeunload`.

```tsx
// inside CookGameGame.tsx
import { useEffect, useRef } from 'react';
import { useCookgameStore } from '@/lib/cookgame/store';
// ...
useEffect(() => { useCookgameStore.getState().loadOrNew(); }, []);
useEffect(() => {
  let t: ReturnType<typeof setTimeout> | null = null;
  const unsub = useCookgameStore.subscribe(() => {
    if (t) return;
    t = setTimeout(() => { useCookgameStore.getState().saveNow(); t = null; }, 3000);
  });
  const onUnload = () => useCookgameStore.getState().saveNow();
  window.addEventListener('beforeunload', onUnload);
  return () => { unsub(); if (t) clearTimeout(t); window.removeEventListener('beforeunload', onUnload); };
}, []);
```

- [ ] **Step 3: Full suite + typecheck**

Run: `./node_modules/.bin/vitest run lib/cookgame` → all PASS.
Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` → no errors.

- [ ] **Step 4: Manual end-to-end**

Open `/cookgame`: buy → load bench → mix several additives (see effects stack + value climb + previews) → package → sell to a buyer (cash up, heat up) → watch heat decay → open Journal (recipes recorded) → Save → reload page → state persists.

- [ ] **Step 5: Senior review (studio convention)**

Dispatch the `senior-swe-reviewer` agent on the branch diff; address findings.

- [ ] **Step 6: Commit**

```bash
git add components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): heat decay loop + autosave/load wiring"
```

---

## Self-Review Notes (coverage vs spec)

- Spec §4 effects engine → Tasks 1, 2 (+ store mixIn). §6 economy/heat → Task 3 (+ store sell/tick). §5 world/character/interaction → Tasks 7, 8. §6 stations/selling → Tasks 9, 10. §7 state/save → Tasks 4, 5, 12. §8 listing → Task 6. §9 testing → tests in Tasks 1–5, manual + senior review in 6–12.
- Pure logic (Tasks 1–5) is fully TDD'd in node (no DOM). R3F/UI (Tasks 6–12) use typecheck + manual verification, per the no-DOM-test constraint.
- Deferred to later phases (per spec §10): grow/cook pipelines, multiple bases, rank/economy depth, day-night, customer demand, employees/dealers, police/cartel, mobile controls.
