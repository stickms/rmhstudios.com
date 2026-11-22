# 18 — Save and share a Lights Out solve

Surface: the daily Lights Out (`/daily/lights-out`), the replay page (`/replays/$id`) and "Your replays", the composer
(through `/share`). Wave 7. Namespace `lights-out-replays`. App tier (L8): the game keeps its own look.

## User story

As someone who just solved today's Lights Out in few moves, I want to save the solve as a replay others can watch move
by move and post it with one press, so that "I did it in 9" comes with the proof.

## Requirements elicitation

- **What exists (verified):**
  - `lib/game/replay.ts` (platform expansion §7) defines replayable games as a seed plus an ordered input log,
    re-simulated and scored on the server; `replayableGames['lights-out']` has a schema (`seed` 0–99 999 999, `inputs`
    1–2 000 moves) and `verifyLightsOut`; `lightsOutInitialGrid` rebuilds the board.
    `components/replays/GameReplayPlayer.tsx` already plays Lights Out replays.
  - The replay library (sprint 04 01): `lib/game/api/replays.server.ts` (`submitReplayApi`,
    `lib/game/replay.contract.ts`), "Your replays" (`replays.mine`), replay boards, visibility and delete
    (`lib/game/replay-library.contract.ts`), the embed (`app/routes/embed.replay.$id.tsx`) and the replay page
    (`app/routes/replays.$id.tsx`, an OG card kind `replay`).
  - `components/replays/SaveReplayButton.tsx` (306 lines: "Adopting games render this after a run completes … v1 'share
    to feed' copies the replay link and opens the composer — a full composer prefill is future work") is imported by
    nothing, and `submitReplayApi` has no other caller.
  - `components/lights-out/LightsOutGame.tsx` derives the seed from the date (`getDateSeed`), knows when the board is
    solved, and keeps no move log.
  - `/share` (`app/routes/_site/share.tsx`) opens the composer with `?title=&text=&url=` filled in.
  - **The Lights Out replay board is upside down.** `verifyLightsOut` stores the move count as `score` ("presentation
    decides direction"), but `listReplaysForGame` (`lib/replays.server.ts`, behind `replayBoardApi` and the game page's
    `boardForGame`) orders every game by `score desc`, so the Lights Out board lists the **most** moves first. The board
    query takes only `game` (`replayBoardQuery`); `GameReplay` stores the seed inside `data` (Json), with
    `@@index([game, score(sort: Desc)])`.
- **Decisions:**
  - **Record the moves.** `LightsOutGame` keeps the ordered list of toggled cells for the current attempt (reset on
    restart) — already-bounded by the schema's 2 000.
  - **Save on solve.** On a solve by a signed-in player, the result panel shows `SaveReplayButton` (the existing
    component, adopted as its comment describes) with `{ game: 'lights-out', version, seed, inputs }`; saving is the
    player's choice, never automatic. A past day's puzzle can be saved too (the replay records its seed; it is not a
    board entry).
  - **Share prefilled.** "Post it" opens `/share?text=<"Lights Out, <date>: solved in N moves">&url=<replay page>` — the
    text comes from a `t()` string in the player's language — replacing the copy-and-open flow; the composer's link
    preview shows the replay's OG card.
  - **Privacy:** the replay's visibility is the library's (public by default, changeable in "Your replays"); signed-out
    players see "Sign in to save a replay".
  - **Fix the board's direction.** `ReplayableGame` (`lib/game/replay.ts`) gains `lowerIsBetter?: true`, set for
    `lights-out`; `listReplaysForGame` orders such a game by `score asc` (Postgres reads the existing descending index
    backwards). The game page's Replays section for Lights Out then shows fewest moves first.
  - **Watch the best of today.** `replayBoardQuery` gains an optional `seed` (an integer in the Lights Out schema's
    range, accepted only for `lights-out`); with it, `listReplaysForGame` adds `data: { path: ['seed'], equals: seed }`
    (filtered after the `game` index; Lights Out replays are small and few, and `take` bounds the read; the implementer
    reports the plan against the integration database). Below the solved panel, "Fewest moves today": the three public
    replays of the day's seed with the fewest moves (`replayBoardApi` with `seed`, read with `useQuery`), each a row
    linking to its replay page. 07 (wave 6) has already added leaderboard privacy to `listReplaysForGame`; keep its
    filter.
  - **Daily puzzles' own replays** (`lib/daily-puzzles/replay.server.ts`, `daily-puzzle` kind) are untouched.

## Functional requirements

1. FR-1 The move log in `LightsOutGame`.
2. FR-2 `SaveReplayButton` in the solved panel; its "share to feed" path through `/share` with text and URL.
3. FR-3a `lowerIsBetter` and the ascending order for Lights Out; the optional `seed` on the board query.
4. FR-3 The saved replay plays in `GameReplayPlayer` and appears in "Your replays" and the Lights Out replay board.
5. FR-4 "Fewest moves today" (loading, empty: "No replays of today's puzzle yet").
6. FR-5 Signed-out and error states.

## Non-functional requirements

- **Correctness:** the server re-simulates; a log that does not solve the seed's board is refused with the existing
  error, which the button shows.
- **Performance:** the move log is an array of small integers.
- **Accessibility:** the button and the share link are labelled; the replay player's controls are keyboard-operable
  (check, report gaps).

## Data model and API

- No schema change. Edits: `lib/game/replay.ts` (`lowerIsBetter`), `lib/replays.server.ts` (`listReplaysForGame`: order
  and seed), `lib/game/replay-library-schema.ts` (`seed`), `components/lights-out/LightsOutGame.tsx`,
  `components/replays/SaveReplayButton.tsx` (the share path; strings move to `t()` in `lights-out-replays` where they
  are not translated yet), `lib/lights-out/share.ts` if it builds the share text.

## Testing requirements

- Product suite `lib/lights-out/__tests__/replay-log.product.test.ts`: the recorded log of a solve verifies with
  `verifyLightsOut`; a restart clears it; the 2 000 bound.
- Main suite `components/replays/__tests__/save-replay-button.test.tsx` (rendered with `react-dom/server`): signed-out
  state; the share URL is built from translated text and the replay URL.
- Main suite `lib/__tests__/replay-board-order.test.ts` (mock Prisma): Lights Out orders `score asc`, every other game
  `score desc`; `seed` adds the JSON filter and is refused for another game; 07's hidden-member filter stays in the
  `where`.
- `lib/__tests__/raw-api-fetch-ratchet.test.ts` (the button already uses `api()`; keep it so).

## Acceptance criteria

- [ ] Solving today's Lights Out offers "Save replay"; the saved replay plays back the same moves on `/replays/$id`.
- [ ] "Post it" opens the composer with the text and the replay link filled in.
- [ ] A signed-out player sees "Sign in to save a replay".
- [ ] "Fewest moves today" lists today's puzzle's solves, fewest moves first, and the game page's Lights Out replay
      board is fewest moves first too.

## Out of scope

Replays for other games, video export, automatic saving, comments on replays.
