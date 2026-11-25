# 06 — Today's puzzles among your friends

Surface: the daily puzzles hub (`/daily`), every daily puzzle's result board (Lights Out, Alibi, Spectrum, Outcast,
Chainlink, Impostor, GlobeSet), past puzzles. Wave 4. Namespace `daily-following`. App-tier pages of the daily puzzles,
which keep their newsprint look.

## User story

As someone who does the daily puzzles with friends, I want to see how the people I follow did on today's puzzles, so
that the board means something to me after the first week, when the global top twenty is people I have never met.

## Requirements elicitation

- **What exists (verified):**
  - `GET /api/daily-puzzles/leaderboard` (`lib/daily-puzzles/api/daily-puzzles.leaderboard.server.ts`) returns the
    global top N (default 20, at most 50) for one mode and date, publicly cached, with board privacy applied
    (`leaderboardHiddenUserIds`, `userNotHiddenWhere`; the file is in `BOARD_PRIVACY_READ_PATHS`,
    `lib/game/leaderboard-privacy.ts`). It has no audience scope.
  - Game boards do have scopes: `lib/game/leaderboard-scope.server.ts` `scopeFilter(scope, viewerId)` resolves
    `global | friends | community | country` into one audience list, and its header says the small boards are "exactly
    where the security questions appear". Its `friends` scope is **mutual follows only**, on purpose: a one-way list
    would let anyone follow a stranger and then watch their results on a "friends" board; it already removes members
    with board privacy on and members banned now, and always includes the viewer. RMH Music's friends board uses it the
    same way (`lib/rmhmusic/learn/social/board.server.ts`).
  - `components/daily-puzzles/DailyPuzzleLeaderboard.tsx` renders one board under each result; the hub is
    `DailyPuzzlesHub.tsx`, past days `PastPuzzlesSection.tsx`. Scores are `DailyPuzzleScore` rows (`gameMode`,
    `dateKey`, `score`, `moves`, `hintUsed`, `dnf`, `timeSeconds`).
- **Decisions:**
  - **A "Friends" board** beside "Everyone" under every result (a `components/ui/tabs.tsx` strip inside the board): the
    viewer and their mutual follows who have a score for that mode and date, ranked by the mode's own axis (moves for
    Lights Out, time for GlobeSet, points for the rest), up to 100 rows. The empty state explains "Friends are people
    you follow who follow you back".
  - **On the hub,** a line per mode for today: "4 friends finished" with the best of them, and the viewer's own result,
    linking to the board.
  - **Audience:** exactly `scopeFilter('friends', viewerId)` (mutual follows, board privacy and current bans removed,
    the viewer included), never a second follow query; then anyone blocked either way and deleted accounts are removed
    as well (block either direction already deletes the follow edges, `moderation.block.server.ts`; the check is kept
    for edges made before that). A one-way follower never sees a member's daily result here. The viewer always sees
    their own row, whatever their own privacy setting.
  - **Signed out:** the tab is not shown. **Signed in, no friend has a score:** an empty state with a link to the
    follows page.
  - **Past puzzles:** the same tab on a past day's board, for the dates the global board already serves.
  - **Caching:** private (`Cache-Control: private, max-age=30`); the global endpoint is untouched and stays public.
  - **No notifications** (an alert each time a followed member finishes would be noise).

## Functional requirements

1. FR-1 `lib/daily-puzzles/following.server.ts`: `followingBoard(viewerId, gameMode, dateKey)` and
   `followingSummary(viewerId, dateKey)` (all seven modes in one query grouped by mode).
2. FR-2 Registered endpoints `GET /api/daily-puzzles/following` (`gameMode`, `date`) and
   `GET /api/daily-puzzles/following/summary` (`date`), `auth: 'required'`, `rateLimit: 'read'`, contracts in
   `lib/daily-puzzles/following.contract.ts`, zod for both queries.
3. FR-3 `DailyPuzzleLeaderboard.tsx` gains the tab strip and the following list; `DailyPuzzlesHub.tsx` and
   `PastPuzzlesSection.tsx` the summary lines.
4. FR-4 Both new server files are added to `BOARD_PRIVACY_READ_PATHS`.

## Non-functional requirements

- **Privacy:** the following board never lists someone the global board would hide; it lists only accounts the viewer
  follows.
- **Performance:** one indexed query per board (`gameMode`, `dateKey` and `userId IN` the audience) and one for the
  summary; check the existing `DailyPuzzleScore` indexes and use one that leads on `(gameMode, dateKey)`. If none fits,
  stop and report (no index is planned).
- **Accessibility:** the tabs are the shared primitive; rows name the member and the result in text.

## Data model and API

- No schema change.
- New `lib/daily-puzzles/following.server.ts`, `following.contract.ts`, two endpoint modules under
  `lib/daily-puzzles/api/`. Edits `components/daily-puzzles/DailyPuzzleLeaderboard.tsx`, `DailyPuzzlesHub.tsx`,
  `PastPuzzlesSection.tsx`, `lib/game/leaderboard-privacy.ts` (two registry entries).

## Testing requirements

- Main suite `lib/daily-puzzles/__tests__/following.test.ts`: only mutual follows and the viewer (a one-way follow in
  either direction is absent; the audience comes from `scopeFilter('friends')`); board privacy, blocks either way, bans
  and deleted accounts excluded; the viewer's own row kept with privacy on; the ranking axis per mode (Lights Out by
  moves with `dnf` last, GlobeSet by time, others by score); the summary counts per mode.
- Board privacy registry test (both files listed and importing the filter), route table, raw-fetch and `useEffect`
  ratchets, design consistency (the shared tabs).
- Component `components/daily-puzzles/__tests__/following-board.test.tsx` (`renderToStaticMarkup`): empty state, rows.

## Acceptance criteria

- [ ] After two mutual follows solve today's Lights Out, the "Friends" tab lists them and the viewer, by moves.
- [ ] A member the viewer follows who does not follow back is not listed.
- [ ] A friend who turned on "hide me from leaderboards" is not listed.
- [ ] Signed out, the board shows only "Everyone".

## Out of scope

Community boards for the daily puzzles, streak comparisons, notifications, a one-way "people you follow" board
(rejected: it would show a member's daily results to anyone who follows them).
