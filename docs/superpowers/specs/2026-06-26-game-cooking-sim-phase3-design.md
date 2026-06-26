# "Game" (cookgame) — Phase 3 Design — Economy, Progression & Metroidvania Districts

> **Status:** Approved for spec. Depends on Phases 1 & 2 (merged) + the 3D model overhaul (merged).
> **Display title:** "Game" · **Internal slug:** `cookgame`.
> **Engine:** react-three-fiber + Rapier; reuses the overhaul's procedural model kit + lighting.

## 1. Goal

Turn the single-block vertical slice into a **progression-driven, metroidvania-structured** game:
the player earns **XP** from the whole loop, **ranks up**, and rank/key gates **open new connected
districts** of an expanding town that house new shops, buyers, and buyable/upgradeable **property**.
A real-time **day–night cycle** animates the world and selectively gates some content. The recipe
journal deepens into a catalog. Money becomes meaningful (property + upgrades + stash cap are the sinks).

Tone unchanged: satirical/fictional. Pure logic stays vitest-tested in node; R3F/UI is
typecheck+lint+manual (no DOM test env). Extends Phases 1–2 rather than rewriting them.

## 2. Build Sequencing (milestones)

Phase 3 is large (~30–40 tasks; the district world-building is the heavy part). It is **one spec**
(coherent design) built as **five milestones**, each its own plan → subagent-driven build →
senior review → **PR/merge to `main`** (matching the #229/#239 cadence). Strict order:

| Milestone | Scope | New pure libs |
|---|---|---|
| **M1 Progression** | XP/rank curve, rank unlocks data, passive perks wired into economy/cultivation, rank+XP HUD, save **v2→v3** | `progression.ts` |
| **M2 Shops & Property** | Data-driven multi-shop catalog (rank-gated items), property tiers (plots/station-upgrades/stash-cap/passive-income), shop + property overlays | `property.ts`, shop content |
| **M3 Districts** | The metroidvania map: ~4 connected district scenes, rank/key gates + transitions, district map UI | `districts.ts` |
| **M4 Day–night** | Real-time clock, animated sun/sky, selective open/closed gating | `timeOfDay.ts` |
| **M5 Journal depth** | Effect catalog + per-recipe best-value tracking + naming/favoriting | (extends content) |

Each milestone is independently shippable and leaves the game playable. Later milestones consume
earlier ones (M2 gates on M1 rank; M3 districts host M2 shops/property; M4 gates some M3 content).

## 3. Progression Spine (M1) — `lib/cookgame/progression.ts` [PURE]

- **XP sources:** `xpForSale(saleValue)` (scales with value), `xpForRecipe()` (one-time per newly
  discovered effect-set), `xpForProduction()` (per harvest/cook collect). Exact constants tuned in plan.
- **`RANKS`** — an ordered table; each entry `{ rank, name, xpThreshold, shopTier, propertyTierUnlocked,
  buyersUnlocked: BuyerId[], perk }`. ~6–7 ranks with rising thresholds.
- **`rankForXp(xp): RankInfo`** and **`xpToNextRank(xp)`** — pure.
- **Perks (cumulative):** a `perksAtRank(rank)` returns `{ priceMult, heatMult, cooldownMult }`
  (e.g. small +price%, −heat%, −tend/dry-cooldown%). Applied READ-ONLY in `economy.buyerOffer` /
  `applyHeatOnSale` and `cultivation` cooldown checks (pass the perk factor in; keep those libs pure).
- Store gains `xp` (and derives `rank`); a `gainXp(amount)` action called by `sellUnit`, `mixIn`
  (on new recipe), `harvestPlot`/`submitCook`/`collectDried`. **Existing pure-lib signatures stay
  backward-compatible** — perk params are optional and default to neutral (1.0) so Phase 1/2 tests pass.

## 4. Metroidvania Districts (M3) — `lib/cookgame/districts.ts` [PURE] + world

- **~4 districts:** `suburbs` (home lot, always open, start), `downtown` (rank-gated), `docks`
  (key-item-gated; night-leaning), `warehouse` (high-rank-gated). Connected in a small graph with
  named gates between them; backtracking free once open.
- **`DISTRICTS`** content: each `{ id, name, gate: {type:'rank', rank} | {type:'key', keyId}, contains:
  {shops, buyers, property} }`.
- **`isDistrictUnlocked(id, rank, keys): boolean`** — pure gate check. The world renders each gate's
  barrier mesh as locked (solid, with a rank/key hint) or open (passable) from this.
- **Keys** are inventory items acquired by rank reward or shop purchase (e.g. the docks key is buyable
  at the Downtown hardware store once `rank ≥ N`). Stored in the save.
- **World:** each district is a scene area built from the overhaul's `models/` kit (buildings, ground,
  props, stations, characters), laid out beyond the current ±20 block and joined by gate corridors.
  A lightweight district-transition keeps the player bounded to unlocked districts. Reuses
  `Interactable`/`PlayerController`/lighting. (This is the heaviest build chunk.)

## 5. Shops (M2) — content + generalized overlay

- Data-driven **shop catalog**: `SHOPS` content `{ id, name, districtId, items: [{kind:'additive'|
  'base'|'input'|'upgrade'|'key', refId, price, rankReq, timeWindow?}] }`. Items appear when
  `rank ≥ rankReq` (and, if `timeWindow` set, only when open per M4).
- Shops: **Supplier** (suburbs, existing — migrated to the catalog), **Hardware Store** (downtown —
  grow/cook gear, station upgrades, the docks key), **after-hours stall** (docks — premium/black-market,
  night-only).
- A single generalized `ShopOverlay` (data-driven, replacing the bespoke `SupplierShopOverlay` logic)
  renders any shop's catalog filtered by rank/time, with buy buttons + cash/owned display.

## 6. Property (M2) — `lib/cookgame/property.ts` [PURE] + overlay

- **`PROPERTY_TIERS`**: ordered `{ tier, name, districtId, cost, rankReq, plots, stationUpgrades,
  stashCap, passiveIncomePerSec }` — cumulative. Tier 0 = starting lot (3 plots, base stash cap,
  no income). Higher tiers (rank-gated, cash-bought) raise plot count (3→6→9, plots physically appear),
  apply station upgrades (faster tend/dry cooldowns via the M1 `cooldownMult`-style factor, bigger
  packaging batches), raise the **stash cap**, and add **passive income**.
- **`propertyEffects(ownedTier)`** — pure aggregate of the owned tier's effects.
- **Stash cap (new constraint):** total `baseStock` units + `packaged` units may not exceed the cap;
  `buyBase`/production collect/`packageBench` refuse when it would overflow (return false). Cap comes
  from `propertyEffects`. *(This changes Phase-2 store behavior — covered by updated store tests.)*
- Store: `ownedPropertyTier`, actions `buyProperty(tier)` / `upgradeStation(id)`; a passive-income
  tick (reuse the existing per-frame ticker, throttled). Plot count becomes `propertyEffects().plots`
  (the store's `plots` array grows on purchase; cultivation untouched).

## 7. Day–Night Cycle (M4) — `lib/cookgame/timeOfDay.ts` [PURE] + lighting

- **`DAY_LENGTH_MS`** (~360000 = 6 real min/day). Store holds `clock` (ms into the day); a ticker
  advances it (`advanceClock(clock, dtMs)` pure, wraps at day length). Survives save (absolute or
  day-relative — day-relative `clock` value persisted).
- **`phaseOfDay(clock): 'dawn'|'day'|'dusk'|'night'`** and **`sunDirection(clock): [x,y,z]`** —
  pure; `Lighting.tsx` reads them each frame to animate sun position/intensity + sky tint.
- **Selective gating:** `isOpenAt(window, clock)` where `window` is `{ from, to }` in day-fraction;
  a few shops/buyers/districts carry a `timeWindow` (e.g. hardware store day-only, docks stall
  night-only). Closed = shop items hidden / buyer won't deal / a district gate shows "closed until …".
  Core buy→mix→sell loop works anytime.

## 8. Recipe Journal Depth (M5)

- **Effect catalog:** list every `EFFECT` with name/tier/multiplier, marked discovered (seen in any
  product) or locked (silhouette). Tracked via a `discoveredEffects` set in the save.
- **Per-recipe best value:** for each discovered effect-set key, record the best `productValue` ever
  achieved with it.
- **Naming / favoriting:** let the player rename and ⭐-favorite discovered recipes (persisted).
- Upgrades the existing `RecipeJournal` overlay; pure helpers (catalog assembly, best-value merge)
  are vitest-tested.

## 9. State & Save

Store additions across milestones: `xp`, `ownedPropertyTier`, `keys: string[]`,
`unlockedDistricts` (derivable from rank+keys but cached), `clock`, `currentDistrict`,
`discoveredEffects`, recipe metadata (names/favorites/best-values). **Save bumps v2→v3** (M1) with a
forward migration that defaults all new fields (xp 0, tier 0, empty keys, clock 0, etc.) so v2 saves
upgrade losslessly; `parseSave` validates the v3 shape.

## 10. Testing & Verification

- **Unit (vitest, pure, no DOM):** `progression` (xp formulas, `rankForXp` thresholds, perk
  aggregation), `property` (`propertyEffects`, stash-cap math), `districts` (`isDistrictUnlocked` gate
  logic), `timeOfDay` (`advanceClock` wrap, `phaseOfDay`, `isOpenAt` windows incl. wrap-around night),
  journal helpers, save v2→v3 migration, and store flows (gainXp/rank-up, buyProperty + cap
  enforcement, district unlock, clock tick). Phases 1–2 tests stay green (perk params default neutral).
- **Type/build/lint:** `tsc --noEmit` clean, `eslint` clean, `vite build` exit 0.
- **Manual:** earn XP→rank up→see unlocks; open a gate into a new district; buy/upgrade property
  (plots appear, stash cap enforced, income trickles); watch day→night animate and a night-only
  shop/buyer gate; use the upgraded journal; reload to confirm v3 persistence + v2 migration.
- **`senior-swe-reviewer` before each milestone PR.**

## 11. Out of Scope (later phases)

Full NPC demand simulation, phone/deal system, hireable employees & dealers (Phase 4); police AI,
busts, wanted escalation, rival cartel/factions (Phase 5); multiplayer (Phase 6). Mobile controls and
authored GLB assets remain out. Phase 3 adds a few **static** rank-gated buyers, not a demand sim.
