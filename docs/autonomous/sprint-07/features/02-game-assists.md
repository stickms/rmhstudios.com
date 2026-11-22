# 02 — Game assists: the settings page and the first two games that honour them

Surface: a new page `/settings/game-assists`, the game pages of Synapse Storm
and Void Breaker, and the score submission path. Wave 3. Namespace
`game-assists`.

## User story

As a player with photosensitive epilepsy, slow reactions or a motor
impairment, I want to say once that games should calm their flashing, slow
their clock or stop timing my inputs, and have the games that can honour it do
so, so that I can play them at all — knowing my assisted runs will not be put
on the public boards next to everyone else's.

## Requirements elicitation

- **What exists (verified):**
  - The cross-game assist layer `lib/game/assist.ts` (P7): five settings
    (`holdToPress`, `speedFloor` 0.5–1, `calmVisuals`, `colorSafe`,
    `noTimedInput`), `normalizeAssists`, `profileFor(game, settings)`, the rule
    "a run with assists on can never reach a leaderboard" encoded in the
    `AssistProfile` union, and **`ASSIST_CAPABLE`, which is empty**: "a game
    joins it in the same change that teaches its client to honour the
    settings", with `ASSIST_FEATURES` (`assist-mode`, `reduced-flashing`,
    `colorblind-safe`, `no-timed-input`) that an adopting game must declare in
    `lib/game-capabilities.ts`; `lib/__tests__/game-assist.test.ts` holds the
    two together.
  - Storage and endpoint exist: `GameAssistPreference`
    (`prisma/schema/profile.prisma`), `lib/game/assist.server.ts`
    (`getAssists`, `setAssists`, `assistProfileFor`), the contract
    `lib/game/assist.contract.ts` and the module
    `lib/game/api/settings.game-assists.server.ts` (GET/POST, also returning
    `honouredBy`). **No page or component calls it** (`grep -rl
    "game-assists" components app` finds nothing).
  - The submission boundary is `submitGameScore` (`lib/game/submit.server.ts`);
    `lib/game/director.server.ts` ends with a "WIRING NOTE" describing exactly
    where an unranked run must skip the adapter write while keeping
    progression (`recordGamePlay`, `reportGameResult`), and the claim pattern
    (`issueEnvelope`/`consumeRunEligibility`, Redis with a TTL, fails open).
    Neither is wired today.
  - Synapse Storm (`features/synapse-storm/`) and Void Breaker
    (`features/void-breaker/`) both declare the `flashing` descriptor in
    `lib/game-capabilities.ts` with an empty `accessibility` list; both submit
    scores through the shared adapters (`lib/game/adapters.server.ts`).
  - Slice It and Massive March keep their own assist implementations
    (`OWN_ASSIST_IMPLEMENTATION`); they are not touched.
  - `GameAssistPreference` is already in the data export
    (`lib/account/api/account.export.server.ts`, `gameAssists`) but is not
    erased on account deletion.
- **Decisions:**
  - **Which runs are assisted is decided by the server, at run start.** The
    game calls a new `POST /api/games/$gameId/assist-run` when a run starts;
    the server computes `assistProfileFor(userId, gameId)` and, when it is not
    ranked, records a claim `assist-run:<gameId>:<userId>` in Redis for 2 hours
    (the director's helpers and TTL pattern). `submitGameScore` consumes it
    after the registry verdict and skips the leaderboard adapter write when the
    claim exists **or** the member's stored settings are assisted for that game
    right now. Progression, quests, coins and personal bests (sprint 05 04)
    still run; the response gains `ranked: boolean` (additive). Turning assists
    off mid-run therefore never puts an assisted run on the board.
  - Redis unavailable: the claim read fails open as the director's does, but the
    "stored settings are assisted now" check still applies, so the only gap is
    a member who switched assists off during that one run.
  - **Two games adopt in this feature**, each honouring all five settings:
    - Synapse Storm: `calmVisuals` removes flash and shake effects and caps
      full-screen colour changes to one per second; `speedFloor` scales the
      game clock; `noTimedInput` removes the round timer (the round ends when
      the player submits); `colorSafe` adds shape or pattern to every
      colour-coded state; `holdToPress` lets a held key repeat the action.
    - Void Breaker: `calmVisuals` turns off screen shake, hit flashes and
      strobing boss effects; `speedFloor` scales simulation time;
      `noTimedInput` pauses the wave timer and extends any timed prompt to
      untimed; `colorSafe` adds outlines/patterns to enemy and pickup types;
      `holdToPress` auto-fires while the fire key is held.
    The implementer reads each game's engine and applies the profile where its
    effects and clock live; a game whose code makes one of these impossible is
    reported, not faked, and is then not added to `ASSIST_CAPABLE`.
  - Both games show one line on their start screen when assists are on
    ("Assists on: this run will not be ranked") with a link to the settings
    page, and one line in the results ("Not ranked: assists were on").
  - The settings page lists the five switches (the speed floor as a
    `components/ui` slider, 50–100 %), says which games honour them
    (`honouredBy`, by catalog title), and says plainly that assisted runs are
    kept off the public boards but still count for progress.
  - The site-wide reduced-motion setting stays retired (M7); this page is about
    the games' own renderers, as the schema comments say.

## Functional requirements

1. FR-1 `/settings/game-assists` with the five controls, saved on change
   through the existing contract, with a polite "Saved" announcement; signed-out
   visitors see the sign-in prompt.
2. FR-2 A settings-nav entry "Game assists" (group: games or account, beside
   Cloud saves and Replays).
3. FR-3 Synapse Storm and Void Breaker read the profile at run start from
   `POST /api/games/$gameId/assist-run` (React Query mutation, never
   `fetch` in an effect) and apply it for that run.
4. FR-4 `submitGameScore` skips the board write for assisted runs and returns
   `ranked: false`; the two games show the results line.
5. FR-5 `ASSIST_CAPABLE` gains `synapse-storm` and `void-breaker`;
   `lib/game-capabilities.ts` gains the four `ASSIST_FEATURES` for both.
6. FR-6 The game page's capability list (wherever `accessibility` is rendered)
   shows the new entries without further change.

## Non-functional requirements

- **Integrity:** no client input decides `ranked`; the run-start endpoint has
  `auth: 'required'`, `rateLimit: { limit: 30, windowMs: 60_000, prefix:
  'assist-run' }`; signed-out players get the ranked profile (no board write
  happens for them anyway).
- **Correctness:** the skip sits exactly where the director's wiring note puts
  it; personal bests and progression are unchanged for unassisted runs (test).
- **Performance:** one Redis write per assisted run start, one read per submit
  only for games in `ASSIST_CAPABLE`; other games pay nothing.
- **Steel:** the settings page is a titled page of rows on rules; controls are
  `components/ui` switch and slider (the slider thumb is chrome, R2).
- **Motion:** nothing on the page animates beyond the switch slide (140 ms).
- **Privacy:** `GameAssistPreference` is erased on deletion (it is already
  exported).
- **i18n:** `game-assists`; game-side strings in the same namespace.

## Data model and API

- No schema change.
- `lib/game/assist-run.server.ts`: `startAssistRun(userId, gameId)` and
  `consumeAssistRun(userId, gameId)` (Redis, director pattern), plus
  `assistErasureOps(userId)` (`prisma.gameAssistPreference.deleteMany`).
- Contract `lib/game/assist-run.contract.ts`; module
  `lib/game/api/games.$gameId.assist-run.server.ts` (POST → `{ profile }`).
- `lib/game/submit.server.ts`: the skip and `ranked` in the result.
- Page `app/routes/_site/settings/game-assists.tsx`,
  `components/settings/GameAssistsPanel.tsx`.
- Game adoption under `features/synapse-storm/` and `features/void-breaker/`.

## Testing requirements

- Main suite `lib/game/__tests__/assist-run.test.ts`: an assisted run start
  writes a claim; submit with a claim skips the adapter and still records play;
  submit with no claim but assisted settings skips; unassisted submit writes;
  a game outside `ASSIST_CAPABLE` always writes; Redis failure falls back to
  the settings check.
- Main suite `lib/account/__tests__/game-assists-erasure.test.ts`.
- Update `lib/__tests__/game-assist.test.ts` expectations for the two new
  members (the test already holds capabilities and the set together).
- Product suites in each game for the profile application (pure functions that
  map a profile to effect flags and clock scale).
- Gate tests: settings-nav labels, sitemap coverage, OG coverage.

## Acceptance criteria

- [ ] With "Calm visuals" on, Void Breaker's boss fight has no screen shake or
      flashing; the results say the run was not ranked; the board does not show it.
- [ ] Switching assists off after starting a run does not put that run on the board.
- [ ] A player with no assists sees no change in either game and their runs rank.
- [ ] The settings page names the two games and works with a keyboard.
- [ ] Deleting the account erases the setting.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Adopting the layer in other games, folding Slice It's and Massive March's own
assists into it (the file says that is its own change), adaptive difficulty
(the director stays inert), per-game settings.
