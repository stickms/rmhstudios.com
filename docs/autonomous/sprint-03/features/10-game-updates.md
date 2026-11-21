# 10 — Game updates: a changelog per game and following a game

Surface: the game page in the games library (`/games/$gameId`,
`components/steam/GamePage.tsx`), a new updates page
(`/games/$gameId/updates`), `/admin/patch-notes` and the notifications inbox.
Wave 6. Namespace `game-updates`.

## User story

As a player of one of the site's games, I want to read every update a game has
had — not just the latest note that pops up once on launch — and to follow a
game so that I am told when it gets an update or a new player guide, so that I
come back when something I care about changes.

## Requirements elicitation

- **What exists (verified):** admins publish patch notes per game
  (`/admin/patch-notes`, `components/arcade/AdminPatchNotes.tsx`,
  `GamePatchNote` in `prisma/schema/games.prisma`). The only reader is `GET
  /api/arcade/patch-notes?path=…` in
  `lib/arcade/api/arcade.patch-notes.server.ts`, which returns **only the
  latest** note, shown once on launch by
  `components/arcade/PatchNotesMount.tsx`. Older notes are stored and never
  shown. The game page shows reviews, guides, achievements and "About" but no
  update history, and there is **no way to follow a game** (no model or code for
  it; wishlists exist for shop items, not games).
- **Decisions:** a public updates list per game (newest first, paginated), an
  "Updates" section on the game page with the latest three, and a follow
  toggle stored in a new `GameFollow` table. Publishing a patch note, or a new
  guide being published (`GameGuide`), notifies followers in-site through the
  existing `createNotification` (type `SYSTEM`, entity `game_update` /
  `game_guide`), fanned out by a pg-boss job (not in the admin's request) in
  batches of 1,000. Notifications respect the global "system" preference.

## Functional requirements

1. FR-1 `/games/$gameId/updates` lists every patch note of the game: version,
   title, date, body (plain text with line breaks), 20 per page with "Load
   more"; 404 for unknown games and for off-site titles.
2. FR-2 The game page gains an "Updates" section (latest three, "All updates"
   link) and an "Updates" anchor in its section links.
3. FR-3 A "Follow" toggle on the game page and the updates page (signed in
   only; `aria-pressed`; "Following" when on) with the follower count shown on
   the updates page.
4. FR-4 Publishing a patch note enqueues a fan-out job; each follower gets one
   notification "<Game> updated to <version>: <title>" linking to the updates
   page. A newly published guide notifies followers "New guide for <Game>:
   <title>" (the guide's author is not notified).
5. FR-5 The inbox labels both kinds with the game's name (`systemIdentity` in
   `components/feed/NotificationsColumn.tsx`).
6. FR-6 `/admin/patch-notes` lists the game's existing notes under the form,
   with edit (title and body; version is immutable because launch prompts
   compare it) and delete.
7. FR-7 The member's followed games are listed in their library
   (`/games` library home, a "Following" filter) and can be unfollowed there.

## Non-functional requirements

- **Performance:** the updates page uses `@@index([gameId, createdAt])`
  (exists); follow counts by `@@index([gameId])`; the fan-out pages followers
  by id cursor and creates notifications with `createMany` per batch, skipping
  members whose system notifications are off.
- **Security:** follow is session-only and writes only the caller's row;
  patch-note edit/delete are `auth: 'admin'` and audit-logged
  (`logAdminAction`); the fan-out deduplicates by `(userId, entityType,
  entityId)` so a retried job does not notify twice.
- **SEO:** the updates page has its own title and description and the game's
  OG card (`ogCardPath('game', id)` if it exists — check `lib/og/` — or a
  section card); it is in the sitemap next to the game pages.
- **Accessibility:** each note is an `article` with a heading; dates in
  `<time>`.
- **i18n:** strings in `game-updates`; note text is admin-written and shown as
  written.
- **Steel (app tier):** the games library is full-screen with its own
  (`stm-*`) styles; keep them.

## Data model and API

- New model `GameFollow { userId, gameId String @db.VarChar(64), createdAt,
  @@id([userId, gameId]), @@index([gameId]), @@map("game_follow") }` with a
  cascade to the user. Migration `20261123060200_s03_game_follows`.
- `lib/arcade/updates.server.ts` (list, follow, unfollow, counts,
  `fanOutGameUpdate`), `lib/arcade/updates-schema.ts`,
  `lib/arcade/updates.contract.ts`, `lib/arcade/updates-jobs.server.ts`
  (queue `games.update-fanout`, a work queue, not a cron — registered in
  `server/jobs/index.ts`).
- Modules: `lib/arcade/api/games.$gameId.updates.server.ts` (GET),
  `games.$gameId.follow.server.ts` (GET, PUT, DELETE),
  `arcade.patch-notes.$id.server.ts` (PATCH, DELETE, admin). The existing POST
  enqueues the fan-out; the guide-publish path (find it under
  `lib/**/guides*`) does too.
- Route `app/routes/games/_library/$gameId_.updates.tsx` (check the naming of
  the sibling `$gameId_.guides.$guideId.tsx`).
- `anonymizeAccount` deletes the member's follows.

## Testing requirements

- Main suite `lib/arcade/__tests__/game-follow.test.ts`: follow writes only the
  caller's row; fan-out run twice notifies once; members with system
  notifications off are skipped; non-admins cannot edit or delete notes.
- Main suite `lib/account/__tests__/game-follow-erasure.test.ts`.
- Product suite `lib/arcade/__tests__/updates.product.test.ts`: pagination
  cursor, notification text building.

## Acceptance criteria

- [ ] Every stored patch note of a game is readable on its updates page.
- [ ] Following a game and publishing a note gives one notification.
- [ ] A new guide notifies followers but not its author.
- [ ] The updates page unfurls as itself.
- [ ] 390 px and 1280 px, and `ar`.

## Out of scope

Email for game updates, following a game's community (communities have their
own membership), per-version comments.
