# 02 — Game assists in Vega

Surface: `/vega` (the run, its settings and end screen), `/settings/game-assists` (Vega listed), the game's page in the
library ("Playing this game"). Wave 2. Namespace `vega-assists`. App tier (L8) in the game; site tier for the settings
row.

## User story

As a player who finds Vega's waves too fast to read, who cannot tell the specimens apart by colour, or who is bothered
by the leak flash, I want the site's game assists to work in Vega — a slower floor on the game speed, calm visuals,
colour-safe palettes, and placing towers while paused — so that I can play a full run, knowing that an assisted run
stays off the board.

## Requirements elicitation

- **What exists (verified):**
  - The shared assist layer: `lib/game/assist.ts` (`AssistSettings` with `holdToPress`, `speedFloor`, `calmVisuals`,
    `colorSafe`, `noTimedInput`; `profileFor`, `HONOURED_SETTINGS`, `ASSIST_CAPABLE`, `ASSIST_FEATURES`),
    `lib/game/assist.server.ts`, the run claim `lib/game/assist-run.server.ts` (`consumeAssistRun`: the server decides
    at run start that a run is assisted, and the score route reads that, never the client), the member's settings page
    `components/settings/GameAssistsPanel.tsx` (`app/routes/_site/settings/game-assists.tsx`) and the run banner
    `components/games/assist-run.tsx` / `components/games/assist-run-island.tsx` (for island games).
  - Six games adopted it (sprints 07, 08, 09): Synapse Storm, Void Breaker, Dream Rift, Nightrail, Neon Driftway and
    Laundry Sort (`features/laundry-sort/engine/assist-profile.ts`, `features/laundry-sort/ui/useRunAssists.ts` and
    `features/laundry-sort/api/laundry-sort.score.server.ts` are the newest model). `lib/__tests__/game-assist.test.ts`
    holds `ASSIST_CAPABLE` to the `accessibility` entries in `lib/game-capabilities.ts`.
  - Vega (`features/vega/`) is a real-time tower defence: `engine/TimeManager.ts` runs the clock at `speed: 1 | 2`;
    waves are started from the build phase or called early (`engine/GameState.ts`, `engine/WaveManager.ts`); a leak
    darkens the board edge and burst specimens stain the board (`engine/Renderer.ts`, `engine/art.ts`); its score route
    is `features/vega/api/vega.score.server.ts` and its capabilities entry claims only `remappable-input`
    (`accessibility: []` in `lib/game-capabilities.ts`, the game is keyboard-, mouse- and touch-playable). It is not in
    `ASSIST_CAPABLE`.
- **Decisions:**
  - **What Vega honours:** `speedFloor` (0.5–1 in the shared settings: the run clock's normal speed becomes
    `speedFloor` × 1 and the fast toggle stays 2×, so `TimeManager.speed` widens from `1 | 2` to a number; at the
    default floor 1 nothing changes; the score route's rate checks already allow a slower run, and the wall-clock
    `durationMs` it reads is real time, so a slower run only lengthens it), `calmVisuals` (no leak edge flash, no burst stains, no tower muzzle flashes; the leak is shown by
    the integrity count and a text line), `colorSafe` (the specimen and tower palettes swap to a colour-blind-safe set, and each
    specimen type also carries a distinct outline glyph, as Laundry Sort's garments carry a pattern glyph), `noTimedInput` (the game can be
    paused at any time during a wave, and towers can be placed, sold and upgraded while paused). `holdToPress` is not
    honoured (Vega has no held input). `HONOURED_SETTINGS.vega` lists the four.
  - **Ranking:** a run whose profile has any honoured assist is unranked, decided at run start by the claim and read
    by the score route through `consumeAssistRun`; the run's score is still saved to the player's own row as their
    personal best only if the route's existing rules allow (the Laundry Sort route's handling is copied: an assisted
    run never reaches the board). Achievements and quests follow the same rule as Laundry Sort.
  - **Banner and end screen:** the run shows the shared "Assists on — this run is not ranked" banner; the end screen
    says "Not ranked: assists were on" (Vega's namespace).
  - **Capabilities:** Vega's entry gains `assist-mode`, `reduced-flashing`, `colorblind-safe`, `no-timed-input`
    (`ASSIST_FEATURES`); `vega` joins `ASSIST_CAPABLE` in the same change.
  - **Signal Forge is not in this feature:** it is turn-based and already claims `no-timed-input` and
    `colorblind-safe`; the shared settings would only change visuals there, so adopting it would unrank runs for no
    gameplay difference (recorded in the README).

## Functional requirements

1. FR-1 `features/vega/engine/assist-profile.ts` (new, pure): the profile → Vega's knobs (`minSpeed`, `calm`,
   `palette`, `pauseAnywhere`), like Laundry Sort's.
2. FR-2 Engine: `TimeManager.ts` reads the speed floor (the toggle moves between the floor and 2); `GameState.ts` and
   the input layer allow placing, selling and upgrading while paused when `pauseAnywhere`; `Renderer.ts` and `art.ts`
   skip the edge flash, stains and muzzle flashes when `calm`, and use the colour-safe palette and outlines.
3. FR-3 `features/vega/ui/` reads the run's profile through the island-safe path (`components/games/assist-run-island.tsx`
   pattern; the island imports no React Query or router), starts the claim at run start and shows the banner and the
   end-screen line.
4. FR-4 `features/vega/api/vega.score.server.ts`: `consumeAssistRun(userId, 'vega', …)` (as Laundry Sort's route calls
   it) decides whether the run reaches the board; for an assisted run `VegaPlayer.highestLevel` and `highestLoop` (the
   board's columns) are not raised and the response says `ranked: false`; `gamesPlayed`, `recordGamePlay` and the
   achievements follow Laundry Sort's rule for assisted runs.
5. FR-5 `lib/game/assist.ts` (`ASSIST_CAPABLE`, `HONOURED_SETTINGS.vega`, the header count "Seven games"),
   `lib/game-capabilities.ts` (Vega's `accessibility`), and the settings page lists Vega among the games each setting
   reaches (`components/settings/GameAssistsPanel.tsx` reads `HONOURED_SETTINGS`; confirm it needs no edit).

## Non-functional requirements

- **Integrity:** the client never says whether a run was assisted; only the claim does (a test submits an "unassisted"
  score for an assisted claim and sees it kept off the board).
- **Accessibility:** every honoured assist is real in play; colour-safe also adds shape, never colour alone.
- **Performance:** no extra frame work when assists are off (the palette and flags are read once per run).

## Data model and API

No schema change: assists are the member's existing settings and the claim is Redis, as for the other six games.

## Testing requirements

- Product suite `features/vega/engine/__tests__/assist-profile.product.test.ts`: each setting maps to its knob; the
  default profile changes nothing; the speed floor bounds.
- Main suite `features/vega/api/__tests__/vega-score-assists.test.ts`: an assisted claim keeps the run off the board
  whatever the body says; an unassisted claim ranks as before (copy the Laundry Sort route test's mocks).
- `lib/__tests__/game-assist.test.ts` (Vega in both halves), `components/steam/__tests__/PlayingThisGame.test.tsx`
  (the new claims render), the islands gate.

## Acceptance criteria

- [ ] With "Slower games" at 0.5, Vega's slowest speed is half the normal speed.
- [ ] With calm visuals on, a leak shows no flash and specimens leave no stain.
- [ ] With "No timed input" on, a player pauses mid-wave and places a tower.
- [ ] An assisted run ends "Not ranked: assists were on" and does not appear on the Vega board.
- [ ] Vega's game page lists its four new accessibility claims.

## Out of scope

Signal Forge and the other games without assists; new assist settings; per-game assist overrides.
