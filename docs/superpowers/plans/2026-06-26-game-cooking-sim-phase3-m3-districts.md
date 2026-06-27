# cookgame Phase 3 · Milestone 3 (Metroidvania Districts) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the single block into ~4 rank/key-gated connected districts (Suburbs → Downtown → Docks → Warehouse) that the player physically walks between through gates that open as they progress, each housing new shops, buyers, and a district map.

**Architecture:** One PURE `districts.ts` (district graph + `isDistrictUnlocked`) is the tested core; `shops.ts`/`content` gain the district-housed shops, a buyable district key, and new buyers; the store gains `buyKey` + `setCurrentDistrict`. The world stays a single `<Canvas>`/`<Physics>` scene enlarged into an L/T-shaped map: each district is a spatial region with its own ground/buildings/props, joined by corridor openings blocked by **Gate** barriers whose collider+visual are driven by `isDistrictUnlocked` — so traversal gating is pure physics, no transition code. A district map overlay + HUD indicator complete it.

**Tech Stack:** TypeScript, react-three-fiber, `@react-three/rapier`, Zustand, vitest, the existing `models/` kit. Build/test via `./node_modules/.bin/*` wrappers.

## Global Constraints

- **Internal slug `cookgame`**; satirical/fictional tone. **No DOM test env:** pure logic + store unit-tested; world/overlays typecheck+lint+manual. Tests via `./node_modules/.bin/vitest run <path>` (pnpm wrappers blocked).
- **Backward compatibility:** existing stations/buyers/anchors in the Suburbs stay where they are and keep working; Phases 1/2 + M1/M2 suites stay green. No save bump (`keys`/`currentDistrict` already in SaveV3 from M1).
- **Gating is pure physics:** a locked gate has a fixed-collider barrier (player can't pass) + a prompt showing the requirement; an unlocked gate has no barrier collider. `isDistrictUnlocked(id, rank, keys)` is the single source of truth.
- **Reuse the `models/` kit** (`Building`, `Character`, `SupplierStallModel`, `StreetProps`, palette, lighting) — procedural only, muted suburban→urban palette. `"use client"` first line on components.
- **Branch:** `feat/cookgame-phase-3-m3` (M3 of 5; PR/merge to `main` when reviewed). Run `senior-swe-reviewer` before the PR.
- Spec of record: `docs/superpowers/specs/2026-06-26-game-cooking-sim-phase3-design.md` (§4 districts, §5 shops in districts).

---

## District Layout (single expanded Canvas — concrete coordinates)

All districts share one ground/physics world. The map is L/T-shaped:

| District | Bounds (x, z) | Ground center / size | Gate from | Gate unlock |
|---|---|---|---|---|
| **suburbs** (home, exists) | x[-20,20] z[-20,20] | (0,0) 40×40 | — (always open) | always |
| **downtown** | x[-16,16] z[-58,-22] | (0,-40) 34×38 | north wall gap at `z=-20`, x∈[-4,4] | rank ≥ 2 |
| **docks** | x[-58,-22] z[-16,16] | (-40,0) 38×34 | west wall gap at `x=-20`, z∈[-4,4] | key `docks_key` |
| **warehouse** | x[-14,14] z[-94,-60] | (0,-78) 30×36 | downtown north at `z=-58`, x∈[-4,4] | rank ≥ 5 |

Gate barriers sit in the wall gaps. Suburbs keeps its 4 walls EXCEPT the north wall gains a gap for the downtown corridor and the west wall a gap for the docks corridor (split each wall into two segments around the opening). Each new district has perimeter walls except its corridor opening(s).

---

## Task 1: District graph (`districts.ts`)

**Files:**
- Create: `lib/cookgame/districts.ts`
- Test: `lib/cookgame/__tests__/districts.test.ts`

**Interfaces:**
- Produces:
  - `type DistrictGate = { type: 'rank'; rank: number } | { type: 'key'; keyId: string }`
  - `interface District { id: string; name: string; gate: DistrictGate | null; shops: string[]; buyers: string[] }` (`gate: null` = always open).
  - `DISTRICTS: Record<string, District>` — `suburbs` (gate null), `downtown` (rank 2), `docks` (key `docks_key`), `warehouse` (rank 5), each listing the shop ids + buyer ids it houses.
  - `isDistrictUnlocked(id: string, rank: number, keys: string[]): boolean` — true if the district has no gate, or `gate.type==='rank' && rank >= gate.rank`, or `gate.type==='key' && keys.includes(gate.keyId)`. Unknown id → false.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/cookgame/__tests__/districts.test.ts
import { describe, it, expect } from 'vitest';
import { DISTRICTS, isDistrictUnlocked } from '../districts';

describe('DISTRICTS', () => {
  it('has the four districts with the expected gates', () => {
    expect(DISTRICTS.suburbs.gate).toBeNull();
    expect(DISTRICTS.downtown.gate).toEqual({ type: 'rank', rank: 2 });
    expect(DISTRICTS.docks.gate).toEqual({ type: 'key', keyId: 'docks_key' });
    expect(DISTRICTS.warehouse.gate).toEqual({ type: 'rank', rank: 5 });
  });
});

describe('isDistrictUnlocked', () => {
  it('suburbs is always open', () => {
    expect(isDistrictUnlocked('suburbs', 0, [])).toBe(true);
  });
  it('rank gates open at/above their rank', () => {
    expect(isDistrictUnlocked('downtown', 1, [])).toBe(false);
    expect(isDistrictUnlocked('downtown', 2, [])).toBe(true);
    expect(isDistrictUnlocked('warehouse', 4, [])).toBe(false);
    expect(isDistrictUnlocked('warehouse', 5, [])).toBe(true);
  });
  it('key gates open only with the key', () => {
    expect(isDistrictUnlocked('docks', 9, [])).toBe(false);
    expect(isDistrictUnlocked('docks', 0, ['docks_key'])).toBe(true);
  });
  it('unknown district is locked', () => {
    expect(isDistrictUnlocked('atlantis', 9, ['docks_key'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/districts.test.ts`
Expected: FAIL — cannot resolve `../districts`.

- [ ] **Step 3: Implement `districts.ts`**

```ts
// lib/cookgame/districts.ts
export type DistrictGate = { type: 'rank'; rank: number } | { type: 'key'; keyId: string };

export interface District {
  id: string; name: string; gate: DistrictGate | null; shops: string[]; buyers: string[];
}

export const DISTRICTS: Record<string, District> = {
  suburbs:   { id: 'suburbs',   name: 'The Suburbs', gate: null,                              shops: ['supplier'],     buyers: ['doug', 'kim', 'pablo'] },
  downtown:  { id: 'downtown',  name: 'Downtown',    gate: { type: 'rank', rank: 2 },         shops: ['hardware'],     buyers: ['marcus'] },
  docks:     { id: 'docks',     name: 'The Docks',   gate: { type: 'key', keyId: 'docks_key' }, shops: ['afterhours'], buyers: ['vera'] },
  warehouse: { id: 'warehouse', name: 'The Warehouse', gate: { type: 'rank', rank: 5 },       shops: [],               buyers: ['silas'] },
};

export function isDistrictUnlocked(id: string, rank: number, keys: string[]): boolean {
  const d = DISTRICTS[id];
  if (!d) return false;
  if (!d.gate) return true;
  if (d.gate.type === 'rank') return rank >= d.gate.rank;
  return keys.includes(d.gate.keyId);
}
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/districts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/districts.ts lib/cookgame/__tests__/districts.test.ts
git commit -m "feat(cookgame): district graph + isDistrictUnlocked gating"
```

---

## Task 2: New buyers + district key content

**Files:**
- Modify: `lib/cookgame/types.ts` (extend `BuyerId`)
- Modify: `lib/cookgame/content.ts` (add buyers)
- Test: `lib/cookgame/__tests__/content.test.ts`

**Interfaces:**
- `BuyerId` gains `'marcus' | 'vera' | 'silas'`.
- `BUYERS` gains those three (each `{ id, name, preferredEffect, preferenceBonus, basePriceFactor }`) — higher `basePriceFactor`/`preferenceBonus` than the Suburbs trio (they're later-district premium buyers). `preferredEffect` must be existing `EffectId`s.

- [ ] **Step 1: Add failing content assertions**

Append to `lib/cookgame/__tests__/content.test.ts` a new describe block. **Do NOT add a new import line** — `BUYERS` and `EFFECTS` are already imported at the top of this file from prior phases; reuse them (a duplicate import is a redeclaration error). If for some reason one isn't imported, add it to the EXISTING top-of-file import, not a second statement.

```ts
describe('phase 3 district buyers', () => {
  it('adds marcus, vera, silas with valid preferred effects', () => {
    for (const id of ['marcus', 'vera', 'silas']) {
      const b = BUYERS.find((x) => x.id === id);
      expect(b, id).toBeDefined();
      expect(EFFECTS[b!.preferredEffect]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/content.test.ts`
Expected: FAIL — buyers undefined.

- [ ] **Step 3: Edit `types.ts` + `content.ts`**

In `types.ts`: `export type BuyerId = 'doug' | 'kim' | 'pablo' | 'marcus' | 'vera' | 'silas';`

In `content.ts`, append to `BUYERS`:

```ts
  { id: 'marcus', name: 'Marcus', preferredEffect: 'focused',  preferenceBonus: 0.35, basePriceFactor: 1.2 },
  { id: 'vera',   name: 'Vera',   preferredEffect: 'glowing',  preferenceBonus: 0.4,  basePriceFactor: 1.3 },
  { id: 'silas',  name: 'Silas',  preferredEffect: 'euphoric', preferenceBonus: 0.45, basePriceFactor: 1.45 },
```

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/types.ts lib/cookgame/content.ts lib/cookgame/__tests__/content.test.ts
git commit -m "feat(cookgame): district premium buyers (marcus/vera/silas)"
```

---

## Task 3: District shops + the docks key (`shops.ts`)

**Files:**
- Modify: `lib/cookgame/shops.ts`
- Test: `lib/cookgame/__tests__/shops.test.ts`

**Interfaces:**
- `ShopItemKind` gains `'key'`. `ShopItem` for a key: `{ kind: 'key', refId: 'docks_key', rankReq }`.
- `KEY_PRICES: Record<string, number>` (e.g. `docks_key: 250`); `shopItemPrice` returns `KEY_PRICES[refId]` for `kind === 'key'`.
- `SHOPS` gains `hardware` (Downtown — sells the **docks key** at rank 2, plus reagent/seeds) and `afterhours` (Docks — premium additives at higher ranks). Their item refIds must reference real content (additives/inputs) or the key.

- [ ] **Step 1: Add failing tests**

Append to `lib/cookgame/__tests__/shops.test.ts`:

```ts
import { KEY_PRICES } from '../shops';

describe('district shops + keys', () => {
  it('hardware sells the docks key; afterhours exists', () => {
    expect(SHOPS.hardware).toBeDefined();
    expect(SHOPS.afterhours).toBeDefined();
    expect(SHOPS.hardware.items.some((i) => i.kind === 'key' && i.refId === 'docks_key')).toBe(true);
  });
  it('shopItemPrice resolves a key via KEY_PRICES', () => {
    expect(shopItemPrice({ kind: 'key', refId: 'docks_key', rankReq: 2 })).toBe(KEY_PRICES.docks_key);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/shops.test.ts`
Expected: FAIL — `hardware`/`afterhours`/`KEY_PRICES` undefined.

- [ ] **Step 3: Edit `shops.ts`**

Add `'key'` to `ShopItemKind`; add `KEY_PRICES`; extend `shopItemPrice`; add the two shops:

```ts
export type ShopItemKind = 'additive' | 'base' | 'input' | 'key';
export const KEY_PRICES: Record<string, number> = { docks_key: 250 };

export function shopItemPrice(item: ShopItem): number {
  if (item.kind === 'base') return BASE_PRICE;
  if (item.kind === 'key') return KEY_PRICES[item.refId] ?? 0;
  if (item.kind === 'additive') return ADDITIVES[item.refId as AdditiveId].cost;
  return INPUTS[item.refId as InputId].cost;
}
```

Add to `SHOPS`:

```ts
  hardware: {
    id: 'hardware', name: 'Hardware Store',
    items: [
      { kind: 'key', refId: 'docks_key', rankReq: 2 },
      { kind: 'input', refId: 'reagent', rankReq: 2 },
      { kind: 'input', refId: 'nutrient', rankReq: 2 },
      { kind: 'input', refId: 'seed_zoomhaze', rankReq: 2 },
    ],
  },
  afterhours: {
    id: 'afterhours', name: 'After-Hours Stall',
    items: [
      { kind: 'additive', refId: 'battery', rankReq: 3 },
      { kind: 'additive', refId: 'energydrink', rankReq: 3 },
      { kind: 'additive', refId: 'donut', rankReq: 4 },
    ],
  },
```

(Update the existing `shops.test.ts` catalog-integrity loop, if it iterates all shops, to allow the `'key'` kind — its refId is validated against KEY_PRICES rather than content.)

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/shops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/shops.ts lib/cookgame/__tests__/shops.test.ts
git commit -m "feat(cookgame): district shops (hardware/after-hours) + docks key item"
```

---

## Task 4: Store — buyKey + setCurrentDistrict

**Files:**
- Modify: `lib/cookgame/store.ts`
- Test: `lib/cookgame/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `shops` (`KEY_PRICES`).
- Produces:
  - `buyKey(keyId: string): boolean` — deduct `KEY_PRICES[keyId]` from cash, add `keyId` to `keys` (idempotent — no double-add, refuse if already owned or insufficient cash or unknown key).
  - `setCurrentDistrict(id: string): void` — sets `currentDistrict` (used by the world region detector for the map highlight).

- [ ] **Step 1: Add failing tests**

Append to `lib/cookgame/__tests__/store.test.ts`:

```ts
import { KEY_PRICES } from '../shops';

describe('cookgame store — keys + district', () => {
  beforeEach(reset);
  it('buyKey deducts cash and adds the key once', () => {
    useCookgameStore.setState({ cash: 1000 });
    const st = useCookgameStore.getState();
    expect(st.buyKey('docks_key')).toBe(true);
    let s = useCookgameStore.getState();
    expect(s.keys).toContain('docks_key');
    expect(s.cash).toBe(1000 - KEY_PRICES.docks_key);
    expect(st.buyKey('docks_key')).toBe(false); // already owned
  });
  it('buyKey refuses when broke or unknown', () => {
    expect(useCookgameStore.getState().buyKey('docks_key')).toBe(false); // 150 < 250
    useCookgameStore.setState({ cash: 9999 });
    expect(useCookgameStore.getState().buyKey('nope')).toBe(false);
  });
  it('setCurrentDistrict updates the field', () => {
    useCookgameStore.getState().setCurrentDistrict('downtown');
    expect(useCookgameStore.getState().currentDistrict).toBe('downtown');
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts`
Expected: FAIL — `buyKey`/`setCurrentDistrict` undefined.

- [ ] **Step 3: Edit `store.ts`**

Add `import { KEY_PRICES } from './shops';`. Add to the interface: `buyKey: (keyId: string) => boolean; setCurrentDistrict: (id: string) => void;`. Add the actions:

```ts
  buyKey: (keyId) => {
    const { cash, keys } = get();
    const price = KEY_PRICES[keyId];
    if (price === undefined || keys.includes(keyId) || cash < price) return false;
    set({ cash: cash - price, keys: [...keys, keyId] });
    return true;
  },
  setCurrentDistrict: (id) => set({ currentDistrict: id }),
```

- [ ] **Step 4: Run; expect pass + full suite**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): buyKey + setCurrentDistrict store actions"
```

---

## Task 5: District world regions

**Files:**
- Modify: `components/cookgame/world/TownScene.tsx`
- Create: `components/cookgame/world/districts/DistrictScene.tsx` (a small helper rendering a district's ground + perimeter walls + content)

**Interfaces:**
- Consumes: `models/` kit (`Building`, `SupplierStallModel`, `StreetProps`, palette), `BuyerNPC`, the layout coordinates above.
- Produces: the three new district regions rendered in `TownScene` (or via `DistrictScene`), each with: a ground plane (Rapier fixed collider), perimeter walls with the corridor opening(s) left as gaps (gate barriers come in Task 6), a building or two, the district's shop model (reuse `SupplierStallModel` for `hardware`/`afterhours` visual), and street props. Export anchor consts for the new shops + buyers (e.g. `HARDWARE_POSITION`, `AFTERHOURS_POSITION`, and buyer positions for marcus/vera/silas) for Task 8 to mount interactables/NPCs.

- [ ] **Step 1: Add `DistrictScene.tsx`**

`"use client";` A helper `<DistrictScene ground={{center,size}} walls={Wall[]} children/>` that renders a Rapier fixed-collider ground plane (palette `asphalt`/`sidewalk` tones to read as more urban than the suburbs grass) + the passed wall segments + children. Reuse the `Wall` pattern from `TownScene` (extract or duplicate the small `Wall` helper). Keep it focused.

- [ ] **Step 2: Build the three districts in `TownScene.tsx`**

Add `downtown`, `docks`, `warehouse` regions at the layout coordinates. For each: ground + perimeter walls WITH the corridor gap (split the shared wall into two segments around the opening, e.g. downtown's south edge at z=-22 is implicit via the suburbs north wall which you split into two segments around x∈[-4,4]). Add 1–2 `Building`s, the shop model at its anchor, and `StreetProps`. Also SPLIT the suburbs north wall (`[0,2,-20] size [40,4,0.5]`) into two segments leaving an x∈[-4,4] gap, and the west wall (`[-20,2,0] size [0.5,4,40]`) into two segments leaving a z∈[-4,4] gap, so corridors exist (gates fill them in Task 6). Export the new anchor consts.

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK` → OK.
Run: `./node_modules/.bin/eslint components/cookgame/world/TownScene.tsx components/cookgame/world/districts/DistrictScene.tsx` → clean.
Run: `./node_modules/.bin/vitest run lib/cookgame` → still green.
Manual: the three new regions render beyond the suburbs with their own ground/buildings/props; the suburbs north & west walls now have corridor gaps (you can walk through them — gates not in yet).

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/world/TownScene.tsx components/cookgame/world/districts/DistrictScene.tsx
git commit -m "feat(cookgame): downtown/docks/warehouse district regions + corridors"
```

---

## Task 6: Gate system

**Files:**
- Create: `components/cookgame/world/Gate.tsx`
- Modify: `components/cookgame/world/TownScene.tsx`, `components/cookgame/world/InteractionPrompt.tsx`

**Interfaces:**
- Consumes: `useCookgameStore` (`xp`, `keys`), `progression` (`rankForXp`), `districts` (`DISTRICTS`, `isDistrictUnlocked`).
- Produces: `<Gate districtId position size />` — reads `rank`/`keys` from the store; computes `unlocked = isDistrictUnlocked(districtId, rank, keys)`. When LOCKED: render a solid barrier mesh + a Rapier `<RigidBody type="fixed"><CuboidCollider/></RigidBody>` filling the corridor gap (blocks the player) + a small floating `<Html>`/prompt with the requirement (`"Reach rank N"` for a rank gate, `"Need the Docks Key"` for a key gate, from `DISTRICTS[districtId].gate`). When UNLOCKED: render an open-gate visual (two posts, optional arch) and NO barrier collider. The gate must re-evaluate when xp/keys change (store selectors drive a re-render).

- [ ] **Step 1: Implement `Gate.tsx`**

`"use client";` Subscribe `xp` + `keys` via selectors; `const rank = rankForXp(xp).rank; const unlocked = isDistrictUnlocked(districtId, rank, keys);`. Render the locked barrier (mesh + fixed CuboidCollider sized to fill the gap, e.g. `[4,4,0.5]` for the downtown corridor) + requirement label when `!unlocked`; render open posts (no collider) when `unlocked`. Derive the label from `DISTRICTS[districtId].gate`.

- [ ] **Step 2: Place gates in TownScene + label**

Mount `<Gate districtId="downtown" position={[0,2,-21]} size={[8,4,0.6]} />`, `<Gate districtId="docks" position={[-21,2,0]} size={[0.6,4,8]} />`, `<Gate districtId="warehouse" position={[0,2,-58]} size={[8,4,0.6]} />` at the corridor openings (size spans the gap). Add gate prompt labels to `InteractionPrompt.tsx` LABELS only if the gate uses the proximity-prompt system; otherwise the floating Html on the Gate suffices (pick one approach; the floating Html on the locked barrier is simplest).

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK` → OK.
Run: `./node_modules/.bin/eslint components/cookgame/world/Gate.tsx components/cookgame/world/TownScene.tsx` → clean.
Run: `./node_modules/.bin/vitest run lib/cookgame` → green.
Manual: at rank 0 the downtown/warehouse gates are solid (can't pass) and show "Reach rank N"; the docks gate shows "Need the Docks Key". Ranking up to 2 opens downtown's gate (walk through); buying the docks key opens the docks gate.

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/world/Gate.tsx components/cookgame/world/TownScene.tsx components/cookgame/world/InteractionPrompt.tsx
git commit -m "feat(cookgame): rank/key-gated district gates (physics + prompts)"
```

---

## Task 7: District shops/buyers wiring + region detector + map

**Files:**
- Modify: `components/cookgame/CookGameGame.tsx`
- Create: `components/cookgame/ui/DistrictMap.tsx`
- Modify: `components/cookgame/ui/HUD.tsx`

**Interfaces:**
- Consumes: the new anchors (Task 5), `Interactable`, `BuyerNPC`, `ShopOverlay` (already renders any `SHOPS[id]`), `districts`, store (`playerPosition`, `setCurrentDistrict`, `currentDistrict`, `xp`, `keys`).

- [ ] **Step 1: Mount district shops + buyers**

In `CookGameGame.tsx` add inside `<Physics>`: `<Interactable id="hardware" position={HARDWARE_POSITION} />`, `<Interactable id="afterhours" position={AFTERHOURS_POSITION} />` (ShopOverlay already opens them since `SHOPS.hardware`/`SHOPS.afterhours` exist), and `<BuyerNPC buyerId="marcus" .../>`, `vera`, `silas` at their district positions. Add `hardware`/`afterhours`/buyer names to `InteractionPrompt.tsx` LABELS.

- [ ] **Step 2: Region detector (currentDistrict)**

Add a small in-canvas component (or fold into an existing `useFrame`) that, throttled (~every 10 frames), reads `playerPosition` and sets `currentDistrict` to the district whose bounds contain the player (using the layout bounds; suburbs is the default). Only call `setCurrentDistrict` when it changes (compare to the current value) to avoid churn.

- [ ] **Step 3: `DistrictMap.tsx` overlay + HUD indicator**

`DistrictMap` (`"use client";`, self-gate `activeOverlay === 'map'`, opened via an `M`-style key or a HUD button — reuse the menu/journal toggle pattern): a simple schematic of the 4 districts showing each as locked (🔒 + requirement) or unlocked (✓), and the current one highlighted, from `isDistrictUnlocked(id, rankForXp(xp).rank, keys)`. In `HUD.tsx` add a small current-district name readout (`DISTRICTS[currentDistrict].name`).

- [ ] **Step 4: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK` → OK.
Run: `./node_modules/.bin/eslint components/cookgame/CookGameGame.tsx components/cookgame/ui/DistrictMap.tsx components/cookgame/ui/HUD.tsx components/cookgame/world/InteractionPrompt.tsx` → clean.
Run: `./node_modules/.bin/vitest run lib/cookgame` → green.
Manual: in an unlocked district the new shop opens on E and the new buyer trades; the HUD shows the current district; the map overlay shows lock state + highlights where you are.

- [ ] **Step 5: Commit**

```bash
git add components/cookgame/CookGameGame.tsx components/cookgame/ui/DistrictMap.tsx components/cookgame/ui/HUD.tsx components/cookgame/world/InteractionPrompt.tsx
git commit -m "feat(cookgame): district shops/buyers + region detector + district map"
```

---

## Task 8: M3 verification

**Files:** none (verification; fix forward only on gate failure).

- [ ] **Step 1: Full gates**

```bash
./node_modules/.bin/vitest run lib/cookgame                        # all green (incl. districts/shops/buyers/store)
./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK
./node_modules/.bin/eslint components/cookgame lib/cookgame
./node_modules/.bin/vite build                                     # exit 0; revert pnpm-workspace.yaml noise
```

- [ ] **Step 2: Manual end-to-end**

`/cookgame`: at low rank the Suburbs is bounded by locked downtown/warehouse gates ("Reach rank N") and a key-locked docks gate; rank up → the downtown gate opens, walk in, use the Hardware Store, sell to Marcus; buy the Docks Key at Hardware → the docks gate opens → After-Hours stall + Vera; reach rank 5 → Warehouse + Silas. The district map + HUD indicator track lock state and location. Reload persists `keys`/`currentDistrict` (v3). Suburbs loop unaffected.

- [ ] **Step 3: Commit any gate fixes**

```bash
git add -A && git commit -m "fix(cookgame): M3 districts verification"
```

---

## Self-Review Notes (coverage vs spec §4, §5)

- §4 ~4 connected districts, `DISTRICTS`, `isDistrictUnlocked`, rank/key gates, backtracking → Tasks 1 (graph), 5 (regions), 6 (gates). Keys acquired via shop purchase → Tasks 3 (key item) + 4 (`buyKey`). currentDistrict tracking → Task 7. District map → Task 7.
- §5 district-housed shops (hardware downtown, after-hours docks) + new buyers → Tasks 2 (buyers), 3 (shops), 7 (mount). Generalized `ShopOverlay` (from M2) already renders them.
- Gating is pure physics (locked gate = barrier+collider) → Task 6; `isDistrictUnlocked` is the single source of truth.
- Backward-compat: suburbs stations/buyers/anchors unchanged; pure suites green; no save bump (`keys`/`currentDistrict` from M1's v3).
- Deferred to later M's: day-night shop/buyer time-windows (M4 — the after-hours stall's "night-only" gating lands then), journal depth (M5). M3 places the after-hours stall but its night-only time-window is M4.
```
