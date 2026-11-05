# Hearthworks: the city layer

Roads, zones, utilities and milestones — the part of Isleworks that Hearthworks kept. It is plan 3E of
[`superpowers/plans/2026-11-04-hearthworks.md`](./superpowers/plans/2026-11-04-hearthworks.md) and
lives inside the same deterministic simulation as the farm, the kitchen and the crime route: plain data in
`World`, changed only by commands, advanced only by `stepWorld`. Nothing here is a second game.

Every number below is a constant in `lib/hearthworks/content/city.ts`; change it there, and the tests that
pin behaviour (not numbers) keep passing.

## What changed in the loop

You still farm, cook and sell. The town adds a second way to make a place worth coming to:

- **Roads** are the cheap, fast way round: NPC customers and farmhands path along them (and walk about 1.5×
  as fast on them), so a stall at the end of a street is a stall people reach.
- **Homes zones** grow lots that house residents. Residents are the new customers: once the town has people,
  most of the customers who walk up to your stalls set out from a home on the road network instead of the
  shore.
- **Shops and workshops** give residents jobs and the town trade income; every shop lot adds a little
  foot traffic to what customers pay at your stalls (+0.05 on the 1.5× customer premium, up to +0.3).
- **Utilities** supply power and water along the roads. A powered auto-harvester works twice as often.
- **Milestones** unlock zones and utilities (and one a skin) and pay a reward.

## Where it lives

| Piece | File |
| --- | --- |
| Numbers, zone / utility / milestone tables | `lib/hearthworks/content/city.ts` |
| State shapes (`CityState`, commands, events) | `lib/hearthworks/world/city-types.ts` |
| Packed cells, flags, `roadLink` (the one road rule) | `lib/hearthworks/world/city-cells.ts` |
| Derived data and stepping (`recomputeCity`, `tickCity`) | `lib/hearthworks/world/city.ts` |
| Command handlers | `lib/hearthworks/world/city-commands.ts` |
| Pathfinding and walking on roads | `lib/hearthworks/nav/{passable,astar,mover}.ts` |
| Save format v2 and v1 migration | `lib/hearthworks/save/{format,city-schema}.ts` |
| Peer command schemas | `lib/hearthworks/net/protocol.ts` |
| Drag → commands | `lib/hearthworks/city-input.ts` |
| Road and zone meshes, lot / utility models | `lib/hearthworks/art/{city-mesh,models}.ts` |
| Scene, panel, dock | `components/hearthworks/scene/City.tsx`, `CityPanel.tsx`, `Hud.tsx` |

## State

`World.city` is plain JSON and travels with every save and P2P checkpoint:

- `cells` — one packed int per tile (same layout as `terrain`): bit 0 road, bits 1–2 zone, bits 3–4 lot
  level (0 = empty zoned tile, 1–3 = developed lot), bits 5–7 utility. This is the authoritative layer.
- `flags` — derived per tile: 1 connected to the town's road network, 2 powered, 4 watered.
- `population`, `peakPopulation`, `day`, `reached` / `claimed` milestones, `roadCount` — stateful.
- `stats` — derived numbers for the HUD and the rules (people, jobs, coverage, happiness, demand, budget).
- `dirty` — set by anything that changes what the derived data depends on; the next step refreshes it.

Derived data is stored, not recomputed on load, so a snapshot is self-consistent and a replica agrees with the
host to the bit. A save without it (version 1) has `dirty: true` and is rebuilt on the first step.

## Rules

### Roads

- A road goes on open **grass or sand**, one tile at a time or along a straight run of up to 48 tiles
  (`placeRoad {x, z, x2?, z2?}`). It costs 3 per tile, 1 comes back when it is taken up, and upkeep is 0.2 a
  day per tile. Water, trees and rock are refused, as are tiles with a building, a utility or a developed lot.
  A run lays what it can and stops at the first tile that cannot take a road.
- Two road tiles **join** only if they are orthogonal neighbours and their ground differs by at most one
  block level — a ramp, not a cliff (`roadLink`). The same function decides what is drawn as joined, what
  walkers treat as a road step, and what carries power.
- **The town green** is the tile at the middle of the map (the meadow). The **network** is every road that
  joins, directly or through other roads, a road within one tile of the green. Only the network counts: a
  street that does not reach the green is not part of the town yet, and nothing beside it grows.
- Roads over an empty zoned tile pave it over. `place road` still works as a one-tile alias, and old
  saves' `road` buildings become road tiles on load.

### Walking on roads (nav)

A step between two joined road tiles costs `ROAD_STEP_COST` (0.55 of a plain walk) and is always a walk —
even up or down a one-block ramp, where open ground would be a jump — and takes 0.65× the ticks. The pathfinder's
straight-line estimate is scaled by the same 0.55 whenever any road exists, so it stays admissible and A\*
still returns the cheapest route; its heap breaks ties on (f, h, tile index), so every replica finds the same
path. With no roads the scale is 1 and nothing changes. Developed lots and utilities are solid, like cottages.

### Zones and lots

- `zone {zone, x, z, x2?, z2?}` paints a rectangle (up to 256 tiles) of open **grass**; `unzone` clears it. A
  tile costs 4 (homes), 6 (shops) or 8 (workshops); clearing an empty zone returns half, tearing down a built
  lot returns nothing. Tiles that cannot take the zone are skipped, and painting stops when the money does.
- An empty zoned tile **sprouts** into a level-1 lot when it is connected, its zone **wants to grow**, and
  nobody is standing on it. A lot **levels up** (1 → 2 → 3) when it is powered and watered, the town's
  happiness is at least 45, and its **land value** reaches the zone's bar. Growth runs every 10 s of game
  time, at most one lot per step (plus one for every 12 lots already standing), chosen by a hash of (seed,
  tile, step) — never the world's rng, so the city cannot disturb anything else's random stream.
- **Land value** of a tile: 40, +10 per park within 3 tiles (max 2), +5 per shop within 5 (max 2, a stall
  counts), +8 beside water, −12 per workshop within 3 (max 2), −15 unpowered, −10 unwatered.
- A lot's front faces the road beside it.

| Zone | Housing (L1/2/3) | Jobs | Serves residents | Trade/day | Power | Water | Level bar (L2, L3) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Homes | 3 / 6 / 10 | – | – | – | 1 / 2 / 3 | 1 / 2 / 3 | land value 46, 64 |
| Shops | – | 2 / 4 / 7 | 6 / 14 / 26 | 3 / 8 / 16 | 1 / 2 / 4 | 1 / 1 / 2 | 44, 62 |
| Workshops | – | 3 / 6 / 10 | – | 4 / 9 / 18 | 2 / 4 / 6 | 1 / 2 / 3 | 30, 48 |

Existing buildings count once a road reaches them: a **cottage** houses 4, a **stall** is 2 jobs and serves
6, a **kitchen** is 3 jobs, a **park** raises happiness and land value, a **harvester** draws 2 power.

### Utilities

`placeUtility {kind, x, z}` puts a utility on open grass or sand. Each is **solid** and is fed by the road
beside it. Its supply flows only **along the road network**, to at most `reach` road steps.

| Utility | Supplies | Units | Reach | Cost | Upkeep/day | Needs | Unlocked by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Well | water | 14 | 8 | 60 | 0.5 | – | start |
| Windmill | power | 12 | 10 | 110 | 1 | – | start |
| Pumping station | water | 48 | 14 | 240 | 2 | water beside it | Hamlet |
| Water wheel | power | 36 | 14 | 320 | 2 | water beside it | Village |

Allocation is nearest-first and deterministic: lots (and harvesters) are ordered by their road distance to
the closest producer then by tile index, and each takes its draw from the nearest producer in reach that still
has capacity. A lot that is out of reach, or comes after the supply has run out, is dark (or dry) and shows a
signpost over it in the plan view. Unlike Isleworks there is no pooled city-wide supply: where you put the
windmill matters.

Without power a lot works at 30% of its jobs, a home holds half its housing; without water a home holds 60%.

### People, happiness, demand

- **Residents** move in every 20 s of game time toward `housing × desirability` (at least one at a time, up to
  12, closing 12% of the gap) and leave when the town can no longer hold them. Desirability is
  `0.45 + 0.3 × (happiness − 30)/70 + 0.25 × job availability`, never below 0.15.
- **Happiness** (0–100) starts at 50: +14 for homes with a park in reach, +8 with a shop in reach, −14 with a
  workshop next door (all weighted by housing), −12 × unemployment, −0.12 per point of missing power cover,
  −0.10 per point of missing water cover.
- **Demand** (0–100, shown as "wants to grow") for each zone: homes want to grow when jobs outnumber the
  workforce (58% of residents) and the town is happy, and less the more homes stand empty (the first 6 empty places
  do not count); shops want to grow when residents outnumber what the shops serve; workshops when the workforce
  outnumbers the jobs. A zone below 12 demand does not sprout.

### The day and the budget

Every 60 s of game time is a **town day**. The day's accounts are `taxes (1.5 per resident, scaled 60–100% by
happiness) + trade (powered shop and workshop lots) − upkeep (roads and utilities)`. The net is **shared
evenly between every player in the world** (the remainder goes to the first in id order); a deficit is charged
the same way, never below zero money. The HUD shows the figure as "per day"; it is the same number the
`cityDay` event announces.

### Milestones

Milestones are measured continuously and **stay reached** once met. Reaching one raises `milestoneReached`;
`claimMilestone {id}` pays its reward (and look, if it has one) **once per world, to whoever claims it**.

| Milestone | Needs (all at once) | Reward | Opens |
| --- | --- | --- | --- |
| Hamlet | 16 residents, 70% power, 70% water, a shop | 250 | workshop zone, pumping station |
| Village | 30 residents, 12 jobs, happiness 55 | 600 | water wheel |
| Green commons | 40 residents, 3 parks, happiness 62 | 500 + the Factory worker look | – |
| Town | 80 residents, 3 level-3 lots, +20 a day | 1500 + the Barney look | – |
| City | 200 residents, 3 workshops, 90% power and water, happiness 65 | 4000 | – |

Until the first milestone the HUD's town panel shows the next small step instead (lay a road, zone homes,
a windmill, a well, shops) — `nextStep(world)`.

### Pacing

The first milestone is tuned for about ten minutes of play. The simulation's own floor is about **five
minutes**: the test `city.test.ts` builds the cheapest possible first town (a ten-tile street, twelve homes
and four shop tiles, one well and one windmill, 275 of the 300 a new player starts with) in the first tick
and measures the Hamlet at about five minutes of game time (the test allows 3.5–7.5) with no further input. A person has to find the tools,
earn the money for a second windmill, and wait for residents (one arrives every 20 s), which is where the other
five come from. Pace is set by `GROWTH_TICKS`, `POPULATION_TICKS`, `SPROUT_CHANCE` and the milestone
thresholds.

## Commands

All flow through `applyCommand` like `place` and `plant`, with a zod schema each in `net/protocol.ts` (a
compile-time table fails the build when a command type has none):

`placeRoad` · `removeRoad` · `zone` · `unzone` · `placeUtility` · `removeUtility` · `claimMilestone`

Rejections: `bad-shape` (a road run that is not straight), `bad-amount` (too long / too big), `locked`
(milestone not reached), `no-shore`, `not-reached`, `already-claimed`, `unknown-milestone`, plus the
existing `out-of-bounds`, `bad-terrain`, `occupied`, `nothing-there`, `cannot-afford`.

A client sends a drag as one or two runs (`roadCommands` in `city-input.ts`: an L, longer leg first) and a
zone stroke as one rectangle, so a drag is one or two commands, not one per tile.

## Determinism

- The city never draws from the world's rng except in `customers.ts` (which already did, and only when the
  town has people). Growth uses `hash01(seed, tile, step)`.
- Everything derived is a pure function of cells, buildings, terrain and tick, visited in tile-index order
  with explicit tie-breaks.
- `worldHash(world)` (`world/hash.ts`) is a canonical fingerprint; `city.test.ts` checks that the same seed and
  commands give the same hash after thousands of ticks, across a JSON round trip, and across a save
  round trip; `net/__tests__/city.test.ts` checks that a host and two peers (and a late joiner) agree while a
  town is built and grows.

## Save format

`SAVE_VERSION` is 2. `decodeWorld` accepts 1 and 2. A version 1 save gets an empty city; any `road` buildings in
it become road tiles (on grass or sand tiles that are free) and are removed from `buildings`. The city schema
refuses a lying save (wrong cell count, a level with no zone, an unknown utility or milestone, negative
population).

## What was left behind from Isleworks, and why

Isleworks was a placed-building city builder, not a zoning game: there were no zones and no demand meters.
What Hearthworks takes from it is the road-network rule (everything is measured from one anchor), spatial
utility priority, sticky milestones with claimable rewards, unlocks from the best population ever reached, and
the idea of happiness and a monthly budget. Zones and demand are new, because Hearthworks lets you paint
instead of placing every house. Not ported:

- The 40 placeable buildings (hospitals, universities, the observatory, …) and the five service coverages: that
  catalogue belongs to a game about the city alone. Parks, stalls and kitchens already exist here.
- Pollution, noise and traffic fields: replaced by a single "workshop next door" penalty and the road network
  itself. Congestion needs per-tile traffic that the fixed-tick sim does not model.
- Tax-rate control, random city events, land-parcel purchase, the 120-month ledger and building condition
  decay. Each is a clean follow-up (a `setTaxRate` command, events from `w.rng`).
- Its renderer, HUD and cloud save.

## Interface

- **Plan view first.** Pick the **Town** tool set in the dock: Road (drag to lay an L), Homes / Shops / Workshops
  (drag a rectangle), Well, Windmill, Pumping station, Water wheel. Locked tools say which milestone opens them.
  **Clear** takes away whatever is under it (a building, then a utility, a road, a zone). Escape drops a
  drag in progress; the right mouse button and two fingers still pan.
- The **Town** chip opens the panel: next step, people / mood / power / water, what each zone wants, the
  budget, and the milestones with a **Claim** button. A badge counts rewards waiting.
- **Walk view** shows the result (roads, lots and utilities) without the planning markers; road, zone and
  utility tools still work from the Use button on the tile in front of you.
- Roads are drawn as a lane with arms to every joined neighbour, following the block heights and ramping
  across one-block steps (`art/city-mesh.ts`); lots and utilities are instanced procedural models in the
  Hearthworks palette (`art/models.ts`: `lot:<zone>:<level>`, `utility:<kind>`, `city:green`,
  `marker:unserved`), held to the same style rules as every other model.
