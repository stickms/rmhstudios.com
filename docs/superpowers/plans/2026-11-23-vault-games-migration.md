# Vault Games Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `/secret`, delete Satan's Library, and ship Project Vega, Signal Forge and Cursed Logic as listed `/games` library titles, each with a unique extensively-built visual identity, reworked gameplay, a tutorial and achievements.

**Architecture:** Tasks 1 and 2 (lead, sequential, one commit each) do the shared plumbing so the three game tasks (3, 4, 5) can run in parallel in isolated worktrees, each touching only its own `features/<id>/` folder, its own `public/images/games/**/<id>.*` assets, its own `docs/game-design-schemes/<id>.json`, its own locale namespace and its own slice of the shared registries (given below). Task 6 merges and gates.

**Tech Stack:** TanStack Start islands (`features/<id>/island.tsx`, `vite.islands.config.ts`), React 19, canvas/SVG, Tailwind v4 `--app-*` full-screen tier, Zustand, i18next `t()`, Vitest, Playwright+Chromium for art rendering and screenshots.

**Spec:** `docs/superpowers/specs/2026-11-23-vault-games-migration-design.md`

## Global Constraints

- Public URLs: `/vega`, `/signal-forge`, `/cursed-logic`; `/secret/*` redirect to them. Catalog `listed`, `authGate: true`, status badge `Playable`.
- `pnpm check:consistency` passes before every commit (CLAUDE.md commit gate). Never `--no-verify`.
- All user-facing strings via `t("key", { defaultValue })`, then `pnpm i18n:extract`; check `locales/en/<ns>.json`. A new namespace is added to `NAMESPACES` in `lib/i18n/config.ts`. No `{/* */}` comment directly before a `t()` call.
- `routeTree.gen.ts` is generated; never edit.
- Games are full-screen: they use the `--app-*` tier and keep their own look (L8). Nothing flashes faster than once per second; ambient motion obeys `html[data-jelly-motion='still']`; focus ring stays visible; text pairs hold 4.5:1.
- Art is original (SVG rendered by headless Chromium, or canvas). Fonts only from `components/shared/game-fonts/` (OFL). Card art credits appended to `docs/game-art-credits.md`.
- Achievement ids are permanent: `game.<id>.<slug>`. Rewards use the existing tiers/coin scale in `lib/achievements/catalog.ts`.
- Catalog art files: `imagePath` `/images/games/<id>.webp`, `bannerPath` `/images/games/banners/<id>.webp` (1920x620 WebP, <= 400 KB), `logoPath` `/images/games/logos/<id>.webp` (transparent, ~1024 px wide).
- Do not touch roadmap or news files (other agents own them).

## Review Focus

- A signed-out visitor opening `/vega` etc.: sees the sign-in gate like Void Breaker, not a blank island.
- Old bookmarks `/secret`, `/secret/vega`, `/secret/signal-forge`, `/secret/cursed-logic` redirect (permanent) and `/secret` has no remaining route.
- Existing Signal Forge cloud saves and Vega/Signal Forge leaderboard rows survive the rework (a pre-rework save loads or is cleanly retired, never crashes).
- Score submissions from the reworked games stay under the catalog `scoring` ceilings; an honest max run is not rejected.
- A game left open on the tutorial, or tutorial skipped, never blocks the first real run; reduced-motion and keyboard-only players can finish the tutorial.

## File Structure

- `features/cursed-logic/{feature.ts,catalog.ts,island.tsx,island.css,engine/,ui/,api/}` (Task 1 moves; Task 5 builds out)
- `features/{vega,signal-forge}/catalog.ts` and `docs/game-design-schemes/{vega,signal-forge,cursed-logic}.json` (Task 2 stubs; Tasks 3-5 own)
- `app/routes/{vega,signal-forge,cursed-logic}.tsx` island routes; `app/routes/secret*` deleted
- Per-game tutorial lives in `features/<id>/ui/Tutorial*.tsx`, state flag in the game's save or `localStorage` key `rmh:<id>:tutorial-done` (try/catch wrapped).

---

### Task 1: Move Cursed Logic into `features/cursed-logic`

**Files:**
- Move: `lib/cursed-logic/*` -> `features/cursed-logic/engine/`; `components/cursed-logic/*` -> `features/cursed-logic/ui/`
- Create: `features/cursed-logic/feature.ts`
- Modify: every importer (`grep -rn "cursed-logic"`), `app/site-tier.css` (`@source not` lines at 96, 156 become `../features/cursed-logic/{engine,ui}`), `eslint-local-rules/design-scope.js:41`, `lib/__tests__/{game-viewport-consistency,stacking-consistency,raf-loop-allowlist}.test.ts` paths, `vitest.config.ts` excludes, `lib/CLAUDE.md`/`features/CLAUDE.md` "Moved so far" list.

**Interfaces:**
- Produces: `@features/cursed-logic/engine/*` and `@features/cursed-logic/ui/*` specifiers; manifest `id: 'cursed-logic'`, `basePath: '/secret/cursed-logic'` (changed in Task 2).

- [ ] **Step 1:** `git mv` the two directories; rewrite specifiers repo-wide with a scripted replace; update the paths listed above.
- [ ] **Step 2:** `feature.ts` as `defineFeature({ id: 'cursed-logic', kind: 'game', basePath: '/secret/cursed-logic', delivery: 'route', routes: ['app/routes/secret/cursed-logic/index.tsx'], namespaces: ['c-cursed-logic', 'r-secret'], listed: false })`.
- [ ] **Step 3:** Run `pnpm typecheck && pnpm exec vitest run lib/__tests__ features` Expected: PASS.
- [ ] **Step 4:** Commit `refactor(cursed-logic): move into features/cursed-logic` (gate first).

### Task 2: Library entries, new URLs, remove the Vault

**Files:**
- Create: `features/{vega,signal-forge,cursed-logic}/catalog.ts` (stubs: real titles/descriptions from `public/images/games/{project_vega,signal_forge,cursed_logic}.webp` existing cards as `imagePath` for now, `order` 130/131/132 unless taken, `scoring` per `lib/game/registry.ts` existing signal-forge rule and new vega/cursed-logic rules)
- Create: `app/routes/{vega,signal-forge,cursed-logic}.tsx` (island routes copied from the `secret/*` ones, heads from the catalog like `app/routes/void-breaker.tsx`; Cursed Logic gets `island.tsx`/`island.css` modelled on `features/vega`), `docs/game-design-schemes/{id}.json` stubs
- Modify: `features/*/feature.ts` (`basePath`, `listed: true`, drop `r-secret` namespace, routes), `lib/catalog/index.ts` (import lines), `lib/game/registry.ts` (remove `unlisted: true`, add vega + cursed-logic rules), `lib/sitemap.ts:750-756` (drop `/secret*`, add the three paths), `lib/islands/*` if redirects live there, the three `VegaPage`/`SignalForgePage`/`CursedLogic` frames (back link goes to `/games`, drop the `/secret` scroller frame), `lib/i18n/config.ts`
- Delete: `app/routes/secret.tsx`, `app/routes/secret/**`, `locales/en/r-secret.json` and its `NAMESPACES` entry (after moving the back-link string into each game's own namespace), `public/images/games/satans_library.webp` and its `lib/images/variants.gen.ts` entries
- Redirects: add permanent redirects `/secret`, `/secret/vega`, `/secret/signal-forge`, `/secret/cursed-logic` -> `/games`, `/vega`, `/signal-forge`, `/cursed-logic` in the repo's redirect mechanism (find with `grep -rn "redirect" app/routes/__root.tsx lib/*redirect*`; if none exists for static maps, add Apache `RewriteRule`s in `deploy/apache/rmhstudios.conf` and a router `beforeLoad` redirect for dev).

**Interfaces:**
- Produces: catalog ids `vega`, `signal-forge`, `cursed-logic` (stable join keys for scoring, achievements, saves); achievement group names `Project Vega`, `Signal Forge`, `Cursed Logic`.

- [ ] **Step 1: Write the failing tests:** in `lib/__tests__/catalog.test.ts` expectations run unchanged; add `lib/__tests__/vault-removed.test.ts` asserting `app/routes/secret.tsx` and `app/routes/secret/` do not exist, no source file contains `satans-library`/`satans_library`, and `lib/sitemap.ts` has no `/secret`. Run it; Expected: FAIL.
- [ ] **Step 2:** Make the changes above. The redirects test: assert the redirect map has all four sources (name the test `vault redirects cover every old path`).
- [ ] **Step 3:** `pnpm i18n:extract && pnpm facts:generate && pnpm exec vitest run lib/__tests__/catalog.test.ts lib/__tests__/feature-manifests.test.ts lib/__tests__/vault-removed.test.ts -u` for the catalog-contract snapshot only after reading the diff. Expected: PASS.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint`; smoke the three URLs with `pnpm dev` and curl for 200 (signed-out shows the gate) and the four old paths for 301.
- [ ] **Step 5:** Commit `feat(games): list Vega, Signal Forge, Cursed Logic; remove the Vault and Satan's Library`.

### Tasks 3, 4, 5: per-game build (run in parallel, one agent each, isolated worktree)

Common structure for each agent (the task text it receives is this section plus its game block). Each agent's order of work:

- [ ] **Step A: Read** the game's current code end to end, `docs/game-design-schemes/void-breaker.json` (the scheme format), `docs/game-art-credits.md`, one finished neighbour for conventions (`features/void-breaker`), and the design doc.
- [ ] **Step B: Design scheme** `docs/game-design-schemes/<id>.json` (same keys as the others: mood, palette, fonts, shape, motifs, buttonStyle, backdrop, motion). It must be visibly distinct from all 20 existing schemes (compare palettes and fonts; no reuse of another game's accent+font pair).
- [ ] **Step C: Library art:** a generator script `scripts/game-art/<id>.mjs` (SVG -> headless Chromium -> WebP) producing card (`imagePath`), banner, logo, and the small icon in `public/images/games/icons/` if neighbours have one; credits row added to `docs/game-art-credits.md`. Check each at card size and banner crop with a screenshot.
- [ ] **Step D: In-game visuals (extensive):** rebuild the menu, HUD, panels, buttons, icons and in-play rendering to the scheme (sprites/sigils/glyphs drawn originally, themed backdrops, particles, hit/kill/death/victory effects, transitions under 360 ms, themed sound hooks where the game already has sound). Done when a screenshot of menu, mid-play and end screen is unmistakable from the other two games and from every existing title.
- [ ] **Step E: Gameplay rework (below), with a balance artifact:** pure-logic modules are unit-tested; numbers live in one data file; add a seeded simulation test (`__tests__/balance.test.ts`) asserting the balance claims in the game block (win-rate or survival bands across strategies).
- [ ] **Step F: Tutorial:** guided, interactive, skippable, remembered; re-openable from the help control; keyboard and reduced-motion safe; test the tutorial state machine (`tutorial.test.ts`).
- [ ] **Step G: Achievements and integration:** 10-15 achievements in `lib/achievements/catalog.ts` under the game's group (ids `game.<id>.*`, rewards bronze 10-25, silver 25-75, gold 75-200, platinum 200-500 coins; follow the Synapse block's shape), awarded through the existing award path (find: `grep -rn "game.synapse" lib features`), score submit and leaderboard, playtime heartbeat, quests where a hook exists, cloud save where a run is long. Update the game's `catalog.ts` copy (`longDescription`, tags) and `scoring` ceiling from the simulation's max.
- [ ] **Step H: Verify:** `pnpm exec vitest run features/<id> lib/achievements lib/__tests__/catalog.test.ts`, `pnpm typecheck`, `pnpm lint`, screenshots (390 px and 1280 px) of tutorial, menu, play, end; `pnpm check:consistency`; commit in focused commits on its own branch.

**Interfaces (all three):** consumes `catalog.ts` ids and achievement group names from Task 2; produces, for Task 6, one branch each that modifies only: `features/<id>/**`, its `public/images/games/**/<id>.*`, its design scheme, `scripts/game-art/<id>.mjs`, `locales/en/c-<id>.json`, plus these shared files by append-only edits: `lib/achievements/catalog.ts` (its own group block), `lib/game/registry.ts` (its own rule), `docs/game-art-credits.md` (its own rows).

#### Task 3 game block: Project Vega (clinical-horror tower defense)
Visual direction (builder refines in the scheme): sterile lab / specimen scan; pale surgical greens and cold whites against a black void, monitor scanlines drawn as static art, clinical iconography. Gameplay minimum: discrete waves with a build phase and an explicit start-wave control; about 8 towers with 2-3 upgrade tiers each (the 4 existing ones kept); a larger enemy roster with distinct movement/resistance behaviours and boss waves every fifth wave; 3 selectable maps with different path shapes (the existing `Pathfinder`/`GridManager` extended, not replaced); lives and a coin economy tuned so a median strategy reaches the mid waves. Balance test: a scripted "greedy", "balanced" and "single-tower spam" strategy; assert balanced beats greedy beats spam at wave N bands the builder chooses and records. Score: waves cleared x multipliers; update `maxScore`, `maxScorePerSecond` from the simulation.

#### Task 4 game block: Signal Forge (rhythmic roguelike deckbuilder)
Visual direction: forge heat meeting circuit traces and oscilloscope waveforms; hot amber and electric cyan on charred metal. Gameplay minimum: roughly triple cards, relics, enemies and events (counts recorded in the spec test); elites and an act boss per act; an ascension ladder (at least 5 levels, each with a stated modifier); the rhythm layer given real decisions (timing windows affect damage/block, with an accessible non-timed mode); a balance pass with a card-power budget table and a seeded run simulator test (random-agent and greedy-agent win-rate bands per ascension). Saves: keep the cloud-save schema backward compatible or add a version field that retires old runs cleanly (Review Focus).

#### Task 5 game block: Cursed Logic (psychological duel vs a rogue AI)
Visual direction: corrupted terminal, glitch sigils and cursed circuitry; acid green/violet over deep black, glyph-based UI. Gameplay minimum: an opponent roster of at least 5 Protocols with distinct personalities (tells, bluff frequency, stance pools) and tiered run structure (a run is a ladder of duels with milestone shops, existing `shopState` and `minigame` reused); stance and shop rebalance so no stance dominates (simulation across stance pairs asserting win-rate within a band); score and leaderboard for runs (new `features/cursed-logic/api/cursed-logic.score.server.ts` and leaderboard through `implement()`, following `features/vega/api`), tutorial as a scripted first duel.

### Task 6: Integrate and gate

- [ ] **Step 1:** Merge branches 3, 4, 5 one at a time into the working branch; resolve achievements/registry/credits conflicts by keeping all three blocks.
- [ ] **Step 2:** `pnpm i18n:extract && pnpm facts:generate && pnpm typecheck && pnpm lint && pnpm test && pnpm build`; `pnpm check:consistency --base main`. Expected: all pass; update the catalog-contract snapshot only after reading its diff.
- [ ] **Step 3:** Screenshot the `/games` library with all three cards and each detail hero (banner + logo) at 390 px and 1280 px, Day and Night; fix any crop or contrast issue.
- [ ] **Step 4:** Update `CLAUDE.md`/`features/CLAUDE.md` mentions of the unlisted secret games, push the branch, open the PR, subscribe to its activity.
