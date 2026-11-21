# Sprint 03 — community, moderation, messaging and the apps

Twenty features that deepen surfaces members already use and that sprints 01
and 02 did not reach: communities and site moderation, direct messages, the
feed's conversations, the Logs editor, the developer API, RMHTube, RMHMusic,
RMHStudy, RMHLadder, the daily puzzles and the games library. Each was checked
against the code base (and sprint 02's branch) before it was chosen: the "What
exists (verified)" paragraph of each specification names the files that show
the gap.

- [summary.md](summary.md) — what shipped, the security fixes found along the
  way, verification, size and the owner decisions left open.
- [plan.md](plan.md) — the sprint 02 precondition, Wave 0 scaffolding, waves,
  shared and anchored files, migration timestamps, integration steps.
- `features/NN-<slug>.md` — user story, requirements elicitation, functional
  and non-functional requirements, data model and API, testing, acceptance
  criteria, out of scope.
- `briefs/NN-<slug>.md` — a self-contained implementer brief per feature.

## The twenty features

| #   | Feature                                                                             | Surface                               | Wave | Persistence                                              |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------- | ---- | -------------------------------------------------------- |
| 01  | [RMHMusic practice log](features/01-music-history.md)                               | `/rmhmusic/history`                   | 1    | `MusicPracticeEntry`                                     |
| 02  | [Daily puzzle statistics](features/02-daily-stats.md)                               | `/daily/stats`, `/daily`              | 5    | none (reads `DailyPuzzleScore`)                          |
| 03  | [Mute a conversation and pin a reply](features/03-conversation-controls.md)         | post menu, replies, settings          | 5    | `ConversationPref` scope `post:`, `RMHark.pinnedCommentId` |
| 04  | [Moderator notes on member accounts](features/04-mod-notes.md)                      | `/admin/users`, `/admin/reports`      | 7    | `ModeratorNote`                                          |
| 05  | [Log drafts, scheduled publishing and revisions](features/05-log-drafts.md)         | `/admin/blog`, every Log reader       | 3    | `BlogPost.status`, `BlogPostRevision`, cron              |
| 06  | [API key restrictions](features/06-key-restrictions.md)                             | `/developer` keys, `/api/v1/**`       | 5    | 2 columns, `ApiKeyRefusalDaily`                          |
| 07  | [Password resets in the log, last unkeyed address hashes](features/07-security-hardening.md) | `/settings/security`, 2 modules | 6    | one-time cleanup migration                               |
| 08  | [RMHStudy streaks in local days and break insights](features/08-rmhstudy-streaks.md) | RMHStudy rooms and history            | 7    | `RmhStudyProfile.timeZone`, backfill script              |
| 09  | [Scheduled watch parties with reminders](features/09-watch-parties.md)              | `/rmhtube`, `/rmhtube/party/$roomId`  | 4    | `RmhTubeRoomRsvp`, cron                                  |
| 10  | [Game updates: changelog and following a game](features/10-game-updates.md)         | `/games/$gameId/updates`              | 6    | `GameFollow`, fan-out queue                              |
| 11  | [Developer API: games, playtime and achievements](features/11-api-games.md)         | `/api/v1/games`, `/api/v1/me/*`       | 6    | none (new scope `read:games`)                            |
| 12  | [Send a message later](features/12-send-later.md)                                   | DM and group composers                | 2    | `ScheduledChatMessage`, cron                             |
| 13  | [Community rules and reports to moderators](features/13-community-rules.md)         | `/c/$slug`, mod tools                 | 1    | `CommunityRule`, 2 columns                               |
| 14  | [Community moderation log](features/14-community-modlog.md)                         | mod tools, public log                 | 2    | `CommunityModAction`, prune job                          |
| 15  | [Community insights for moderators](features/15-community-insights.md)              | mod tools                             | 3    | `CommunityMemberEvent`                                   |
| 16  | [Your reports: status and outcome](features/16-my-reports.md)                       | `/settings/security`, inbox           | 2    | 2 columns and an index on `ContentReport`                |
| 17  | [RMHLadder offer comparison](features/17-ladder-offers.md)                          | `/rmhladder/offers`                   | 1    | `LadderOffer`                                            |
| 18  | [RMHLadder search insights](features/18-ladder-insights.md)                         | `/rmhladder/insights`                 | 4    | none (reads application events)                          |
| 19  | [Image descriptions in messages](features/19-message-alt-text.md)                   | message composers and rows            | 4    | `ChatMessage.imageAlts`                                  |
| 20  | [Moderation queue triage](features/20-report-triage.md)                             | `/admin/reports`                      | 3    | index on `ContentReport`                                 |

Every feature has UI (11's is the generated API reference and explorer),
server code (contracts with `implement()` and registered `apiRoute` modules;
`/api/v1/**` route files with `withDeveloperApi` for 11), persistence where it
makes sense (additive migrations), strings in its own namespace, and tests:
mission-critical ones (ownership, secrets, auth, a member's data, erasure) in
the main suite, the rest in the product suite.

## How the ideas were found

Sprint 02 searched for shallow spots in surfaces people use; this sprint kept
the method and widened the net:

- **Columns and models with no writer or no reader.** `RmhTubeRoom.scheduledFor`
  is read by the landing and set by nothing (09); `GamePatchNote` keeps every
  note and shows only the latest (10); `DailyPuzzleScore` is stored per member
  while the hub's streak is computed from `localStorage` (02).
- **Loops that do not close.** A reporter never learns what happened to a
  report (16); a community moderator never sees a member's report (13).
- **History that is overwritten.** RMHMusic keeps bests only (01); community
  membership deletes its row on leave (15); Logs overwrite their content on
  every save (05).
- **Sprint 02 follow-ups that are still open.** RMHStudy's streak counts UTC
  days and every profile from before sprint 02's fix still stores a streak of
  one (08); two modules still hash addresses without the key, one with an
  operator-precedence bug, and password resets never reach the security log
  (07).
- **Accessibility gaps.** Images in messages have no description (19,
  WCAG 2.2 SC 1.1.1).
- **Operational load.** The moderation queue decides reports one by one (20);
  moderators have nowhere to leave context on a member (04).

## Rejected ideas

| Idea                                               | Why not                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Another batch of standalone utilities              | Sprint 01 did that.                                                                                                                                                      |
| Recovery codes and trusted contacts                | `RecoveryCode`, `TrustedContact` and `RecoveryRequest` exist in `auth.prisma` with no code. Who may vouch for an account, and how recovery interacts with the passkey-and-provider policy, is a security decision for the owner. |
| Battle pass season rollover                        | Listed as a bug in the 2026-11-19 audit, but already fixed: `lib/battlepass/season.ts` derives seasons from the shared season clock.                                     |
| Billing history and invoices                       | The Stripe billing portal (`useMembershipActions.ts`, `portal`) already shows them.                                                                                      |
| Pausing a membership                               | A pricing and revenue decision, not a product gap.                                                                                                                       |
| RMHBox custom prompt packs                         | Exist (`/rmhbox-packs`, `components/party/PacksPage.tsx`).                                                                                                               |
| Edit history and quote posts                       | Exist (`rmharks.$id.history.server.ts`, `rmharks.$id.quotes.server.ts`).                                                                                                 |
| Hiding replies                                     | Exists (`HiddenReplies.tsx`); 03 adds only pinning.                                                                                                                       |
| Quiet hours for notifications                      | Exist (`NotificationPreference.quietStart`/`quietEnd`).                                                                                                                  |
| Per-chat mute                                      | Exists (`ConversationPref`, B14); 03 extends it to posts.                                                                                                                |
| Community mod queue log                            | Exists for queue decisions; 14 covers every other action.                                                                                                                |
| Reading goals and statistics                       | Exist (`ReadingGoal`, `ReadingShelfEntry`, `/reading`).                                                                                                                  |
| RMHLadder interview prep                           | Exists (`PrepSheet.tsx`, `lib/rmhladder/prep.server.ts`).                                                                                                                |
| "Looking for group" board for multiplayer games    | Adds an eighth "a time and who is coming" model while the consolidation audit (Tier 2, Scheduling) asks to merge the seven that exist.                                    |
| Conversation export from messages                  | Exports the other person's words too; needs a privacy decision on consent.                                                                                               |
| AI image descriptions and voice-note transcripts   | A paid model call per item; a cost decision (19 adds human descriptions).                                                                                                 |
| Features for the Tier 3 verticals beyond RMHLadder | Homes, rideshare, elections, the parody sites and the commercial-game ports wait on owner decisions (audit Tier 3); RMHLadder was named as in scope for this sprint.    |
| Library sharing and book clubs                     | Library documents are private by policy (sprint 02's rejection stands).                                                                                                  |
