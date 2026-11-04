# Hearthworks — design (working title)

Status: **approved by the owner 2026-11-04** (decisions in §13) · 2026-11-04 · replaces CookGame, Forest Explorer,
Isleworks and RMH Farming Simulator; removes Massive March, Bum's Rush and
Mental-Hospital: Rochester Offensive.

Legend: **[Asked]** = the owner said it. **[Call]** = my proposal, with a reason;
correct any of them. Anything unmarked is derived from the code as it stands.

## 1. Intent

Four games began as tech demos and share a spine: a grid of things that grow,
get made and get sold. One expansive game: you build a city, forage a forest,
farm, cook and sell to people you meet, automate with factory-style machines
(Roblox tycoon / Factorio) or hire workers to do it for you, and play it with
friends. **[Asked]**

## 2. Goals

1. One persistent world, played two ways, switchable at any moment: **[Asked]**
   - **Isometric view** — fixed-angle camera; the planning view. City building,
     farm plots, belts and machines, worker assignment. "Isometric is better"
     for building and farming.
   - **Third-person 3D view** — a walkable, skinnable avatar: forage, talk to
     NPCs, cook, sell, tend crops by hand.
2. **A cinematic, smooth transition** between the two views (camera swing from the
   orthographic plan down to the avatar's shoulder, avatar lands, UI cross-fades).
   Interruptible: toggling mid-flight reverses from the current frame. **[Asked]**
3. **Skins** for the avatar, shown to other players. **[Asked]**
4. **P2P multiplayer, no hosted game servers, with host transfer.** **[Asked]**
5. **Really nice 3D models under one cohesive design scheme**, and smooth
   animation everywhere (characters, crops, machines, UI). **[Asked]**
6. A new title. **[Asked]** — proposals in §10.
7. Cooking-and-selling, foraging, automation, hiring: all five loops feed each
   other through one economy (§5). **[Asked]**

## 3. Non-goals / anti-goals

- **Not** four games under one menu. If forest, city, farm and kitchen are
  separate screens with a shared save, it has failed. [Call]
- **Not** a game server. Nothing authoritative runs in our infrastructure. [Asked]
- **Both food and crime** **[Asked]**: cooking and selling food is the legal
  route; CookGame's underground product-mixing is the crime route. Choosing crime
  brings **heat** and run-ins with the police (City-17 Metrocops / Combine) that the
  player must fight with guns sourced from the CS:GO and HL2 channels. Pure fiction,
  invented products, as in CookGame.
- **Not** a stylistic mashup. A model that looks like it came from a different game
  is a defect (§6). [Asked, "cohesive"]
- No real-money purchase paths for skins. Skins are bought with **in-game money
  only** **[Asked]** (never site coins/memberships). [Call]

## 4. Constraints from the codebase

- Stack: TanStack Start, React 19, **React Three Fiber / three / drei / rapier**
  (already used by Isleworks, Forest Explorer, Farming Sim — one stack, so one
  scene is feasible), Zustand, zod. `CLAUDE.md` rules apply: `--app-*` full-screen
  app tier, `GameErrorBoundary`, i18n via `t()` + a new namespace registered in
  `lib/i18n/config.ts`, catalog entry in `lib/catalog/games/`, capabilities in
  `lib/game-capabilities.ts`, `pnpm check:consistency` before every commit.
- **Reuse, don't rewrite, the P2P layer:** `lib/shared/p2p` (WebRTC channels,
  `ReliableLink`, relay frames, ICE) with the host-migration pattern from TF2 /
  Balatro (`lib/balatro/mp/migration.ts`: host names a successor, streams it
  checkpoints, hub promotes it on loss).
- **WebRTC cannot find peers without a signaling step.** The existing signaling
  path is a handler on the socket hub that carries offers/ICE and room discovery
  only — no game traffic, no simulation — plus TURN credentials and a
  rate-limited relay fallback for blocked NATs. "No hosted servers" is read as
  *no game logic and no state server*; signaling + TURN stays. **[Call — this is
  the one place the literal wording is impossible. Confirm.]**
- Asset size/licence: see §6; Source content stays in object storage under the existing 12 GB shared budget.
- Perf: the project has a 3D performance audit culture (`docs/3d-performance-audit.md`);
  the merged scene must hold the frame budget on laptops and mid phones, so
  instancing, LOD and a quality tier are part of the design, not polish.

## 5. The shape of the game

### 5.1 One world, two cameras

A single **world state** (tiles, buildings, crops, machines, belts, workers,
NPCs, resource nodes, items) rendered by one R3F scene. The two views are two
cameras on the same scene:

| | Isometric | Third-person |
|---|---|---|
| Camera | orthographic, fixed yaw/pitch, pan/zoom | perspective chase cam behind the avatar |
| You do | place/remove, route belts, assign workers, zone, plan | walk, forage, harvest, cook, trade, talk |
| Input | pointer/touch tools, hotkeys | WASD/stick + context action |

Everything simulates the same in both views; the view only changes what you can
*do* and how it looks. A machine you built keeps running when you walk past it.

### 5.2 Systems (what each old game becomes)

| System | From | Becomes |
|---|---|---|
| Grid, roads, zones, utilities, happiness, milestones | Isleworks | the **city layer** on the shared grid |
| Plots, crops, tools, seasons, festivals | Farming Sim | the **farm layer**; crops are world entities, growable by hand, by machine, or by worker |
| Chemistry/recipes, effects, demand, shops, journal | CookGame | the **kitchen & trade layer**: recipes with stacking effects, NPC demand per district, stalls/shops, a recipe journal |
| Forest, foraging, garden, NPC encounters, puzzles/story | Forest Explorer | the **wilds layer**: a forest region with resource nodes, wildlife, wandering **NPC customers**, and story/puzzle sites as optional landmarks |
| Automation | (new) | machines + belts on the grid (drills/harvesters/choppers → belts → processors → storage/shop); **workers** as hireable agents with a role, a wage and a skill |

The loop: scavenge or farm → process (machines, workers, by hand) → cook → sell to
NPCs and players → buy land/machines/workers → expand. Automation is a
choice, not a replacement: hand play in 3D must remain viable and rewarding.

### 5.3 Transition

Camera rig interpolates ortho → perspective (position, FOV/frustum, pitch) on one
smooth curve (`EASE.smooth`, zero start/end speed — the repo's motion token);
the avatar drops in or is lifted out; building UI fades while the interaction
prompt fades in. It is a tween on a single `viewBlend` value, so a mid-flight
toggle just reverses it. Skippable setting for those who want a cut.

### 5.4 Multiplayer (P2P)

- **Netcode [Asked: Source-engine smoothness]:** the existing TF2 stack already
  implements Source-style networking (fixed tick, user-command stream, client-side
  prediction with reconciliation, snapshot interpolation, lag compensation, delta
  snapshots, cmdrate/updaterate, loss meter). Hearthworks reuses these pieces
  from `lib/tf2-game/{net,client/net,sim}` and `lib/shared/p2p`.
- **Topology:** host-authoritative star over WebRTC. The host runs the full sim
  in its browser; peers send inputs/commands and receive state deltas and
  snapshots. Peers interpolate/predict their own avatar.
- **Join:** share-code and `?lobby=` link (existing `lib/lobby-link.ts`);
  signaling via the hub as §4; the hub vouches for account identity so the host
  doesn't trust peer claims.
- **Host transfer:** host nominates a successor, streams it periodic world
  checkpoints; on host loss/exit the successor is promoted and re-admits everyone
  from the checkpoint. Players may also hand over deliberately.
- **Scale:** small co-op worlds (target 2–8 players) [Call]; shared build rights are
  host-configurable roles (owner / builder / visitor).
- **Cheating:** a host can alter its own sim, as in any listen server; validation
  of cosmetics ids and rate limits on commands protect guests from each other.
  Competitive leaderboards are out of scope.

### 5.5 Skins

**[Asked]** Different skins are different **models** (a Source character model
with its animation set), tiered and priced in **in-game money** by how
influential the character is — e.g. the G-Man is a very expensive top-tier skin.
Cosmetics (hats, paint) bone-merge on top of any body. The catalog is one list of
legal ids shared by client and host (the pattern of Bum's Rush's `cosmetics.ts`):
a peer announces its skin id, the host validates it against the catalog and
rebroadcasts. Owned skins live with the account; prices are tiers in one table.
[Call] Tiers: Common (citizens, rebels) · Uncommon (Metrocop, Barney) ·
Rare (Combine soldier, Alyx-type heroes) · Epic (TF2 mercs) · Legendary (G-Man,
Breen). Only models present in the asset channels ship; the table is data.
Skins are visible in both views.

## 6. Art direction — Source-engine assets, one cohesive scheme

**[Asked]** Use the Source-engine (HL2) models and their animations, under one
cohesive design scheme, with smooth animation throughout.

### 6.1 What the repo already has (checked 2026-11-04)

An asset pipeline for Valve content already exists and is in production use by
RMH TF2, Half-Life 2 (demo), Portal and CS:GO (`docs/tf2-game.md`):

- **Converters** (`scripts/tf2-game/models.py`, `srcanim.py`, `ragdoll.py`,
  `sourcegame.py`) turn Steam-installed MDL/VTF/VMT/PHY/BSP into **GLB** with
  skeletons, **animation clips and sequences, activities (`ACT_*`), pose
  parameters, gesture layers, ragdolls, attachments, bone-merge and jiggle bones**.
- **Delivery:** content is never committed. A scheduled workflow
  (`tf2-assets-sync`, `csgo-assets-sync`) rebuilds channels in object storage
  (`tf2-game/`, `hl2-game/`, `portal-game/`, `csgo-game/`), served by
  `/api/<game>-game/assets/*`, with an `mdl/index.json` manifest. One shared
  storage budget (default 12 GB).
- **Runtime:** a clean-room TypeScript engine (`lib/tf2-game`, `lib/sp-game`) —
  *not* Source — reads these channels; it already blends walk/run by `move` pose
  parameters, steers aim with gestures, plays one-shots from animation events,
  and renders bone-merged cosmetics (the TF2 loadout builder, `lib/tf2-loadout`).

**Hearthworks reuses these channels and loaders. No new extraction pipeline.**

### 6.2 What it does *not* have (the honest limits)

- **The HL2 channel is the demo.** Valve's demo depot only ships
  `d1_trainstation_01/02`, so HL2 content is that slice: the citizens, Combine
  and props found in those maps (208 props). It does not contain the full game's
  NPC roster. TF2 (nine mercenary classes with complete animation packs, plus
  hundreds of bone-merged cosmetics) and CS:GO (player + arms models) are far richer.
- **Source has no farming/factory art.** There are no crops, belts, harvesters,
  stoves or town-building kits. Those must be authored — in the Source idiom
  (below) so they don't read as a different game.

### 6.3 Direction [Call]

- **Characters and skins:** the avatar, hired workers and NPC customers are
  Source characters with their real animation sets (idle/walk/run/work/gesture,
  blend by pose parameter). **Skins are the existing bone-merged-cosmetic pattern**
  (hats, props, paint) rather than a new system.
- **World props:** Source props from the channels where they fit (crates,
  barrels, furniture, jars, vehicles); custom-authored models for everything the
  catalog lacks, held to the same look.
- **The scheme that makes them cohesive:** Source's own look — flat-ish baked
  lighting, muted desaturated palette, chunky readable silhouettes, hand-painted
  textures — expressed as one **palette and material kit** defined once in code,
  a poly/texel budget and scale grid (Source units → metres), and a **style test**
  in the suite so a custom model that drifts from it fails CI. Replaces the earlier
  "pastel diorama" idea.
- **Isometric:** Source models are low-poly and read well from above; the iso
  camera uses simplified LODs and outline/readability treatment per class.
- **Animation:** use the Source animation data as authored; add blending and
  transitions on top (crossfades, one `EASE.smooth` curve, interruptible), plus
  custom clips for new content (machines, crops growing, workers at work)
  authored as procedural/keyframed animation in the same frame rates.
- **UI:** the full-screen app tier (`--app-*`), lucide icons, sonner toasts.

### 6.4 Risk to decide [owner]

These are **Valve's copyrighted assets**. The pipeline avoids committing them and
the existing games are free to play (`docs/tf2-game.md`). Hearthworks would sit on
a site with a coin economy and paid memberships, and would put those assets inside
a monetised economy. This is not a legal opinion; it is a decision the owner has made (§13). Mitigations I can build in either way: gate the Source
content behind the same asset channels (so it can be turned off without code
changes), keep skins free/earned only (already a non-goal to sell them for money),
and keep a full set of original fallback models behind the same interface.

## 7. Persistence

[Call] The world has to exist when nobody is online without a game server:

- The host stores the world locally (IndexedDB) and **every peer keeps the latest
  replicated checkpoint** (needed for host migration anyway), so the world
  outlives any one machine.
- The owner can **export/import** a world file and may opt into the existing
  account-scoped cloud save (the pattern in each old game's `cloud.ts`) —
  storage, not a game server.
- Personal progress that must follow the person across worlds (cosmetics, recipe
  journal) lives with the account, validated against the catalogs.
- **Migration:** a one-way importer maps an existing Isleworks city, Farming Sim
  farm, Forest garden and CookGame save into a new world where the shapes allow
  it. Best-effort, not lossless.

## 8. Removals

Independent of the merge and done first. For each: route, components, `lib/`,
API routes, data, scripts, catalog entry, capabilities, i18n namespaces, tests,
docs mentions, sitemap, quests/achievement groups, then regenerate the route tree.

| Game | Footprint (approx.) | Watch for |
|---|---|---|
| **Bum's Rush** | `components/bums-rush`, `lib/bums-rush` (~25k lines), `data/bums-rush`, `app/routes/bums-rush.tsx`, `api/bums-rush/*`, scripts (`bums:manifest*`, `probe-bums-chain`), Prisma `BumsRush*` models | DB tables with player progress (see Q1); `c-bums-rush` i18n namespace; `lib/games/achievement-groups.ts` |
| **Massive March** | `components/massive-march`, `lib/massive-march`, `app/routes/massive-march.tsx`, `api/massive-march/*`, socket handler + config, `scripts/gen-massive-march-art.ts`, Prisma campaign/member models | `server/socket-server/config.ts` rate limits; `deploy/apache` mic-permission comment; `c-massive-march` |
| **Mental-Hospital: Rochester Offensive** | `components/breakpoint`, `lib/breakpoint`, `app/routes/rochester-offensive.tsx`, `lib/catalog/games/rochester-offensive.ts`, capabilities entry, `lib/quests/arcade.ts` quest | **`lib/csgo-game` / `components/csgo-game` / `app/routes/csgo.tsx` are a different game (Counter-Strike: Global Offensive) and stay.** |

Old URLs (`/cookgame`, `/forest-explorer`, `/isleworks`, `/rmh-farming-sim`, and the
three removed games) redirect: merged games to the new game, removed games to
`/games`.

## 9. Approaches considered

- **A. One world, two cameras — chosen.** One state, one scene, an animated camera
  swap; multiplayer syncs one thing. Most design up front; delivers the
  "one game" goal. 
- **B. Two modes sharing a save** (Isleworks city + Forest Explorer as a level).
  Faster, reuses more code, but the forest freezes while you build, the toggle is
  a load, and multiplayer syncs two worlds. Rejected.
- **C. Isometric first, 3D later.** Cheapest, drops the requested toggle. Rejected.

## 10. Title

Working title **Hearthworks** (hearth = cooking/home; works = the Isleworks and
factory lineage). Alternatives: **Wildhollow**, **Townforge**. Slug follows the title.

## 11. Delivery order [Call]

1. **Removals** (3 games) — one PR.
2. **World core:** shared world state, grid, sim tick, model kit + palette, iso
   renderer. Port the city layer.
3. **3D view:** avatar rig, third-person controller, camera transition, skins.
4. **Layers:** farm → forest/NPCs/foraging → kitchen & trade → automation & workers.
5. **Multiplayer:** host-authoritative sync, lobby/join links, host transfer.
6. **Migration & cutover:** save importer, redirects, retire the four old games.

Each step ships behind the new game's catalog entry (old games stay playable until
step 6), keeps `pnpm check:consistency` green, and has colocated tests.

## 12. Left to the builder

Exact grid/chunk sizes, tick rate and netcode details, machine/recipe/crop
content tables, belt/worker algorithms, model-by-model art, quality-tier thresholds,
the skin starter set, and asset/LOD budgets — within the constraints above.

## 13. Owner decisions (2026-11-04)

- **Valve assets: use them.** Source content is primary. Skins are tiered Source
  models bought with in-game money (§5.5). The risk in §6.4 is accepted by the owner.
- **Old player data: delete freely.** The old games are replaced entirely; their
  tables may be dropped with the games.
- **Food and crime both** (§3), with police fights using CS:GO/HL2 guns.
- **Hub:** use the existing signaling hub; Source-style netcode (§5.4).
- **Delivery:** implement in sequential PRs; each is merged by the agent once CI is green.

## 14. Calls made after the builder check (correct any)

- **Fallbacks:** v1 ships Source content as primary. Original models exist only
  where the channels have nothing (crops, belts, machines, town kit) plus a minimal
  stand-in character, so Source content can be switched off without a rewrite — not
  a parallel full art set.
- **Avatar:** one modular rig; the player picks a body from a small set drawn from
  the channels with the best animation coverage (TF2 class bodies and their
  animation packs), with cosmetics bone-merged on top. NPCs and workers use the
  HL2 citizen/Combine set plus TF2/CS:GO bodies for variety.
- **Host trust:** account-level progress (cosmetic unlocks, recipe journal) is
  low-stakes and unverified; a modified host can grant unlocks and that is accepted.
  The in-world economy is self-contained: **no site coins, quests or achievements**
  in v1.
- **Offline world:** the sim freezes when nobody is hosting. On load, crops and
  machines apply a closed-form catch-up capped at 24 h of game time; wages do not
  accrue offline. The world's source of truth is the owner's local copy plus
  every peer's replicated checkpoint; cloud save is optional, last-write-wins
  with a prompt on conflict.
- **Parity at cutover:** the bar is the core loops (city, farm, cook/sell,
  forage, automation, workers, multiplayer). Forest Explorer's story/puzzles,
  Farming Sim festivals and Isleworks milestones port as later layers; the old
  routes stay playable (no redirect) until the layer for that game ships.
  Existing saves import best-effort.
