# 06 — Game assists in Dream Rift and Nightrail

Surface: Dream Rift (`/dream-rift`), Nightrail (`/nightrail`), their score
paths and the seeded daily run. Wave 3. Namespace `more-game-assists`.

## User story

As a player with photosensitivity, slow reactions or a motor impairment, I
want the assists I already set once in `/settings/game-assists` to work in
Dream Rift's bullet patterns and Nightrail's high-speed track, so that two
more of the site's action games are playable for me, knowing my assisted runs
stay off the boards.

## Requirements elicitation

- **What exists (verified):**
  - `lib/game/assist.ts` (the assist layer: `holdToPress`, `speedFloor`,
    `calmVisuals`, `colorSafe`, `noTimedInput`), `ASSIST_CAPABLE =
    {'synapse-storm', 'void-breaker'}` (sprint 07 02), with the rule that "a
    game joins it in the same change that teaches its client to honour the
    settings" and that `lib/game-capabilities.ts` then claims
    `ASSIST_FEATURES`.
  - Each adopting game has an `engine/assist-profile.ts` (pure, with a product
    test) and UI wiring (`features/void-breaker/ui/assist-ui.tsx`); the run
    start claim and `consumeAssistRun` (`lib/game/assist-run.server.ts`) keep
    assisted runs off boards in `submitGameScore` (`lib/game/submit.server.ts`).
  - Nightrail submits through `submitGameScoreApi` (`features/nightrail/ui/NightrailUI.tsx`)
    and ships an island entry (`features/nightrail/island.tsx`). Its engine
    (`engine/game.ts`, `renderer3d.ts`, `constants.ts`) has speed, shake and
    flash.
  - Dream Rift has its own score and leaderboard modules
    (`features/dream-rift/api/dream-rift.score.server.ts`,
    `dream-rift.leaderboard.server.ts`), a seeded solo run used by the arcade
    daily mutator (`lib/arcade/seeded.ts`, `lib/arcade/runs.server.ts`,
    `ArcadeSeedRun`), a deterministic sim (`engine/sim/`, `engine/rng.ts`)
    and practice mode (`engine/practice.ts`).
  - `lib/game-capabilities.ts` declares `accessibility: []` for both.
- **Decisions:**
  - **Dream Rift:** `speedFloor` scales the sim's step (bullets and enemies
    move slower; the seeded pattern is unchanged, so the run is still the same
    run, only slower); `calmVisuals` removes screen shake, hit flashes and
    bomb strobe (a fade instead); `colorSafe` gives enemy bullets a shape cue
    (outline ring for aimed, solid for fixed) in addition to colour;
    `noTimedInput` widens the graze and bomb-cancel windows to the slowest
    tier; `holdToPress` turns held fire into auto-fire (already automatic on
    touch) and makes focus mode a toggle.
  - **Nightrail:** `speedFloor` caps the track speed multiplier; `calmVisuals`
    removes camera shake, the speed-line strobe and impact flashes;
    `colorSafe` adds a pattern to hazard panels; `noTimedInput` lengthens the
    trick input window and slows near-miss timing; `holdToPress` lets one held
    key stand for a repeated tap in trick sequences.
  - **Boards:** both games join `ASSIST_CAPABLE` and claim `ASSIST_FEATURES`
    in `lib/game-capabilities.ts`. Assisted runs never reach the general
    boards (`submitGameScore`), **Dream Rift's own score module** (the same
    `consumeAssistRun` check), or the **arcade daily seeded board** (an
    assisted seeded run is stored with `detail.assisted = true` and excluded
    from ranking in `lib/arcade/runs.server.ts`; it still counts for the
    member's own history). Personal bests and progression follow
    `submitGameScore`'s existing handling of assisted runs ("Progression and
    personal bests below still run").
  - **Co-op Dream Rift** (`players: online-coop`, `dream-rift.coop.server.ts`)
    shares one simulation between up to four players, so one player's
    `speedFloor`, `noTimedInput` or auto-fire would change everyone's game.
    In a co-op lobby only the two presentational assists apply, locally:
    `calmVisuals` and `colorSafe` (they change what this player's screen
    draws, never the shared sim, so the co-op run's ranking is unaffected and
    no assist claim is made for it). The lobby shows one line: "In co-op only
    Calm visuals and Colour-safe apply." (Decision by default: photosensitivity
    protection must not switch off in co-op; gameplay assists cannot apply to
    a shared sim.)
  - The in-game result screen says "Assisted run — not ranked" (as the other
    two games), and both games' settings screens link to
    `/settings/game-assists`.
  - **Islands:** Nightrail's island must not import React Query or the router
    (`lib/__tests__/islands.test.ts`); it reads the member's assist settings
    through the same server-provided prop or plain `api()` call the other
    games use, never through a query hook. Take the run-claim helpers from
    `components/games/assist-run-island` (the React Query and router free
    module sprint 07 split out for Void Breaker's island), never from a module
    that imports a query hook.

## Functional requirements

1. FR-1 `features/dream-rift/engine/assist-profile.ts` and
   `features/nightrail/engine/assist-profile.ts` mapping settings to engine
   modifiers, applied by each engine.
2. FR-2 Run-start assist claims and the ranked refusal on every score path
   named above, including the seeded daily run.
3. FR-3 `ASSIST_CAPABLE` and `game-capabilities.ts` updated in the same change.
4. FR-4 Result-screen line and settings link in both games.

## Non-functional requirements

- **Correctness:** the seeded Dream Rift run's outcome under `speedFloor` is
  the same sequence of events (the step scales time, not the RNG); the
  product test pins it on a fixed seed.
- **Performance:** no extra allocations per frame; `calmVisuals` removes work.
- **Accessibility:** every assist observable within one second of a game
  starting; the in-game line is announced (`aria-live="polite"`).
- **Design:** app tier (L8), each game's own look.
- **i18n:** `more-game-assists` for the new lines; existing game namespaces
  untouched except where a string already lives.

## Data model and API

- No schema change (`ArcadeSeedRun.detail` is JSON already).
- Edits: `lib/game/assist.ts`, `lib/game-capabilities.ts`,
  `features/dream-rift/**`, `features/nightrail/**`,
  `features/dream-rift/api/dream-rift.score.server.ts`,
  `lib/arcade/runs.server.ts` (exclude assisted from ranking).

## Testing requirements

- Product suites `features/dream-rift/engine/__tests__/assist-profile.product.test.ts`,
  `features/nightrail/engine/__tests__/assist-profile.product.test.ts`
  (each setting's modifiers; seeded determinism under `speedFloor`).
- Main suite `lib/arcade/__tests__/seeded-assist.test.ts` (assisted seeded
  runs never ranked) and `features/dream-rift/api/__tests__/score-assist.test.ts`.
- Existing: `lib/__tests__/game-assist.test.ts` and `lib/game/__tests__/assist-run.test.ts` (the `ASSIST_CAPABLE` ↔
  capabilities join), `lib/__tests__/islands.test.ts`.

## Acceptance criteria

- [ ] With "Calm visuals" on, neither game shakes or flashes.
- [ ] With speed at 0.5, Dream Rift's daily seed plays the same pattern at
      half speed and the run is marked not ranked on every board.
- [ ] Nightrail with "No timed input" lets a slow player land the first trick.
- [ ] In a co-op Dream Rift lobby, a player with "Calm visuals" and speed 0.5
      sees no shake or flash, the shared game runs at full speed for everyone,
      and the co-op result is ranked as before.
- [ ] Both games in their own look at 390 px and 1280 px, once in `ar`.

## Out of scope

Assists for any other game (13 lists who supports what), new assist settings,
gameplay assists (speed, timing, auto-fire) in co-op Dream Rift.
