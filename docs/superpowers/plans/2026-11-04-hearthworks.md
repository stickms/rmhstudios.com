# Hearthworks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CookGame, Forest Explorer, Isleworks and RMH Farming Sim with one game, Hearthworks (one world, an isometric view and a toggleable third-person 3D view, P2P multiplayer with host transfer), and remove Massive March, Bum's Rush and Rochester Offensive.

**Architecture:** A pure-TypeScript world model (`lib/hearthworks/`) ticks at a fixed rate and knows nothing about rendering. One React Three Fiber scene draws it; an isometric (orthographic) camera and a third-person (perspective) camera are blended by a single `viewBlend` value. Multiplayer is a host-authoritative star over the existing `lib/shared/p2p` layer with Source-style netcode reused from `lib/tf2-game`. Source models/animations come from the existing `hl2-game/`, `tf2-game/`, `csgo-game/` asset channels.

**Tech Stack:** TanStack Start, React 19, R3F/three/drei/rapier, Zustand, zod, Vitest, existing P2P + asset pipelines.

**Spec:** `docs/superpowers/specs/2026-11-04-hearthworks-design.md`

## Global Constraints

- Not Next.js. `app/routeTree.gen.ts` and `lib/i18n/resources.<locale>.ts` are generated — never hand-edit.
- `pnpm check:consistency` passes before every commit; failing gates are fixed, not bypassed.
- Game route is full-screen (top-level under `app/routes/`), wrapped in `GameErrorBoundary`; UI uses the `--app-*` tier (`components/shared/`), lucide icons, sonner toasts.
- All user-facing strings via `t("key", { defaultValue })`; new namespace registered in `NAMESPACES` in `lib/i18n/config.ts`; run `pnpm i18n:extract`.
- Catalog entry in `lib/catalog/games/<id>.ts` registered in `lib/catalog/index.ts`; capabilities in `lib/game-capabilities.ts`.
- `lib/**/*.server.ts` never imported from client code. Server code imports `lib/` relatively.
- No game state or logic on our servers; the hub carries signaling/TURN only.
- Skins priced in **in-game money only**; no site coins/quests/achievements tie-in in v1.
- Valve content is never committed; it is loaded from the existing asset channels. Models absent from the channels fall back to original procedural models behind the same interface.
- Each PR: one phase slice, CI green, merged by the agent; the designated branch is reset to `origin/main` after each merge.
- Do not touch `lib/csgo-game`, `components/csgo-game`, `app/routes/csgo.tsx` — a different game that stays.

## Review Focus

- A removed game's old URL (`/bums-rush`, `/massive-march`, `/rochester-offensive`) must 404-or-redirect to `/games`, not crash; the sitemap and quest list must not reference it.
- Prisma migration dropping tables must apply on a database that already has rows, and `pnpm db:push` / `prisma validate` must pass.
- Toggling the view mid-transition reverses from the current frame (no snap, no NaN camera).
- A peer announcing an unknown or unowned skin id is refused by the host and renders the default.
- Host leaves mid-tick: the successor resumes from the last checkpoint with no duplicated or lost items.
- Zero Source assets reachable (channel 404): the game still loads using fallback models.

---

## Phase 0 — Remove Massive March, Bum's Rush, Rochester Offensive (PR 1)

### Task 0.1: Delete the three games and every reference

**Files:**
- Delete: `components/bums-rush/`, `lib/bums-rush/`, `data/bums-rush/`, `app/routes/bums-rush.tsx`, `app/routes/api/bums-rush/`, `scripts/bums-rush-manifest.ts`, `scripts/probe-bums-chain.ts`, `lib/catalog/games/bums-rush.ts`
- Delete: `components/massive-march/`, `lib/massive-march/`, `app/routes/massive-march.tsx`, `app/routes/api/massive-march/`, `scripts/gen-massive-march-art.ts`, `server/socket-server/handlers/massive-march.ts`, `lib/catalog/games/massive-march.ts`
- Delete: `components/breakpoint/`, `lib/breakpoint/`, `app/routes/rochester-offensive.tsx`, `lib/catalog/games/rochester-offensive.ts`
- Modify: `lib/catalog/index.ts`, `lib/game-capabilities.ts`, `lib/quests/arcade.ts`, `lib/games/achievement-groups.ts`, `lib/sitemap.ts`, `lib/i18n/config.ts`, `package.json`, `server/socket-server/` (handler registration + `config.ts`), `lib/__tests__/*` and any test asserting these games, `deploy/apache/rmhstudios.conf` comment, `docs/` mentions of live behaviour (`docs/site-reference/games.md`, `pages.md`, `api.md`), `prisma/schema.prisma`, locale JSON for the removed namespaces.
- Create: `prisma/migrations/<timestamp>_drop_removed_games/migration.sql`

**Interfaces:**
- Produces: a repo with none of the three games; `pnpm exec tsc --noEmit` and `pnpm test` green.

- [ ] **Step 1:** Run `git grep -n -i -E "bums-rush|bumsrush|massive-march|massivemarch|rochester-offensive|breakpoint"` and record the full reference list (do not delete anything yet).
- [ ] **Step 2:** Delete the directories/files above; remove each catalog import/entry, capabilities entry, quest, achievement group, sitemap rule, i18n namespace (`c-bums-rush`, `c-massive-march`, plus any breakpoint/rochester namespace) and the `bums:manifest*` scripts.
- [ ] **Step 3:** Remove the socket handler registration and rate-limit config for Massive March; remove `BumsRush*` and `MassiveMarch*` Prisma models and the relations on `User`; add a migration that drops those tables (`DROP TABLE ... CASCADE`, children first). Old player data is explicitly deletable.
- [ ] **Step 4:** Delete `locales/*/c-bums-rush.json` and `c-massive-march.json` (all 16 locales) and regenerate `lib/i18n/resources.*.ts` via `pnpm i18n:extract` / the repo's i18n build.
- [ ] **Step 5:** Regenerate `app/routeTree.gen.ts` (`pnpm exec vite build` or dev route-gen) and confirm it no longer lists the removed routes.
- [ ] **Step 6:** Verify: `pnpm exec prisma validate`; `pnpm exec tsc --noEmit`; `pnpm lint`; `pnpm test`; `git grep -n -i -E "bums-rush|massive-march|rochester-offensive"` returns only historical docs under `docs/plans` and `docs/superpowers`.
- [ ] **Step 7:** `pnpm check:consistency`; commit `feat: remove Massive March, Bum's Rush and Rochester Offensive`; push; open PR; wait for CI; merge.

---

## Phase 1 — World core, model kit, isometric renderer (PR 2)

Scope: the shared world model, tick, save format, catalog/route shell, procedural model kit + palette, isometric scene, minimal build/move tools. No Source assets yet beyond the loader seam.

### Task 1.1: World model and tick (`lib/hearthworks/world/`)

**Files:** Create `lib/hearthworks/world/{types,grid,world,tick,items}.ts`, Test `lib/hearthworks/world/__tests__/world.test.ts`

**Interfaces:**
- Produces: `type TileCoord = { x: number; z: number }`; `createWorld(seed: number, size: number): World`; `stepWorld(world: World, dtMs: number, cmds: Command[]): WorldEvent[]` (fixed 50 ms tick, deterministic for a given seed + command stream); `type Command` union (`place`, `remove`, `plant`, `harvest`, `assign`, `move`, `interact`); `type World` is plain serialisable data.

- [ ] **Step 1:** Write failing tests: `stepWorld` is deterministic (two worlds, same seed + commands, `JSON.stringify` equal after 200 ticks); `place` on an occupied tile is rejected with a `rejected` event; `remove` returns the item to the player's inventory; a crop planted at t advances stage at the table's interval.
- [ ] **Step 2:** Run `pnpm exec vitest run lib/hearthworks/world` — FAIL.
- [ ] **Step 3:** Implement the types and `stepWorld` (command application → entity systems in fixed order → events). Seeded RNG local to world state.
- [ ] **Step 4:** Tests pass; commit.

### Task 1.2: Content tables (`lib/hearthworks/content/`)

**Files:** Create `lib/hearthworks/content/{crops,buildings,recipes,items}.ts`, Test `lib/hearthworks/content/__tests__/content.test.ts`

**Interfaces:** Produces zod-validated tables `CROPS`, `BUILDINGS`, `RECIPES`, `ITEMS` keyed by id; every id referenced anywhere resolves (tested).

- [ ] **Step 1:** Test that every recipe ingredient/output, building input, and crop yield is an id in `ITEMS`; ids unique; prices > 0.
- [ ] **Step 2-4:** Implement tables seeded from the four old games' content (Isleworks buildings, Farming Sim crops, CookGame recipes/effects), run tests, commit.

### Task 1.3: Save format (`lib/hearthworks/save/`)

**Files:** Create `lib/hearthworks/save/{format,idb}.ts`, Test `lib/hearthworks/save/__tests__/format.test.ts`

**Interfaces:** Produces `encodeWorld(world: World): Uint8Array`, `decodeWorld(bytes: Uint8Array): World` (versioned, zod-validated; unknown version → typed error), `saveWorld/loadWorld` over IndexedDB with try/catch fallback.

- [ ] **Step 1:** Tests: round-trip equality; corrupted bytes throw `SaveFormatError`; future version refused.
- [ ] **Step 2-4:** Implement, pass, commit.

### Task 1.4: Palette, material kit and procedural models (`lib/hearthworks/art/`, `components/hearthworks/models/`)

**Files:** Create `lib/hearthworks/art/{palette,model-manifest,style-rules}.ts`, `components/hearthworks/models/*.tsx`, Test `lib/hearthworks/art/__tests__/style.test.ts`

**Interfaces:** Produces `PALETTE` (token → colour), `getModel(id: ModelId): ModelSpec` where Source assets resolve through a loader seam `loadSourceModel(path)` and fall back to a procedural model when it throws; `checkStyle(spec): string[]` returning rule violations (colour outside palette, over poly budget, off scale grid).

- [ ] **Step 1:** Tests: every procedural model passes `checkStyle` with zero violations; a spec with an off-palette colour returns a violation; `getModel` returns the procedural fallback when the loader rejects (Review Focus: no Source assets).
- [ ] **Step 2-4:** Implement, pass, commit.

### Task 1.5: Isometric scene and shell (`components/hearthworks/`, route)

**Files:** Create `components/hearthworks/{HearthworksGame,Hud}.tsx`, `components/hearthworks/scene/{Scene,IsoCamera,Terrain,Entities}.tsx`, `lib/hearthworks/store.ts`, `app/routes/hearthworks.tsx`, `lib/catalog/games/hearthworks.ts`; Modify `lib/catalog/index.ts`, `lib/game-capabilities.ts`, `lib/i18n/config.ts` (`c-hearthworks`), `locales/en/c-hearthworks.json`.

**Interfaces:** Consumes Tasks 1.1–1.4. Produces `useHearthworksStore` with `world`, `dispatch(cmd: Command)`, `view: 'iso' | 'third'`, `viewBlend: number`.

- [ ] **Step 1:** Test the store: `dispatch` of a `place` command advances the world on the next `tick`; `viewBlend` clamps to [0,1].
- [ ] **Step 2-4:** Implement store, scene (orthographic iso camera with pan/zoom, instanced terrain/entities), HUD with build palette, route + catalog + capabilities; pass tests.
- [ ] **Step 5:** `pnpm check:consistency`, `pnpm exec tsc --noEmit`, `pnpm test`; commit; PR; CI; merge.

---

## Phase 2 — Third-person view, camera transition, avatars and skins (PR 3)

### Task 2.1: Camera rig with `viewBlend` (`components/hearthworks/scene/CameraRig.tsx`, `lib/hearthworks/camera.ts`)

**Interfaces:** Produces `blendCamera(iso: CameraPose, third: CameraPose, t: number): CameraPose` (position, target, ortho↔perspective via frustum/FOV interpolation) and `stepViewBlend(current: number, target: 0 | 1, dtMs: number): number` using `EASE.smooth` (zero speed at both ends).

- [ ] **Step 1:** Tests: `stepViewBlend` is monotone toward the target, never outside [0,1], reverses smoothly when the target flips mid-flight (no jump larger than one frame's step); `blendCamera(…, 0)` equals iso pose and `(…, 1)` equals third pose; no NaN for any t.
- [ ] **Step 2-4:** Implement; pass; commit.

### Task 2.2: Avatar controller and animation (`lib/hearthworks/avatar/`)

**Interfaces:** Produces `stepAvatar(state, input, dtMs)` (walk/run/strafe, collision against the grid), and `pickActivity(state): ActivityId` mapping to `ACT_*` from the model's `anims.json` (idle/walk/run/work), with crossfade durations.

- [ ] Tests, implementation, commit (TDD as above).

### Task 2.3: Skin catalog and pricing (`lib/hearthworks/skins/`)

**Interfaces:** Produces `SKINS: Record<SkinId, { model: string; tier: 'common'|'uncommon'|'rare'|'epic'|'legendary'; price: number }>` (G-Man = legendary, highest price), `validateSkinId(id: unknown): SkinId | null`, `canAfford(money, id)`.

- [ ] Tests: unknown/malicious id → `null`; price strictly increases with tier; G-Man is the most expensive; purchase deducts in-game money only.
- [ ] Implement; wardrobe UI; PR; CI; merge.

---

## Phase 3 — Game layers (one PR each)

Each layer extends `World`/`stepWorld`/content tables with tests first, then scene/UI.

- **3A Farm & forest:** crops, tools, foraging nodes, wildlife; hand-tend in 3D, plan in iso. (Ports Farming Sim + Forest Explorer garden.)
- **3B Kitchen & trade:** recipes with stacking effects, stalls/shops, NPC customers with demand per district (ports CookGame).
- **3C Crime & police:** crime-route products, heat meter, Metrocop/Combine patrols that engage at high heat; weapon tables sourced from CS:GO/HL2 channels; combat resolved by the host sim with lag compensation.
- **3D Automation & workers:** machines, belts, hireable workers with role/wage/skill; closed-form offline catch-up (cap 24 h).
- **3E City layer:** roads, zones, utilities, milestones (ports Isleworks).

## Phase 4 — Multiplayer (PR)

`lib/hearthworks/net/`: lobby via `lib/lobby-link.ts`; signaling through a new hub handler modelled on `server/socket-server/handlers/tf2-p2p.ts`; host runs `stepWorld`, peers send command streams and receive delta snapshots; reuse `lib/shared/p2p` `ReliableLink`; Source-style prediction/interpolation reused from `lib/tf2-game`; host migration with successor checkpoints (`lib/balatro/mp/migration.ts` pattern). Tests: two in-memory peers converge; host drop → successor resumes from checkpoint with equal world hash.

## Phase 5 — Cutover (PR)

Delete CookGame, Forest Explorer, Isleworks, RMH Farming Sim (routes, components, lib, API, socket handler, Prisma tables, catalog, i18n); redirect old URLs to `/hearthworks`; one-way save importer optional if time permits.
