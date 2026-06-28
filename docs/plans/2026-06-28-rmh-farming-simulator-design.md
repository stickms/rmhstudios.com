# RMH Farming Simulator — Game Design Document

**Genre:** Multiplayer Farming / Life Sim (sandbox economy)
**Visual Style:** Pixelated low-poly 3D — voxel/pixel-textured meshes, nearest-neighbor filtering, dithered lighting (think *Stardew Valley* meets *Minecraft* meets *Animal Crossing*, rendered in 3D)
**Engine:** Three.js (WebGL2) on the front end, authoritative Node game server over WebSockets
**Route:** `/app/rmh-farming-sim/`
**Date:** 2026-06-28
**Status:** Design draft

---

## 1. Game Identity

**RMH Farming Simulator** is a browser-based, pixelated 3D multiplayer farming game. Players claim a plot of land, clear it, till it, plant and tend crops, raise animals, fish, forage, mine, craft, and sell their produce to grow from a struggling homesteader into an agricultural tycoon. The hook is **shared play**: farms can be solo, co-op (multiple players, one shared farm and wallet), or competitive (independent farms racing on a shared seasonal leaderboard inside the same world).

The "RMH" framing keeps it lighthearted and a little chaotic — exaggerated tools, slightly absurd crops (giant pixel pumpkins the size of a barn), and seasonal community events. It should feel cozy to play solo and lively in a group.

**Pillars:**
1. **Cozy core loop** — plant → tend → harvest → sell → upgrade should feel satisfying within the first 5 minutes.
2. **Better together** — every system has a multiplayer dimension (shared labor, trading, competition).
3. **Pixel-3D charm** — the look is the brand; readable, chunky, performant on mid-range laptops.
4. **Meaningful progression** — equipment, land, automation, and prestige give long-term goals (100+ hours).

---

## 2. Visual & Art Direction

### Style
- **Low-poly geometry** with **pixel-art textures** (16×16 / 32×32 texels per face), `THREE.NearestFilter` magnification, no mipmapping blur on key art.
- **Orthographic-leaning perspective camera** at a fixed isometric-ish angle (~35°), with limited zoom and 8-direction or free orbit (configurable). Slight perspective for depth, snapped to feel diorama-like.
- **Palette-limited shading**: posterized/quantized lighting via a custom toon shader (3–4 light bands) for the pixel-diorama look.
- **Dithered shadows** and a single warm directional "sun" + ambient hemisphere light. Day/night tints the sun color.
- **Chunky particles** (billboarded pixel sprites) for dust, water splash, sparkles, smoke, harvest pops.

### Color & Mood
- Daytime: warm greens, soft sky gradient skybox.
- Seasonal palette swaps (spring pastel, summer saturated, autumn amber, winter cool/snow).
- Day/night cycle drives a color-graded post-process LUT.

### UI
- Pixel-font HUD (bitmap font), wooden/parchment panel frames matching the cozy theme.
- Bottom hotbar (tools + seeds), top-right clock/date/season/weather, top-left wallet + energy.
- Minimap (top-right) showing your farm, players, and points of interest.

---

## 3. Core Architecture

```
CLIENT (Three.js / TypeScript)
  ├── Renderer (WebGL2, toon/pixel shader, post FX)
  ├── Scene Graph
  │     ├── Terrain (chunked instanced tile meshes)
  │     ├── Entities (crops, animals, players, props — InstancedMesh pools)
  │     ├── Player Controller (movement, tool use, interaction raycast)
  │     └── Camera Rig (iso orbit + zoom)
  ├── Game State Store (client-predicted, reconciled)
  ├── Net Layer (WebSocket, binary protocol, snapshot interpolation)
  ├── UI Layer (React overlay or lightweight DOM/canvas HUD)
  └── Audio (Howler.js — music, SFX, positional ambience)

SERVER (Node / TypeScript — authoritative)
  ├── World Manager (instances/shards, tile ownership)
  ├── Simulation Tick (crop growth, weather, animals, economy)
  ├── Player Sessions (auth, presence, inventory)
  ├── Economy Engine (prices, shops, market)
  ├── Persistence (Postgres via Prisma + Redis for hot state)
  └── Anti-cheat / validation (all gameplay actions validated server-side)
```

**Key design decisions**
- **Server-authoritative** for anything economic (inventory, money, growth, sales) to prevent cheating in competitive mode. Client predicts movement and cosmetic actions only.
- **Tile grid world**: each farm is a fixed grid (e.g. 80×80 tiles, expandable). Tiles are typed (grass, tilled, watered, path, water, rock, etc.) and stored compactly.
- **Instanced rendering** for crops/tiles/props — one `InstancedMesh` per visual type, updated per-tick, to render thousands of plants cheaply.
- **Chunked terrain & frustum culling**: world split into 16×16 tile chunks; only visible chunks build geometry.
- **Fixed simulation tick** server-side (e.g. 4–10 Hz for gameplay, crops advance on in-game time steps); clients interpolate.
- **Time model**: in-game day = ~15–20 real minutes; configurable per world (co-op may pause when nobody's online; competitive runs on persistent server time).

---

## 4. The Core Gameplay Loop

1. **Clear & prepare** land (remove rocks, weeds, stumps; till soil with a hoe).
2. **Plant** seeds bought from the shop or saved from harvests.
3. **Tend** — water daily (or build sprinklers), fertilize, protect from pests/weather.
4. **Harvest** when mature.
5. **Process / sell** raw or refined goods (jam, cheese, wine, cloth).
6. **Spend** earnings on better seeds, tools, buildings, animals, land.
7. **Upgrade & automate** to scale output and reduce manual labor.
8. **Repeat** across seasons, chasing goals, events, and (in competitive) the leaderboard.

Energy/stamina gates daily activity early game; upgrades and food restore/expand it.

---

## 5. Farming Systems (Base-Game Features)

### 5.1 Crops
- **Seasonal crops**: each crop grows only in its season(s); planting out of season fails or wilts.
- **Growth stages** with distinct pixel-3D models (seed → sprout → growing → mature → harvestable).
- **Regrowing crops** (berries, etc.) that yield repeatedly vs single-harvest crops.
- **Quality tiers**: Normal / Silver / Gold / Iridescent, affecting sell price. Quality driven by fertilizer, watering consistency, and farming skill.
- **Giant crops / mutations**: rare chance for adjacent same-crops to merge into a giant harvest (co-op flex item).
- **Crop care**: watering, fertilizing, weeding, pest control. Skipping care lowers quality/yield.

### 5.2 Soil & Tilling
- Hoe tills grass → soil. Watering can / sprinklers keep soil moist.
- Fertilizers: growth speed, quality boost, water retention, anti-pest variants.
- Soil degrades with monoculture; crop rotation or compost restores it (light depth, optional).

### 5.3 Weather & Seasons
- Four seasons (configurable length, default 28 in-game days each).
- Weather: sunny, rain (auto-waters), storm (lightning can damage/charge), drought (extra water needed), snow (winter, most crops dormant), fog, windy.
- Rain auto-waters; storms risk crop damage but can power lightning rods; seasonal festivals tied to calendar.

### 5.4 Animals & Ranching
- **Coop animals**: chickens (eggs), ducks (eggs/feathers), rabbits (wool/luck).
- **Barn animals**: cows (milk), goats (milk), sheep (wool), pigs (truffles/foraging).
- **Care**: feed (grown hay or bought), pet for happiness, let graze outdoors. Happiness → product quality & rare products.
- **Breeding/incubation**: incubate eggs, buy from animal shop, herd reproduction.
- **Products** feed into processing (cheese press, loom, mayonnaise machine, etc.).

### 5.5 Fishing
- Cast at ponds/rivers/ocean tiles. Timing/reel minigame (pixel-3D bobber + simple skill bar).
- Fish vary by season, weather, time, location. Legendary fish as rare goals.
- Fish ponds on-farm passively produce fish/roe; crab pots in water tiles.

### 5.6 Foraging & Mining
- **Foraging**: seasonal wild items spawn around the world hub/forest (berries, mushrooms, herbs, flowers).
- **Mining**: a multi-level mine (procedurally laid-out floors). Break rocks for ore/gems, fight light enemies (slimes, bats) with a basic combat system, descend via ladders. Ore feeds tool/equipment upgrades and machines.

### 5.7 Crafting & Processing
- **Machines**: furnace (ore→bars), keg (fruit→wine/juice/beer), preserves jar (jam/pickles), cheese press, loom, oil maker, mayonnaise machine, dehydrator.
- **Crafting bench**: build sprinklers, fences, paths, scarecrows, chests, decorations, machines themselves.
- **Cooking**: kitchen recipes from crops/animal products → meals that restore energy / grant buffs.
- Processing adds value: turning raw goods into artisan goods is the main margin engine mid-game.

---

## 6. Economy: Shops, Selling & Markets

### 6.1 Shops (NPC vendors in the central town hub)
- **General Store / Seeds** — seasonal seeds, fertilizer, basic supplies, farm-building materials.
- **Blacksmith** — tool upgrades, ore processing, geode cracking.
- **Animal Shop** — buy/sell livestock, buy hay, incubators, barn/coop building upgrades.
- **Carpenter** — farm buildings & expansions (barns, coops, sheds, greenhouse, silos), house upgrades.
- **Fish Shop** — fishing gear, bait, tackle, fish ponds, sells rare fish.
- **Travelling Cart** — rotating rare/out-of-season stock at variable prices.
- **Decoration / Furniture** — cosmetic items for farm and home.

### 6.2 Selling
- **Shipping bin** on each farm: drop goods, get paid at end of in-game day (no haggling, convenient).
- **Direct sale** to relevant vendors (sometimes better price for matching category).
- **Quality multipliers** apply to sale price; artisan goods sell far above raw inputs.

### 6.3 Dynamic Market (multiplayer twist)
- Server-wide **supply/demand pricing**: if everyone floods parsnips, parsnip price dips; scarce goods spike. Prices recover over time.
- **Daily demand bonuses**: town requests a specific item at a premium (shared across world or per-farm).
- Encourages crop diversity and reading the market — a competitive skill axis.

### 6.4 Player-to-Player Trade & Marketplace
- **Direct trade window** (co-op/friends): drag items + money, both confirm.
- **Auction house / player market board** (competitive worlds): list goods at your price, others buy. Server takes a small tax (money sink).
- **Co-op shared wallet** option vs **individual wallets with a shared "farm fund."**

---

## 7. Equipment & Upgrades

### 7.1 Tools (each with upgrade tiers)
Tiers: **Basic → Copper → Iron → Gold → Iridium → (Mythic, prestige)**. Upgraded at the Blacksmith using bars + money + time.

| Tool | Upgrade effect |
|------|----------------|
| Hoe | Wider till area (1 → 3 → 5 → 3×3, etc.), less energy/use |
| Watering Can | Bigger water area + larger water tank |
| Axe | Faster tree felling, bigger stumps |
| Pickaxe | Faster rock breaking, deeper mining |
| Scythe | Wider harvest/clearing radius |
| Fishing Rod | Bait/tackle slots, bigger catch range |

Each upgrade reduces energy cost and increases area-of-effect, directly lowering manual labor.

### 7.2 Buildings & Land
- **House upgrades**: bigger house, kitchen, nursery, more storage.
- **Greenhouse**: grow any crop year-round regardless of season.
- **Barns/coops**: capacity tiers; auto-feeders; deluxe = auto-care.
- **Silos**: store hay.
- **Sheds**: extra machine/processing space.
- **Land expansion**: buy adjacent plots to grow farm size.

### 7.3 Automation
- **Sprinklers** (tiers cover larger areas) — auto-water.
- **Auto-harvesters / junimo-style helpers** (late game) — auto-collect mature crops in range.
- **Auto-feeders & auto-grabbers** in deluxe barns/coops.
- **Conveyor/pipe logic** (optional advanced tier) routing machine outputs to bins.
- Automation is the late-game power fantasy: turn manual chores into a humming factory farm.

### 7.4 Skills & Perks
Skill trees leveled by doing the activity: **Farming, Mining, Foraging, Fishing, Ranching, Combat, Crafting.**
- Each level grants XP perks; milestone levels offer branching profession choices (e.g. Farming 10: "Agriculturist" +crop growth speed vs "Artisan" +artisan good value).
- **Prestige / "New Generation"**: optionally reset progress for permanent meta-bonuses and cosmetic prestige markers (long-term replay).

---

## 8. Multiplayer Design

### 8.1 World & Session Model
- A **world** = one persistent server instance hosting multiple farms + a shared town hub.
- Players join via friend invite (private world) or matchmaking/browser (public world).
- **Presence**: see other players move around their farms and the town in real time.
- Scalability: shard worlds by population; farm sim ticks are cheap, so a world can hold dozens of players. Town hub is the main contention point — instance it if crowded.

### 8.2 Co-op Farms
- **Shared farm**: multiple players inhabit one farm, divide labor (one waters, one mines, one fishes).
- **Shared or split economy** (world setting): single wallet, or individual wallets + shared "Farm Fund" for buildings.
- **Shared storage** chests; **shared progression** on farm-level goals; individual skill levels.
- **Roles/permissions** (farm owner can set): can-build, can-sell, can-spend-fund, guest (look only) — prevents griefing on public co-ops.
- **Async co-op**: time advances on server; offline members' contributions persist. Optional "sleep to skip night" requires majority vote of online players.
- **Tethering off**: players roam freely; no leash. Fast-travel/warp totems to regroup.

### 8.3 Competitive Farming
- **Independent farms, shared world**, racing objectives:
  - **Seasonal leaderboard** — total earnings, goals completed, rarest items, biggest giant crop, etc.
  - **Ranked seasons**: each in-game year (or fixed real-time season) resets to a fresh competitive ladder with rewards.
  - **Head-to-head modes**: "Harvest Rush" (most value in N days), "Market Mogul" (manipulate/dominate the market), "Specialist" (best single crop quality).
- **Shared dynamic market** is the competitive battleground — overproducing tanks prices for everyone, so strategy matters.
- **Sabotage-lite (opt-in)**: send crows, weeds, or "pest packages" to rivals in chaos mode; defendable with scarecrows/upgrades. Off by default for cozy worlds.
- **Spectate & emotes** for finished/eliminated players.

### 8.4 Social Layer
- **Chat** (proximity + world + party), **emotes**, **pings** ("water this!", "look here!").
- **Friends list, parties, invites**.
- **Community events** (server-wide goals: "harvest 10,000 carrots as a server → unlock town fountain & cosmetic"). Blends co-op and competitive populations.
- **Festivals** (calendar events in the town hub): cooking contest, fishing derby, harvest fair — minigames with prizes and leaderboards.
- **Visiting**: tour other players' farms; rate/like decorated farms (cosmetic prestige).

---

## 9. Networking & Technical Detail

- **Transport**: WebSocket (binary). Consider WebTransport/WebRTC datagrams later for movement if needed.
- **Movement**: client-side prediction + server reconciliation; remote players snapshot-interpolated (~100ms buffer).
- **Authority**: server validates every gameplay mutation (plant, harvest, buy, sell, craft, trade). Client sends *intents*, not results.
- **State sync**: area-of-interest — clients only receive entity updates for their loaded chunks + nearby players. Tile/crop changes sent as deltas.
- **Persistence**:
  - Postgres (Prisma) for durable state: accounts, farms, inventories, world calendar, market history, leaderboards.
  - Redis for hot/ephemeral state: presence, live tile cache, rate limits, matchmaking.
  - Periodic snapshot + write-ahead of farm state; crash-safe.
- **Anti-cheat**: server-side economy, sanity checks on action rate, server clock for growth/time, signed transactions for trades, audit log for competitive worlds.
- **Performance budget (client)**: target 60fps on integrated GPUs.
  - Instanced meshes for tiles/crops/props; merged static geometry per chunk.
  - Texture atlas for all tiles/crops to minimize draw calls and state changes.
  - LOD: distant crops render as billboards; cull off-screen chunks.
  - Object pooling for particles and transient entities.

---

## 10. Progression & Goals

- **Quest/Goal board** in town (the "Community Center"-style restoration): bundles of items to donate that unlock town improvements, new areas (greenhouse, mine elevator, bridge to forest), and rewards.
- **Achievements** (server-tracked, shareable).
- **Collections**: shipped-items log, fish log, recipe book, museum of minerals/artifacts (donate finds from mining).
- **Long-term tycoon goals**: own all land, max all tools, fully automate, reach prestige tiers.
- **Cosmetics**: farm decorations, player outfits/hats, pet companions, farm themes (no pay-to-win; cosmetics are aspirational/event rewards).

---

## 11. Audio
- Adaptive **seasonal music** (track per season, mellow night variants), ambient layers (birds, rain, mine hum, ocean).
- **Positional SFX** for tools, animals, water, machines.
- **UI/feedback chimes** for level-ups, sales, quality harvests.
- Howler.js with spatial panning tied to camera position.

---

## 12. Monetization (optional / if ever needed)
- Cosmetic-only: outfits, farm skins, decoration packs, pet skins. **No gameplay/economy advantage**, critical for competitive integrity.
- Cosmetic battle-pass per competitive season (earnable free track + premium cosmetic track).
- Private world hosting / larger co-op slots as a convenience option.

---

## 13. Tech Stack Summary

| Layer | Choice |
|-------|--------|
| Rendering | Three.js (WebGL2), custom toon/pixel shaders, postprocessing (LUT, dither) |
| Client lang | TypeScript |
| UI | React overlay (HUD) + canvas/DOM hybrid; integrates with existing site stack |
| State | Client store (Zustand/valtio-style) with net reconciliation |
| Server | Node + TypeScript, authoritative game loop |
| Realtime | WebSocket (binary protocol), AoI sync, snapshot interpolation |
| DB | Postgres + Prisma (durable), Redis (hot state/presence) |
| Audio | Howler.js |
| Assets | Aseprite/voxel-textured low-poly models, shared texture atlases |

> Note: aligns with the existing `rmhstudios.com` stack (Vite + React + TS, Prisma already present) so the game can live at `/app/rmh-farming-sim/` like other RMH web games (e.g. Dream Rift at `/app/dream-rift/`).

---

## 14. Milestone Roadmap

**Phase 1 — Core single-player vertical slice**
- Tile world + terrain rendering (instanced, pixel-3D look)
- Player movement, camera rig, tool use (hoe/water/plant/harvest)
- One season, ~6 crops, growth + watering + shipping bin
- Basic shop (buy seeds, sell crops), energy/day cycle
- Save/load (Postgres)

**Phase 2 — Depth**
- All 4 seasons, weather, ~30 crops, fertilizer & quality tiers
- Animals + barn/coop, fishing minigame, foraging
- Tool upgrades, sprinklers, more buildings
- Crafting/processing machines, cooking

**Phase 3 — Multiplayer co-op**
- Authoritative server + net layer, presence, chat
- Shared co-op farms, permissions, shared/split economy
- Player trade window, shared storage

**Phase 4 — Competitive & live**
- Dynamic market, auction house, leaderboards, ranked seasons
- Head-to-head modes, opt-in sabotage, festivals/events
- Mining + combat, museum/collections, prestige

**Phase 5 — Polish & live ops**
- Cosmetics, decoration, achievements
- Performance hardening, anti-cheat audit, scaling/sharding
- Seasonal content cadence, community events

---

## 15. Open Questions / Risks
- **Time model in co-op**: how to handle offline time progression fairly (pause vs persistent server time). Recommend per-world setting.
- **Market balance**: dynamic pricing needs careful tuning to avoid death spirals or exploits; start with conservative elasticity + price floors/ceilings.
- **Town hub contention**: instance the hub if too crowded; keep farms sharded.
- **Pixel-3D readability**: validate that crop growth stages and quality are visually distinguishable at default zoom.
- **Scope**: this is a large game — Phase 1 should be shippable and fun on its own before committing to multiplayer infra.
