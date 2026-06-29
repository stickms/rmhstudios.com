# "Game" (cookgame) — Phase 4 Design — NPC Simulation (Demand, Deals & Employees)

> **Status:** Approved for spec. Depends on Phases 1–3 (all merged) + the 3D model overhaul (merged).
> **Display title:** "Game" · **Internal slug:** `cookgame`.
> **Engine:** react-three-fiber + Rapier; reuses the overhaul's procedural model kit + lighting + the M4 day clock.

## 1. Goal

Turn the **static** rank-gated buyers of Phase 3 into a living market. NPCs gain **dynamic demand**
that depletes when you sell to them and **restocks over time**; a **reputation** with each buyer that
gates better business; and **drifting preferences** that keep recipes from going stale. A **phone**
delivers timed **deal offers** (sell N units of an effect by a deadline for a premium) — the structured
demand sink. Finally, the player **hires employees** (grower, chef, dealers) to **automate** the
buy→grow→cook→sell loop, turning the single-player grind into a light management/idle layer. Money
gains new sinks (wages) and new faucets (deals, reputation premiums).

Tone unchanged: satirical/fictional. Pure logic stays vitest-tested in node; R3F/UI is
typecheck+lint+manual (no DOM test env). Extends Phases 1–3 rather than rewriting them; existing
pure-lib signatures stay backward-compatible (new multipliers are optional, default neutral).

## 2. Build Sequencing (milestones)

Phase 4 is large and is built as **one spec, three milestones**, each its own plan → subagent-driven
build → senior (opus) review → **PR/merge to `main`** (the #242–#276 cadence). Strict order — each
milestone consumes the prior:

| Milestone | Scope | New pure lib |
|---|---|---|
| **M1 Dynamic demand** | Per-buyer demand (depletes on sale, restocks on the M4 clock), reputation, slow preference drift; feeds pricing + a live "what each buyer wants now" sell UI; save **v3→v4** | `demand.ts` |
| **M2 Phone & deals** | Phone overlay with timed deal offers generated from demand/reputation; accept → fulfill from packaged stock by deadline → cash+rep+XP; decline/expire → reputation/heat consequences | `deals.ts` |
| **M3 Employees & dealers** | Hire NPCs (capped by rank/property) to automate the loop — grower (auto-tend/harvest), chef (auto-cook), dealers (auto-fulfill deals / passive sell) — each with wages (cash sink) + capacity | `employees.ts` |

Each milestone is independently shippable and leaves the game playable. The **save bumps v3→v4 once**
(M1) with all Phase-4 fields defaulted (`buyerState`, plus M2 `deals`/M3 `employees` empty) so M2/M3
add behavior without re-bumping — mirroring the Phase-3 v2→v3 strategy.

## 3. Dynamic Demand Model (M1) — `lib/cookgame/demand.ts` [PURE]

**New per-buyer dynamic state**, stored in the save as `buyerState: Record<BuyerId, BuyerDynamicState>`:

```
BuyerDynamicState = {
  demand: number;          // 0..1, how much this buyer wants product right now
  reputation: number;      // 0..1, your standing with them
  preferredEffect: EffectId; // current preference (seeds from Buyer.preferredEffect, then drifts)
}
```

Defaults on a new/migrated save: each buyer at `demand: 1`, `reputation: 0`, `preferredEffect` = the
static `Buyer.preferredEffect`.

**Pure functions (vitest-tested; no `Date.now()`/`Math.random()` — time and rolls are passed in):**
- **`restockDemand(demand, dtMs): number`** — regenerates toward `1.0` at `RESTOCK_PER_MS` (tuned so a
  fully-saturated buyer recovers over a few in-game hours of the M4 clock). Clamped to `[0,1]`.
- **`depleteDemand(demand, units): number`** — each unit sold lowers demand by `DEPLETE_PER_UNIT`
  (flooding one buyer saturates them). Clamped to `[0,1]`.
- **`demandPriceMult(demand): number`** — maps demand → a price factor in roughly `0.6..1.3` (a scarce
  buyer pays a premium; a saturated one discounts). Monotonic, tuned constants.
- **`reputationPriceMult(rep): number`** — a small premium that rises with reputation (e.g. `1.0..1.15`).
- **`gainReputation(rep, delta): number`** — clamp `rep + delta` to `[0,1]`. Sales (especially matching
  the buyer's preferred effect) add reputation; heat / failed deals (M2) subtract it.
- **`driftPreference(state, roll): BuyerDynamicState`** — with probability `DRIFT_CHANCE` (compared
  against a caller-supplied `roll ∈ [0,1)`), shift `preferredEffect` to another `EffectId` chosen
  deterministically from `roll`. Returns the same reference when no drift occurs.

**Integration (keeps `economy.ts` pure):** `economy.buyerOffer` already accepts optional multipliers
(the M1 `priceMult` perk). Demand + reputation multipliers pass in the same way — `buyerOffer` stays a
pure function of its inputs. The store composes `perk.priceMult * demandPriceMult(demand) *
reputationPriceMult(rep)` at the call site.

**Store wiring:** add `buyerState`; a throttled **`tickDemand(dtMs)`** action (restocks every buyer +
rolls preference drift) folded into the existing `WorldTicker` (same pattern as `tickClock`/`tickHeat`,
early-returning to avoid idle churn). `sellUnit` now: deplete the target buyer's demand, gain
reputation (bonus when the product carries their `preferredEffect`), and fold demand/reputation mults
into the offer. A `getBuyerState(buyerId)` selector backs the UI.

**UI:** `SellOverlay` shows the buyer's live **demand meter**, **reputation** (e.g. ★ rating), and
**current wanted effect** ("Wants Euphoric · demand high · rep ★★★☆☆"), and the per-unit offer reflects
the live mults. The core buy→mix→sell loop still works regardless of demand level.

## 4. Phone & Deal System (M2) — `lib/cookgame/deals.ts` [PURE] + phone overlay

- **Deal offers** are generated from buyer demand/reputation: `Deal = { id, buyerId, effect: EffectId,
  qty, unitPrice, deadline (clock-ms), createdAt }`. Higher reputation + demand → more frequent,
  larger, better-priced offers. A pure `rollDeal(buyer, buyerState, clock, roll)` builds a candidate;
  the store schedules them (capped count) on a throttled tick.
- **Phone overlay** (new HUD button / hotkey): lists **active deals** with buyer, wanted effect, qty,
  total payout, and a countdown to the deadline. **Accept** → marks the deal active; **fulfill** by
  delivering matching packaged units before the deadline → cash + a reputation bump + XP. **Decline**
  or **expire** → a small reputation/heat consequence.
- **Pure helpers (tested):** `rollDeal`, `isExpired(deal, clock)`, `dealPayout(deal)`,
  `canFulfill(deal, packaged)` (does the player hold enough matching-effect units). Save field
  `deals: Deal[]` (defaulted `[]` in the v4 bump).

## 5. Employees & Dealers (M3) — `lib/cookgame/employees.ts` [PURE] + management overlay

- **Hireable roles**, each with a hire cost + per-time **wage** (cash sink) and a capacity:
  - **Grower** — auto-tends/harvests plots on their cooldowns.
  - **Chef** — auto-runs the cook mini-game at a fixed (sub-player) quality.
  - **Dealer** — auto-fulfills active deals and/or passively sells into buyer demand, generating cash
    while away (bounded by demand + capacity).
- **`EMPLOYEE_ROLES`** content table `{ id, name, role, hireCost, wagePerSec, capacity, rankReq }`;
  hires capped by rank/property (a management sink for cash + property tiers). Save field
  `employees: HiredEmployee[]` (defaulted `[]` in the v4 bump).
- **Pure helpers (tested):** wage accrual, per-tick automation decisions (which plot to tend, which
  deal to fulfill) as pure functions of state, so the store ticker stays thin and testable.
- **Overlay:** a management panel to hire/fire and see wages vs. income. Automation runs on the
  throttled world ticker.

## 6. State & Save

Store additions across milestones: `buyerState: Record<BuyerId, BuyerDynamicState>` (M1),
`deals: Deal[]` (M2), `employees: HiredEmployee[]` (M3). **Save bumps v3→v4 once** (M1) with a forward
migration that defaults all Phase-4 fields (`buyerState` seeded from the static `BUYERS`, `deals: []`,
`employees: []`) so v3 saves upgrade losslessly; `parseSave` validates the v4 shape. The migration
chain becomes v1→v2→v3→v4.

## 7. Testing & Verification

- **Unit (vitest, pure, no DOM):** `demand` (restock/deplete clamps, price-mult curves, reputation
  clamp, deterministic drift), `deals` (rollDeal determinism, expiry, payout, fulfilment check),
  `employees` (wage accrual, automation decisions), save v3→v4 migration, and store flows (sell
  depletes demand + gains rep, tickDemand restocks, deal accept/fulfil/expire, employee tick). Phases
  1–3 tests stay green (new multipliers default neutral; new fields additive).
- **Type/build/lint:** `tsc --noEmit` clean, `eslint` clean, `vite build` exit 0 (drop the stray
  `routeTree.gen.ts` regen the build appends).
- **Manual:** sell to a buyer repeatedly → watch demand fall and offers drop, then recover over time;
  see reputation rise and a preference shift; accept a phone deal and fulfil it before the deadline
  (and let one expire); hire a grower/dealer and watch the loop run with wages ticking; reload to
  confirm v4 persistence + v3 migration.
- **`senior-swe-reviewer` (opus) before each milestone PR.**

## 8. Out of Scope (later phases)

Police AI, busts, wanted escalation, rival cartel/factions (Phase 5); multiplayer (Phase 6). Mobile
controls and authored GLB assets remain out. Phase 4 keeps automation **bounded** (capacity + demand
limits) — it is a light management layer, not a full offline idle-economy or AI pathfinding sim.
