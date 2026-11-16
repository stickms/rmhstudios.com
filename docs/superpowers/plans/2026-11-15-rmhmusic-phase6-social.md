# RMH Music Phase 6 — the social layer: Daily board, friends' progress, Share a result

Date: 2026-11-16, for the owner's choices of 2026-11-15. Roadmap: `docs/rmhmusic/roadmap.md` §3
(Phase 6) and §2.2 ("No leaderboard until the owner decides" — now decided). Builds on Phase 2's
Sprint persistence (#1651), Phase 4's songs (#1654) and Phase 5's voice learners (branch
`claude/hopeful-bohr-99d1vw`). This file is the plan only; nothing here is built yet.

The owner chose three parts:

1. **A Daily board** for the sight reading Daily challenge (the same prompts for everyone per UTC
   day), showing display names and scores to other signed-in users.
2. **Friends' progress**: friends' streaks, finished units and song bests, through the site's
   existing follow graph, opt-in per learner.
3. **Share a result**: a Share button on a song or Daily result that copies a link with a result
   card. No public profile page.

## 0. What exists today (research, with paths)

- **Results already stored.** `prisma/schema/rmhmusic.prisma`: `MusicLearnProfile` (instrument
  `piano|guitar|voice`, input, `voiceRange`), `MusicLearnLessonProgress` (per lesson: `stars`,
  `bestScore`, `completedAt`), `MusicSprintBest`, `MusicSprintDaily` (one row per user per UTC date;
  written at Start with `score` null, filled once; `score`, `avgMs`, `played`, `skipped`,
  `results` Json, `scoredAt`, `createdAt`), `MusicSongBest` (user, song, mode `wait|play`,
  `bestScore`). Every relation is `onDelete: Cascade` from `User` (`prisma/schema/auth.prisma`
  lines 239–245).
- **Sprint rules are pure and server-side.** `lib/rmhmusic/learn/sprint/record.ts`:
  `acceptDealtDate` (today, or yesterday within `DATE_GRACE_MS` 10 min), `checkDailyRun` (30
  prompts: `DAILY_LEVELS` note, note-both, accidental, triad, inversion, bar × 5; points recomputed
  with `promptPoints`, client points ignored), `dailyStreak`. `sprint.server.ts`
  `saveSprintDaily` fills the row once (`UPDATE … WHERE score IS NULL`), a second run is
  `already-scored`. Scoring (`scoring.ts`, `levels.ts`): 100 at or under par (`PAR_MS` note 1200,
  accidental 1600, chord 2400, bar 2000 + 700 per extra note), 0 at 4 × par; the score is the mean
  of **played** prompts; the microphone (and every voice learner) skips the 10 chord prompts
  (`skipped`, left out of the score). The record.ts header says it plainly: "this keeps an honest
  client's score honest, it is not anti-cheat". The roadmap (§2.00) accepts that a fabricated run
  can raise one's own best "because no one else sees it" — a public board removes that excuse.
- **Endpoints** are contracts bound with `implement()` in `lib/rmhmusic/api/rmhmusic.*.server.ts`
  (`sprint.contract.ts`, `songs.contract.ts`, zod in `*-schema.ts`, rate limits `read`/`write`),
  registered through `pnpm api:routes` into `lib/api/route-table.server.ts` (CLAUDE.md §3 AR3).
- **Streaks.** The learn home's flame (`components/rmhmusic/learn/StreakChip.tsx`) is the
  **site-wide** `DailyStreak` (`lib/streak.server.ts` `checkIn`, fed by any activity on the
  site); the only RMH Music streak is the Daily challenge's (`dailyStreak` over scored dates).
- **Units.** `lib/rmhmusic/learn/content/path.ts`: `PATH` (piano/guitar) and `VOICE_PATH`
  (`pathFor(instrument)`), units of lessons with `available` flags.
- **Social graph.** `Follow` (`prisma/schema/social.prisma`). "Friends" on this site means
  **mutual follows**: `scopeFilter('friends', viewerId)` in `lib/game/leaderboard-scope.server.ts`
  (viewer + back-edges of `getFollowingIds`, capped at 5,000, with the written reason: a one-way
  follow would let a stranger put themselves on your friends board); `getActiveFriends` in
  `lib/presence.server.ts` does the same. Gate: `lib/__tests__/leaderboard-scope.test.ts`.
  `CloseFriend` (`profile.prisma`) is a feed-audience circle, not a friend list.
- **Blocks.** `UserBlock` / `UserMute` (`prisma/schema/moderation.prisma`). Blocking deletes the
  follows both ways (`lib/moderation/api/moderation.block.server.ts`), so blocked pairs are never
  mutuals. `getBlockedAuthorIds(viewer)` (`lib/moderation.server.ts`) is the access-control set
  (blocked + blocked-by), cached 30 s, **fails closed**.
- **Bans and deletion.** `User.bannedUntil`; deleted accounts are tombstones
  (`lib/account-lifecycle.ts`: `bannedUntil` 9999-12-31, `banReason 'account_deleted'`;
  `lib/account/deletion.server.ts` `anonymizeAccount`). The "not banned" filter is
  `OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }]` (`lib/sitemap.server.ts`,
  `lib/profile/webrings.server.ts`). `lib/account/api/account.export.server.ts` exports no RMH
  Music table today.
- **Privacy settings precedents.** `User.playtimePrivacy` ('public'|'followers'|'private', enforced
  in `lib/playtime`), `UserProfile.presenceVisibility` ('mutuals' default), `guestbookMode` ('off'
  default, "opt-in by design"); the site's Privacy page `app/routes/_site/settings/privacy.tsx`
  renders `components/settings/PlaytimePrivacyControls.tsx`.
- **Display data.** `userDisplaySelect` + `resolveUser` (`lib/user-display.ts`; the only
  sanctioned user selects, `eslint-local-rules/no-adhoc-user-select`), `useFreshUser`
  (`stores/userDisplayStore.ts`), `components/ui/UserAvatar.tsx`.
- **Leaderboard precedents.** `lib/daily-puzzles/api/daily-puzzles.leaderboard.server.ts` (daily,
  `dateKey`, score desc then `createdAt` asc), `features/slice-it/api/slice-it.leaderboard.server.ts`
  (a `self` row for a player outside the page). Neither filters blocks; this board will.
- **Moderation.** `ContentReport` with `REPORT_ENTITY_TYPES` (`lib/moderation/report-schema.ts`),
  owner lookup `resolveTargetUser` (`lib/moderation/api/moderation.report.server.ts`), admin
  action + `takedownReportedContent` (`lib/admin/api/admin.reports.$id.server.ts`), the "Resolve &
  remove content" button list (`app/routes/_site/admin/reports.tsx` line ~220), `ReportDialog`
  (`components/moderation/ReportDialog.tsx`, used in app tier by RMHLadder). Automated reports are
  filed as an `[Auto]` report attributed to the first admin (`lib/moderation/auto-moderate.server.ts`).
- **Sharing precedents.** `SharedMoment` (`lib/moments.server.ts`, `/moments/$id`,
  `/api/og/moment/$id`, `components/share/ShareMomentSheet.tsx`): client-supplied text, a cuid id,
  a "View profile" button. `MarathonList.shareId` = `randomBytes(9).toString('base64url')`
  (`lib/tools/tools.server.ts`), page `noindexHead`. Capability pages are `null` in the sitemap's
  `DYNAMIC_ROUTES` (`lib/sitemap.ts`, e.g. `/marathon/$shareId`, `/tf2/hud-editor/s/$token`).
- **OG cards.** `docs/open-graph.md`: dynamic cards are `GET /api/og/<kind>/<id>` under
  `lib/og/api/`, `auth: 'none'`, PNG; `ogCardPath(kind, id)` in `lib/seo.ts` (kind union);
  `renderPageCard` (`lib/og/page-card.server.tsx`: eyebrow, lead, title, subtitle, stats, byline,
  art, path, `cacheKey`). `lib/__tests__/og-page-coverage.test.ts` holds sitemap-public routes to
  `buildMeta` + their own card; excluded routes "carry noindex instead".
- **robots.txt** (`public/robots.txt`): `Allow: /api/og/` exists because Twitterbot and LinkedInBot
  honour robots.txt before fetching a page or its `og:image`. A share page must therefore stay
  crawlable and say `noindex` in a meta tag, not be `Disallow`ed.
- **Routing.** `app/routes/rmhmusic.tsx` is a server-side auth gate for everything under
  `/rmhmusic` (`beforeLoad` → redirect to `/login`). A public page there must un-nest from the
  layout with a trailing underscore, as `app/routes/_site/c.$slug_.invite.$code.tsx` does.
  `lib/rmhmusic/learn/return-path.ts` is the sign-in return allowlist; `testing/e2e/fouc-routes.mjs`
  holds a fixture per dynamic route; `lib/prepaint/theme-routes.ts` and
  `lib/native-material-routes.ts` match `/rmhmusic` by prefix.
- **Rate limits** (`lib/rate-limit.ts`): `read` 120/min, `write` 30/min; a spec may set
  `scope: 'user'`, `limit`, `windowMs`, `prefix`. **Caching**: `cached()` / `invalidateCached()`
  (`lib/cached.server.ts`, L1 + Redis); the HTTP `cache` option of the wrapper defaults to
  uncacheable.

## 1. Decisions

### 1.1 Consent: everything is private until the learner turns it on

- **Two switches, both off by default**, stored in a new one-row-per-learner table
  `MusicSocial` (not columns on `MusicLearnProfile`: the profile is a settings object the setup
  flow PUTs whole, and consent deserves its own endpoint, audit time and deletion line):
  - **Daily board** — "Show my Daily challenge scores on the board". Audience: any signed-in
    learner. Shows: display name, avatar, score, average time per prompt, whether chords were
    skipped. Nothing else (no handle, no instrument, no profile link).
  - **Friends** — "Share my progress with friends". Audience: mutual follows only (the site's
    definition, `scopeFilter('friends')`). Shows: the Daily challenge streak and whether today's
    challenge is done, finished units (count and titles of the learner's own path), song bests
    (per song per mode). It also puts the learner's Daily score on the board's **Friends** tab.
- **Reciprocal friends view.** A learner sees friends' progress only while their own Friends
  switch is on. Reason: sharing between people who know each other should not allow one-sided
  watching, and it gives the switch an obvious reason to exist. The **Everyone** board needs no
  opt-in to view (it is a members' leaderboard, as the owner described).
- **Before opting in nothing is visible to anyone**: not a row, not an anonymous row, not counted
  in "of N". The learner privately sees where their score **would** place ("92 would place 14 of
  230").
- **Retroactive and reversible.** The switches are read at query time, so turning the board on
  puts today's already-scored run on today's board, and turning it off removes every past and
  present row at once. The board's cached lists are invalidated on the toggle; friends' cached
  lists expire within 30 s (said in the switch's help text: "Friends stop seeing it within a
  minute"). Turning a switch off never deletes results.
- **Where the switches live:** the new `/rmhmusic/friends` page ("Friends and sharing"), the
  Daily board page (board switch only) and a one-tap "Show it on the board" text button on the
  Daily result. The site's Privacy settings page gets an "RMH Music" group with the same two
  switches (`components/settings/MusicPrivacyControls.tsx`, beside `PlaytimePrivacyControls`) so
  every visibility setting can be found in one place. No dialog ever asks unprompted.
- **Shares are a separate, per-link consent** (§1.4); turning the switches off does not revoke
  shared links, and the page says so next to the links list.

### 1.2 The Daily board

- **What counts:** only the date's scored run (the first started run; practice runs are never
  posted), with the score the server recomputed (`checkDailyRun`). A row is on the board when:
  `score` is set, `ranked` is true (§1.3), `hiddenAt` is null (moderation), the learner's board
  switch is on, the account is not banned or deleted (`bannedUntil` null or past) and not a bot
  (`isBot`), and the viewer and learner do not block each other.
- **Order and ties:** `score` desc → `avgMs` asc (nulls last; a perfect score is common, and the
  faster reader wins) → `scoredAt` asc → `userId` (determinism). Ranks are 1..N over the full
  board, the same for every viewer; a row hidden from one viewer by a block leaves a gap in that
  viewer's numbering rather than renumbering (renumbering would make the viewer's own place
  disagree with everyone else's). Ranks are shown as "14", never as ordinals (locale-safe).
- **One board, not one per input.** Runs that skipped chords (microphone, voice) are ranked with
  full runs, by the game's own definition of the score (the mean of the prompts played; points are
  relative to par, so the chord levels are not easier or harder by construction), with a plain
  "without chords" note on the row. Splitting by input is open question Q2.
- **Scope:** `Everyone` (top 50 + "Around you": two above and two below the viewer when they are
  outside the top 50 and on the board) and `Friends` (mutuals with the board **or** friends switch
  on, plus the viewer; ranked 1..n among them; the tab requires the viewer's Friends switch).
- **Dates:** today (live) and yesterday (final once the 10-minute grace window has passed); any
  other date is a 400. A line says when the day changes, in the viewer's local time ("The board
  starts again at 01:00 your time").
- **Viewer status line** (never cached): not played · started but not finished · scored and on the
  board ("Place 14 of 230") · scored but private ("Your 92 would place 14 of 230" + the switch) ·
  not ranked ("This run is not on the board: the start of this run did not reach us." /
  "…: it did not pass the board's timing checks.") · hidden by a moderator.
- **Display names:** `resolveUser` over `userDisplaySelect` (profile `displayName` → `name`);
  fallback "A learner". Rows render through `useFreshUser`. No handle and no link: the board is
  not a directory, and the owner ruled out a music profile page.
- **Reports:** each row but the viewer's own has a row menu with **Report score**
  (`ReportDialog`, entity type `music-score`, entity id = the `MusicSprintDaily` id).

### 1.3 Abuse limits (proportionate; server-side; never punish an honest run silently)

The server still cannot know which notes were played. The aim is to make a fabricated board run
cost real time and look human, and to give a moderator one click to remove what slips through.
A run that fails a check is **kept** (it counts for the learner's own streak, as today) and
**not ranked**; the learner is told it is not on the board.

- **The run must have started on the server.** `daily-start` already writes the row at Start
  (`createdAt`). A save that has to create the row itself (the start never arrived) is
  `unrankedReason: 'no-start'`. A fabricated client cannot skip the start and still rank.
- **Wall clock:** the sum of the played prompts' `ms` must not exceed `scoredAt − createdAt`
  + `CLOCK_SLACK_MS` 5,000 (app and DB clocks) → else `'clock'`. Fabricating a run now takes as
  long as playing it.
- **Human floors:** a right answer faster than `MIN_ANSWER_MS` (note 250, accidental 300, chord
  350, bar's first note 250; any later bar note under `MIN_BAR_GAP_MS` 80 after the one before)
  counts as too fast; **two or more** too-fast prompts → `'too-fast'` (one is tolerated as a
  glitch, e.g. a doubled key event).
- **Too even:** with 15 or more right answers, the coefficient of variation of `ms / par` under
  `MIN_TIME_SPREAD` 0.05 → `'too-even'` (human reading times vary far more; scripted times do not).
- **Review, not punishment, for the rest:** a ranked run that scores 100 with `avgMs` under
  `REVIEW_AVG_MS` 450, or a learner's third ranked 100 within 7 days, files one `[Auto]`
  `ContentReport` (entity `music-score`, reason `OTHER`, attributed to the first admin as
  `auto-moderate.server.ts` does, deduplicated on an open report for the row and on any auto report
  for that learner in the last 30 days) and notifies admins with `notifyAdminsOfReview`. The run
  stays up until a human acts.
- **Admin hide:** "Resolve & remove content" on a `music-score` report sets
  `MusicSprintDaily.hiddenAt` (the result stays the learner's; it leaves every board); on a
  `music-share` report it sets `MusicShare.hiddenAt` (the link and card go dark). "Ban author"
  already exists on the same row and removes the learner from every board by the ban filter.
- The exact thresholds are constants in one pure module (`sprint/plausible.ts`), tested with
  real-shaped runs from the S6 smoke (no honest smoke run may fail them). Error copy never names a
  threshold.
- Rows scored before the PR that adds `ranked` stay unranked (no backfill): the board starts on
  the day that PR deploys, which is why it ships first (§3, PR A).

### 1.4 Share a result

- **What can be shared:** the date's scored Daily run (only when it is saved, never a practice
  run) and a song's **best** for one mode (the server keeps only the best, not each run; the button
  on the song result is "Share best" and appears once a best exists).
- **The server builds the card from stored data.** The client sends only `{ kind: 'daily', date }`
  or `{ kind: 'song', songId, mode }` and `showName`. The snapshot is taken from
  `MusicSprintDaily` / `MusicSongBest` (never from client text, unlike `SharedMoment`) and stored as
  a small typed payload: Daily → date, score, stars, right/played, skipped, `avgMs`; song → song
  id, mode, version (piano, guitar or voice, from the profile at share time), best score, stars.
  The title and composer come from the songbook (`songs/catalog.ts`) at render time.
- **Name is opt-in per link** (checkbox "Show my name and picture", off by default). Without it the
  card and page say "A learner". With it the name and avatar are resolved **live** (a rename or an
  anonymised account is never frozen into a card). No handle, no profile link, no instrument or
  input other than a song's version, no streak, no board place (a place changes during the day).
- **The link:** `https://rmhstudios.com/rmhmusic/r/<token>`, `token` = `randomBytes(16)` base64url
  (22 characters, 128 bits; the marathon list's 72 bits is short for a link that may circulate).
  The route is a separate file outside the auth gate (`app/routes/rmhmusic_.r.$token.tsx`). The
  internal id (cuid) is what reports and the owner's "Stop sharing" use; the token is never
  logged by the app.
- **Lifetime:** a link works for 90 days (`expiresAt`) unless stopped sooner (Q3). The learner's
  links are listed on `/rmhmusic/friends` with "Stop sharing" each and "Stop sharing all". At most
  50 live links per learner (a 51st is refused with a sentence); sharing the same result with the
  same name choice again returns the existing live link. A banned author's links read as gone while
  the ban lasts; account deletion deletes them (`anonymizeAccount`). A viewer who blocks or is
  blocked by the sharer sees the "gone" page. Expired rows older than 30 days are deleted by the
  existing maintenance job (`lib/jobs/maintenance.server.ts`).
- **What a signed-out viewer gets:** a small notebook-paper page (app tier, the RMH Music look,
  static paper with no animated backdrop): the result as a heading and sentences ("Daily sight
  reading, 15 November 2026 · 92 points · 28 of 30 right · 0.9 s a note · ★★★"; song: "Ode to Joy —
  Beethoven · Play along · guitar · 98 points"), the name if chosen, and one primary link, **Try RMH
  Music** (`/rmhmusic`, which sends a signed-out visitor through sign-in and back). A signed-in
  viewer of today's Daily share also gets "Play today's challenge" (`/rmhmusic/sprint`) and a
  "Report" text button (entity `music-share`). A gone link (unknown, revoked, expired, hidden,
  banned author, blocked pair) shows one generic "This result is no longer shared" with HTTP 200.
- **Head and SEO:** `head()` uses `buildMeta({ title, description, path, image:
  ogCardPath('music', token), imageAlt })` plus `{ name: 'robots', content: 'noindex, nofollow' }`;
  no canonical. The sitemap lists `/rmhmusic/r/$token` as `null` ("a shared result: a capability
  link, noindex, never listed"), so `og-page-coverage` does not cover it — but it still keeps that
  test's three rules (through `buildMeta`, names its own card, its own copy), and a new test holds
  it to them. A gone link's head is `buildMeta` with the app's catalogue card
  (`/images/og/rmhmusic.png`), never the stale result. `robots.txt` is **not** changed (crawlable,
  so Twitterbot and LinkedInBot can unfurl it); a test asserts `/rmhmusic/r/` is not disallowed.
- **The card:** `GET /api/og/music/$token` → `renderPageCard` (the site's Steel Day card, as every
  card is, `docs/open-graph.md` §1): eyebrow "RMH Music", lead "Daily sight reading · 15 Nov 2026"
  or the song and composer, title "92 points", subtitle "28 of 30 right · 0.9 s a note" or "Play
  along · guitar", stats (stars as "3 of 3 stars" text, one ink chip), byline only when `showName`,
  art `/images/games/rmhmusic.webp`, footer path `/rmhmusic`. English, like every card (the page
  itself is translated). `cacheKey` = token + payload + resolved name/image. 404 for a gone link.
  `Cache-Control: public, max-age=600, s-maxage=600` (not immutable: stopping a link must kill the
  card within ten minutes on our side; unfurls already made by other services keep their copy —
  the dialog says "Previews already posted elsewhere may stay").

### 1.5 Friends' progress — where and what

- **The learn home** gets (a) a fourth quiet text link, **Friends**, in the footer row beside Sight
  reading, Tuner and Songs, and (b) when the learner's Friends switch is on and at least one friend
  shares, a short **Friends** section **at the very end of the page** (after the footer row, so
  nothing below it moves when it arrives; it fades in with `useArrival`, M9): up to three rows on
  rules, each "avatar · name · Daily: 12 days · 3 of 5 units", and "All friends" linking to the
  page. Opted out or no sharing friends: nothing (no nag).
- **`/rmhmusic/friends` ("Friends and sharing")**: the two switches with their help text; the
  friends list (up to 100, ordered: today's Daily done first, then Daily streak desc, then name):
  each row shows avatar, name, "Daily challenge: 12 days in a row" (+ "done today"), "3 of 5 units
  finished" with the last finished unit's title, and a native `<details>` "Song bests" listing
  song title, mode and best; then "Shared links" (each link's subject, date shared, expiry, "Stop
  sharing"; "Stop sharing all"). Empty states are sentences: "None of your friends share their
  progress yet. Friends are people you follow who follow you back."
- **Which streak:** the Daily challenge streak (`dailyStreak`), the only streak RMH Music owns. The
  flame on the home is the site-wide streak, fed by anything on the site; showing it as music
  progress would misdescribe it and widen the consent to site activity (Q1).
- **Finished units:** a unit is finished when every `available` lesson of it has `stars >= 1`,
  counted on the friend's own path (`pathFor(instrument)`); pure function `finishedUnits` in the
  strict island.

### 1.6 Data model (additive migrations only)

```prisma
// rmhmusic.prisma — PR A: two columns and an index on the existing table
model MusicSprintDaily {
  // … existing fields …
  /// Passed the board's checks (`sprint/plausible.ts`) when it was scored; false for rows scored
  /// before Phase 6 and for runs whose start never reached the server.
  ranked         Boolean   @default(false)
  /// Why a scored run is not ranked: no-start | clock | too-fast | too-even. Null when ranked.
  unrankedReason String?   @db.VarChar(16)
  /// Set by a moderator ("Resolve & remove content" on a `music-score` report): off every board.
  hiddenAt       DateTime?

  @@index([date, ranked, score(sort: Desc), avgMs])
}

// PR B
/// A learner's social consent (Phase 6). No row = both off.
model MusicSocial {
  userId    String   @id
  /// Show my Daily challenge scores on the board (any signed-in learner).
  board     Boolean  @default(false)
  /// Share my progress (Daily streak, finished units, song bests) with mutual follows.
  friends   Boolean  @default(false)
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("music_social")
}

// PR D
/// A shared result: the capability link `/rmhmusic/r/<token>` and the snapshot its card shows.
model MusicShare {
  id        String    @id @default(cuid())
  token     String    @unique @db.VarChar(32)
  userId    String
  /// daily | song
  kind      String    @db.VarChar(8)
  /// What was shared, for reuse: `2026-11-15` or `ode-to-joy:play`.
  subject   String    @db.VarChar(80)
  /// The server-built snapshot (`share.ts` `SharePayload`, versioned `v: 1`).
  payload   Json
  showName  Boolean   @default(false)
  createdAt DateTime  @default(now())
  expiresAt DateTime
  revokedAt DateTime?
  /// Set by a moderator ("Resolve & remove content" on a `music-share` report).
  hiddenAt  DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@map("music_share")
}
```

`User` gains `musicSocial MusicSocial?` and `musicShares MusicShare[]` beside the other RMH Music
relations (`auth.prisma` line ~245). Migrations: `20261116090000_music_sprint_daily_ranked`
(`ADD COLUMN … NOT NULL DEFAULT false`, nullable columns, `CREATE INDEX`),
`20261116100000_music_social`, `20261116110000_music_share` (`CREATE TABLE`). No drop, rename or
type change.

### 1.7 Endpoints (contracts + `implement()`, zod, registered `*.server.ts` modules)

All under `lib/rmhmusic/learn/social/` (contract, schemas, server) and
`lib/rmhmusic/api/rmhmusic.<path>.server.ts`, then `pnpm api:routes`. All `auth` default
(`'required'`) except the card. No HTTP `cache` declaration (per-viewer); server-side caches below.

| Method + path | Body / query (zod) | Rate limit | Answer |
| --- | --- | --- | --- |
| `GET /api/rmhmusic/social` | — | `read` | `{ board, friends, shares: ShareSummary[] }` |
| `PUT /api/rmhmusic/social` | `{ board?: boolean, friends?: boolean }` (at least one) | `write` | same as GET; invalidates the board caches of today and yesterday and the viewer's friends cache |
| `GET /api/rmhmusic/sprint/board` | `{ date, scope: 'everyone' \| 'friends' }` | `read` | `{ date, final, total, rows: BoardRow[≤50], around: BoardRow[] \| null, me: BoardMe, friendsOff?: true }` |
| `GET /api/rmhmusic/friends` | `{ limit: 3 \| 100 }` | `read` | `{ optedIn, friends: FriendProgress[] }` (empty when not opted in) |
| `POST /api/rmhmusic/share` | `{ kind: 'daily', date } \| { kind: 'song', songId, mode }` + `showName` (discriminated union) | `{ policy: 'write', scope: 'user', limit: 20, windowMs: 3_600_000, prefix: 'rmhmusic-share' }` | `{ id, url, expiresAt }`; 400 nothing to share; 409 over 50 live links |
| `DELETE /api/rmhmusic/share/$id` | — | `write` | `{ ok: true }` (owner-scoped `updateMany where { id, userId }` sets `revokedAt`) |
| `DELETE /api/rmhmusic/share` | — | `write` | revokes all the learner's live links |
| `GET /api/og/music/$token` (`lib/og/api/og.music.$token.server.ts`) | — | `read` per IP, `auth: 'none'` | PNG |
| `POST /api/rmhmusic/sprint/daily` (existing) | unchanged | unchanged | adds optional `board: BoardMe` to `sprintDailyRes` (old clients ignore it) |

The share page's loader is a `createServerFn` (as `/moments/$id`) calling `getSharedResult(token,
viewerId?)` in `share.server.ts`; it checks the token's shape (`^[A-Za-z0-9_-]{22}$`) before any
query. `BoardRow` = `{ rank, user: { id, name, image }, score, avgMs, withoutChords, you }`;
`FriendProgress` = `{ user, daily: { streak, today: boolean }, units: { finished, total, last:
string | null }, songs: { songId, mode, bestScore }[] }`.

**Caching.** The Everyone board: one `cached('rmhmusic:board:<date>', 30_000)` sorted list per date
(`{ rowId, userId, score, avgMs, scoredAt, skipped }`, at most 10,000 rows) built by one SQL query
(the §1.2 filters, `JOIN music_social` on `board`, the ban/bot filter on `"user"`, ordered as
§1.2). Per request, in pure code (`social/board.ts`): drop blocked ids, slice the top 50, find the
viewer (or binary-search where their unranked/private score would fall), slice "around you",
then load display data for at most 55 ids with `userDisplaySelect`. The viewer's own state is read
fresh. Friends: `cached('rmhmusic:friends:<viewer>', 30_000)`; friends board computed per request
(small). Streaks for up to 100 friends: one query of scored dates over the last 400 days for those
ids, `dailyStreak` per friend.

### 1.8 UI (app tier: the RMH Music notebook look)

RMH Music is a full-screen app (L8): `.app-theme rmhmusic-theme`, `--app-*` tokens, `.app-page`
(document scroll), `rmm-sheet divide-y divide-app-border` rows on rules, `rmm-display` for page
headings, the buttons in `components/rmhmusic/learn/buttons.ts`. No chips, badges or eyebrows; no
coloured medals; the top three are not styled differently. Numbers in Geist Mono with
`tabular-nums`. Controls from `components/ui` that the app already uses: `<Tabs>` (Everyone /
Friends), `Switch` (themed for apps by `[data-slot='switch']` in `app-theme.css`), `Dialog` (the
share dialog), `UserAvatar`, a dropdown row menu for Report. One primary per view (R4): Daily
result keeps its existing primary; Share is a secondary button; the board page has none; the share
page's "Try RMH Music" is its one primary.

- **New routes** (auth-gated, inside the layout): `app/routes/rmhmusic/daily.tsx` (the board,
  `?date=` today|yesterday) and `app/routes/rmhmusic/friends.tsx`. **Public:**
  `app/routes/rmhmusic_.r.$token.tsx`. Sitemap: `'/rmhmusic/daily': 'personal'`,
  `'/rmhmusic/friends': 'personal'`, `DYNAMIC_ROUTES['/rmhmusic/r/$token'] = null`. Return-path
  allowlist: add `/rmhmusic/daily` and `/rmhmusic/friends`. FOUC fixture for
  `/rmhmusic/r/$token` (a seeded token; `fidelity: 'shell'`).
- **Links in:** the Sprint picker's Daily challenge row gets "Today's board"; the Daily result gets
  the status line (§1.2) and "See today's board"; the learn home footer gets "Friends".
- **Share dialog** (`components/rmhmusic/learn/share/ShareDialog.tsx`): title "Share this
  result"; the card's lines as plain text (exactly what will be public); checkbox "Show my name and
  picture" (off); a sentence "Anyone with the link can see this. It stops working after 90 days, or
  when you stop sharing it under Friends and sharing. Previews already posted elsewhere may stay.";
  primary **Copy link**, which creates the link (nothing is public before this press) and writes
  it with `navigator.clipboard.writeText`; on success the button reads "Link copied" and a polite
  live region says so; if the clipboard is refused, a read-only field with the URL appears,
  selected, labelled "Copy this link". Focus returns to Share on close.
- **Skeletons:** the board's ten placeholder rows, the friends list's three and the home section's
  placeholder match loaded row heights (the Phase 2–5 skeleton-parity rule); the home section has
  no placeholder because it sits last and arrives without moving anything.
- **R5:** nothing polls; the board is fetched on visit and on "Refresh" (a text button). No
  `requestAnimationFrame`, timers or observers are added; the share page does not mount
  `PaperBackdrop`.

### 1.9 i18n and accessibility

- Every string through `t()` in `c-rmhmusic` (the site Privacy group in the Privacy page's own
  namespace, `feed`); plurals with i18next `count` ("{{count}} days in a row"); numbers, the
  average seconds and dates with `Intl` in the viewer's locale (`timeZone: 'UTC'` for the Daily
  date); no ordinals; no `{/* */}` comment directly before a `t()` call. After `pnpm i18n:extract`
  keep only the 16 shipped `locales/*/c-rmhmusic.json` (and `feed.json`) changes (roadmap §4).
  Song titles and composers stay data. The OG card is English (§1.4).
- The board is an `<ol>`; each row reads as one sentence to a screen reader ("Place 14, Alex, 92
  points, 0.9 seconds a note, without chords"), the viewer's row has `aria-current="true"`. Tabs
  use the primitive's roving focus. Each switch has a visible label and `aria-describedby` help.
  `<details>` for song bests. Row menus and every control are 44 px on touch. Live regions for
  "Loading today's board…" and "Link copied". RTL: logical properties (`ms-`, `me-`, `text-end`),
  numbers in an LTR isolate. Focus ring is the global K10 ring. Text holds 4.5:1 in both modes.

## 2. Tests (TDD: written first, seen failing, then made to pass)

Pure modules join the strict island (`tsconfig.strict.json`: add `lib/rmhmusic/learn/social/*.ts`;
`sprint/plausible.ts` is already covered by `lib/rmhmusic/learn/sprint/*.ts`).

- `sprint/plausible.test.ts`: every S6/Phase 5 smoke run shape passes; one too-fast prompt passes,
  two fail (`too-fast`); a bar with a 50 ms gap counts; CV under 0.05 over ≥15 right answers fails
  (`too-even`), 14 does not trigger; sum of ms over elapsed + 5 s fails (`clock`); no start →
  `no-start`; skipped chords are ignored by every check; `needsReview` for 100 with avg < 450 and
  for the third 100 in seven days, not for the second.
- `sprint.server.test.ts` (extended): a save after a start writes `ranked`/`unrankedReason`; a save
  that creates the row is `no-start`; an identical retry keeps the first verdict; the `[Auto]`
  report is filed once (deduped) and never blocks the save; `board` is returned on the response.
- `social/board.test.ts` (pure): the comparator (score, avgMs nulls last, scoredAt, userId); ranks
  stable across viewers; block filtering leaves gaps; top 50 + around ±2 at the edges (rank 1, rank
  N, inside the top 50 → no "around"); would-place for a private or unranked score; yesterday
  `final` only after the grace window; dates other than today/yesterday rejected.
- `social/board.server.test.ts` (mocked prisma, as `leaderboard-scope.test.ts`): opted-out,
  hidden, unranked, unscored, banned, deleted (tombstone), bot and blocked (both directions) rows
  never appear; `getBlockedAuthorIds` failure fails the request (no fallback to "no blocks"); the
  friends scope uses mutuals only (a one-way follower never appears), requires the viewer's switch,
  includes friends with either switch on; the cache is per date and invalidated on PUT.
- `social/friends.test.ts` (pure): `finishedUnits` per path (piano, guitar, voice; unavailable
  lessons ignored; the shared rhythm unit), ordering, streak today/yesterday.
- `social/friends.server.test.ts`: reciprocity (viewer off → empty), only opted-in mutuals, banned
  and blocked excluded, limit 3/100, payload never carries handle, email, input or latency.
- `social/prefs.test.ts` + server: no row reads as both off; PUT with neither field is a 400; PUT
  creates the row; toggles invalidate caches.
- `social/share.test.ts` (pure): snapshot builders from a stored daily row and a song best; token
  shape; subject keys; payload version; "gone" for revoked, expired, hidden.
- `social/share.server.test.ts`: share of an unscored date, a practice-only date, another user's
  row or an unknown song is a 400; reuse of an identical live share; the 51st live link is a 409;
  `showName` off → no name/image in the view; banned author and blocked viewer → gone; DELETE is
  owner-scoped (another user's id changes nothing); revoke-all; tokens are 22 url-safe characters
  and unique across 10,000 draws.
- `lib/og/__tests__/music-card.test.ts`: the card route 404s when gone; draws no name without
  `showName`; `cacheKey` changes with the name.
- `lib/rmhmusic/learn/social/share-route.test.ts` (source-level, as the og tests read routes): the
  share route's `head()` goes through `buildMeta`, names `ogCardPath('music', …)`, carries
  `noindex, nofollow`, and the route is not under the auth-gated layout; `public/robots.txt` does
  not disallow `/rmhmusic/r/`.
- `return-path.test.ts`: `/rmhmusic/daily` and `/rmhmusic/friends` pass; `/rmhmusic/r/x` does not
  (it is public; nothing to return to).
- Moderation: `music-score` and `music-share` in `REPORT_ENTITY_TYPES`; `resolveTargetUser`
  resolves both; `takedownReportedContent` sets `hiddenAt` and is idempotent.
- Account: `anonymizeAccount` deletes `MusicSocial` and `MusicShare` rows; the export includes them.
- Component logic as pure helpers (components run in node without a DOM, roadmap §4):
  `board-text.ts` (row sentence, status lines), `share-text.ts` (the dialog's preview lines equal
  the card's lines), `friends-text.ts`.
- Existing gates that must stay green: `route-table.test.ts`, `sitemap-coverage`,
  `sitemap-sections`, `og-cards`, `og-page-coverage`, `raw-api-fetch-ratchet` (all calls through
  `api(contract)`), `ts-escape-hatch-ratchet`, `tsconfig-projects`, `game-viewport-consistency`,
  `leaderboard-scope`, `blocked-authors-fail-closed`, `i18n-catalogs`.

## 3. Tasks, as PR-sized milestones (one commit per task; the commit gate on every commit)

**Task 0 (with PR A):** this plan; the committing agent adds its `.prettierignore` entry beside the
other RMH Music plans (`.prettierignore` line ~3625).

### PR A — the board's evidence (invisible to learners)

1. `sprint/plausible.ts` + tests (constants, `judgeDailyRun(results, elapsedMs | null)`,
   `needsReview`).
2. Schema: `MusicSprintDaily.ranked`, `unrankedReason`, `hiddenAt`, index; migration
   `20261116090000_music_sprint_daily_ranked`; `saveSprintDaily` records the verdict (start existed
   ⇔ the save's `createMany` made no row; `createdAt` read before the fill); the `[Auto]` review
   report; tests.
3. Moderation: entity types `music-score` (and `music-share`, so PR D adds no second edit),
   `resolveTargetUser`, `takedownReportedContent` (hide), the admin "Resolve & remove content"
   list; tests.

### PR B — consent and the Daily board

4. `MusicSocial` + migration `20261116100000_music_social`; `social-schema.ts`,
   `social.contract.ts`, `prefs.server.ts`, `GET/PUT /api/rmhmusic/social`; deletion and export;
   tests.
5. `social/board.ts` (pure) + `board.server.ts` + `GET /api/rmhmusic/sprint/board`; the
   `board` field on the daily save response; `pnpm api:routes`; tests.
6. UI: `/rmhmusic/daily` (Tabs, rows, around you, status line, switch, Refresh, row menu with
   Report), the Sprint picker's "Today's board" and the Daily result's status line + "Show it on
   the board" + "See today's board"; sitemap, return path, strings; `board-text` tests.
7. Site Privacy page: `MusicPrivacyControls` (site tier, Steel: rows on rules, `t-label`/`t-meta`,
   the site `Switch`), strings in `feed`.

### PR C — friends' progress

8. `social/friends.ts` (pure) + `friends.server.ts` + `GET /api/rmhmusic/friends`; tests.
9. UI: `/rmhmusic/friends` (switches, list, empty states) and the learn home's Friends link and
   end-of-page section; sitemap, return path, strings; `friends-text` tests; the Friends tab of the
   board now reads the friends switch.

### PR D — Share a result

10. `MusicShare` + migration `20261116110000_music_share`; `social/share.ts` +
    `share.server.ts`; `POST /api/rmhmusic/share`, `DELETE …/share/$id`, `DELETE …/share`;
    deletion, export, the maintenance sweep; tests.
11. Card: `lib/og/api/og.music.$token.server.ts`, `ogCardPath` kind `'music'`; tests.
12. Public page `app/routes/rmhmusic_.r.$token.tsx` (loader, head, gone state, Report for
    signed-in viewers), sitemap `null` entry, FOUC fixture; route/robots test.
13. `ShareDialog` + Share buttons on the Daily result and the song result; the "Shared links"
    list on `/rmhmusic/friends`; `share-text` tests.

### PR E — docs and the browser pass (may ride with PR D)

14. `docs/rmhmusic/roadmap.md` (§1, §2 Phase 6, §3, §4: the board's limits), `docs/open-graph.md`
    (card routes: `music`), `pnpm docs:site`, `pnpm facts:generate`.
15. Chromium smoke (the Phase 4/5 harness, dev server + throwaway Postgres, four accounts: A and B
    mutual follows, C a stranger, D blocked by A): A plays the Daily with fake MIDI (the start
    recorded) → ranked; A private → C sees no row and A sees "would place"; A turns the board on →
    C sees A; D never sees A on either tab and A never sees D; B sees A on Friends only when both
    friends switches are on; a fabricated POST with 30 × 100 ms answers → not ranked, sentence
    shown; admin hides A's score from the reports page → gone from every board; A shares the
    Daily with the name off → signed-out page shows "A learner", the HTML carries an absolute
    `og:image` and `noindex, nofollow`, `/api/og/music/<token>` is a 1200×630 PNG; Stop sharing →
    gone page and 404 card; Copy link with the clipboard denied → the fallback field; 320, 390 and
    1280 in Day and Night, once in `ar`: no horizontal scroll, CLS 0, skeleton = loaded height, 0
    `requestAnimationFrame` at rest on the new pages; screenshots looked at (notebook paper, no
    chips, badges or eyebrows).

## 4. Verification

- `pnpm exec vitest run lib/rmhmusic components/rmhmusic lib/og lib/moderation lib/account` and
  the `lib/__tests__/` gates named in §2; `pnpm typecheck:strict`; `pnpm typecheck` on a machine
  that can hold it (the agent container OOM-kills `tsc -b`; record a scoped check otherwise, as
  Phases 2–5 did).
- `pnpm api:routes` leaves `lib/api/route-table.server.ts` clean after commit;
  `pnpm exec prisma validate`; the three migrations apply on a throwaway Postgres and
  `prisma migrate diff` shows no drift; every migration is `ADD`/`CREATE` only.
- `pnpm check:consistency` before every commit; `pnpm check:consistency --base main` before each PR.
- `curl -s http://localhost:7005/rmhmusic/r/<token>` signed out: 200, `og:image` absolute and
  versioned, `robots` `noindex, nofollow`, no redirect to `/login`; the same for a revoked token
  shows the app's card and the gone copy; `curl -I /api/og/music/<revoked>` is 404.
- `pnpm audit:pages` over the three new pages (iOS edge-pinned layers, page anatomy).
- Anything not run (Firefox, WebKit, iOS Safari, 200 % text, real translations) goes into the
  roadmap's "Not done" list, as in Phases 3–5.

## 5. Owner decisions (2026-11-16)

The owner answered the open questions; the plan above builds these.

- **Q1. Which streak do friends see?** The Daily challenge streak (music-only), as built.
- **Q2. One board for every input?** One board; runs without chords (microphone, voice) say so on
  the row, as built.
- **Q3. Share link lifetime.** 90 days, stoppable any time, as built.
- **Q4. RMH Music in the account export.** **Changed from the default:** every RMH Music table, the
  existing ones (profile, lesson progress, cards, Sprint daily and bests, song bests) as well as the
  two new ones, joins the account data export and the account-deletion sweep. This is a task of its
  own in PR A (export entries, deletion sweep entries, tests that each music table is covered).

## 6. Known limits (to carry into the roadmap)

- The checks make a fabricated board run slow and human-shaped; they cannot prove a note was
  played. A patient cheater with human-looking times can still rank; moderation is the backstop.
  Several accounts per person are not addressed.
- Inputs differ in difficulty (MIDI must play the written octave; other inputs any octave) and
  share one board.
- The OG card is English; unfurls already fetched by other services outlive "Stop sharing".
- Boards begin on the day PR A deploys; earlier Daily runs are never ranked.
