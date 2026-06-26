# "Game" — Cooking & Dealing Sim — Phase 1 Design

> **Status:** Phase 1 of 5 approved for spec.
> **Display title:** "Game" · **Internal slug:** `cookgame` (avoids collision with existing
> `components/game/` and `lib/game/`; single constant, trivially renamed later).
> **Genre:** Satirical/fictional 3D crime-management sim. Public library entry.
> **Engine:** react-three-fiber + Rapier (declarative), reusing Forest Explorer patterns.

## 1. Premise & Tone

A clearly **satirical, fictional** tycoon sim in the vein of Steam's *Schedule I*: the player
runs an underground operation — buy ingredients, **mix** product for value-boosting "effects,"
package it, and sell to neighbourhood NPCs while keeping "heat" down. Tone matches studio
precedent (*House Always Wins*, *rmh-capital*): comedic and over-the-top, never instructional.
No real-world chemistry, quantities, or procedures are modelled — production is abstracted into
game-y stations and a data-driven **effects engine**. All substances/strains are invented.

## 2. Full-Game Roadmap (context)

The complete game is built in 5 stacked chunks; each is its own spec → plan → build cycle.

| Phase | Scope | Depends on |
|---|---|---|
| **1 (this doc)** | Foundation + core loop: world, character, interaction, **mixing/effects engine**, inventory, packaging, selling, soft heat, save | — |
| 2 | Production pipelines: weed grow stations + chemistry-station cook mini-game; multiple bases feed the mixer | 1 |
| 3 | Economy & progression: rank/XP, shops, property buy/upgrade, day–night & time cycle, recipe discovery depth | 1, 2 |
| 4 | NPC simulation: customer base w/ demand & preferences, phone/deal system, hire employees & dealers (automation) | 1–3 |
| 5 | Heat, police & cartel: police AI, busts, wanted escalation, rival factions, risk events | 1–4 |

Phase 1 is a **fully playable vertical slice** on its own: buy → mix → package → sell → improve recipes.

## 3. Phase 1 Architecture

Mirrors Forest Explorer's layout so we reuse proven controller/interaction/save code.

```
lib/cookgame/
  types.ts            # shared TS types (Product, Additive, Effect, SaveV1, store shapes)
  effects.ts          # ⭐ PURE effects engine — mix(), value calc, transforms. No R3F. Unit-tested.
  content.ts          # data tables: BASES, ADDITIVES, EFFECTS, TRANSFORM_RULES, BUYERS
  economy.ts          # pure: buyer offer pricing, heat application, packaging yield
  store.ts            # Zustand store: cash, inventory, recipes, heat, player pos; actions
  saveSystem.ts       # versioned localStorage save/load (pattern copied from forest-explorer)

components/cookgame/
  GameShell.tsx       # auth gate + canvas mount (studio GameShell pattern)
  CookGameGame.tsx    # top-level: <Canvas>, scene, HUD, overlays, save wiring
  world/
    TownScene.tsx     # ground, street, buildings (low-poly), boundary walls, lighting
    PlayerController.tsx  # WASD + mouse + sprint + E (adapted from forest-explorer)
    Interactable.tsx      # registers a station/NPC interaction zone
    InteractionPrompt.tsx # "Press E" floating prompt
  stations/
    MixingStationOverlay.tsx   # product slot + additive slot + Mix → effects/value preview
    SupplierShopOverlay.tsx    # buy bases & additives with cash
    PackagingOverlay.tsx       # convert mixed product → sellable units
  npc/
    BuyerNPC.tsx        # static buyer model + interaction → SellOverlay
    SellOverlay.tsx     # buyer offer, accept/decline, applies heat
  ui/
    HUD.tsx             # cash, heat meter, carried-product summary
    RecipeJournal.tsx   # discovered combos (journal-overlay pattern)
    MenuOverlay.tsx     # pause/save/reset

app/routes/cookgame.tsx   # route → GameShell
lib/games.ts              # add public GameInfo entry (id 'cookgame')
public/images/games/cookgame.webp  # placeholder card art
```

### 3.1 Boundaries / isolation
- **`effects.ts` is pure and R3F-free** — the crown jewel. `mix(product, additive)` and value
  computation are deterministic functions over `content.ts` data; fully unit-testable with vitest
  (no DOM env needed — matches the repo's pure-logic test constraint).
- **`economy.ts`** pure too (offer pricing, heat, packaging) — testable in isolation.
- **`store.ts`** is the only stateful hub; React/R3F components are thin views over it.
- World/UI components depend on the store + pure libs, never on each other's internals.

## 4. The Effects Engine (signature mechanic)

Data-driven, modelled on *Schedule I*'s mixing system.

**Data shapes (`types.ts`):**
```ts
interface Effect   { id: string; name: string; multiplier: number; tier: 1|2|3; color: string; }
interface Additive { id: string; name: string; cost: number; baseEffect: EffectId; }
interface Base     { id: string; name: string; baseValue: number; }
interface TransformRule {           // mixing `additive` into a product carrying `from` → `to`
  additive: AdditiveId; from: EffectId; to: EffectId;
}
interface Product  { baseId: BaseId; effects: EffectId[]; }   // carried/mixed product instance
```

**`mix(product, additive) → Product` algorithm:**
1. Start from `product.effects`.
2. Apply transform rules for this additive: any existing effect `from` becomes `to` (rules applied
   to a snapshot so one additive can't cascade-transform its own outputs in a single mix).
3. Add the additive's `baseEffect` if not already present.
4. De-dupe; cap at **8** effects (excess dropped, lowest tier first).
5. Return `{ baseId, effects }`. **Output can be re-fed as input** to stack effects across mixes.

**Value:** `value(product) = round(base.baseValue × Π(effect.multiplier for each effect))`.

**Discovery:** the first time a `(state → newState)` mix yields an effect set not seen before, it's
recorded in the **Recipe Journal**. Journal persists in the save.

**Phase-1 content budget** (enough for real experimentation, small enough to ship/test):
- 1 base strain, ~8 additives, ~10 effects, ~12 transform rules. Tables live in `content.ts` and
  are trivially expandable in later phases.

## 5. World, Character, Interaction

- **Map:** one bounded block — your property (lab interior with Mixing + Packaging stations), a
  short street, a Supplier shop, and 2–3 static buyer spots. Low-poly stylized; day-only lighting.
  Boundary walls keep the player in-bounds.
- **Controls:** third-person — WASD move, mouse-look camera, Shift sprint, **E** interact. Adapted
  from forest-explorer `PlayerController` (Rapier capsule). Desktop-first; mobile joystick deferred.
- **Interaction:** `Interactable` registers a trigger zone + label; when the player is inside,
  `InteractionPrompt` shows "Press E"; pressing E opens that station/NPC overlay. One active
  interaction at a time.

## 6. Core Loop & Economy

1. **Supplier shop** — spend cash on the base strain and additives (`SupplierShopOverlay`).
2. **Mixing station** — load product + an additive, preview resulting effects + value, confirm
   (`MixingStationOverlay`). Re-feed to stack. New combos → journal.
3. **Packaging station** — convert a mixed product batch into N sellable units (`economy.ts`
   packaging yield), each carrying the product's effect set/value.
4. **Sell** — walk to a buyer; `SellOverlay` shows an **offer** = `value × (preference factor) ×
   (heat penalty) × (small variance)`. Accept → cash gained, **heat += sale increment**. Decline → no change.
5. **Heat** — single 0–100 meter; rises per sale, **decays over real time** while playing. Above a
   threshold buyers pay less / may decline. No police AI in Phase 1 (Phase 5).
6. **Money is the score.** No formal win condition in Phase 1.

## 7. State & Save

- **Zustand store** holds: `cash`, `inventory` (additives owned, product batches, packaged units),
  `discoveredRecipes`, `heat`, `playerPosition`, plus actions (`buy`, `mix`, `package`, `sell`,
  `tickHeat`). Pure libs do the math; the store just holds state and calls them.
- **Save:** versioned localStorage (`cookgame-save-v1`), copied from forest-explorer `saveSystem`
  (size guard, version check, corrupt-data discard). Autosave on key actions + manual save in menu;
  load on mount; reset from menu.

## 8. Integration & Listing

- `lib/games.ts`: new public `GameInfo` (`id: 'cookgame'`, title "Game", satirical description,
  tags like `['Simulation','Tycoon','Crime']`, `authGate: true`, placeholder `imagePath`). The
  description copy will read clearly as comedic fiction.
- `app/routes/cookgame.tsx`: route renders `GameShell`.
- Placeholder card art at `public/images/games/cookgame.webp`.

## 9. Testing & Verification

- **Unit (vitest, pure logic — no DOM):** `effects.ts` (`mix` correctness, transform ordering,
  effect cap, value math, determinism) and `economy.ts` (offer pricing, heat penalty/decay,
  packaging yield). Run via `./node_modules/.bin/vitest` per repo constraints.
- **Type/build:** typecheck + build with `./node_modules/.bin/*` wrappers (pnpm wrappers blocked).
- **Manual:** load route, full loop buy→mix→package→sell, heat rise/decay, save/reload persistence.
- Run the `senior-swe-reviewer` agent before any PR (studio convention for game work).

## 10. Out of Scope for Phase 1 (handled by later phases)

Grow/cook production pipelines, multiple bases, rank/XP, shops beyond the single supplier, property
purchase/upgrade, time-of-day cycle, customer demand simulation, phone/deal system, employees &
dealers, police/cartel/busts, mobile controls. The Phase 1 data tables and store are shaped so each
later phase extends rather than rewrites.
