# 02 — Daily puzzle statistics

Surface: `/daily/stats` (full-screen, inside the `/daily` layout) and the
`/daily` hub. Wave 5. Namespace `daily-stats`. No schema change.

## User story

As a member who plays the daily puzzles, I want my streak, solve rate, scores
and history per puzzle to follow me across devices — and to see a calendar of
the days I played — so that a new phone or a cleared browser does not reset my
streak and I can see how I am doing over time.

## Requirements elicitation

- **What exists (verified):** every finished daily puzzle is stored for a
  signed-in member in `DailyPuzzleScore` (`@@unique([userId, gameMode,
  dateKey])`, score, moves, hints, `dnf`, time, `resultJson`), written by
  `lib/daily-puzzles/api/daily-puzzles.score.server.ts`;
  `daily-puzzles.results.server.ts` returns one mode's stored runs to mirror
  into the local store. But the hub's streak, "all-time solves" and
  completion map are computed **from `localStorage` only**
  (`computeStreak(collectCompletedDates())`, `countAllTimeSolves()` in
  `components/daily-puzzles/DailyPuzzlesHub.tsx`), so they differ per device
  and reset with site data. There is no per-mode statistics view (solve rate,
  distribution, best, average) and no calendar.
- **Decisions:** the server is the source of truth for signed-in members; the
  local store stays the source for guests (and as an offline fallback). One
  read endpoint computes everything from `DailyPuzzleScore` for the caller;
  the hub reads the streak and totals from it when signed in. Day keys are the
  puzzle's own `dateKey` (America/New_York, the drop clock), so the streak
  matches what the puzzles call "today". A day counts toward the streak if any
  mode was finished (a `dnf` lights-out run does not count; a globeset run that
  used the auto-solver does not count) — the same rule the hub uses today.

## Functional requirements

1. FR-1 `GET /api/daily-puzzles/stats` returns, for the caller: current and
   longest overall streak; days played; total solves; per mode: played,
   solved, solve rate, current and longest mode streak, best and average score
   (for lights-out best and average moves; for globeset best and average
   time), and a distribution of results in at most 8 buckets suited to the
   mode (`lib/daily-puzzles/stats.ts` defines the buckets per mode).
2. FR-2 `/daily/stats`: an overall header (streak, longest, days played), then
   one section per mode with its figures and distribution bars.
3. FR-3 A month calendar of played days (all modes, or one mode via a select),
   month navigation back to the first played month; each day cell has an
   accessible name ("12 March: 3 puzzles solved").
4. FR-4 The hub (`DailyPuzzlesHub.tsx`) shows the server streak and all-time
   solves when signed in, the local values otherwise; its stats bar links to
   `/daily/stats`.
5. FR-5 Guests see the same page computed from the local store (one pure
   function shared with the server so both agree), with a sign-in prompt
   explaining that signing in keeps the history across devices.
6. FR-6 After a puzzle is finished, the result screen shows the mode's new
   streak and a "See statistics" link.

## Non-functional requirements

- **Performance:** one query of the caller's rows (at most 7 modes × 1,000
  days) over the unique index prefix `userId`; computed in a pure function;
  cached per member for 60 s with `cached()` and invalidated by the score
  endpoint. p95 under 100 ms.
- **Security:** `auth: 'required'`; owner-only; rate limit `read`; the mode
  query param (calendar) is zod-validated against the known modes.
- **Accessibility:** the calendar is a table with row and column headers;
  distribution bars carry their numbers as text; no information by colour
  alone.
- **i18n:** strings in `daily-stats`; month and weekday names from
  `Intl.DateTimeFormat`; numbers via `Intl.NumberFormat`.
- **Steel (app tier):** `/daily` is full-screen and keeps its newsprint look
  (`components/daily-puzzles/desk-newsprint.css`, L8); no new site-tier CSS.
  Nothing animates at rest (the hub's existing countdown is the hub's, not
  this feature's).

## Data model and API

- No schema change; the existing `@@unique([userId, gameMode, dateKey])`
  serves the read.
- Pure `lib/daily-puzzles/stats.ts`: `computeDailyStats(rows, today)`, mode
  buckets, streak by `dateKey` (consecutive New York days), counting rules.
  Used by the server and by the guest page (rows built from the local store).
- `lib/daily-puzzles/stats.server.ts` (`getDailyStats(userId)` with
  `cached`), contract `lib/daily-puzzles/stats.contract.ts`, module
  `lib/daily-puzzles/api/daily-puzzles.stats.server.ts`. The score endpoint
  calls `invalidateCached` for the member's key after a write.
- Route `app/routes/daily/stats.tsx` (`noindexHead`, personal data);
  `EXCLUDED_ROUTES` in `lib/sitemap.ts` gains `/daily/stats`.

## Testing requirements

- Main suite `lib/daily-puzzles/__tests__/stats-endpoint.test.ts`: returns only
  the caller's rows; signed-out is 401; the score endpoint invalidates the
  cache key.
- Product suite `lib/daily-puzzles/__tests__/stats.product.test.ts`: streaks
  across a missed day, today not yet played (streak still counts yesterday, as
  the hub does), `dnf` and auto-solved runs not counted, buckets per mode,
  local-store and server rows giving the same result.

## Acceptance criteria

- [ ] Signing in on a second browser shows the same streak as the first.
- [ ] A lights-out run with `dnf` does not extend the streak.
- [ ] The calendar announces each played day with its count.
- [ ] Guests see their local statistics and a sign-in prompt.
- [ ] 390 px and 1280 px, and `ar`.

## Out of scope

Friends' statistics (the leaderboard exists), streak freezes, changing the
drop clock.
