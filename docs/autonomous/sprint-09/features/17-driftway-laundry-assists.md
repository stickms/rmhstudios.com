# 17 — Game assists in Neon Driftway and Laundry Sort

Surface: `/neon-driftway`, `/laundry-sort`, the game-assists settings page (`/settings/game-assists`), the games
library's capability lines. Wave 2. Namespace `driftway-laundry-assists`. App tier (L8): both games keep their own look.

## User story

As a player who needs calmer visuals, colours that do not depend on red and green, or a slower clock, I want Neon
Driftway and Laundry Sort to honour the game assists I already set, the way Synapse Storm, Void Breaker, Dream Rift and
Nightrail do, so that two more games are playable for me.

## Requirements elicitation

- **What exists (verified):**
  - The assist layer (sprint 07 02, `lib/game/assist.ts`): `AssistSettings` (`holdToPress`, `speedFloor`, `calmVisuals`,
    `colorSafe`, no timed input), `ASSIST_CAPABLE = { synapse-storm, void-breaker, dream-rift, nightrail }`; "a game
    joins it in the same change that teaches its client to honour the settings, and `lib/game-capabilities.ts` gains the
    matching `accessibility` entries in that same change". An assisted run is decided at run start and kept off the
    boards; the island-safe helpers live apart from React Query and the router
    (`components/games/assist-run-island.tsx`, sprint 07's review).
  - Sprint 08 06 did Dream Rift and Nightrail (patterns: `features/dream-rift/**`, `features/nightrail/**`,
    `lib/arcade/runs.server.ts` `detail.assisted`).
  - `lib/game-capabilities.ts`: `neon-driftway` (single, online versus; descriptor `flashing`; `accessibility: []`) and
    `laundry-sort` (single, online versus; `accessibility: []`). Neon Driftway's flashes and camera shake are in
    `lib/neon-driftway/renderer3d.ts`, `game.ts` and `camera.ts` (`shakeMagnitude`, `shakeTimer` in `game.ts`). Laundry
    Sort is a drag-and-drop sorting game (input `mouse`, `touch`) whose solo match is a timed round (`durationSec` in
    `engine/store.ts`, the clock in `ui/hud/HudReadout.tsx`); garments are sorted by colour (`colorId`,
    `engine/arena.ts`). A grep for shake, flash, strobe or bloom in `features/laundry-sort/**` finds nothing but a CSS
    comment: the game has no flashing or shaking effect to remove.
  - Neon Driftway has a ghost and a leaderboard (`lib/neon-driftway/api/neon-driftway.leaderboard.server.ts`); Laundry
    Sort has online lobbies (`engine/net/*`).
- **Decisions:**
  - **Neon Driftway:** calm visuals (no screen flash on boost or collision, no camera shake, bloom intensity capped),
    colour-safe (the track's hazard and boost markings switch to the colour-safe pair plus a shape: chevrons for boost,
    stripes for hazards), speed floor (the simulation's clock scales by `speedFloor`, single-player only). An assisted
    solo run is kept off the leaderboard and its ghost is not saved as a record (as Void Breaker does). Online races
    apply only calm visuals and colour-safe, locally (sprint 08's co-op decision).
  - **Laundry Sort:** colour-safe (every garment colour also carries a pattern glyph, on the garment and on its bin, so
    no sort depends on hue) and no timed input (a solo match runs without the clock: the HUD shows "Untimed", the player
    ends it with "Finish", and the result is kept off the board). Calm visuals and hold to press do not apply: there is
    no flash or shake to remove (verified by the grep above; the implementer re-checks the scene shaders) and no
    quick-tap input (dragging is untimed). Online versus applies colour-safe only, locally (a versus round's clock is
    shared, so it stays).
  - **Capabilities:** each game's `accessibility` gains exactly the entries it now honours — Neon Driftway
    `assist-mode`, `reduced-flashing`, `colorblind-safe`; Laundry Sort `assist-mode`, `colorblind-safe`,
    `no-timed-input` (solo) — using only values the capability type already defines (the implementer checks the union in
    `lib/game-capabilities.ts` and stops if one is missing); Neon Driftway keeps its `flashing` descriptor (the default
    experience still flashes). Both join `ASSIST_CAPABLE` in the same change; the settings page's list of supporting
    games and the library lines (sprint 08 13) pick them up from the registry.
  - **No idle motion added** and no new frame loop: both games already animate while played; assists only remove
    effects.

## Functional requirements

1. FR-1 Neon Driftway reads the member's assists at run start and applies calm visuals, colour-safe and the speed floor;
   assisted runs are unranked.
2. FR-2 Laundry Sort applies colour-safe glyphs and no timed input in solo; assisted runs are unranked.
3. FR-3 Online modes apply the local assists only (Neon Driftway calm visuals and colour-safe; Laundry Sort
   colour-safe).
4. FR-4 `ASSIST_CAPABLE` and both capability entries updated; the assists page lists the games.

## Non-functional requirements

- **Correctness:** the assisted decision is made once at run start and sent with the result; the server rejects an
  assisted result on a ranked board (as for the four games).
- **Performance:** no frame-time regression on the games' `demanding` path (calm visuals only removes passes).
- **Accessibility:** the glyphs carry meaning without colour; contrast of glyphs on garments holds 3:1 (graphical
  objects).

## Data model and API

- No schema change. Edits: `lib/game/assist.ts`, `lib/game-capabilities.ts`,
  `lib/neon-driftway/{renderer3d,game,camera}.ts`, `components/neon-driftway/*` (reading assists), the Neon Driftway
  leaderboard submit, `features/laundry-sort/engine/*`, `features/laundry-sort/ui/*`. Island entries use the island-safe
  helpers.

## Testing requirements

- Product suite `lib/neon-driftway/__tests__/assists.product.test.ts`: the speed floor scales the step; calm visuals
  disables flash and shake.
- Product suite `features/laundry-sort/engine/__tests__/assists.product.test.ts`: glyph per colour unique; untimed mode
  never ends on time.
- Main suite: an assisted Neon Driftway result is refused on the board.
- `lib/__tests__/islands.test.ts`, the assist ↔ capabilities test from sprint 07,
  `lib/__tests__/raf-loop-allowlist.test.ts`.

## Acceptance criteria

- [ ] With calm visuals on, a boost in Neon Driftway does not flash the screen and the camera does not shake.
- [ ] With colour-safe on, every Laundry Sort garment shows its glyph, and a level can be solved in greyscale.
- [ ] An assisted solo run is shown as "Assisted, not ranked".
- [ ] The games library shows both games' new accessibility lines.

## Out of scope

Remappable controls, subtitles, assists in Kowloon Knockout or the Source ports, changing either game's rules.
