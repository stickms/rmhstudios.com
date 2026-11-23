# 17 — RMHType results the server can stand behind

Surface: RMHType solo runs and multiplayer rooms (their results screens and the boards they feed), a line on a result
that was not ranked and why. Wave 5. Namespace `type-scoring`. App tier (L8). Hardening (sprint 11 follow-up).

## User story

As an RMHType member, I want the leaderboard and my personal bests to hold only runs that really happened, so that a
best of 240 WPM means someone typed it; and when one of my runs does not count, I want to be told why rather than see a
number that later disappears.

## Requirements elicitation

- **What exists (verified):**
  - `rmhtype:solo:finish` in `server/socket-server/handlers/rmhtype.ts` times the run on the server
    (`Date.now() - room.roundStartTime`) but takes `position` and `errors` from the payload with only a lower bound
    (`Math.max(0, payload.position)`), computes WPM from them, emits the result, and calls `persistSoloResult`, which
    writes an `RmhTypeMatch` and upserts the `RmhTypeProfile` bests (`bestWpm`, `bestWpmAccuracy`) whenever accuracy is
    at least `MIN_LEADERBOARD_ACCURACY = 90`. A client can send a finished position one second after the start.
  - Multiplayer is the same: `rmhtype:game:progress` stores the client's `position` and `errors` unbounded
    (`player.currentPosition = position`), `rmhtype:game:finish` takes no payload and scores the last progress, and
    `persistMatchResults` upserts the profiles from those figures.
  - Sprint 11 12 wrote the check a race needs and recorded this gap for later: `evaluateFinish` in
    `lib/rmhtype/challenges.ts` clamps the position to the passage, requires it to equal the passage length, requires
    WPM ≤ `MAX_WPM` (`lib/rmhtype/typing-run.ts`, 250) and a curve that passes `isPlausibleGhost`
    (`lib/rmhtype/ghost.ts`) against the server's time; it clamps errors to the position. Solo clients already send that
    curve (`samples`, built by `buildSamples` in `components/rmhtype/RmhTypeSoloPage.tsx`); the room client
    (`RmhTypeRoomPage.tsx`) sends none.
  - The daily (`lib/rmhtype/daily.server.ts`) and lessons (`lessons-schema.ts`, `max(MAX_WPM)`) already bound their
    figures; saved texts (sprint 10 05) check WPM against characters and time.
- **Decisions:**
  - **One check for every scored run:** `evaluateFinish` moves to `lib/rmhtype/run-check.ts` (challenges import it from
    there) and gains a reason: `short` (did not reach the end), `too-fast` (above `MAX_WPM`), `implausible` (the curve
    failed or is missing), or none.
  - **Solo:** the result emitted and persisted uses the clamped position and errors. A run with a reason is still shown
    (WPM from the clamped figures) but is **not ranked**: no `RmhTypeMatch`, no profile best, no ghost; the result says
    "Not ranked: …" with the reason. A timed-out run is unchanged (it never ranked).
  - **Rooms:** progress is clamped to `[previous, passage length]` (positions only go forward) and errors to
    `[0, position]`; a progress step that adds more than `MAX_CHARS_PER_STEP` per 250 ms since the last one is clamped
    to that; the room client sends `samples` at finish (built as the solo page builds them). A finished player whose
    check fails is placed as "Did not finish" for the round and not ranked; the others' results are unchanged.
  - **Accuracy** stays the client's error count, clamped (a residual risk sprint 11 recorded, still open).
  - **Existing rows are not rewritten.** Bests set before the fix stay; an admin can still reset a profile (existing
    tooling). The integration summary reports how many current `bestWpm` values exceed `MAX_WPM`.

## Functional requirements

1. FR-1 `lib/rmhtype/run-check.ts`: `evaluateFinish` with `reason`,
   `clampProgress(prev, next, passageLength, elapsedMs)`; `challenges.ts` re-exports or imports it (sprint 11's tests
   stay green).
2. FR-2 Solo finish: clamped figures, `ranked` and `reason` in the result payload, persistence and ghost save only when
   ranked.
3. FR-3 Rooms: clamped progress, `samples` accepted on `GAME_FINISH` (zod-checked, bounded length), the round result's
   "did not finish" for a failed check, `persistMatchResults` skipping unranked players.
4. FR-4 `lib/rmhtype/events.ts` payload types; `RmhTypeRoomPage.tsx` sends `samples`; both result screens show the
   reason through `type-scoring` keys (`reason-short`, `reason-too-fast`, `reason-implausible`).
5. FR-5 A one-off read-only script `scripts/rmhtype-best-audit.ts` that counts profiles with `bestWpm > MAX_WPM` (for
   the integration summary; it writes nothing).

## Non-functional requirements

- **Integrity:** no client-sent position beyond the passage reaches a board or a best; a test sends each forgery.
- **Compatibility:** an honest run scores exactly as before (a test replays a recorded honest run's figures).
- **Performance:** O(1) work per progress event.

## Data model and API

No schema change. Socket payloads: `SOLO_RESULT` gains `ranked: boolean` and `reason?`; `GAME_FINISH` accepts
`{ samples?: number[] }`.

## Testing requirements

- Main suite `lib/rmhtype/__tests__/run-check.test.ts`: each reason; clamping; monotone progress; the per-step cap.
- Main suite `server/socket-server/handlers/__tests__/rmhtype-scoring.test.ts` (the harness of
  `rmhtype-challenge.test.ts`): a solo finish one second in with the full position is unranked and writes nothing; a
  room progress beyond the passage is clamped; a room finish without plausible samples is "did not finish"; an honest
  run is ranked with unchanged figures.
- Existing tests that must stay green: `server/socket-server/handlers/__tests__/rmhtype-challenge.test.ts`,
  `lib/rmhtype/__tests__/challenges.test.ts`, the ghost tests.
- Gates: `server-bundle-copies`, socket rate-limit entries (no new event).

## Acceptance criteria

- [ ] A forged solo finish (full position after one second) shows "Not ranked: too fast" and changes no best.
- [ ] A forged room progress beyond the passage never wins a round.
- [ ] An honest 80 WPM run ranks as before.

## Out of scope

Server-side keystroke verification, rewriting historic bests, the daily's existing checks.
