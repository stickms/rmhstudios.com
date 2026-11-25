# Sprint 13 — Halves that never met, in the games and apps the last sprints passed by

Twenty features. Most finish something the code already started and nobody can use: a Slice It chart picker whose pick
is never played and a miss heatmap nothing writes (04), a friend-activity read for the games library with no endpoint
(05), Altair runs the server verifies and no screen lists (03), an RMHTube subscribe toggle no button calls (07), a
"lists you're on" query nobody calls (11), a news story index the code can build and never shows (12), a season standing
`getStanding` computes for nobody (13), a prediction quote no card shows and no way to sell (14). Several give an
under-served app or game what its members reach for next: a new RMHBox minigame (01, Sequence Sam, one of the seven
stubs), the site's game assists in Vega (02), jobs found elsewhere in RMHLadder (08) and the job search on the member's
calendar (09) and in the developer API (10), and a push when someone sends a direct message (20). Five close safety
holes: an RMHTube chat message, a direct message, a rideshare trip and an RMHBox pack can finally be reported to a
moderator who reads them (06, 17, 15, 16), and rideshare matching and chat honour blocks (15). Two are hardening from the
follow-up lists: a billing stop that cannot lose a subscription (18, sprint 12 18's three follow-ups) and four small gaps
sprint 12 recorded (19). Each was checked against the sprint 12 tip (`e5e8bb911`, the squashed sprint 12 commit in
review for `main`) so it repeats nothing that exists. Specifications are in [`features/`](features/), the build order
in [`plan.md`](plan.md), implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`, `docs/plans/2026-11-11-steel-design-implementation.md`)
on the site tier (08, 09, 11, 12, 13, 14, 15, 16, 17, 20, the admin and settings halves of 06 and 18, the settings row of
02) and the app tier's own look (L8) in RMHBox (01), Vega (02), Altair (03), Slice It (04), the games library (05) and
RMHTube (06, 07). None resolves a section-18 open decision (D1, D3, D6, D7, D8, D10, D12) or an open owner decision
(moderator notes in the data export, the deletion grace period, unlisted tournament or listing meta, Apache
`CF-Connecting-IP` stripping, blocked members RSVPing to a blocker's events, RMHBox per-minigame history privacy,
ownership transfer in the public mod log, emoji reactions under quiet counts, recovery codes and trusted contacts having
no product, a deleted member's follows, game reviews, guides, jam entries and public decks, uploading Studio samples, how
long `RebarReservation` bookings are kept, a public setting for the RMHTube profile card, purchased cosmetics and season
passes at erasure, refunds when an account is deleted). Where a feature meets one, its specification says which default
it keeps: 07 leaves RMHTube subscriptions `owner` at erasure (a deleted member's follows); 05 shows game reviews as the
profile does and leaves their erasure alone; 18 keeps sprint 12's no-refund default.

The erasure registry is at four `todo` entries, each needing a product call, so this sprint has no erasure feature of
its own: every new table is classified by the feature that adds it, and `TODO_CEILING` stays 4. Two features (06, 17)
erase rows in tables with a plain `userId` column and no `User` relation, which the coverage test cannot see; each adds
its operation and a test, and the coverage test's blind spot is recorded below as a follow-up.

### Decisions taken by default (design pass, 2026-11-25)

The owner's standing rule is to take the most reasonable decision and record it. The design pass took these:

- **01** the server draws and judges the sequence and times the bonus; steps are sent one at a time as they are shown;
  pads have names and shapes; a pad lights by a fill change only.
- **02** Vega honours four of the five settings (not hold to press); an assisted run is unranked through the run claim;
  Signal Forge is not adopted (turn-based, its assists would only change visuals).
- **03** the member's own finished solo runs and co-op matches; only server-verified numbers; teammates' names read now,
  "A player" across a block.
- **04** the picked public chart is played; a chart run never writes the song's board (no chart dimension in its key),
  so the skill rating reads the player's runs instead of the board; misses are sampled one cleared run in ten, checked
  against the chart's note times, shown to the author only.
- **05** followees minus blocks, bans, pending deletions and members hidden from boards (their achievements and badges);
  no polling.
- **06** report type `tube-chat`, reporter must have been in the room; takedown deletes the row and tells the hub over
  Redis; an erased member's chat is deidentified; a 90-day prune keeps each room's newest 200 and anything a pending
  report names.
- **07** a subscription is a follow of a host for parties only; one notice per public party, through a durable fan-out;
  no counts anywhere.
- **08** an own job is a `LadderJob` with `ownerId` (and its own company row); every catalogue reader of jobs and
  companies (the sitemap and the job's OG card included) uses one fragment per model, held by a read-path registry;
  every write that takes a `jobId` refuses another member's own job; links are never fetched; 300 per member.
- **09** opt-in; interviews, follow-ups and deadlines; never notes, contacts, referrals or pay in the feed; the download
  stops writing notes too.
- **10** `read:ladder` and `write:ladder`, both explicit; explicit scopes leave the default grant; offers, pay, resumes
  and contacts stay out.
- **11** public and unlisted lists only; leaving is final for that list (the developer API reports a left member as
  `left`); blocking removes memberships both ways; one refusal sentence for every reason.
- **12** an index of stories with a published article; follow with a notice per newly linked article, through the
  durable fan-out; a per-story RSS.
- **13** the member's own rows; the place is a count with board privacy and decay applied as the ladder does.
- **14** a client quote from the same pure functions (the card gains the market's `q` and `b`), with `minShares` /
  `minProceeds` slippage guards; proceeds round down; a sale decrements the market's `q`, runs under the market's row
  lock with a conditional position decrement and a member-scoped idempotency key checked before any write; selling is
  not gated by responsible play; a new `prediction-sale` faucet.
- **15** blocks (the site's `getBlockedAuthorIds`) filter the available list and refuse accept and chat; a block
  mid-trip closes chat but not the trip, answering as a closed chat; report type `ride`, not removable; refusals in the
  five ride routes get codes.
- **16** pack reports join `ContentReport`; auto-hide stays, under a lock, and stamps `autoHiddenAt`; remove sets
  `moderatedAt`; dismissing the last report of a pack the reports hid restores it (never one an admin hid); old
  reports are copied in.
- **17** report type `dm` filed from the message menu by a conversation member; the moderator sees the message and its
  earlier versions from a new `ChatMessageEdit` table (replacing the Redis store), kept 30 days or while a report waits.
- **18** a Stripe metadata marker written in the same call as the flip, a withdrawal that always reconciles, pagination
  to 1,000, and an hourly reconcile sweep over a done-stamp (the queue's singleton key dedupes); no refunds.
- **19** four items; S11-01 (socket ids in Gabriel's Horn) left as its own refactor.
- **20** a `messages` category (push on, in-app off); no message text in any push; one push per conversation per two
  minutes; a per-conversation mute for direct messages; a `SYSTEM` dispatch (no enum change), and the push-only branch
  learns the tag its hold already used.

## Features

| #   | Feature                                                                                         | Surface                                                   | Wave | Schema |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---- | ------ |
| 01  | [Sequence Sam, a new RMHBox minigame](features/01-sequence-sam.md)                              | RMHBox picker, rounds, history                            | 1    | no     |
| 02  | [Game assists in Vega](features/02-vega-assists.md)                                             | `/vega`, `/settings/game-assists`, the game's page        | 2    | no     |
| 03  | [Your Altair runs, solo and co-op](features/03-altair-runs.md)                                  | Altair menu "Your runs", the export                       | 5    | no     |
| 04  | [Play the chart you pick in Slice It, and see where players miss](features/04-chart-misses.md) | Song details, results, chart editor                       | 3    | no     |
| 05  | [What the people you follow are playing](features/05-games-friends.md)                          | `/games` library home                                     | 6    | no     |
| 06  | [Report a message in an RMHTube room, and the chat a deleted member leaves](features/06-tube-chat-reports.md) | RMHTube chat, admin reports, erasure, a prune | 1 | no |
| 07  | [Subscribe to an RMHTube host and hear about their parties](features/07-tube-subscriptions.md)  | Party page, upcoming list, landing, inbox                 | 4    | no     |
| 08  | [Track a job you found elsewhere in RMHLadder](features/08-ladder-own-jobs.md)                  | `/rmhladder/pipeline`, job detail, the export             | 1    | yes    |
| 09  | [Your job search on your calendar](features/09-ladder-calendar.md)                              | RMHLadder settings, `/calendar`, the private feed         | 3    | yes    |
| 10  | [Your job search in the developer API](features/10-api-ladder.md)                               | `/api/v1/me/ladder/*`, two explicit scopes                | 4    | no     |
| 11  | [The lists you are on](features/11-lists-on.md)                                                 | `/settings/lists`, list writes, blocking                  | 2    | yes    |
| 12  | [News stories you can browse and follow](features/12-news-stories.md)                           | `/news/stories`, story pages, RSS, inbox                  | 5    | yes    |
| 13  | [Your standing in a ranked season](features/13-ranked-standing.md)                              | `/compete` Ranked                                         | 6    | no     |
| 14  | [See the price first, and sell your shares, in Predictions](features/14-prediction-trades.md)  | `/predictions` cards, sell dialog, the export             | 6    | yes    |
| 15  | [Blocks and reports in Rideshare](features/15-rideshare-safety.md)                              | `/rideshare/drive`, `/rideshare/ride`, trip chat, reports | 2    | no     |
| 16  | [RMHBox packs in the report queue](features/16-pack-reports.md)                                 | `/rmhbox-packs`, admin reports, Your reports              | 3    | yes    |
| 17  | [Report a message, and let the moderator see what it said](features/17-dm-reports.md)           | Message menu, admin reports, a prune                      | 4    | yes    |
| 18  | [A billing stop that cannot lose a subscription](features/18-billing-hardening.md)              | Deletion billing jobs, `/admin/deletions`                 | 7    | yes    |
| 19  | [Close the gaps sprint 12 left open](features/19-s12-gaps.md)                                   | Parties, mod logs, suggestions, route announcer           | 7    | no     |
| 20  | [A push when someone messages you, and a mute for each conversation](features/20-message-push.md) | Push, Settings > Notifications, conversation menu      | 5    | no     |

### Why each one

- **01** Seven RMHBox minigames are still stubs; Sequence Sam needs neither physics nor input sync, only per-player
  submissions.
- **02** Vega is a real-time single-player game with a board and no assists (`accessibility: []`).
- **03** `AltairSoloRun` and `AltairMatchPlayer` are written and never listed, and neither is in the export.
- **04** `selectedChartId` is never read, so members' published charts cannot be played; `recordNoteStats` has no
  caller and the editor waits on it in two TODOs.
- **05** `getFriendActivity` has no endpoint and no screen, and it checks no block, ban or board privacy.
- **06** A room message cannot be reported, an erased member's chat keeps their name, and the table is never pruned.
- **07** `RmhTubeSubscription` and its toggle have no button, no list and no notice.
- **08** Every application must point at a scraped job.
- **09** RMHLadder's dates reach a calendar only as a one-off download, with private notes in it.
- **10** No developer API scope reaches RMHLadder, and an explicit read scope would still be a default.
- **11** `listsUserIsOn` has no caller, a member can be re-added after leaving, and blocks leave memberships.
- **12** `listPublicStories` has no caller and no index page exists.
- **13** `getStanding` has no caller; members see a ladder they may not be on.
- **14** `quoteTrade` has no caller and a position can never be sold.
- **15** Rideshare reads no blocks and has no report type; its refusals are English strings.
- **16** `RmhboxPackReport` is written and never read; three reports hide a pack for ever.
- **17** `dm` is a report type nothing files, and edit history lives only in Redis, read by nothing.
- **18** Sprint 12 18's three recorded follow-ups.
- **19** Four recorded bugs: party bans and blocks, mod-log paging, suggestions to a removed deck, announcer residuals.
- **20** A direct message sends no push and no notification of any kind.

## Rejected ideas

| Idea                                                                      | Why not                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Game assists in Signal Forge                                              | Turn-based and already `no-timed-input` and `colorblind-safe`; the shared settings would only change visuals and would unrank runs for no gameplay difference.                                                             |
| A board per Slice It chart (beside 04)                                    | The song board's key has no chart dimension; changing it re-keys every best. 04 keeps chart runs off the board; a per-chart board is a design of its own.                                                                   |
| Versecraft endings (the `unlockedEndings: [] // TODO`)                    | The twelve endings name the old fixed cast; worlds are now generated with their own characters, so the endings need a new design, not wiring.                                                                              |
| The remix graph (`recordRemix`, `RemixEdge`)                              | Nothing forks builds, themes or playlists yet, and the edge exists to route revenue shares (money); lineage without forks is display of nothing.                                                                           |
| RMHLadder source errors for admins                                        | Checked: `/rmhladder/health` already lists each run's source errors (`listRuns` includes them) and admins can disable a company; a per-source page adds little.                                                            |
| Pushes for every group message (beside 20)                                | Group "All" is the default state with no row, so turning it into pushes would notify every member of every busy group; groups keep their mention notices.                                                                 |
| Gabriel's Horn without socket ids in views (S11-01)                       | The socket id is the seat identity throughout the engine and the bots; replacing it is a refactor of the game, not a gap fix.                                                                                              |
| RMHType hub settlement retry (S11-12)                                     | A failed settlement is already finished by the 15-minute job; an immediate retry inside the hub adds a second settling path to race the first.                                                                             |
| Group pools (`createPool`, `listOpenPools`)                               | Retired on purpose (`lib/commerce/pools.server.ts`, 2026-11-19 audit): community goals are the shipped version.                                                                                                            |
| Office hours windows nobody reads                                         | Checked: read through the config's `windows` relation; not a gap.                                                                                                                                                           |
| RMHTube chat history after a restart                                      | Checked: `hydrateRoom` restores the newest 200 from the table; 06 takes the real gaps (reports, erasure, retention).                                                                                                       |
| Med Schools features                                                      | Under active development on `main` (phases A–D in the last week); a parallel sprint feature would collide with the owner's own work.                                                                                       |
| Flashcards, RMH Music, RMHType, Homes                                     | Saturated by sprints 10–12 (nine study, three music, three typing, four homes features); 19 (c) is the one study item, a recorded bug.                                                                                    |

### Corrections from the independent validation pass (2026-11-25)

Every "never called" claim was re-checked by grep against the worktree and holds (`quoteTrade`, `listPublicStories`,
`getStanding`, `getFriendActivity`, `listsUserIsOn`, `recordNoteStats`, `chartHeatmap`, `isRankedChart`,
`readPriorRevisions`, `selectedChartId`, the RMHTube subscribe route). `origin/main` past `e5e8bb911` changes only
Med Schools files, none of which a feature cites. No feature was dropped or replaced: each closes a verified gap and
none duplicates shipped work. What changed:

- **04** The skill rating is built from `SongLeaderboard` rows (`collectContributions`), so keeping chart runs off the
  board would have stopped ranked charts from ever counting; the rating now reads `SliceRun`, and a chart run's "new
  best" is decided from `SliceRun`. Misses are recorded for cleared runs only, with every note as an attempt.
- **08** Five more catalogue readers that would have leaked an own job or company: the sitemap, the job's OG card, the
  two company lists and the interview reports; the source scan now covers `ladderCompany`; writes that take a `jobId`
  get one guard.
- **12** The follower notices use the durable fan-out (the plan's own rule), not an in-request loop; a jobs anchor is
  added for it.
- **13** The ladder applies decay on read, so the place cannot be one SQL count: a bounded candidate read (decay only
  lowers) with an honest cap; one acceptance criterion's arithmetic fixed.
- **14** The card holds no market state (`yesPercent` only), so `SerializedMarket` gains `q` and `b`; a sale must
  decrement the market's `q` (missing, it would pay twice for the same shares), check its idempotency key before any
  write, scope the key to the member and decrement the position conditionally.
- **15** Reuses `getBlockedAuthorIds` instead of a new block reader; a blocked chat answers as a closed one; the fifth
  ride route (`…sync`) is included.
- **16** A dismissal would have restored a pack an admin hid by hand; `autoHiddenAt` tells the two apart, and the
  report's count and hide run under a lock.
- **18** The crash case could never reach a resume (an empty hold is deleted and an empty id list is skipped); restore
  now always reconciles, the marker rides in the flip's own call, and the sweep uses a done-stamp with the queue's
  singleton key instead of a compare-and-set that would have marked failures as synced.
- **20** `pushTitleFor` keys on `NotificationType`, which has no message value; the push is a `SYSTEM` dispatch, and
  the push-only branch gains the tag. The away auto-reply sends no push.
- **01, 02, 06, 10, 11** precision: Sequence Sam's pace and bonus formula and its icon map; Vega's speed floor as a
  multiplier and which columns stay off the board; 06's prune keeps reported messages; 10 joins 08's owner registry
  and pins the default grant; 11's API reason `left`, with a changelog anchor.

## Follow-ups this design records for the owner

- **Erasure coverage cannot see plain `userId` columns.** `RmhTubeChatMessage` (06) and the new `ChatMessageEdit` (17)
  hold member data without a `User` relation; the coverage test walks relations only. A scan of `userId`-named columns
  without a relation would find the rest; it is a gate of its own.
- **A board per Slice It chart** (beside 04).
- **Prediction payouts round to the nearest coin** (`resolvePrediction`'s `Math.round`), while 14's sales round down;
  with selling, a member can tune a holding to a half share and gain at most half a coin per market at resolution. It
  is bounded and pre-existing (a buy can leave any fraction too); flooring payouts is a product call, not taken here.

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at the end of the sprint, measured as
`plan.md` §Reporting describes, together with the `serverError` ratchet's value (it must not rise above 18), the follow-ups 18 and 19 closed, and any found already closed.
