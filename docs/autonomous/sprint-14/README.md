# Sprint 14 — Doors nobody built, in the games, apps and safety tools members already use

Twenty features. Most open a door to something the code already keeps: Synapse Storm versus matches the hub writes and
nothing reads (03), Altair co-op totals nothing shows (04), a Doctrine XP ledger nobody can see while the profile's
heatmap is passed `{}` and its "Full XP breakdown" link opens the leaderboard (05), a `pinned` flag on every
conversation preference that no screen sets (12), a supporter lookup "for rendering supporter badges" with no caller
(13), a jam shortlist contract no client calls and no way at all to edit a jam (14), and a self-exclusion that promises
to hide the coin games and hides nothing (16). Several give under-served games and apps what their members reach for
next: Identity Crisis, the next RMHBox stub (01), and a Hearthworks town that survives a cleared browser (02), puzzle
reports and an admin check of the AI daily puzzles (06), notices when someone replies in your game thread or comments on
your song (11), and saved homes in the developer API (15). Five close safety holes: a Slice It song (a report type since
L9 that nothing files) and its comments (07), the games library's reviews, guides, threads and tips (08), a profile —
which has no mute, block or report control at all, and whose built impersonation reports nothing calls (09), and an
RMHTube room or party (10) can finally reach a moderator; and a moderator's timeout holds on the twenty-odd writers, three
hubs and the developer API routes that ignored it (17). Three are hardening from the follow-up lists: erasure that sees
plain member columns (18, sprint 13's recorded blind spot), test doubles that reject what Postgres rejects (19, the
lesson of sprint 13's integration) and seven recorded sprint 13 gaps (20). Each was checked against the sprint 13 tip
(`e07d7b737`, the squashed sprint 13 commit in review for `main`) so it repeats nothing that exists. Specifications are
in [`features/`](features/), the build order in [`plan.md`](plan.md), implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`, `docs/plans/2026-11-11-steel-design-implementation.md`)
on the site tier (09, 12, 13, 14, 16, 17's refusals, the admin page of 06, the queue and Your reports halves of 07, 08
and 10, the inbox and settings of 11, the settings row of 02) and the app tier's own look (L8) in RMHBox (01),
Hearthworks (02), Synapse Storm (03), Altair (04, 20), Doctrine (05), the daily desk (06), Slice It (07), the games
library (08, 11) and RMHTube (10, 20). None resolves a section-18 open decision (D1, D3, D6, D7, D8, D10, D12) or an
open owner decision (moderator notes in the data export, the deletion grace period, unlisted tournament or listing meta,
Apache `CF-Connecting-IP` stripping, blocked members RSVPing to a blocker's events, RMHBox per-minigame history privacy,
ownership transfer in the public mod log, emoji reactions under quiet counts, recovery codes and trusted contacts having
no product, a deleted member's follows, game reviews, guides, jam entries and public decks, uploading Studio samples, how
long `RebarReservation` bookings are kept, a public setting for the RMHTube profile card, purchased cosmetics and season
passes at erasure, refunds when an account is deleted, retiring one of the two news-story follows). Where a feature
meets one, its specification says which default it keeps: 08 reports and removes game reviews and guides but leaves their
erasure (`owner`) alone; 18 keeps moderator notes about other members (`CommunityMemberNote`) as the moderators' record
and does not touch the export decision.

The erasure registry is at four `todo` entries, each needing a product call; `TODO_CEILING` stays 4. Every new table is
classified by the feature that adds it (06), 03 erases the Synapse Storm rows that carry no `User` relation under its
own anchor, and 18 adds the second registry that makes such tables visible to the coverage test.

### Decisions taken by default (design pass, 2026-11-25)

The owner's standing rule is to take the most reasonable decision and record it. The design pass took these:

- **01** the spec's "voting accuracy" bonus is dropped (the server cannot know the true answer to a free-text
  question); 240+ bundled identities; question text length-limited and cleaned (RMHBox has no word filter anywhere).
- **02** the IndexedDB copy stays first; the account copy is gzipped into the shared save table under the existing
  500 KB cap (never raised), at most every five minutes and on pagehide (by beacon only up to 60,000 bytes); shared
  worlds are never uploaded; a stale second device is refused by an optional compare-and-set on the save `POST`.
- **03** own finished matches, paged on (`lastUpdateAt`, `id`); others by current name, "A player" for guests and
  blocks; a `CONCURRENTLY` index on (`userId`, `lastUpdateAt` desc);
  erasure tombstones ids and names; scores labelled as reported by each player's game.
- **04** the favourite class is computed from co-op matches (the stored field names the first class); two boards over
  the indexed columns with board privacy.
- **05** a breakdown page by action key (the stored English `reason` and the `metadata` are never shown); the heatmap
  bucketed in the browser's zone.
- **06** a puzzle report is its own table, not a `ContentReport` (no author, nothing to take down); replace only a day
  in the next two days, more than 10 minutes before it starts, with no scores, generated first and written in place
  under a lock; today's puzzle is never replaced.
- **07** `song` becomes removable through the existing irreversible `takeDownSong`; a new `song-comment` type.
- **08** reviews, guides and tips gain `moderatedAt`; threads and posts are deleted; a moderated item cannot be edited
  or deleted by its author.
- **09** a profile menu (mute, block, report, impersonation); impersonation stays `reason: 'OTHER'` with its entity
  type, as J2 designed; the other accounts claiming a host are admin-only.
- **10** a takedown closes the room, tells the hub over Redis and blocks the same name from the same host for 30 days.
- **11** replaces the existing English-only `notifyHubReply` (author only) with a keyed notice to the author and
  earlier posters; at most 50 recipients a post; the Replies category; a `game-thread` conversation scope for muting.
- **12** five pins, direct conversations only, first page only; marks from one batched read.
- **13** visible to the post's author only, absent for everyone else; a profile switch (a constant-default column).
- **14** everything editable before the start, only later deadlines and the description after; the slug never
  changes; no notices about edits.
- **15** `read:homes` and `write:homes`, both explicit; no coordinates, address or internal throttle in any response.
- **16** only self-exclusion hides (cool-off refuses as before); one list of risk paths; the two pages and the
  Compete hub's Wagers tab decided on the server.
- **17** `comment`, `message` and `post` cover every writer; no new restrictable feature; the `message` label becomes
  "Messages and chats" with a new key; `/api/v1` posts and replies now refuse a timed-out member; scheduled posts wait
  out a `post` timeout.
- **18** a separate plain-column registry with a `not-member` decision; Discord ids and worker leases are not members;
  the author column of staff- and moderator-made content (`createdById`) is de-identified.
- **19** a test-time checker built from the schema source (the runtime `Prisma.dmmf` has no optionality), a fake
  wrapper and a JSON check; adopted by the economy fake and the
  three sprint 13 tests whose fakes hid bugs; required by every later brief.
- **20** seven items; the rest of sprint 13's list is left with the reason it needs a product call or a schema change.

## Features

| #   | Feature | Surface | Wave | Schema |
| --- | ------- | ------- | ---- | ------ |
| 01  | [Identity Crisis, a new RMHBox minigame](features/01-identity-crisis.md) | RMHBox picker, rounds, history | 1 | no |
| 02  | [Your Hearthworks town on every device](features/02-hearthworks-saves.md) | Hearthworks menu, Settings > Cloud saves | 2 | no |
| 03  | [Your Synapse Storm matches](features/03-synapse-matches.md) | Synapse Storm multiplayer menu, the export | 3 | index |
| 04  | [Your Altair co-op record, and the co-op boards](features/04-altair-coop.md) | Altair "Your runs", leaderboard, export | 4 | no |
| 05  | [Where your Doctrine XP came from](features/05-doctrine-ledger.md) | `/strategies/profile`, `/strategies/profile/xp` | 5 | no |
| 06  | [Report a broken daily puzzle, and check the coming days' puzzles](features/06-puzzle-reports.md) | AI daily puzzles, `/admin/daily-puzzles` | 5 | yes |
| 07  | [Report a Slice It song, or a comment on one](features/07-slice-reports.md) | Slice It song details and comments, the queue | 1 | no |
| 08  | [Report a game review, a guide, a discussion or an achievement tip](features/08-game-reports.md) | Games library, achievement tips, the queue | 2 | yes |
| 09  | [Mute, block or report from a profile, and report an impersonator](features/09-profile-reports.md) | Profiles, the queue's impersonation view | 3 | no |
| 10  | [Report an RMHTube room or watch party](features/10-tube-room-reports.md) | RMHTube header and party page, the hub, the queue | 4 | yes |
| 11  | [Hear about replies to your game threads and comments on your songs](features/11-thread-replies.md) | Inbox, thread page | 5 | no |
| 12  | [Pin conversations to the top, and see which you muted](features/12-pinned-conversations.md) | `/messages`, conversation header | 2 | no |
| 13  | [See which of the people replying to you support you](features/13-supporter-marks.md) | Replies under a creator's post, profile editor | 6 | yes |
| 14  | [Edit a game jam, and its theme shortlist, after creating it](features/14-jam-editing.md) | `/jams/$slug` (admins) | 4 | no |
| 15  | [Saved homes and saved searches in the developer API](features/15-homes-api.md) | `/api/v1/me/homes/*`, two explicit scopes | 3 | no |
| 16  | [Self-exclusion hides the coin games, as it promises](features/16-exclusion-hides.md) | Shell, search, `/predictions`, `/wager/$id` | 6 | no |
| 17  | [A timeout that holds on every reply and every chat](features/17-timeouts-everywhere.md) | Every member-text writer, three hubs, `/api/v1` | 6 | no |
| 18  | [Erasure that sees every member column, not only relations](features/18-erasure-plain-columns.md) | Account deletion, the registry, its doc | 7 | no |
| 19  | [Test doubles that know the schema](features/19-schema-fakes.md) | The test suites | 1 | no |
| 20  | [Close the gaps sprint 13 left open](features/20-s13-gaps.md) | Packs, group messages, RMHTube, admin deletions, Altair, Vega, Ranked | 7 | no |

### Why each one

- **01** Six RMHBox minigames are still stubs; Identity Crisis is turn-based talk and votes, needing neither physics nor
  input sync, and its design spec is complete.
- **02** Hearthworks is a 20–90 minute sim that saves to one browser's IndexedDB only (`save: 'local-only'`).
- **03** `SSMatch` and `SSPlayerMatch` are written on every versus match and read by nothing.
- **04** `AltairCoopProfile` is written from verified co-op matches and read by nothing; its "favourite class" is the
  first one played.
- **05** `DoctrineReputationLedger` is written on every XP change and read by nothing; the heatmap gets `{}`.
- **06** Five daily puzzles are written by a model, validated only structurally, and locked for the day; nobody can
  say one is wrong and nobody looks at the next day's.
- **07** `song` is a report type nothing files; song comments cannot be reported.
- **08** Five kinds of public member text on the games library have no report path.
- **09** A profile has no mute, block or report control; the impersonation endpoint and `accountsClaimingHost` have no
  caller.
- **10** A public party's name and description cannot be reported, and a closed party can be scheduled again.
- **11** A reply in a game thread tells only the thread's author, in English whatever their language, ignoring
  blocks; a comment on a song tells nobody.
- **12** `ConversationPref.pinned` and `listConversationPrefs` have no caller.
- **13** `getSupporterBadgeMap` has no caller.
- **14** A jam cannot be edited at all after creation; `setJamThemeCandidatesApi` has no caller.
- **15** No developer API scope reaches RMH Homes.
- **16** `isSelfExcluded` and the hiding `hidesRiskSurfaces` describes have no consumer; more than a dozen UI files link a coin
  surface.
- **17** `comment` is checked in two writers, `message` in no hub, `/api/v1` posts and replies check nothing, and
  queued posts publish through a timeout.
- **18** Sprint 13's recorded erasure blind spot (plain member columns).
- **19** Sprint 13's integration found three runtime bugs green fakes had pinned.
- **20** Seven recorded sprint 13 items.

## Rejected ideas

| Idea | Why not |
| ---- | ------- |
| Your RMHType races (beside 03) | Checked: `RmhTypeMatchPlayer` is read by `lib/rmhtype/progress.server.ts` and `lib/rmhtype/challenges.server.ts` (progress over time, challenges); a race history would be a fourth RMHType feature in four sprints. |
| Cloud saves for Cursed Logic (beside 02) | Its local save is an unfinished run with the RNG state; moving it to the account invites save-scumming across devices for little gain. |
| Dream Rift high scores on the account | `DreamRiftPlayer` already holds the board's high scores; only a per-character local best is local. |
| A birthday line on the profile (`isBirthdayToday` has no caller) | Checked: the profile already shows `birthdayToday` from its own read. |
| A report type for TF2 HUDs and Versecraft seed listings (beside 08) | Real but separate surfaces; one report feature per wave keeps the report files clean. Recorded as a follow-up. |
| Kowloon Knockout records or assists | The fight runs client-side with no server result to trust, and its online versus would make a speed assist unfair. |
| An `IMPERSONATION` report reason (beside 09) | J2 chose the entity type as the category to avoid an enum change on `ContentReport`; nothing gains from changing that now. |
| Daily puzzle archive beyond 14 days | Checked: the puzzle read allows 60 days back and the hub shows 14; not a gap. |
| Announcement polls (`FeedAnnouncementPoll*`) | Nothing writes `FeedAnnouncement` any more; these are leftovers of a removed feature, not a half-built one. |
| Keyword alert hits as a history | `KeywordAlertHit` is a dedupe ledger by design (its comment), not a history; the inbox is the history. |
| A per-chart Slice It board | Recorded in sprint 13; still a design of its own. |
| Med Schools features | Under active development on `main`; a parallel sprint feature would collide with the owner's own work. |
| Flashcards, RMH Music, RMHType, RMHLadder, Homes UI | Saturated by sprints 10–13; 15 adds Homes to the developer API only, with no UI. |

### Corrections from the design pass's own validation (2026-11-25)

Recorded in [`plan.md`](plan.md) §Validation. While checking, the design pass changed: 01's content loader (RMHBox
loads bundled data through a per-game `data-loader.ts`, not the pack loader) and its text filter (none exists in
RMHBox); 09's scope (from a new report reason to the missing profile menu and the unwired J2 endpoint, after finding both
built halves); 13's switch (a `UserProfile` column; the creator section has no JSON settings); 15's writes (through the
site's `favorite`, `setFavoriteNote` and `setPriceAlerts`); 16's notice component location; 18's table
(`ChatMessageEdit` carries no member column); 20's namespaces and the thread field (`threadParentId`).

### Corrections from the independent validation (2026-11-25, second pass)

A separate validator re-checked every feature, brief and the wave plan against the worktree (`54c958522`'s tree,
identical to sprint 13 on `main`) by grep and, where a claim was about runtime behaviour, by running it. Every
"nothing reads it" claim was re-verified: `SSMatch` / `SSPlayerMatch` (written only in
`features/synapse-storm/server/handlers.ts`), `AltairCoopProfile` (written only in `verify/persist.server.ts`),
`ConversationPref.pinned` and `listConversationPrefs` (the `PUT` accepts `pinned`, no screen sends it, no caller of
the list read), `getSupporterBadgeMap` and `isSupporterOf`, `isSelfExcluded` and `hidesRiskSurfaces`, the J2
impersonation endpoint (no client), `accountsClaimingHost`, `setJamThemeCandidatesApi`, and the empty heatmap and
mislinked "Full XP Breakdown" all hold. Two did not, and are corrected below (05, 11). No feature was found to be bloat
or a duplicate, so none was dropped or replaced; 18 and 19 were judged worth keeping (18 erases real personal data the
coverage test cannot see — a security report's e-mail, chat-removal marks — and 19 is a few hundred lines of checker
whose rules every later brief relies on, and whose original design would not have worked, below). No feature was
renumbered and no wave slot moved.

- **02** The save `POST` is last-writer-wins, so a second device that opened the town earlier would silently overwrite
  newer progress on its next autosave; added an optional compare-and-set (`expectedUpdatedAt`, `409`) to
  `lib/game-saves/api/game-saves.$gameId.server.ts` (absent: today's behaviour, so the other games are unchanged), a
  test of its four cases, and an acceptance criterion. `jsonTransport`'s `keepalive` write and `sendBeacon` both cap a
  body at 64 KB (its own comment), which a gzipped town can pass: periodic uploads use a plain `fetch`, the `pagehide`
  beacon is sent only at 60,000 bytes or less, and the shared transport is not reused for the town.
- **03** Paging on (`finishedAt`, `id`) with "Left early" rows (null `finishedAt`) cannot work, and ordering by
  `SSMatch.endAt` cannot use an index on the member's rows: the order, cursor and index are now on the required
  `lastUpdateAt` (`@@index([userId, lastUpdateAt(sort: Desc)])`, `ss_player_match_userId_lastUpdateAt_idx`; `plan.md`
  updated). `matches.server.ts` moves from `features/synapse-storm/server/` (the hub's socket handlers) to `engine/`.
  The "island, so no React Query (islands test)" premise was wrong — the game has no `island.tsx` and the islands test
  does not cover it; the no-React-Query rule is kept as the game's existing practice. The `_ensure_valid` model's
  name is `20261220010102_…`.
- **04** "Banned or pending-deletion members are excluded the way `AltairPlayer` boards exclude them": the existing
  boards exclude opt-outs and current bans (`leaderboardHiddenUserIds`) and nothing for pending deletion; the board
  now names that set and `userNotHiddenWhere` (the required-column form; `notHiddenWhere`'s `userId: null` branch is
  wrong for `AltairCoopProfile`). `coopRecord` is only on `kind=coop` without a cursor.
- **05** "Nothing reads the ledger" is narrowed: the decay job's idempotency subquery (`notDecayedThisWeek`) reads it.
  Doctrine has no `island.tsx` and its hooks use React Query, so the "no React Query if the island test forbids it"
  hedge is replaced with React Query hooks beside `useDoctrineReputation`.
- **06** "Delete the row and generate again" leaves a gap in which a visitor's or the prewarm's
  `getOrCreateDailyPuzzle` writes a different puzzle, and the slow model call could straddle midnight: the replace now
  generates first (exporting `generateForMode`), then in one transaction under `lockKey` re-checks the window (the
  next two days), a 10-minute margin, no scores and that the row is the one the admin saw, and updates it in place;
  new refusal `PUZZLE_CHANGED`. Rate limits named for the report and admin endpoints (none were).
- **09** `accountsClaimingHost` orders `verifiedAt: 'desc'`, which puts unverified (null) claims first in Postgres:
  fixed to `nulls: 'last'`. Adding `'impersonation'` to `REPORT_ENTITY_TYPES` would let the generic report route
  accept it (its schema is `z.enum(REPORT_ENTITY_TYPES)`) without J2's structured header: the generic route now
  refuses it. The three existing refusal reasons are mapped to the two codes explicitly.
- **10** Live rooms carry names too (`createRoom` → `persistRoomCreate`), so the 30-day removed-name rule also
  applies in the hub's `createRoom`, and `restoreRoomsFromDb` (not only `loadRoomFromDb`) skips moderated rooms; a
  second concurrent takedown sends no second set of notices.
- **11** "No notification of any kind is created for a reply" was wrong: `createPost` calls `notifyHubReply`
  (`lib/cards/notify.server.ts`), which tells the thread's author with a hard-coded English preview and no block or
  mute check. The feature now replaces it (one row per recipient, same `entityType` so `dedupeUnread` merges old
  unread rows) instead of adding a second notice; the brief names the file and its tests.
- **12** The conversation header has no menu (the pin control sits beside `MuteConversationControl`); the paging rule
  is stated exactly (`notIn` pinned ids on every page of the default view; folder and Unread unchanged); a pin needs
  membership of the DM; a `GET` never writes; the concurrency test pins between pages.
- **13** The reply `GET` must stay uncached now that the author's view differs; stated, with what the mark does and
  does not reveal (the creator already sees supporters in Creator Studio).
- **14** Concurrent admin saves serialise on `lockKey(tx, 'game-jam:<id>')`; a voting jam's theme is never editable;
  the vote-open time only before the vote opens.
- **15** The default-grant test also covers `WILDCARD_SCOPES` (the key manager's "Select all") and `DEFAULT_SCOPES`;
  `favorite` has no block check or cap, so the v1 module adds the block check and no cap is invented.
- **16** Seven linkers the design missed: the Compete hub's Wagers tab (`compete.tsx`, `WagersSection.tsx`; `/wager`
  redirects there), the profile header's coin link, the wallet's "Play & predict", the elections hero and markets
  panel, and the casino table invite. The Wagers tab is decided on the server like the two pages.
- **17** `publishScheduledPost` checks no `post` timeout, and it is the path of the due-post pass, `/api/v1`'s
  scheduled publish, recurring posts, read-alongs and capsules: it now does, leaving the draft for a later pass as its
  community gate already does. 01's Identity Crisis `ask` text is a `message` surface and is gated in the hub.
- **18** The design's column scan had no `createdById` or follow columns and missed nine models: `FollowEvent`
  (already handled by `deleteFollowEventsFor`) and eight with a plain `createdById` (`CommunityChallenge`,
  `CommunityCensus`, `ModMacro`, `TargetedNotice`, `CommunityGoal`, `EventOccurrenceOverride`, `CanvasEvent`,
  `StudioChallenge`), now in the table with a `deidentify` default; the parser's floor is 37 models.
- **19** `Prisma.dmmf` at run time (Prisma 7, checked in the worktree) carries no `isRequired` or `isList` (only
  `name`, `kind`, `type`, `relationName`), so a checker built from it cannot apply the null rules it exists for. The
  model map is now parsed from `prisma/schema/**` (as the erasure coverage test does) and cross-checked against
  `Prisma.dmmf` by name.
- **01** The early-guess timing rule was ambiguous ("any turn but one's own vote"); restated.
- **Wave plan:** no slot changes. The new file edits were checked against each wave: 02's save route, 09's
  `links.server.ts`, 11's `lib/cards/notify.server.ts`, 16's seven linkers and 17's scheduled publisher are each
  touched by one feature in their wave; 16 (w6) touches `ProfileHero.tsx` after 09 (w3), and 17 (w6) touches 01's
  handler (w1), both after the earlier feature merged. `plan.md`'s shared-files table, risks and integration smoke
  list are updated to match.

## Follow-ups this design records for the owner

- **TF2 HUDs and Versecraft seed listings** have public member-written names and no report path.
- **Thread replies under a creator's post** (beside 13): supporter marks cover direct replies only.
- **`AltairCoopProfile.favoriteClassId`** is unused after 04 and could be dropped.
- **Telling reporters a puzzle was fixed** (beside 06) and **notifying jam entrants of an edit** (beside 14).

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at the end of the sprint, measured as
`plan.md` §Reporting describes, together with the `serverError` ratchet's value (it must not rise above 17), the
follow-ups 20 closed, and any found already closed.
