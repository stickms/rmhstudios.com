# 01 — Sequence Sam, a new RMHBox minigame

Surface: RMHBox lobby game picker, the Sequence Sam round screens, results and match history. Wave 1. Namespace
`sequence-sam`. App tier (L8).

## User story

As a group playing RMHBox, I want a quick memory game where everyone watches the same sequence of coloured pads light
up and then plays it back, one longer each round, so that we have a short game between the word and trivia games that
anyone can play without typing.

## Requirements elicitation

- **What exists (verified):**
  - RMHBox runs ten minigames (`MINIGAME_REGISTRY` in `lib/rmhbox/minigame-registry.ts`, Ranking File added by sprint 12
    02). Seven more are commented out there and render a stub in `components/rmhbox/minigames/MinigameRenderer.tsx`
    (`createStub`, `'sequence-sam': lazy(() => … createStub('Sequence Sam'))`). Sequence Sam's commented entry says
    "Memorize and replicate increasingly complex sequences", category `action`, 2–10 players, `spectate_only`.
  - A minigame is a server class extending `BaseMinigame` (`server/rmhbox/minigames/base-minigame.ts`), registered in
    `server/rmhbox/game-coordinator.ts` (the `['ranking-file', RankingFileGame]` row is the model); its client is
    lazy-loaded from `components/rmhbox/minigames/minigame-loaders.ts`; its history detail is registered in
    `lib/rmhbox/history-display-registrations.ts`; its settings are a `GameSettingsSchema`
    (`lib/rmhbox/game-settings.ts`, as `lib/rmhbox/ranking-file/settings.ts`); its icon is in
    `components/rmhbox/minigame-icons.ts`.
  - Every minigame input arrives as the one socket event `rmhbox:game:input`, already limited per socket
    (`SOCKET_RATE_LIMITS` in `server/rmhbox/config.ts`, read by `server/rmhbox/rate-limit.ts`).
  - The RMHBox phase tests (`testing/rmhbox/phase-*/`) hold that a player's state never carries what they must not see.
  - Sprint 12's README rejected the other stubs as "action games needing real-time physics or input sync". Sequence Sam
    needs neither: every player plays the same sequence on their own device and submits once per round, so the server
    only orders and scores the submissions it receives.
- **Decisions:**
  - **A round:** the server draws the round's sequence from a seeded generator (four pads, no pad three times in a row);
    round 1 has 3 steps and each round adds one. The **show** phase plays the steps to everyone at once (each step's
    pad and its start time are sent one step at a time, never the whole sequence ahead of its showing, and the client
    lights a pad on receipt); then the **recall** phase opens for `recallSeconds` (settings: 10–40, default 20). A player
    taps pads in order; the client sends each tap as an `input` action `{ type: 'tap', pad }`. The server judges each
    tap as it arrives against the sequence: a wrong tap ends that player's round at the steps they got right.
  - **Scoring:** a correct full sequence scores `100 × length`, plus a speed bonus of up to 50:
    `round(50 × max(0, 1 − elapsed / (recallSeconds × 1000)))`, where `elapsed` is the server's time from the recall
    opening to the last correct tap. A miss scores `60 × correct steps`. A player
    who misses twice in a match is "out" for the remaining rounds (they watch). The match ends after `rounds` (settings:
    5–12, default 8) or when at most one player is still in.
  - **Accessibility:** the four pads have distinct colours **and** shapes and names (circle, square, triangle,
    diamond), are keyboard keys `1`–`4` while the game has focus, and each shown step is announced politely by name
    ("Square"). The show's pace is a lobby setting, `stepMs` (600 ms by default, or 900 ms, "Slower show"), not a
    per-player assist, so every player sees the same timing; each step is lit for `stepMs × 0.7` and dark for the
    rest. Calm visuals: a pad lights by a
    solid fill change only (no flash, glow or scale), honouring R5 even on the app tier.
  - **Sound:** each pad has a tone (Web Audio through `lib/rmhbox/audio.ts`); muted by the existing RMHBox mute.
  - **History:** the match history shows each round's length and each player's correct steps and points.
  - **Secrecy:** the sequence lives on the server; a player's state carries only the steps already shown, their own
    taps and, after the round, everyone's result. A spectator sees the same.

## Functional requirements

1. FR-1 `lib/rmhbox/sequence-sam/` (new): `schemas.ts` (zod for the `tap` input and the settings), `sequence.ts` (pure:
   seeded generation, the no-three-in-a-row rule, judging a tap, scoring with the speed bonus, the out rule),
   `settings.ts` (`SEQUENCE_SAM_SETTINGS: GameSettingsSchema`: `rounds` 5–12 default 8, `recallSeconds` 10–40 default 20,
   `stepMs` 600 or 900 default 600).
2. FR-2 `server/rmhbox/minigames/sequence-sam/` (new): `handler.ts` (`SequenceSamGame extends BaseMinigame`: show
   timer, recall timer, tap handling, round end when every player still in has finished or the timer ends), `types.ts`,
   `index.ts`; registered in `server/rmhbox/game-coordinator.ts`. A tap after a player finished, before the recall
   opens or with a pad outside 0–3 is ignored.
3. FR-3 The registry entry restored in `lib/rmhbox/minigame-registry.ts` (uncommented, `settingsSchema`, icon
   `grid-2x2` in place of the commented entry's emoji), the stub row removed from `MinigameRenderer.tsx`, the loader
   added to `minigame-loaders.ts`, and `Grid2x2` imported into the explicit lucide map in
   `components/rmhbox/minigame-icons.ts` (an unlisted name resolves to `null`; the header's "ten lucide names" count
   becomes eleven).
4. FR-4 Client `components/rmhbox/minigames/sequence-sam/` (new): `SequenceSamGame.tsx` (phases), `PadGrid.tsx` (four
   named buttons, keys `1`–`4` bound only while the grid has focus, the polite announcer), `RoundResult.tsx`,
   `SequenceSamHistoryDetail.tsx` registered in `lib/rmhbox/history-display-registrations.ts`.
5. FR-5 No new socket event and no new rate-limit entry (the `rmhbox:game:input` limit applies); the handler also
   ignores more taps than the sequence has steps.

## Non-functional requirements

- **Fairness:** no state for any player or spectator carries a step before it is shown (a masking test, like
  `testing/rmhbox/phase-*/security-state-masking.test.ts`); the speed bonus is timed on the server only.
- **Accessibility:** playable by keyboard alone; each pad has a name and a shape, not only a colour; each shown step is
  announced.
- **Motion (R5 spirit on the app tier):** a pad lights by a fill change and nothing else; nothing animates at rest.

## Data model and API

No schema change: matches are recorded through RMHBox's existing match persistence, as every minigame's are.

## Testing requirements

- Product suite `lib/rmhbox/sequence-sam/__tests__/sequence.product.test.ts`: generation is deterministic for a seed
  and never repeats a pad three times; judging; scoring (full, partial, the bonus bounds); the out rule.
- Main suite `server/rmhbox/minigames/sequence-sam/__tests__/handler.test.ts`: no step in any state before it is shown
  (players and spectators); a wrong tap ends the round for that player; taps after finishing, before recall and out of
  range are ignored; the round ends early when everyone still in has finished; the match ends with one player left.
- Gates: `lib/__tests__/server-bundle-copies.test.ts`, the i18n catalogue and computed-key gates, the RMHBox preset
  test that lists minigame ids (`lib/rmhbox/__tests__/rmhbox-presets.test.ts`), the shortcut registry test.

## Acceptance criteria

- [ ] A lobby of three plays eight rounds of Sequence Sam and sees a results screen with each round's length.
- [ ] No socket state before a step is shown contains that step.
- [ ] A keyboard-only player can play a full round with keys `1`–`4`, and hears each step's name.
- [ ] The match appears in RMHBox history with each player's correct steps per round.

## Out of scope

Team play, member-made sequences, the other six stubbed minigames.
