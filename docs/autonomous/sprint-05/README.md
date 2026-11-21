# Sprint 05 — Games, studio, admin tools and member controls

Twenty features on surfaces the first four sprints did not deepen: the game
leaderboards and tournaments, RMH Studio, flashcards, RMHTube playlists, game
jams, the operator's admin tools, and the controls members have over what they
see and show. Each one was checked against `main` and the sprint 04 branch
(`claude/autonomous-sprint-04`) so it repeats nothing that exists.
Specifications are in [`features/`](features/), the build order in
[`plan.md`](plan.md), implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`,
`docs/plans/2026-11-11-steel-design-implementation.md`) on the site tier, and
the app tier's own look (L8) in the Studio and RMHTube. None resolves a
section-18 open decision or an open owner decision (moderator notes in the data
export, the deletion grace period, unlisted tournament or listing meta, Apache
`CF-Connecting-IP` stripping, blocked members RSVPing to a blocker's events,
RMHBox per-minigame history privacy, ownership transfer in the public mod log,
emoji reactions under quiet counts).

## Features

| #  | Feature                                                                           | Surface                                  | Wave | Schema |
| -- | --------------------------------------------------------------------------------- | ---------------------------------------- | ---- | ------ |
| 01 | [Leaderboard privacy](features/01-leaderboard-privacy.md)                         | Every game board, Settings > Privacy     | 1    | yes    |
| 02 | [Background jobs console](features/02-admin-jobs.md)                              | `/admin/jobs`                            | 2    | no     |
| 03 | [Outbox dead letters](features/03-admin-outbox.md)                                | `/admin/outbox`                          | 4    | no     |
| 04 | [Personal best history](features/04-personal-bests.md)                            | Game library page                        | 5    | yes    |
| 05 | [Event co-hosts](features/05-event-cohosts.md)                                    | Events                                   | 3    | yes    |
| 06 | [Studio projects: save, open, sync](features/06-studio-projects.md)               | RMH Studio                               | 1    | yes    |
| 07 | [Turn off reposts](features/07-repost-mutes.md)                                   | Timeline, post menu, Settings > Content  | 2    | yes    |
| 08 | [Double-elimination tournaments](features/08-double-elimination.md)               | Tournaments                              | 1    | yes    |
| 09 | [Reversible and cloze flashcards](features/09-flashcard-types.md)                 | `/study` editor and review               | 2    | yes    |
| 10 | [Admin lookup](features/10-admin-lookup.md)                                       | `/admin/lookup`, admin hub               | 7    | no     |
| 11 | [Dates and numbers in the reader's locale](features/11-locale-formatting.md)      | Site-wide formatting                     | 7    | no     |
| 12 | [Queue a playlist in RMHTube](features/12-rmhtube-playlist-queue.md)              | RMHTube rooms                            | 3    | no     |
| 13 | [Saved replies in messages](features/13-saved-replies.md)                         | DM and group composers                   | 5    | yes    |
| 14 | [Blocked and muted accounts](features/14-blocked-muted-accounts.md)               | `/settings/blocked`                      | 6    | no     |
| 15 | [Game jam teams](features/15-jam-teams.md)                                        | `/jams/$slug`                            | 5    | yes    |
| 16 | [Describe images after posting](features/16-alt-text-editing.md)                  | Post menu, Settings > Content            | 4    | no     |
| 17 | [Community post alerts](features/17-community-post-alerts.md)                     | Community page, notifications            | 6    | yes    |
| 18 | [Tournament seeding](features/18-tournament-seeding.md)                           | Tournaments                              | 3    | yes    |
| 19 | [Pin up to three posts](features/19-profile-pins.md)                              | Profile, post menu                       | 6    | no     |
| 20 | [Flashcard review reminders](features/20-flashcard-reminders.md)                  | `/study`, notifications                  | 4    | yes    |

### Why each one

- **01** A deleted member's chosen username stays on every game board today
  (`anonymizeAccount` erases none of the twelve player tables), banned members
  stay listed, and there is no way to play unlisted.
- **02, 03, 10** The operator has alarms but no way to see a failed job's error,
  retry it, re-send an outbox event that gave up, or resolve an id from a report
  or log line without guessing which admin page knows it.
- **04** Boards keep only the current best, so a player cannot see their own
  improvement.
- **05** An event has exactly one person who can run it.
- **06** RMH Studio has no save or open at all: IndexedDB helpers exist but
  nothing in the UI calls them, so closing the tab loses the project.
- **07** The only per-person controls are mute and block; there is no way to
  keep someone's posts and drop their reposts.
- **08, 18** `DOUBLE_ELIM` has been a reserved, unimplemented enum value, and
  every tournament is seeded by sign-up order.
- **09, 20** Flashcards are one-way front/back only, and nothing tells a learner
  when cards are due.
- **11** 272 `toLocale*String` calls without the active locale and 60
  English-only `formatDistanceToNow` calls mis-format dates in eight of nine
  locales and cause SSR/client text mismatches.
- **12** Room items can be saved to a playlist, but a playlist cannot be played
  in a room.
- **13** Members answering the same questions in messages have no saved replies.
- **14** There is no page listing whom you have blocked or muted; unblocking
  needs one of their posts in front of you. Block and mute lists also survive
  account deletion.
- **15** Jam entries credit one person; teams cannot be credited or kept from
  rating their own game.
- **16** Image descriptions can only be written at posting time.
- **17** Communities have no way to tell members about new posts.
- **19** A profile can pin exactly one post.

## Rejected ideas

| Idea                                                        | Why not                                                                                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved custom texts in RMHType                               | Custom text practice exists (`lib/rmhtype/custom-test.ts`); sprint 04 rejected a near copy.                                                                                                              |
| "Looking for group" board                                   | Sprint 03 rejected it: the consolidation audit asks to merge the seven "a time and who is coming" models, not add an eighth.                                                                            |
| Conversation export from messages                           | Sprint 03: exports the other person's words; needs a privacy decision on consent.                                                                                                                       |
| Recent searches, search operators, saved searches           | Search already has saved searches, alerts and operators (`lib/search/parse.ts`, `saved.server.ts`); recent searches alone are too thin to be a feature.                                                  |
| Developer API usage dashboard, OAuth apps                   | Usage exists (`KeyUsage.tsx`); an OAuth provider is a security platform decision (sprint 02's rejection stands).                                                                                         |
| RMHCode token hashing and management                        | Exists: tokens are stored hashed (`hashRmhCodeToken`), listed with last use and revocable (`TokenGenerator.tsx`).                                                                                         |
| Muted words with expiry                                     | Exists (`UserProfile.mutedWordExpiries`, `lib/feed/muted-expiry.ts`).                                                                                                                                    |
| Speedrun verification queue                                 | Exists (`SpeedrunEntry.status`, `lib/speedrun/verifier.ts`).                                                                                                                                             |
| Saved-item notes and reminders in `/saves`                  | Exist (`SavedItem.note`, the reminders tab in `SavesHub.tsx`).                                                                                                                                           |
| PWA share-target fix (audit Tier 0)                         | Already fixed: `public/sw.js` imports `sw-share-target.js`.                                                                                                                                              |
| Admin member dossier page                                   | The users page's moderation drawer (`UserModerationPanel.tsx`) with mod notes (sprint 03) and coin adjustments (sprint 04) covers it; 10 links into it instead of rebuilding it.                         |
| Erasing a deleted member's follows                          | Changes other members' follower counts and history; that is a product decision for the owner, not an erasure detail. 14 erases only the member's own block and mute lists.                              |
| Erasing a deleted member's game reviews, guides and jam entries | Published content kept under "Deleted user" like posts; whether it should go is the deletion policy's call (an open owner decision area).                                                          |
| RMHBox per-minigame history and privacy                     | Open owner decision.                                                                                                                                                                                     |
| Uploading Studio samples to the account                     | Audio storage and moderation of user audio is a cost and safety decision; 06 syncs project JSON only and says which samples are missing.                                                                |
| Image flashcards, image occlusion                           | Needs an upload pipeline and storage quota for study decks; 09 adds the two text card types that need neither.                                                                                          |
| Accessibility warning burn-down across the repo             | Not measurable without a whole-repo eslint run the machine budget forbids for implementers; 16 and 11 are the a11y/i18n work with a concrete user outcome.                                              |
| Features for Tier 3 verticals (homes, rideshare, elections) | They wait on owner decisions (consolidation audit Tier 3).                                                                                                                                               |
| Per-game control remapping, cross-game lobby directory      | Sprint 04: engine-level or realtime-tier designs, not one feature.                                                                                                                                       |

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at
the end of the sprint, measured as `plan.md` §Reporting describes.
