# "Game" (cookgame) — Phase 3 M5 (Journal Depth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the recipe journal into a catalog — track which effects the player has discovered, record the best product value achieved per recipe, and let the player rename and ⭐-favorite discovered recipes — by activating the `discoveredEffects` and `recipeMeta` save fields that already exist but are currently inert.

**Architecture:** A new pure lib `lib/cookgame/journal.ts` owns the catalog/merge math (effect-catalog assembly, effect-set discovery union, best-value merge). The store wires these into the two points where effects enter a product (`loadBaseToBench` for base bonus effects, `mixIn` for additive effects) and records best value alongside the existing recipe-discovery in `mixIn`; two new actions handle naming/favoriting. The existing `RecipeJournal.tsx` overlay gains an effect-catalog section (discovered vs locked silhouettes) and upgrades the recipe list with names, favorites, and best-value readouts.

**Tech Stack:** TypeScript, Zustand, react-three-fiber DOM overlay (`RecipeJournal.tsx`), Vitest (pure-lib + store unit tests, node — no DOM env).

## Global Constraints

- **Internal slug:** `cookgame`. Display title "Game". Tone: satirical/fictional, invented effects.
- **Pure libs** (`lib/cookgame/*.ts`) export plain functions + `const` data only — no React, no store imports, no `Date.now()`/`Math.random()`. Vitest-tested in node.
- **R3F/UI** is typecheck + lint + manual only (no DOM test env). Every `.tsx` file starts with `"use client";`.
- **No save bump.** `discoveredEffects: string[]` and `recipeMeta: Record<string, RecipeMeta>` already exist in `SaveV3` (defaulted `[]` / `{}`, validated in `parseSave`). M5 adds no persisted fields. Do **not** change `CURRENT_VERSION`.
- **Recipe key = `effectSetKey(effects)`** — the sorted `'+'`-joined effect-id string already used by `discoveredRecipes`. `recipeMeta` is keyed by the same string, so recipe metadata aligns 1:1 with discovered recipes.
- **`RecipeMeta`** (already in `types.ts`): `{ name?: string; favorite?: boolean; bestValue?: number }`.
- **Effect catalog = the 10 `EFFECTS`** in `content.ts` (`EffectId` union: energizing, calming, gingeritis, sneaky, spicy, euphoric, focused, jittery, glowing, sedating). Each has `{ id, name, multiplier, tier (1|2|3), color }`.
- **Backward compatible:** existing pure-lib signatures unchanged; Phases 1–2 + M1–M4 tests stay green. `discoveredEffects`/`recipeMeta` start empty and only grow through play.
- **Verification gates (Task 6):** `vitest run lib/cookgame` green, `tsc -p tsconfig.json --noEmit` clean, `eslint components/cookgame lib/cookgame` clean, `vite build` exit 0. Use `./node_modules/.bin/<tool>` (pnpm wrappers blocked here).
- **Branch:** `feat/cookgame-phase-3-m5` (off `main` @ M4-merged). `senior-swe-reviewer` (opus) whole-branch review before the PR to `main`.

---

### Task 1: `journal.ts` — effect catalog, effect discovery, best-value merge

**Files:**
- Create: `lib/cookgame/journal.ts`
- Test: `lib/cookgame/__tests__/journal.test.ts`

**Interfaces:**
- Consumes: `EFFECTS` + types from `content.ts`/`types.ts`.
- Produces:
  - `export interface CatalogEntry { id: EffectId; name: string; tier: 1 | 2 | 3; multiplier: number; color: string; discovered: boolean; }`
  - `export function effectCatalog(discovered: string[]): CatalogEntry[]` — one entry per effect in `EFFECTS`, `discovered` true when its id is in the `discovered` list. Sorted by `tier` ascending, then `name` ascending (stable catalog order independent of discovery).
  - `export function discoverEffects(current: string[], effects: EffectId[]): string[]` — returns `current` plus any of `effects` not already present (order: existing first, then new in input order). Returns the **same array reference** when nothing is added (so callers can skip a state write).
  - `export function mergeBestValue(meta: Record<string, RecipeMeta>, key: string, value: number): Record<string, RecipeMeta>` — returns a new map with `meta[key].bestValue = max(existing bestValue ?? 0, value)`, preserving any existing `name`/`favorite`. Returns the **same map reference** when `value` does not exceed the stored best (no write needed).

- [ ] **Step 1: Write the failing test**

```ts
// lib/cookgame/__tests__/journal.test.ts
import { describe, it, expect } from 'vitest';
import { effectCatalog, discoverEffects, mergeBestValue } from '../journal';
import type { RecipeMeta } from '../types';

describe('effectCatalog', () => {
  it('returns every effect with a discovered flag', () => {
    const cat = effectCatalog(['euphoric']);
    expect(cat).toHaveLength(10); // the EffectId union
    const euph = cat.find((e) => e.id === 'euphoric')!;
    expect(euph.discovered).toBe(true);
    expect(euph.name).toBe('Euphoric');
    expect(euph.tier).toBe(2);
    expect(cat.find((e) => e.id === 'glowing')!.discovered).toBe(false);
  });

  it('is ordered by tier then name, regardless of discovery', () => {
    const a = effectCatalog([]);
    const b = effectCatalog(['glowing', 'spicy']);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id)); // order is discovery-independent
    for (let i = 1; i < a.length; i++) {
      const prev = a[i - 1], cur = a[i];
      expect(prev.tier < cur.tier || (prev.tier === cur.tier && prev.name <= cur.name)).toBe(true);
    }
  });
});

describe('discoverEffects', () => {
  it('adds new effects, preserving existing-first order', () => {
    expect(discoverEffects(['spicy'], ['euphoric', 'spicy'])).toEqual(['spicy', 'euphoric']);
  });
  it('returns the same reference when nothing is new', () => {
    const cur = ['spicy', 'euphoric'];
    expect(discoverEffects(cur, ['spicy'])).toBe(cur);
  });
});

describe('mergeBestValue', () => {
  it('sets best value for a new recipe key', () => {
    const out = mergeBestValue({}, 'euphoric+spicy', 120);
    expect(out['euphoric+spicy'].bestValue).toBe(120);
  });
  it('raises the best value and preserves name/favorite', () => {
    const meta: Record<string, RecipeMeta> = { 'a+b': { name: 'Zinger', favorite: true, bestValue: 100 } };
    const out = mergeBestValue(meta, 'a+b', 150);
    expect(out['a+b']).toEqual({ name: 'Zinger', favorite: true, bestValue: 150 });
  });
  it('returns the same reference when value does not exceed the stored best', () => {
    const meta: Record<string, RecipeMeta> = { 'a+b': { bestValue: 200 } };
    expect(mergeBestValue(meta, 'a+b', 150)).toBe(meta);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/journal.test.ts`
Expected: FAIL — `Cannot find module '../journal'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cookgame/journal.ts
import type { EffectId, RecipeMeta } from './types';
import { EFFECTS } from './content';

export interface CatalogEntry {
  id: EffectId;
  name: string;
  tier: 1 | 2 | 3;
  multiplier: number;
  color: string;
  discovered: boolean;
}

/** Every effect, flagged discovered/locked, ordered by tier then name. */
export function effectCatalog(discovered: string[]): CatalogEntry[] {
  const seen = new Set(discovered);
  return Object.values(EFFECTS)
    .map((e) => ({
      id: e.id, name: e.name, tier: e.tier, multiplier: e.multiplier, color: e.color,
      discovered: seen.has(e.id),
    }))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

/** Union `current` with `effects`; returns the same reference when nothing is new. */
export function discoverEffects(current: string[], effects: EffectId[]): string[] {
  const have = new Set(current);
  const added = effects.filter((e) => !have.has(e));
  return added.length === 0 ? current : [...current, ...added];
}

/** Raise `meta[key].bestValue` to `value` if higher; same reference when no raise needed. */
export function mergeBestValue(
  meta: Record<string, RecipeMeta>,
  key: string,
  value: number,
): Record<string, RecipeMeta> {
  const prev = meta[key];
  if (prev && (prev.bestValue ?? 0) >= value) return meta;
  return { ...meta, [key]: { ...prev, bestValue: value } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/journal.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/journal.ts lib/cookgame/__tests__/journal.test.ts
git commit -m "feat(cookgame): journal pure lib — effect catalog + discovery + best-value (M5)"
```

---

### Task 2: Store — wire effect discovery + best-value tracking

**Files:**
- Modify: `lib/cookgame/store.ts` (`loadBaseToBench` ~lines 149-165; `mixIn` ~lines 167-184; imports)
- Test: `lib/cookgame/__tests__/store.test.ts` (append a `describe('journal tracking', ...)` block)

**Interfaces:**
- Consumes: `discoverEffects`, `mergeBestValue` (Task 1); `productValue` (from `./effects`).
- Produces: no new store action shape — `loadBaseToBench` now unions `discoveredEffects` with the loaded base's bonus effects; `mixIn` now unions `discoveredEffects` with the mixed product's effects **and** merges `recipeMeta[key].bestValue` with `productValue(next)` (alongside the existing `discoveredRecipes`/`xp` updates).

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/cookgame/__tests__/store.test.ts
describe('journal tracking', () => {
  beforeEach(reset);

  it('mixIn records discovered effects and best value', () => {
    const store = useCookgameStore.getState();
    // Stock a base and an additive, load to bench, mix.
    store.buyBase('greenstart', 10);
    useCookgameStore.setState((s) => ({
      inventory: { ...s.inventory, additives: { ...s.inventory.additives, cuke: 1 } },
    }));
    useCookgameStore.getState().loadBaseToBench(0);
    useCookgameStore.getState().mixIn('cuke'); // cuke => 'energizing'

    const s = useCookgameStore.getState();
    expect(s.discoveredEffects).toContain('energizing');
    const key = s.discoveredRecipes[0];
    expect(s.recipeMeta[key]?.bestValue).toBeGreaterThan(0);
  });

  it('loadBaseToBench discovers a base bonus effect without mixing', () => {
    // couchlock carries the 'sedating' bonus effect.
    useCookgameStore.setState((s) => ({
      inventory: {
        ...s.inventory,
        baseStock: [{ baseId: 'couchlock', qualityMult: 1, bonusEffects: ['sedating'], units: 1 }],
      },
    }));
    useCookgameStore.getState().loadBaseToBench(0);
    expect(useCookgameStore.getState().discoveredEffects).toContain('sedating');
  });
});
```

> Use the file's existing `reset` helper (`beforeEach(reset)`) and existing imports — do not re-import `useCookgameStore`/`describe`/etc.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t "journal tracking"`
Expected: FAIL — `discoveredEffects` stays `[]` / `recipeMeta[key]` undefined.

- [ ] **Step 3: Implement in `store.ts`**

a) Extend the effects import (currently `import { mix, effectSetKey } from './effects';`):

```ts
import { mix, effectSetKey, productValue } from './effects';
```

b) Add the journal import (near the other `lib/cookgame` imports):

```ts
import { discoverEffects, mergeBestValue } from './journal';
```

c) In `loadBaseToBench`, the `set({ ... })` currently writes `inventory`. Add effect discovery from the loaded base's bonus effects. Replace the action's `set(...)` call with:

```ts
    set({
      inventory: {
        ...inventory,
        baseStock,
        workProduct: { baseId: entry.baseId, effects: [...entry.bonusEffects], qualityMult: entry.qualityMult },
      },
      discoveredEffects: discoverEffects(get().discoveredEffects, entry.bonusEffects),
    });
```

d) In `mixIn`, pull `discoveredEffects` and `recipeMeta` from state and write them. Change the destructure line `const { inventory, discoveredRecipes, xp } = get();` to:

```ts
    const { inventory, discoveredRecipes, xp, discoveredEffects, recipeMeta } = get();
```

and change the `set({ ... })` to also union effects + merge best value:

```ts
    set({
      inventory: {
        ...inventory,
        additives: { ...inventory.additives, [additiveId]: inventory.additives[additiveId] - 1 },
        workProduct: next,
      },
      discoveredRecipes: isNew ? [...discoveredRecipes, key] : discoveredRecipes,
      xp: xp + (isNew ? xpForRecipe() : 0),
      discoveredEffects: discoverEffects(discoveredEffects, next.effects),
      recipeMeta: mergeBestValue(recipeMeta, key, productValue(next)),
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t "journal tracking"`
Expected: PASS.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all green (existing mix/discovery tests still pass — the new fields are additive).

- [ ] **Step 6: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): track discovered effects + per-recipe best value (M5)"
```

---

### Task 3: Store — recipe naming + favoriting actions

**Files:**
- Modify: `lib/cookgame/store.ts` (`CookgameState` interface near the other action signatures; action bodies near `mixIn`)
- Test: `lib/cookgame/__tests__/store.test.ts` (append a `describe('recipe meta actions', ...)` block)

**Interfaces:**
- Consumes: existing `recipeMeta` state.
- Produces:
  - `setRecipeName: (key: string, name: string) => void` — sets `recipeMeta[key].name` (trimmed); an empty/whitespace name clears the `name` field (leaving other meta intact).
  - `toggleRecipeFavorite: (key: string) => void` — flips `recipeMeta[key].favorite`.

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/cookgame/__tests__/store.test.ts
describe('recipe meta actions', () => {
  beforeEach(reset);

  it('setRecipeName stores a trimmed name', () => {
    useCookgameStore.getState().setRecipeName('a+b', '  Night Fuel  ');
    expect(useCookgameStore.getState().recipeMeta['a+b'].name).toBe('Night Fuel');
  });

  it('an empty name clears the name but keeps other meta', () => {
    useCookgameStore.setState({ recipeMeta: { 'a+b': { name: 'X', bestValue: 50 } } });
    useCookgameStore.getState().setRecipeName('a+b', '   ');
    const m = useCookgameStore.getState().recipeMeta['a+b'];
    expect(m.name).toBeUndefined();
    expect(m.bestValue).toBe(50);
  });

  it('toggleRecipeFavorite flips the flag', () => {
    useCookgameStore.getState().toggleRecipeFavorite('a+b');
    expect(useCookgameStore.getState().recipeMeta['a+b'].favorite).toBe(true);
    useCookgameStore.getState().toggleRecipeFavorite('a+b');
    expect(useCookgameStore.getState().recipeMeta['a+b'].favorite).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t "recipe meta actions"`
Expected: FAIL — `setRecipeName is not a function`.

- [ ] **Step 3: Implement in `store.ts`**

a) Add to the `CookgameState` interface (near `setCurrentDistrict`):

```ts
  setRecipeName: (key: string, name: string) => void;
  toggleRecipeFavorite: (key: string) => void;
```

b) Add the action bodies (near the end of the `create(...)` body, after `setCurrentDistrict`):

```ts
  setRecipeName: (key, name) => {
    const trimmed = name.trim();
    const meta = get().recipeMeta;
    const entry = { ...meta[key] };
    if (trimmed) entry.name = trimmed;
    else delete entry.name;
    set({ recipeMeta: { ...meta, [key]: entry } });
  },

  toggleRecipeFavorite: (key) => {
    const meta = get().recipeMeta;
    const entry = meta[key] ?? {};
    set({ recipeMeta: { ...meta, [key]: { ...entry, favorite: !entry.favorite } } });
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/cookgame/__tests__/store.test.ts -t "recipe meta actions"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cookgame/store.ts lib/cookgame/__tests__/store.test.ts
git commit -m "feat(cookgame): recipe naming + favoriting store actions (M5)"
```

---

### Task 4: Journal UI — effect catalog section

**Files:**
- Modify: `components/cookgame/ui/RecipeJournal.tsx`

**Interfaces:**
- Consumes: `effectCatalog` (Task 1), `useCookgameStore` `discoveredEffects`.
- Produces: an "Effect Catalog" section in the journal overlay above the recipe list — a grid of all effects, discovered ones shown as a colored chip with name + tier + `×multiplier`, locked ones as a muted `???` silhouette. No export shape change (named `RecipeJournal`).

- [ ] **Step 1: Add the catalog section**

In `components/cookgame/ui/RecipeJournal.tsx`:

a) Add imports:

```tsx
import { effectCatalog } from '@/lib/cookgame/journal';
```

b) Add a selector inside the component (after the `discoveredRecipes` selector):

```tsx
  const discoveredEffects = useCookgameStore((s) => s.discoveredEffects);
```

c) Compute the catalog before the `return` (after the `if (activeOverlay !== 'journal') return null;` guard):

```tsx
  const catalog = effectCatalog(discoveredEffects);
  const discoveredCount = catalog.filter((e) => e.discovered).length;
```

d) Render the catalog section as the first child inside `<OverlayFrame title="Recipe Journal">`, before the recipe list:

```tsx
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-neutral-400">
          <span>Effect Catalog</span>
          <span className="text-neutral-500">{discoveredCount}/{catalog.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {catalog.map((e) =>
            e.discovered ? (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2 rounded px-2 py-1 text-black"
                style={{ backgroundColor: e.color }}
              >
                <span className="font-mono text-[11px] font-semibold">{e.name}</span>
                <span className="font-mono text-[10px] opacity-80">T{e.tier} ×{e.multiplier}</span>
              </div>
            ) : (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1"
              >
                <span className="font-mono text-[11px] text-neutral-600">???</span>
                <span className="font-mono text-[10px] text-neutral-700">T{e.tier}</span>
              </div>
            ),
          )}
        </div>
      </section>
```

- [ ] **Step 2: Typecheck + lint**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i RecipeJournal || echo "clean"`
Expected: `clean`.

Run: `./node_modules/.bin/eslint components/cookgame/ui/RecipeJournal.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cookgame/ui/RecipeJournal.tsx
git commit -m "feat(cookgame): effect catalog section in recipe journal (M5)"
```

---

### Task 5: Journal UI — recipe names, favorites, best value

**Files:**
- Modify: `components/cookgame/ui/RecipeJournal.tsx`

**Interfaces:**
- Consumes: `recipeMeta`, `setRecipeName`, `toggleRecipeFavorite` (Tasks 2-3).
- Produces: the recipe list now shows each discovered recipe with: a ⭐ favorite toggle, an editable name field (committed on blur), the effect chips, and the best value. Favorited recipes sort to the top.

- [ ] **Step 1: Upgrade the recipe list**

In `components/cookgame/ui/RecipeJournal.tsx`:

a) Add a selector (after `discoveredEffects`):

```tsx
  const recipeMeta = useCookgameStore((s) => s.recipeMeta);
```

b) Compute a sorted list before `return` (favorites first, then by best value desc, then key):

```tsx
  const sortedRecipes = [...discoveredRecipes].sort((a, b) => {
    const ma = recipeMeta[a] ?? {}, mb = recipeMeta[b] ?? {};
    if (!!mb.favorite !== !!ma.favorite) return mb.favorite ? 1 : -1;
    return (mb.bestValue ?? 0) - (ma.bestValue ?? 0) || a.localeCompare(b);
  });
```

c) Replace the existing recipe `<ul>...</ul>` block (the one mapping `discoveredRecipes`) with a version that maps `sortedRecipes` and renders meta. Keep the existing empty-state `<p>` for `discoveredRecipes.length === 0`:

```tsx
      {discoveredRecipes.length === 0 ? (
        <p className="font-mono text-sm text-neutral-400">
          No recipes discovered yet — start mixing.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sortedRecipes.map((key) => {
            const ids = key.split('+').filter(Boolean) as EffectId[];
            const meta = recipeMeta[key] ?? {};
            return (
              <li
                key={key}
                className="flex flex-col gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => useCookgameStore.getState().toggleRecipeFavorite(key)}
                    className={`shrink-0 text-base leading-none ${meta.favorite ? 'text-amber-400' : 'text-neutral-600 hover:text-neutral-400'}`}
                    title={meta.favorite ? 'Unfavorite' : 'Favorite'}
                    aria-label={meta.favorite ? 'Unfavorite recipe' : 'Favorite recipe'}
                  >
                    {meta.favorite ? '★' : '☆'}
                  </button>
                  <input
                    defaultValue={meta.name ?? ''}
                    placeholder="Name this recipe…"
                    onBlur={(e) => useCookgameStore.getState().setRecipeName(key, e.target.value)}
                    className="min-w-0 flex-1 rounded bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-lime-500"
                  />
                  {meta.bestValue != null && (
                    <span className="shrink-0 font-mono text-[11px] text-lime-400">${meta.bestValue}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ids.map((id, i) => (
                    <EffectChip key={`${id}-${i}`} id={id} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
```

> The `defaultValue` + `onBlur` (uncontrolled input) avoids per-keystroke store writes; the name commits when the field loses focus. The `key={key}` on the `<li>` keeps each input bound to its recipe even as the favorite sort reorders the list.

- [ ] **Step 2: Typecheck + lint**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i RecipeJournal || echo "clean"`
Expected: `clean`.

Run: `./node_modules/.bin/eslint components/cookgame/ui/RecipeJournal.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cookgame/ui/RecipeJournal.tsx
git commit -m "feat(cookgame): recipe naming, favoriting, best-value in journal (M5)"
```

---

### Task 6: Full verification + milestone wrap-up

**Files:** none (verification only).

- [ ] **Step 1: Full cookgame unit suite**

Run: `./node_modules/.bin/vitest run lib/cookgame`
Expected: all green — including the pre-existing progression/property/districts/timeOfDay/shops/store/economy suites (the new fields are additive; no existing signature changed).

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -iE 'cookgame|journal' || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Lint**

Run: `./node_modules/.bin/eslint components/cookgame lib/cookgame`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `./node_modules/.bin/vite build`
Expected: exit 0.

- [ ] **Step 5: Manual checklist** (browser — record results in the PR description)

- Open the journal (J): the Effect Catalog shows all 10 effects, most locked (`???`) on a fresh save.
- Mix a product → its effects flip to discovered (colored chips with tier + ×multiplier); the discovered count rises.
- Load a couch-lock/zoom-haze/glimmer-dust base to the bench (no mixing needed) → its bonus effect (sedating/focused/glowing) becomes discovered.
- Each discovered recipe shows a best-value (`$N`) that only ever rises; mixing the same effect-set on a better base raises it.
- Rename a recipe (commits on blur) and ⭐-favorite it → favorites sort to the top; reload the page → names, favorites, best values, and discovered effects persist (save v3, no migration needed).

- [ ] **Step 6: Senior review + PR**

- Dispatch the `senior-swe-reviewer` (opus) over the branch diff vs `main`; address findings.
- Open the PR to `main` titled `feat(cookgame): Phase 3 M5 — journal depth`, summarizing the effect catalog, best-value tracking, and naming/favoriting, with the manual checklist. Note this **completes Phase 3** (M1–M5 all merged).

---

## Self-Review Notes

- **Spec coverage (§8):** effect catalog with discovered/locked silhouettes via `discoveredEffects` (Tasks 1, 4); per-recipe best `productValue` (Tasks 1, 2); naming + ⭐-favoriting persisted in `recipeMeta` (Tasks 3, 5). Pure helpers (catalog assembly, best-value merge) vitest-tested (Task 1). Upgrades the existing `RecipeJournal` overlay (Tasks 4, 5). No save bump — both fields already in v3 (matches §9 defaults).
- **Discovery completeness:** effects enter a product at exactly two points — base bonus effects at `loadBaseToBench`, additive effects at `mixIn`. Both are wired (Task 2), so the catalog can reach 100% through normal play (glowing/sedating come only from bases; the `loadBaseToBench` hook is what makes them reachable without a matching additive).
- **Key alignment:** `recipeMeta` and `discoveredRecipes` share the `effectSetKey` string, so best-value/name/favorite attach to the same recipe identity the journal already lists.
- **Backward compatibility:** no existing pure-lib signature changed; `discoverEffects`/`mergeBestValue` return the same reference on no-op to avoid needless state writes (and autosave churn). Phases 1–2 + M1–M4 suites untouched.
- **Type consistency:** `CatalogEntry`, `effectCatalog`, `discoverEffects`, `mergeBestValue`, `setRecipeName`, `toggleRecipeFavorite` are referenced with identical names/shapes across tasks; `RecipeMeta` matches the existing `types.ts` definition.
