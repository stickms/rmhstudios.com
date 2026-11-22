# Sprint 07 — Promises the code already makes, and what deletion leaves behind

Twenty features on surfaces where the code already promises something it does
not do: an assist layer with an empty list of games, a "Mentions only" mode no
group message can trigger, a match time column nothing writes, an upload
policy for build images no route uses, a bulk clean-up whose own comment says a
deploy strands it, chart-editor shortcuts written down as TODOs, and an account
deletion that leaves private notes, drafts and birthdays in place. Around them,
the next things members of the apps reach for — earlier versions of a Studio
project, one review queue across decks, folders, theme voting for jams, group
admins — and three developer API domains (events, communities, reading) that
members' bots and notes tools ask for. Each one was checked against the sprint
06 branch (`claude/autonomous-sprint-06`, which contains sprints 1–5 and sprint
06 except 15, 16 and 18, treated here as done) so it repeats nothing that
exists. Specifications are in [`features/`](features/), the build order in
[`plan.md`](plan.md), implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`,
`docs/plans/2026-11-11-steel-design-implementation.md`) on the site tier, and
the app tier's own look (L8) in the Studio, Slice It and the games. None
resolves a section-18 open decision (D1, D3, D6, D7, D8, D10, D12) or an open
owner decision (moderator notes in the data export, the deletion grace period,
unlisted tournament or listing meta, Apache `CF-Connecting-IP` stripping,
blocked members RSVPing to a blocker's events, RMHBox per-minigame history
privacy, ownership transfer in the public mod log, emoji reactions under quiet
counts, recovery codes and trusted contacts having no product, a deleted
member's follows, game reviews, guides and jam entries, uploading Studio
samples). Where a feature meets one, its specification says which default it
keeps; feature 20 lists the deletion questions as owner entries rather than
answering them.

## Features

| #   | Feature                                                                          | Surface                                             | Wave | Schema |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------- | ---- | ------ |
| 01  | [Copy, paste, mirror and time edits in the chart editor](features/01-slice-it-clipboard.md) | Slice It chart editor                  | 1    | no     |
| 02  | [Game assists: the settings page and two games](features/02-game-assists.md)    | `/settings/game-assists`, Synapse Storm, Void Breaker | 3  | no     |
| 03  | [What this site keeps on your device](features/03-device-data.md)               | `/settings/device`, sign-out, deletion              | 5    | no     |
| 04  | [Group chat admins](features/04-group-admins.md)                                | Group info and manage menu                          | 1    | yes    |
| 05  | [Mentions in group chats](features/05-group-mentions.md)                        | Group composer, rows, notifications                 | 4    | yes    |
| 06  | [Match times and deadlines in tournaments](features/06-match-scheduling.md)     | `/tournaments/$id`                                  | 5    | yes    |
| 07  | [Vote on a game jam's theme](features/07-jam-themes.md)                         | `/jams/$slug`, `/jams` admin form                   | 2    | yes    |
| 08  | [Review everything due; suspend and leeches](features/08-study-queue.md)        | `/study/review`, `/study`, deck page                | 1    | yes    |
| 09  | [Folders for flashcard decks](features/09-deck-folders.md)                      | `/study`                                            | 4    | yes    |
| 10  | [Events and RSVPs in the developer API](features/10-api-events.md)              | `/api/v1/events*`                                   | 3    | no     |
| 11  | [Communities in the developer API](features/11-api-communities.md)              | `/api/v1/communities*`, `POST /api/v1/posts`        | 5    | no     |
| 12  | [Highlights, notes and shelves in the developer API](features/12-api-reading.md) | `/api/v1/me/highlights*`, `/api/v1/me/shelves*`    | 6    | no     |
| 13  | [Admin lookup: many at once, e-mail out of the URL](features/13-admin-batch-lookup.md) | `/admin/lookup`                               | 3    | no     |
| 14  | [Earlier versions of a Studio project](features/14-studio-history.md)           | RMH Studio Projects menu                            | 2    | yes    |
| 15  | [Bulk clean-ups that finish, and two more](features/15-bulk-durable.md)         | `/trash` bulk panel, jobs worker                    | 6    | yes    |
| 16  | [Communities that require image descriptions](features/16-community-alt-text.md) | Mod settings, composers, community posts           | 2    | yes    |
| 17  | [Screenshots on build pages](features/17-build-screenshots.md)                  | Build form, `/builds/$slug`                         | 4    | yes    |
| 18  | [Reading time](features/18-reading-time.md)                                     | Reader tools, `/reading`                            | 6    | yes    |
| 19  | [Quiz polls](features/19-quiz-polls.md)                                         | Poll editor, every poll read path                   | 7    | yes    |
| 20  | [An erasure registry, and the clearly private tables erased](features/20-erasure-coverage.md) | `anonymizeAccount`, a coverage registry | 7    | no     |

### Why each one

- **01** `features/slice-it/ui/editor/ChartEditor.tsx` carries a TODO for
  copy, cut, paste, paste mirrored, duplicate and insert/remove time, all
  specified in `docs/slice-it-chart-editor.md` §5.2 and none implemented.
- **02** `lib/game/assist.ts` is a finished cross-game assist layer whose
  `ASSIST_CAPABLE` set is empty; its endpoint
  (`lib/game/api/settings.game-assists.server.ts`) has no page, and
  `submitGameScore` never consults it. Two games that flash get it.
- **03** Sprint 05 left "Studio samples staying on the device" open; nothing
  lists or clears the site's IndexedDB, local drafts or caches, and neither
  sign-out nor deletion clears them.
- **04** Every group action checks `refuseUnlessOwner`
  (`lib/group-chat/manage.server.ts`); a fifty-person group has one manager,
  and succession goes to whoever joined first.
- **05** `ConversationPref.mentionsOnly` exists for groups, but
  `sendGroupMessage` (`lib/messages/send.server.ts`) creates no notification
  and detects no mention, so "Mentions only" in a group can never fire.
- **06** `TournamentMatch.scheduledAt` has no writer; a week-long bracket has no
  way to agree a time, and a no-show stalls it.
- **07** A jam's theme is one admin string (`GameJam.theme`); there is no
  theme vote, the jam-site staple.
- **08** Review is one deck at a time (`study.decks.$id.review`), and nothing
  sets aside a card failed again and again (08 suspends it at eight lapses).
- **09** Up to 200 decks per member (`MAX_DECKS_PER_MEMBER`) in one flat list.
- **10** Sprint 06 rejected events in the API only to keep `lib/events.server.ts`
  free for its two event features, which have shipped.
- **11** Bots and scripts cannot read a community or post into one; the site's
  gate (`gateCommunityContent`) is the only path, and it is shared.
- **12** Highlights and notes can be exported as a file but not synced; shelves
  and the reading goal have no API.
- **13** Sprint 05's owner follow-up: an e-mail address searched in the admin
  lookup lands in access logs and history; a spam wave means forty lookups.
- **14** A Studio save overwrites the project's only server copy
  (`StudioProject.data`).
- **15** `lib/bulk/bulk.server.ts` says its runs do not survive a deploy and
  that `reclaimStalledOperations` has no caller; likes and reposts cannot be
  cleaned up in bulk.
- **16** Image descriptions can be required by a member for themselves (X12)
  but not by a community for its readers.
- **17** The `build` upload policy in `lib/media/ingest.server.ts` has no route;
  builds have one pasted cover URL and no screenshots.
- **18** The reading tools record highlights, shelves and a yearly goal, but no
  time; members trying to build a habit have nothing to look at.
- **19** Polls have single, multiple and ranked choice; trivia posts in
  communities have no way to mark an answer without giving it away.
- **20** About 245 of the 373 models with a `User` relation are never named by
  `anonymizeAccount`, including private notes, drafts, reminders and
  birthdays, and no test notices. 20 classifies every one (erased, kept on
  purpose, owner decision or TODO, a ratchet), erases 21 clearly private leaf
  tables, and changes nothing else.

## Rejected ideas

| Idea                                                        | Why not                                                                                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event attendance (hosts mark who came)                       | A host-kept record of other members' attendance is a privacy call; a turnout number alone is thin. Cut in review, the twenty-first candidate.                       |
| Erasing a deleted member's follows, reviews, guides, jam entries | Owner decision (sprint 05 README). 20 lists them as owner entries and changes nothing.                                                                       |
| Uploading Studio samples to the account                      | Owner decision (audio storage and moderation); 03 clears them from the device and 14 versions the project JSON.                                                     |
| Restoring a Slice It chart revision                          | Blocked on the chart editor's open question §17.2 (what an edit does to a published chart's scores); the route's own TODO says the two land together.            |
| Versecraft endings                                           | The twelve endings need story chapters written (one chapter exists), not code.                                                                                     |
| Waitlists for repeating events                               | Waits on the owner's "standing answers" question (sprint 04).                                                                                                      |
| Removal reasons for community moderators                     | Moderator macros exist (`lib/safety/macros.server.ts`, `/api/communities/$slug/macros`).                                                                          |
| Public collections from save folders                         | Consolidation audit Tier 2: lists, custom feeds and collections are to be merged, not joined by another.                                                          |
| Voice message transcripts                                    | Needs a speech-to-text provider: an external service, a cost and a consent question.                                                                               |
| Captions for RMHTube videos, friends leaderboards, the daily puzzle archive, calculator notebooks, new-device sign-in alerts | Exist (`VideoPlayer.tsx` captions and `CaptionFileButton.tsx`; `lib/leaderboard.server.ts` friends scope; `PastPuzzlesSection.tsx`; `/api/calc-notebooks`; `lib/auth/session-alert.server.ts`). |
| Webhooks for RSVPs and highlights                            | Pushes other members' identities or private notes to third-party URLs: a consent question; 10 and 12 are pull-only.                                               |
| Tournaments in the developer API                             | Lower demand than events and communities, and would compete with 06 for `lib/tournaments/*`.                                                                       |
| Mark notifications read through the API                      | Too small to be a feature.                                                                                                                                          |
| Automatic forfeits                                           | Settles brackets and moves payouts without a person; 06 has the host award overdue matches.                                                                        |
| `@everyone` in group chats                                   | A broadcast is a moderation question for the group roles 04 introduces; left out of 04 and 05.                                                                    |
| Book clubs (a shared reading schedule)                       | Overlaps communities, events and shelves; three models for one idea.                                                                                               |
| Tags for decks                                               | 09's folders organise decks; folders and tags would be two mechanisms for one need.                                                                                |
| Authenticator two-factor, recovery codes                     | Owner decision (recovery codes and trusted contacts have no product).                                                                                              |
| Account export as a background job                           | No evidence the synchronous export fails; speculative.                                                                                                              |
| Features for Tier 3 verticals (ladder, homes, rideshare, casino, elections) | Wait on owner decisions (consolidation audit Tier 3).                                                                                               |

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at
the end of the sprint, measured as `plan.md` §Reporting describes.
