# 12 — RMHBox player stats

Surface: a new full-screen RMHBox page `/rmhbox/players/$userId`, a "My
stats" entry in the RMHBox header menu (`components/rmhbox/RMHboxHeader.tsx`),
links from lobby player lists and results screens. Wave 5. Namespace
`rmhbox-stats`.

## User story

As a regular at RMHBox party nights, I want a page with my record — games
played and won, my streaks, which minigames I am good at, my recent matches —
and to look at a friend's, so that the nights add up to something and the
rivalry has numbers.

## Requirements elicitation

- **What exists (verified):** `RMHboxProfile` (totals, streaks,
  `minigameStats` JSON) and `RMHboxMatch`/`RMHboxMatchPlayer`
  (`prisma/schema/games/rmhbox.prisma`) are written by
  `server/rmhbox/leaderboard.ts` after every match. `GET /api/rmhbox/stats`
  (`app/routes/api/rmhbox/stats.ts`) computes a player's global and
  per-minigame stats and recent matches — and **no client calls it**. It and
  `GET /api/rmhbox/history` (`app/routes/api/rmhbox/history.ts`, used by
  `app/routes/rmhbox/minigames/$minigameId/history.tsx` through
  `listRmhboxMatchesApi`) are legacy route files with hand-rolled IP rate
  limits, no `defineHandler`, and they return **any member's** stats and match
  list by `userId` to anyone, signed in or not, ignoring blocks and the
  member's game-activity privacy (`User.playtimePrivacy`: `public`,
  `followers`, `private`; `lib/playtime/privacy.ts` `canViewPlaytime`).
  RMHBox shows only global leaderboards (`LeaderboardPanel.tsx`).
- **Decisions:** the player page follows the member's existing
  `playtimePrivacy` (the setting that already governs "what I played"), so no
  new privacy setting: `private` shows the page only to its owner, `followers`
  to followers and the owner, `public` to any signed-in viewer; signed-out
  visitors see only the public case's totals. Blocked pairs get "not found".
  Both legacy routes move to contracts with `implement()` and the same rule;
  the per-minigame history page keeps listing everyone's matches (that list
  is site content and names no single player's record), but its `userId`
  filter is gated by the rule.

## Functional requirements

1. FR-1 `/rmhbox/players/$userId` shows: games played, wins, win rate, current
   and best win streak, total time played, favourite minigame.
2. FR-2 A per-minigame table: played, wins, best score, average placing,
   each minigame linking to its history page filtered to this player.
3. FR-3 The 20 most recent matches: minigame, placing ("2nd of 6"), score,
   when; each opens the existing match detail
   (`HistoryDetail` components through the minigame history page).
4. FR-4 "My stats" in the header menu opens the viewer's own page; player
   names in the lobby list and the results screen link to theirs.
5. FR-5 A private page shows "{{name}} keeps their game activity private" to
   others; the owner's page has a line linking the privacy setting
   (`/settings/privacy`).
6. FR-6 A member with no matches sees "No RMHBox matches yet" and a link to
   start a lobby.

## Non-functional requirements

- **Security:** `implement()` with `auth: 'optional'`, zod `query` for
  `userId`, `minigame`, `limit`, `offset`; the visibility rule in one server
  function used by the page loader, the stats endpoint and the history
  endpoint's player filter; rate limits through the wrapper (`read`). The
  route loader's server function guards inside its handler.
- **Performance:** stats are one profile read plus one
  `rMHboxMatchPlayer.findMany` (`[userId]` index, `take: 20`) and one
  `groupBy` for average placing over the last 500 matches; no full scans.
- **Privacy:** no new data. The page is public only when the member's
  setting is `public`; `head()` marks every other case `noindex`.
- **Accessibility:** tables have captions and headers; placings are words;
  the page works with RMHBox's existing keyboard focus order.
- **i18n:** strings in `rmhbox-stats`; minigame names from the minigame
  registry as RMHBox already shows them; ordinals via `Intl.PluralRules`
  (`ordinal`) with keys per category; numbers and durations via `Intl`.
- **Design:** RMHBox is a full-screen app (L8): the page uses the app tier
  (`--app-*`, `components/shared/app-theme.css`) and RMHBox's shell
  (`RMHboxShell.tsx`), not the Steel site shell.
- **SEO:** `DYNAMIC_ROUTES` entry `null` under `s04-12`; the page's own
  title, description and an OG card (`ogCardPath('user', id)` if
  `lib/og` has a user card, otherwise a section card in
  `lib/og/static-cards.ts`) so `og-page-coverage.test.ts` passes.

## Data model and API

- No migration.
- `lib/rmhbox/player-stats.ts` (pure: derived stats from a profile and match
  rows, averages, favourite), `player-stats-schema.ts`,
  `lib/rmhbox/player-stats.server.ts` (`canViewRmhboxStats(viewer, userId)`,
  `getPlayerStats`).
- Contracts in `lib/rmhbox/rmhbox-reads.contract.ts`: a `getRmhboxStatsApi`
  beside the existing `listRmhboxMatchesApi` (keep its response shape).
- Registered modules `lib/rmhbox/api/rmhbox.stats.server.ts` and
  `rmhbox.history.server.ts`; delete `app/routes/api/rmhbox/stats.ts` and
  `history.ts`.
- Route `app/routes/rmhbox/players.$userId.tsx`; the history page reads an
  optional `player` search param.

## Testing requirements

- Main suite `lib/rmhbox/__tests__/player-stats-access.test.ts`: private is
  owner-only, followers-only refuses a non-follower, blocked pairs get 404,
  signed-out sees only public; the history endpoint's `userId` filter
  follows the same rule.
- Product suite `lib/rmhbox/__tests__/player-stats.product.test.ts`: derived
  stats from fixture rows (win rate rounding, averages, favourite ties).

## Acceptance criteria

- [ ] "My stats" shows the viewer's record and recent matches.
- [ ] A member with private game activity is not visible to others through
      the page or either endpoint.
- [ ] The two legacy route files are gone and the history page still works.
- [ ] Both RMHBox colour modes it supports, 390 px and 1280 px, `ar`.

## Out of scope

Head-to-head records, seasons, badges for RMHBox milestones.
