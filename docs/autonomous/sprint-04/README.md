# Sprint 04 — games, builds, coins, the feed and the gaps between them

Twenty features that deepen surfaces sprints 01 to 03 did not reach: replays
and tournaments, RMHBox, User Builds and the `rmhcode` CLI, the coin ledger
and its admin tools, polls and post counts, the library reader, group chats
and DMs, communities, profiles, feature flags, and two site-wide translation
and accessibility gaps. Each was checked against `main` (sprint 02 merged)
and the sprint 03 branch before it was chosen; the "What exists (verified)"
paragraph of each specification names the files that show the gap.

- [plan.md](plan.md) — the sprint 03 precondition, Wave 0 scaffolding, waves,
  shared and anchored files, migration timestamps, integration steps.
- `features/NN-<slug>.md` — user story, requirements elicitation, functional
  and non-functional requirements, data model and API, testing, acceptance
  criteria, out of scope.
- `briefs/NN-<slug>.md` — a self-contained implementer brief per feature.

## The twenty features

| #   | Feature                                                                  | Surface                                 | Wave | Persistence                                   |
| --- | ------------------------------------------------------------------------ | --------------------------------------- | ---- | --------------------------------------------- |
| 01  | [Your replays and replay boards](features/01-replay-library.md)          | `/settings/replays`, game pages         | 3    | none (reads `GameReplay`)                     |
| 02  | [Event waitlists](features/02-event-waitlist.md)                         | RSVP control, host view                 | 1    | `Rsvp.waitlistedAt`, status `waitlist`        |
| 03  | [Tournament check-in](features/03-tournament-checkin.md)                 | `/tournaments/$id`                      | 3    | 3 columns, cron                               |
| 04  | [User Build releases](features/04-build-releases.md)                     | `/builds/$slug`, `rmhcode release`      | 2    | writes `BuildVersion`, 2 indexes              |
| 05  | [Build insights for creators](features/05-build-insights.md)             | `/create/builds/$slug/insights`         | 4    | indexes only                                  |
| 06  | [Ledgered coin adjustments for admins](features/06-coin-adjustments.md)  | `/admin/users`, wallet statement        | 1    | `CoinAdjustment`                              |
| 07  | [Monthly spending budget](features/07-spending-budget.md)                | `/settings/privacy`, the ledger         | 2    | 4 columns on `UserPlayLimits`                 |
| 08  | [Poll results: end early, extend, hear the outcome](features/08-poll-lifecycle.md) | polls on RMHarks              | 5    | 3 columns, cron                               |
| 09  | [Library place, bookmarks and notes on every device](features/09-reading-sync.md) | library readers, `/history`   | 1    | `LibraryReaderMark`                           |
| 10  | [Manage a group chat](features/10-group-chat-admin.md)                   | group chat header                       | 4    | none                                          |
| 11  | [Compare achievements](features/11-achievement-compare.md)               | `/progress/compare`                     | 6    | none                                          |
| 12  | [RMHBox player stats](features/12-rmhbox-stats.md)                       | `/rmhbox/players/$userId`               | 5    | none (reads RMHBox tables)                    |
| 13  | [RMHBox host presets](features/13-rmhbox-presets.md)                     | RMHBox game settings                    | 6    | `RmhboxSettingsPreset`                        |
| 14  | [Hide counts](features/14-quiet-counts.md)                               | `/settings/content`, every post         | 4    | 2 columns on `UserProfile`                    |
| 15  | [Every computed translation key reaches the catalogs](features/15-i18n-computed-keys.md) | ~15 components, a gate | 7    | none                                          |
| 16  | [Message requests](features/16-message-requests.md)                      | `/messages/requests`, DM privacy        | 3    | `MessageRequest`, 1 column                    |
| 17  | [Hand over a community](features/17-community-handover.md)               | mod tools, `/c/$slug`, admin            | 5    | `CommunityHandover`                           |
| 18  | [Who can see your follow lists](features/18-follow-list-privacy.md)      | profile privacy, follow lists, API      | 2    | 1 column on `UserProfile`                     |
| 19  | [Real dialogs instead of the browser's](features/19-native-dialogs.md)   | ~20 call sites, 2 primitives, a gate    | 7    | none                                          |
| 20  | [Feature flag targeting and history](features/20-flag-targeting.md)      | `/admin/flags`                          | 6    | 2 columns on `FeatureFlag`                    |

Every feature has UI, server code (contracts with `implement()` and
registered `apiRoute` modules; `/api/v1/**` route files with
`withDeveloperApi` where the developer API is touched), persistence where it
makes sense (additive migrations), strings in its own namespace (15 and 19
write into existing namespaces by design), and tests: mission-critical ones
(ownership, money, privacy, a member's data, erasure) in the main suite, the
rest in the product suite.

## How the ideas were found

The sprint 02 and 03 method — shallow spots, columns with no writer or no
reader, loops that do not close — applied to the surfaces the owner named for
this sprint:

- **Written but never read, or read but never written.** `BuildVersion` is
  rendered and never created (04); `BuildView` is recorded and never shown
  (05); `GET /api/rmhbox/stats` has no caller (12); `listReplaysForGame` and
  `deleteReplay` have no caller (01); the `library_doc` history type is never
  sent (09).
- **Invariants that a path breaks.** Admin "set coins" overwrites balances
  outside the ledger that `reconcileUser` checks (06); one-off event RSVPs
  race for the last seat ("v1 has no waitlist", 02).
- **Things that cannot change after creation.** Group chats cannot be
  renamed or gain a member (10); community owners can never leave (17); a
  poll's end is fixed (08).
- **Privacy and safety gaps.** Follow lists and RMHBox stats are open to
  anyone, ignoring blocks and existing privacy settings (18, 12); group
  creation ignores blocks (10); strangers are either fully in or fully out of
  a DM inbox (16); there is no cap on non-wager spending (07).
- **Translation and accessibility debt that a gate can close.** Computed
  `t()` keys that never reach the catalogs (15); native browser dialogs that
  are blocked in the Discord activity and cannot be translated (19).
- **Owner-requested surfaces.** Tournaments (03), RMHBox (12, 13), achievements
  (11), admin tooling (06, 20).

## Rejected ideas

| Idea                                                  | Why not                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-synced post drafts                             | Exist (`ScheduledPost` with `scheduledAt: null`, `/drafts`).                                                                                                                                           |
| Following a hashtag                                   | Covered by custom feeds (`CustomFeed.tags`, `/feeds`) and keyword alerts.                                                                                                                              |
| Content warnings with labels                          | Sprint 02 rejected content warnings because `RMHark.isSensitive` exists; a label is a small refinement, not a feature.                                                                                |
| Custom text practice in RMHType                       | Exists (`lib/rmhtype/custom-test.ts`).                                                                                                                                                                  |
| Daily puzzle archive                                  | Exists for the last 14 days (`daily-puzzles.puzzle.server.ts`, `MAX_PAST_DAYS`).                                                                                                                        |
| Search inside a conversation                          | Exists (`lib/messages/api/messages.search.server.ts`, sprint 02's rejection stands).                                                                                                                    |
| Recurring coin allowances or coin requests            | Moves money between members on a schedule nobody confirmed each time; an owner decision on the economy.                                                                                                 |
| Stripe receipts, refunds and invoices                 | The Stripe billing portal already shows them (sprint 03's rejection stands).                                                                                                                            |
| Waitlists on repeating events                         | Attendance merges standing and per-date answers (`effectiveAttendance`); 02 covers one-off events and keeps repeating events unchanged.                                                               |
| Cross-game "open lobbies" directory and spectating    | Each game's realtime hub has its own lobby model (Kowloon Knockout, Laundry Sort, TF2 server browser, RMHBox); a shared directory is a realtime-tier design, not one feature.                           |
| Comments on every Log                                 | Only announcement Logs have a discussion (`findAnnouncementPost`: "an ordinary post has no discussion"); opening all Logs to comments is a product decision for the owner.                              |
| Per-game control remapping                            | Declared per game (`lib/game-capabilities.ts`, `remappable-input`) and implemented inside each engine; there is no shared input layer to build it on.                                                   |
| Moderator notes in the subject's export, deletion grace period, unlisted tournament meta, Apache `CF-Connecting-IP` | Open owner decisions from sprint 03; no feature here depends on or resolves them. |
| Admin "fix ledger drift" button                       | Writing ledger rows to explain pre-ledger balances is an accounting decision; 06 shows the drift read-only.                                                                                            |
