# Vault games migration: Project Vega, Signal Forge, Cursed Logic into /games

Date: 2026-11-23. Status: approved by the owner in conversation (approach 1, visuals emphasised).

## Intent and why

`/secret` ("The Vault") is being removed. Roadmap and news are moved out by other agents. Satan's Library is
discontinued and is deleted. The three playable games in the Vault become ordinary, listed titles in the `/games`
library. Today they are thin: little gameplay, repetitive, balance that does not make sense, no tutorial. The owner wants
each to be a real game with its own identity.

## Goals

1. Each game is a first-class library title: `features/<id>/catalog.ts` with `imagePath`, `bannerPath`, `logoPath`,
   a `docs/game-design-schemes/<id>.json`, listed, `authGate: true`, public URL `/vega`, `/signal-forge`,
   `/cursed-logic` (the old `/secret/*` paths redirect).
2. **Visuals are extensive, not a reskin of colours.** Each game gets a unique, instantly identifiable look inside the
   established game-art conventions (`docs/game-art-credits.md`, per-game fonts from `components/shared/game-fonts/`, the
   self-contained `--app-*` full-screen tier): original SVG/canvas art for the card, banner, logo and icon; a themed menu,
   HUD, panels, buttons, iconography and in-play rendering (sprites, backdrops, particles, hit and death effects, screen
   transitions within the 360 ms and no-flash rules); a cohesive audio-visual feedback language. Art credits are added to
   `docs/game-art-credits.md`.
3. Gameplay is reworked to be balanced, varied and exciting (owner's complaint: little gameplay, repetitive, balance
   does not make sense), with an interactive first-run tutorial and a re-openable help.
4. Platform integration: achievements (10 to 15 per game, new groups in `lib/achievements/catalog.ts`, coin rewards in
   the existing tiers), score submission and leaderboard where the game has a score, playtime, saves where a run is long.
5. Satan's Library, the `/secret` layout and index, and their strings, tests and snapshots are removed.

## Non-goals and anti-goals

- No change to roadmap and news (other agents own them).
- Do not bring back anything Steel deleted; library pages follow the existing games-page conventions. The games
  themselves are full-screen and keep their own look (L8).
- Not a failure: an identical-looking trio with different accent colours; balance numbers nobody checked; a tutorial
  that is a wall of text.

## Constraints

- Repo rules in `CLAUDE.md` apply: `pnpm check:consistency` before every commit, strings through `t()` with
  `pnpm i18n:extract`, new namespaces in `lib/i18n/config.ts`, catalog is the source of truth, API through `defineHandler`
  / `implement`, no hand edits of `routeTree.gen.ts`, accessibility (focus ring, 4.5:1, nothing flashes faster than once
  per second, reduced-motion respected for ambient motion).
- Achievement ids are permanent once shipped.
- Scoring ceilings in the catalog entry must be honest for the reworked gameplay (`lib/game/registry.ts` derives from
  them; `catalog-contract` snapshot is regenerated deliberately).

## Approaches considered

1. **Plumbing first, then three parallel agents (chosen).** One commit of shared changes, then one agent per game in an
   isolated worktree touching only its own folder plus its slice of shared files; merged one at a time. Clean merges.
2. Three fully independent agents: fastest start, but all three edit the same registries, snapshot and achievements file
   and would each do the Cursed Logic move or redirects differently. Rejected.
3. One game at a time: safest, three times slower. Rejected.

## The shared plumbing (done by the lead, before the agents)

- Move Cursed Logic to `features/cursed-logic/{engine,ui}` (+ `feature.ts`, island or route per what Vega and Signal
  Forge already do), repoint imports, `@source not` lines, test excludes.
- Add `catalog.ts` stubs for the three (real copy and art land with each agent), register in `lib/catalog/index.ts`,
  flip manifests to `listed: true`, new basePaths, redirects from `/secret/*`.
- Add achievement group stubs and the `lib/game/registry.ts` / `lib/game-saves/registry.ts` entries each game needs.
- Delete `app/routes/secret*`, Satan's Library (tile, `satans_library.webp`, `lib/images/variants.gen.ts` entry, roadmap
  data mention only if the roadmap agents have not already removed it), the `/secret` entries in `lib/sitemap.ts`.

## Per-game scope (builder decides numbers; these are the minimum shape)

- **Project Vega** (clinical-horror tower defense): discrete waves with a build phase and a call-next-wave control, about
  8 tower types with upgrade paths, a larger enemy roster with distinct behaviours and boss waves, 3 maps, a rebalanced
  economy, run-end score and leaderboard. Look: sterile clinical horror (the lab, the specimen, the scan).
- **Signal Forge** (rhythmic roguelike deckbuilder): roughly triple the cards, relics, enemies and events, elites and
  bosses per act, an ascension ladder, balance pass with a simulation or test harness for card and enemy numbers.
  Look: circuitry, signal waveforms, forge heat.
- **Cursed Logic** (psychological duel vs a rogue AI): opponent roster with distinct Protocol personalities, a tiered run
  structure, stance/shop rebalance, a score and leaderboard. Look: glitching terminal and cursed-sigil logic.
- Each gets a tutorial (guided, interactive, skippable, remembered) and a distinct visual identity, unique across all
  three and distinct from the 19 existing library titles.

## What is left to the builder

Exact numbers, enemy and card names, palette values within each game's scheme file, art composition, achievement lists,
sound design. Builders must record balance reasoning (a short table or test) so balance is checkable, not asserted.
