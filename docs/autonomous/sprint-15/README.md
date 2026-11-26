# Sprint 15 — Shelves members fill, games that keep their word, and the doors back from a removal

Twenty features. Several give public shelves members fill the safety path every other member-made item has: the TF2
workshop's HUDs and loadouts and Versecraft's shared stories (04, which also lets a story's author take it down —
nothing could), a prediction market's discussion, which showed blocked and banned members to everyone and could be
neither deleted from nor reported (05), and a profile's guestbook and an announcement's discussion (06). Then a removal
stops being silent and final: the author of an item a report took down is told what went, and can ask for a second
look that an admin can grant, in the Account status section every "See Settings, Account status" link already lands on
(16). Several give under-served games and apps what their members reach for next: Human
Keyboard, the last RMHBox stub that needs no physics (01), and packs for it and for Identity Crisis, behind an
auto-hide that three new accounts can no longer trigger (17); The House Always Wins and Nightrail on every device (02);
class resources and a short rest that spends Hit Dice in RMHCharacters (11); saved graphs and graph links in
RMHCalculator, whose every plot was a model call lost on reload (08); a head-to-head record in Synapse Storm (15); and
Dream Rift co-op runs the hub vouches for, on a board that applied no privacy and froze every member's name and avatar
into its rows (09). Some finish halves already built: two Slice It developer API routes no catalogue, SDK or doc
listed, and the "public player stats" its scope promised (03); notifications in the developer API with their notice
keys, a fixed page cursor and a way to mark them read (10); mentions in game discussions (12); a tournament's prizes,
written on every settlement and shown nowhere, and a member's own tournaments (14); a puzzle report that now ends in a
reviewed outcome, and jam entrants told when a deadline moves (07); member theme suggestions for jams, and a way to
delete one (13). Three are hardening from the follow-up lists: what sprint 14's integration found — daily puzzles that
crashed on a score with no saved result, handles that read backwards in Arabic in 37 places, and a phone header whose
tab order did not match its look (19) — and the sprint 13 (18) and sprint 14 (20) items that need no product call.
Each was checked against the sprint 14 tip (`23176a429`, the squashed sprint 14 commit in review for `main`) so it
repeats nothing that exists. Specifications are in [`features/`](features/), the build order in [`plan.md`](plan.md),
implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`, `docs/plans/2026-11-11-steel-design-implementation.md`)
on the site tier (05, 06, 07's admin page and inbox, 13, 14, 16, 19's handles and header, 02's settings row, the queue
and Your reports halves of 04) and the app tier's own look (L8) in RMHBox (01, 17's lobby settings), The House Always
Wins and Nightrail (02), the TF2 workshop and Versecraft (04), RMHCalculator (08, which uses the site theme), Dream Rift
(09), RMHCharacters (11), the games library (12), Synapse Storm (15), the daily desk (07, 19) and Altair (20). None
resolves a section-18 open decision (D1, D3, D6, D7, D8, D10, D12) or an open owner decision (moderator notes in the
data export, the deletion grace period, unlisted tournament or listing meta, Apache `CF-Connecting-IP` stripping,
blocked members RSVPing to a blocker's events, RMHBox per-minigame history privacy, ownership transfer in the public
mod log, emoji reactions under quiet counts, recovery codes and trusted contacts having no product, a deleted member's
follows, game reviews, guides, jam entries and public decks, uploading Studio samples, how long `RebarReservation`
bookings are kept, a public setting for the RMHTube profile card, purchased cosmetics and season passes at erasure,
refunds when an account is deleted, retiring one of the two news-story follows). Where a feature meets one, its
specification says which default it keeps: 05 and 06 leave prediction comments, guestbook entries and announcement
comments `keep` at erasure as they are; 14 shows a self-excluded member their own tournament history (a record, not a
stake); 16 restores only what a moderator's stamp hid and never publishes on the owner's behalf.

The erasure registry is at four `todo` entries, each needing a product call; `TODO_CEILING` stays 4. Every new table is
classified by the feature that adds it (08, 13, 16); 09 and 20 erase personal data held in JSON and plain columns the
coverage test cannot see, under their own anchors and tests.

### Decisions taken by default (design pass, 2026-11-25)

The owner's standing rule is to take the most reasonable decision and record it. The design pass took these:

- **01** the spec's scoring and team multiplier kept; letters dealt to everyone (unused ones included); the table sees
  how many letters each player holds, not which; a dropped player's letters re-dealt after 5 s; no on-screen QWERTY.
- **02** one shared-table row per game (the House's classic and NG+ runs in one); the zustand keys never renamed;
  Nightrail merges by union and never asks; "New run" clears the account copy after a confirm.
- **03** the two routes catalogued as they behave (offset paging kept); `read:slice-it-runs` explicit; a registry guard
  test over every v1 route file; hidden and banned players are 404.
- **04** three types, `moderatedAt` on each; private items not reportable; blobs never deleted; a moderated story cannot
  be deleted by its author but stops counting toward the cap; blocks and bans filter the three lists.
- **05** comments deleted (not hidden) by their author, an admin or a takedown; keyset paging of 20 replaces the fixed 50.
- **06** a guestbook entry is deleted by a takedown (the owner's hide is separate); an announcement comment is
  soft-deleted; the guestbook's two refusals become codes.
- **07** a puzzle review is a judgement (`fault` or `stands`), never a rescore; jam notices only for deadline changes
  after the start, at most 500 a save.
- **08** saved graphs store the validated result; links carry the functions, not the points, so they need no report
  path; notebooks move onto contracts.
- **09** the hub creates the run at start; the post finishes it conditionally; names resolved live; old rows' account
  snapshots ignored; unfinished runs pruned after 24 h.
- **10** `key` and `params` additive; the old cursor still accepted; `write:notifications` explicit; one shared
  mark-read.
- **11** uses stored by resource name; dice-valued resources not tracked; unknown recharge text treated as long-rest-all
  and caught by a test; PF2e unchanged.
- **12** at most five mentions told per post; a mentioned reply recipient gets only the mention; mentions linked at
  display time, never stored as markup.
- **13** suggestions visible to the suggester and admins only (so no report path); three per member per jam; the
  `comment` timeout applies; a jam is deletable only before its start with no entries.
- **14** "Yours" lists entered and hosted tournaments; the prize column and pool on finished pages; no new index.
- **15** rivals are named accounts only; matches count only when both finished; no account id leaves the server (a row
  key resolved server-side instead).
- **16** reversible types only (the `moderatedAt` takedowns, listed exactly); one request per removal within 14 days;
  the removals list joins the Account status section of `/settings/security` (validation: no new page).
- **17** identity packs with optional aliases; sentence packs normalised; a reporter counts toward the auto-hide only
  after 7 days with a verified e-mail or a linked provider, and never while banned.
- **18** six sprint 13 items; S13-12's follows, S13-14's rounding and S13-18's Stripe items left (each needs a call).
- **19** results parsed per mode; a `Handle` primitive and a ratchet; the chat settings join the header's controls row.
- **20** four sprint 14 items; S14-13 and the `favoriteClassId` drop left (a product call, and a destructive migration).

## Features

| #   | Feature | Surface | Wave | Schema |
| --- | ------- | ------- | ---- | ------ |
| 01  | [Human Keyboard, a new RMHBox minigame](features/01-human-keyboard.md) | RMHBox picker, rounds, history | 1 | no |
| 02  | [Your House Always Wins game, and your Nightrail lines, on every device](features/02-haw-saves.md) | The House's menu, Nightrail, Settings > Cloud saves | 2 | no |
| 03  | [Slice It in the developer API](features/03-slice-api.md) | `/api/v1/slice-it/*`, `/api/v1/me/slice-it/runs` | 2 | no |
| 04  | [Report a TF2 HUD, a TF2 loadout or a Versecraft story](features/04-workshop-reports.md) | TF2 workshop, Versecraft gallery, the queue | 1 | yes |
| 05  | [Prediction comments that respect blocks, and that you can delete or report](features/05-prediction-comments.md) | A market's discussion, the queue | 2 | no |
| 06  | [Report a guestbook entry or an announcement comment](features/06-member-text-reports.md) | Profiles, announcements, the queue | 3 | no |
| 07  | [Hear back when a puzzle you reported is reviewed, and when a jam moves its deadlines](features/07-fix-notices.md) | `/admin/daily-puzzles`, inbox | 5 | yes |
| 08  | [Keep your RMHCalculator graphs, and send one as a link](features/08-calc-graphs.md) | RMHCalculator Graphing | 4 | yes |
| 09  | [Dream Rift co-op runs the hub vouches for](features/09-dream-rift-coop.md) | Dream Rift co-op board, "Your co-op runs" | 4 | yes |
| 10  | [Notifications in the developer API that you can mark read](features/10-notifications-api.md) | `/api/v1/me/notifications*` | 5 | no |
| 11  | [Track class resources, and take a short rest that spends Hit Dice](features/11-character-resources.md) | RMHCharacters 5e sheet | 3 | no |
| 12  | [Mention someone in a game discussion](features/12-thread-mentions.md) | Games library threads, inbox | 5 | no |
| 13  | [Suggest a theme for a game jam, and delete a jam that has not started](features/13-jam-suggestions.md) | `/jams/$slug` | 6 | yes |
| 14  | [Your tournaments, and what each place won](features/14-tournament-prizes.md) | Compete > Tournaments, `/tournaments/$id` | 6 | no |
| 15  | [Your head-to-head record in Synapse Storm](features/15-synapse-rivals.md) | Synapse Storm "Your matches" | 3 | no |
| 16  | [Hear when a report takes something of yours down, and ask for a second look](features/16-removal-appeals.md) | Inbox, `/settings/security#account-status`, `/admin/appeals` | 4 | yes |
| 17  | [Community packs for Identity Crisis and Human Keyboard, and a trusted auto-hide](features/17-more-packs.md) | `/rmhbox-packs`, RMHBox lobby | 6 | no |
| 18  | [Close the gaps sprint 13 left open](features/18-s13-gaps.md) | RMHTube hub, `/calendar`, Rideshare, messages, `/api/v1` | 7 | no |
| 19  | [Fix what sprint 14's integration found](features/19-integration-finds.md) | Daily desk, every handle, the conversation header | 1 | no |
| 20  | [Close the gaps sprint 14 left open](features/20-s14-gaps.md) | Identity Crisis, open tabs, erasure, Altair boards | 7 | index |

### Why each one

- **01** Five RMHBox minigames are still stubs; Human Keyboard is the only one whose every input is a discrete key the
  server can judge, and its design spec is complete.
- **02** The House is a 20–90 minute game whose run lives in one browser; Nightrail's lines too.
- **03** `GET /api/v1/slice-it/charts` and `/leaderboard` are served and in no catalogue, SDK or doc; the scope promises
  player stats nothing serves.
- **04** Sprint 14's recorded follow-up; a Versecraft author also cannot unpublish, and the cap fills for good.
- **05** `listComments` shows blocked and banned authors; comments can be neither deleted nor reported.
- **06** The guestbook and announcement comments are the site tier's two public member texts with no report path.
- **07** A report about a played puzzle can never lead anywhere; a jam's deadline can move after the start in silence.
- **08** Every graph is a model call lost on reload.
- **09** A host can put any account on the co-op board; the board ignores privacy and erasure leaves names behind.
- **10** The v1 list skips rows at equal times, returns English only and cannot mark anything read.
- **11** Class resources show a maximum and nothing else; Short Rest spends no Hit Dice.
- **12** `@handle` in a game discussion is plain text.
- **13** Members cannot propose a theme; a jam cannot be deleted at all.
- **14** `TournamentPayout` is written on every settlement and read by nothing on the site.
- **15** Sprint 14's "Your matches" left head-to-head out; the rows are all there.
- **16** A report takedown is silent unless a moderator types a message, cannot be contested, and leaves its author no
  record of what went.
- **17** `PACK_GAMES` is Wit War only; three sock accounts can hide any pack (sprint 13's follow-up).
- **18** Six recorded sprint 13 items.
- **19** Three defects sprint 14's integration recorded.
- **20** Four recorded sprint 14 items and one design follow-up.

## Rejected ideas

| Idea | Why not |
| ---- | ------- |
| Private accounts with follow requests | No `FollowRequest` model exists; it changes who may read every post, profile and list, a read-path change across the whole site, too large for one feature and a product call. |
| Report a Slice It chart review (beside 06) | `ChartReview` is keyed by (`chartId`, `userId`) and the report path keys on one id; worth its own design. Recorded. |
| Versecraft endings (`unlockedEndings: [] // TODO`) | The twelve endings belong to the hand-written story; the generated stories have no ending that maps to them. A product call. |
| Signal Forge run history | Scores already go through the shared pipeline with personal-best history (sprint 05 04); a run table would duplicate it. |
| An RMHLadder sources page for admins (`LadderSourceError` looked unread) | Checked: `/rmhladder/health` and `/rmhladder/review` already show the runs, errors and review tasks. |
| Comment view counts (`RMHarkCommentView`) | Written for deduped impressions; showing them would add a quiet-count surface for little value. |
| Supporter marks on "thread replies" (S14-13) | The comment tree and the lazy reply feed are already marked at every depth; the remaining surface is a product call (20 says so). |
| Dropping `AltairCoopProfile.favoriteClassId` | A destructive migration, which the additive check forbids. |
| Cloud saves for Velum 2099, Portal, Half-Life 2 | Velum's story save is in the `@ts-nocheck` game folder; Portal and Half-Life 2 are engine-project code (`tsconfig.engine.json`); each is a design of its own. |
| A public gallery of RMHCalculator graphs | Would add member content with a report path for little value; links cover sharing. |
| Med Schools features | Under active development on `main` by the owner. |
| RMHType, RMHStudy flashcards, RMH Music, RMHLadder, Homes UI, Studio | Saturated by sprints 10–14. |

### Corrections from the design pass's own validation (2026-11-25)

While checking each claim against the tree, the design pass changed: 03's performance note (the `SliceRun` index on
(`userId`, `createdAt` desc) exists, so no index is needed) and its explorer test path
(`lib/developer/__tests__/explorer.product.test.ts`); 09's migration (the index on an existing table became a
`CONCURRENTLY` pair, and the table has no `@@map`, so the SQL names `"DreamRiftCoopRun"` and the default index name
`DreamRiftCoopRun_memberIds_idx`); 12's deletion column (`deletionScheduledAt`); 13's namespace (`jam-themes` is
sprint 07's, so `jam-suggestions`); 14's settle function (`maybeCompleteTournament`) and the missing `createdById`
index (reported, not added); 15's rival link (the match list sends no account ids, so a server-resolved row key);
17's trust gate (`emailVerified` is optional, so only `true` counts) and the report function's name
(`filePackReport`); 19's snapshot test (`ConversationView.characterization.test.tsx`); 20's own-place test location and
the board's UI file (`MenuScreen.tsx`); the S12-01 (party bans and blocks) and S12-20 (mod log paging) items were
found already fixed and were taken out of 18; 07 and 16 swapped waves so `prisma/schema/games.prisma` is edited by one
feature per wave.

### Corrections from the independent spec validation (2026-11-25)

A second, independent pass checked every feature's claims, paths, gates and risks against the design worktree's tree
(`ec339dd28`, the same tree as `main`'s sprint 14 merge `9b7ff68fd`; `origin/main` has since gained only an unrelated
on-call change, recorded in `plan.md`). Every "nothing does it" claim in the task list was re-grepped: 03 (the two Slice
It routes are the only v1 route files with no `ENDPOINTS` entry), 04 (`versecraft.seeds.server.ts` has `GET` and `POST`
only), 05 (`listComments` has no hidden-author filter), 09 (the host's body chooses every `userId`; no board privacy),
10 (`createdAt < cursor` alone), 13 (no jam delete), 14 (no site reader of `TournamentPayout`), 17 (`PACK_GAMES` is
`['wit-war']`) and 19 (37 `>@{` prints in 32 files) hold. One did not, and several requirements were tightened:

- **16 — the "missing page" was a redirect.** `/settings/account-status` is a `LEGACY_REDIRECTS` entry
  (`lib/route/legacy-redirects.ts`, the 2026-11-19 consolidation) to `/settings/security#account-status`, the
  section `AccountStandingPanel` renders; every link works. A new route there would be shadowed by the root's redirect
  and would undo a deliberate consolidation, so 16 adds **no page**: `RemovalsPanel` renders in that section after
  `AccountStandingPanel`. Dropped with it: the `lib/sitemap.ts` Wave 0 anchor, the settings-nav edit, the OG and sitemap
  gotchas, and "16 adds a page" in the route-tree steps (03 and 10's v1 route files are what change the tree). The
  feature keeps its full value (notices, records, a second look, the admin tab). Also tightened: the exact
  `REVERSIBLE_REMOVAL_TYPES` list (not `tube-room` or the hiding types), the conditional request, what the author sees
  (never the report id, reason, count, reporter or moderator; a render test), and how a restore treats each type's
  visibility switch.
- **04** — the HUD and loadout takedowns also set `visibility: 'PRIVATE'` (as `moderateDeck` sets `isPublic: false`), so
  16's restore cannot republish; the brief now states the engine-project boundary (`lib/tf2-hud/**`,
  `lib/tf2-loadout/**` are `tsconfig.engine.json`: no site imports, `*.server.test.ts` naming, the engine suites run
  with `vitest.tf2.config.ts`) and the static-before-param routing of `seeds/$id` beside `seeds/rate` and `seeds/fork`.
- **02** — the kit cannot do what the spec assumed: `jsonTransport` sends no `expectedUpdatedAt` and treats `409` as a
  failure, and `createCloudSave` has one `localKey` while the House's run is three keys. 02 now adds a compare-and-set
  transport (`lib/game-saves/cas-transport.ts`, the Hearthworks model: `409` stops uploads and the next menu asks,
  the beacon carries the stamp), composes and splits the House's three keys itself (written back only after the whole
  payload parsed), checks the 500 KB and 64 KB caps, and tests first-sign-in upload with `expectedUpdatedAt: null`. The
  NG+ meta key is `haw-meta-v1`, and the run's keys `haw-save-v2` and `haw-ngplus-v1` were never in the device-data
  registry: 02 adds them.
- **08, 09** — the ratchet claims were wrong: neither fetch ratchet counts `toolsApi(...)` (08) or a `fetch(url)` with a
  variable URL (09), so neither falls; both can **rise** if an `api(xxxApi` call lands in a `.tsx` beside a `useEffect`.
  08 loads through React Query; 09 (an island, no React Query) loads the co-op board from click handlers, as Synapse
  Storm's `YourMatches.tsx` does. 09 also takes the roster's accounts from `socket.data.userId` only, and the board
  lists only finished hub runs and pre-feature rows (a started, unposted run never ranks). The contract that gains
  `runId` is the existing `submitDreamRiftCoopApi`.
- **10** — the shared functions are named: `setRead` and `markAllRead` (`lib/notifications/inbox.server.ts`; the latter
  gains an optional `before`), and the count is `getUnreadNotificationCount`, which the badge uses uncapped (the
  "capped at 999, the badge's rule" claim had no basis).
- **07** — a report filed on an already reviewed day is stored reviewed (no reopened day, no second notice); notices
  carry no answer and the jam notice never the theme (`GameJam.theme` is "never sent before startsAt").
- **12** — spam cap: one unread mention notice per member per thread (`dedupeUnread` on the thread), on top of five per
  post.
- **13** — "On the shortlist" is shown to a suggester (and exported) only once the vote has opened, so no member learns
  the shortlist, and through it the secret theme, early; the delete is one conditional `deleteMany` under the lock
  (every `GameJam` relation cascades, checked).
- **14** — read-only stated and tested: no write to payouts, placements or coins.
- **15** — members hidden from boards are not listed as rivals (a named win-loss record is a ranking).
- **17** — the trust gate must not let a reporter be singled out: the owner's view and the reporter's own answer are the
  same whether or not a report counted; the queue shows an aggregate "Counted toward the auto-hide: N of M" only.
- **20** — the `BroadcastChannel` is opened in the hook's effect while signed in and closed on unmount and sign-out,
  with no timer or poll (not a decorative listener, B3/R5).
- **01** — rest stated exactly: no rAF loop or `setInterval`; one `setTimeout` a second only while TYPING is live.
- **06** — the comments GET is already `private, no-store`; the NFR now pins it instead of asking.
- **Every brief** — `lib/account/__tests__/erasure-plain-columns.test.ts` (sprint 14's `PLAIN_MEMBER_COLUMNS` gate) joins
  the gate list beside erasure coverage, and the plan's per-feature checks name it; `docs/_generated/facts.json` no longer
  exists (the facts are the git-ignored `docs/_generated/facts/`), so the briefs and plan say that.
- **Plan** — a ratchet `BASELINE` moved by two features of one wave is re-counted at integration (none is planned to);
  the reporting line no longer says 08 and 09 lower ratchets.
- **Kept as they are, after checking:** 18 (six items, each its own commit and test) and 20 (four items and the co-op
  own place) are each a coherent hardening pass with real tests; 19 (a pure result parser for six boards, a `Handle`
  primitive swept through 32 files with a ratchet, and the header order) is adequately sized. No feature was found to
  be bloat or a duplicate, so none was replaced and the numbering and wave plan are unchanged. Within each wave the only
  shared non-anchored file is the alphabetical erasure registry in wave 4 (three hunks hundreds of lines apart, as the
  plan says).

## Follow-ups this design records for the owner

- **Chart reviews** have no report path (a composite key; beside 06).
- **`Tournament.createdById`** has no index; 14's hosted list filters it on a small table.
- **Versecraft's endings** progress screen counts endings no generated story can reach.
- **Headless Chromium and `navigator.setAppBadge`** (sprint 14's browser pass) remain a harness workaround.

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at the end of the sprint, measured as
`plan.md` §Reporting describes, together with the `serverError` ratchet's value (it must not rise above 17), the
raw-fetch and escape-hatch ratchets' values, the follow-ups 18, 19 and 20 closed, and any found already closed.
