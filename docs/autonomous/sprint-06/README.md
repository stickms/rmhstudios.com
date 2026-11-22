# Sprint 06 — Finishing what was started, and the controls around it

Twenty features on surfaces the first five sprints left half-built or
unguarded: the Studio's advertised edit and export commands that do nothing,
the feedback form nobody can read, the ranked-choice counter with no ballot,
the tournament result one player settles alone, the community a removed member
can rejoin in one click, the GIF that every screen reader calls "Embedded
image", and the controls members and moderators reach for next — bans and
timeouts, moderator notes, invite links, read receipts, an away message, event
dates that change. Each one was checked against `main` and the sprint 05 branch
(`claude/autonomous-sprint-05`) so it repeats nothing that exists.
Specifications are in [`features/`](features/), the build order in
[`plan.md`](plan.md), implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`,
`docs/plans/2026-11-11-steel-design-implementation.md`) on the site tier, and
the app tier's own look (L8) in the Studio. None resolves a section-18 open
decision (D1, D3, D6, D7, D8, D10, D12) or an open owner decision (moderator
notes in the data export, the deletion grace period, unlisted tournament or
listing meta, Apache `CF-Connecting-IP` stripping, blocked members RSVPing to a
blocker's events, RMHBox per-minigame history privacy, ownership transfer in
the public mod log, emoji reactions under quiet counts, recovery codes and
trusted contacts having no product). Where a feature meets one, its
specification says which default it keeps.

## Features

| #   | Feature                                                                        | Surface                                        | Wave | Schema |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------- | ---- | ------ |
| 01  | [Community bans and timeouts](features/01-community-bans.md)                   | Mod tools, member list, `/c/$slug`             | 1    | yes    |
| 02  | [Moderator notes in communities](features/02-community-notes.md)               | Mod tools, member list                         | 4    | yes    |
| 03  | [Undo, redo and the clipboard in the Studio](features/03-studio-editing.md)    | RMH Studio                                     | 2    | no     |
| 04  | [Export a mix and MIDI from the Studio](features/04-studio-export.md)          | RMH Studio, Studio challenges                  | 5    | no     |
| 05  | [Feedback you can send and someone reads](features/05-feedback-inbox.md)       | `/help`, `/settings/feedback`, `/admin/feedback` | 3    | yes    |
| 06  | [Secure a member's account](features/06-admin-secure-account.md)               | `/admin/users` moderation drawer               | 6    | no     |
| 07  | [Written feedback on jam entries](features/07-jam-feedback.md)                 | `/jams/$slug`                                  | 2    | yes    |
| 08  | [Copied decks get their author's changes](features/08-deck-updates.md)         | `/study/$deckId`                               | 1    | yes    |
| 09  | [Invite links for group chats](features/09-group-invites.md)                   | Group chat header, `/groups/join/$code`        | 1    | yes    |
| 10  | [Change or skip one date of a repeating event](features/10-event-occurrences.md) | Event card, host view                        | 2    | yes    |
| 11  | [Updates to the people coming](features/11-event-updates.md)                   | Event card, notifications                      | 4    | yes    |
| 12  | [Webhooks for personal bests and achievements](features/12-game-webhooks.md)   | `/developer/webhooks`, `/api/v1/me/*`          | 3    | no     |
| 13  | [Flashcards in the developer API](features/13-api-flashcards.md)               | `/api/v1/me/decks*`                            | 6    | no     |
| 14  | [Build comments: edit, delete, hide, lock, report](features/14-build-comments.md) | `/builds/$slug`                             | 4    | yes    |
| 15  | [Describe GIFs](features/15-gif-descriptions.md)                               | Post and message composers, every read path    | 6    | yes    |
| 16  | [Say what a content warning is for](features/16-content-warnings.md)           | Composer, every read path                      | 7    | yes    |
| 17  | [Read receipts and typing off everywhere](features/17-read-receipts.md)        | Settings > Privacy, conversation options       | 5    | yes    |
| 18  | [Away message for direct messages](features/18-away-message.md)                | `/messages`, profile, conversation header      | 7    | yes    |
| 19  | [Ranked-choice polls](features/19-ranked-polls.md)                             | Poll editor and poll on RMHarks                | 3    | yes    |
| 20  | [Confirm or dispute a tournament result](features/20-match-results.md)         | `/tournaments/$id`                             | 5    | yes    |

### Why each one

- **01** Removing a member from a public community does nothing lasting:
  `POST /api/communities/$slug/join`
  (`lib/communities/api/communities.$slug.join.server.ts`) lets them straight
  back in, and there is no way to stop someone posting for a day without
  removing them. The one content gate (`lib/communities/gate.server.ts`) has no
  ban check.
- **02** Site admins have moderator notes (sprint 03 04); community moderators
  hand over shifts with nothing written down about a member.
- **03** `lib/studio/keybinds.ts` advertises Undo, Redo, Copy, Cut, Paste,
  Delete, Select all and Duplicate, and the keybind settings let members rebind
  them, but `lib/studio/hooks/useKeybinds.ts` handles none of them: a wrong
  move in the arrangement cannot be taken back.
- **04** `project.export` is bound and unhandled, and Studio challenges ask for
  an "Audio bounce (WAV or MP3)" (`components/studio/creative/ChallengePanel.tsx`)
  that the Studio cannot produce.
- **05** The `Feedback` table has `context` and `shotKey` columns no code writes;
  the only way to send feedback is shaking a phone (`components/access/AccessMount.tsx`);
  and `GET /api/feedback` is admin-only with "no client calls it"
  (`lib/api/routes/feedback.server.ts`). Accessibility barriers have no way in.
- **06** When a member's account is taken over, an admin can ban it (which ends
  sessions) but cannot sign it out everywhere and revoke its API keys, webhook
  secrets and RMHCode tokens without banning the victim.
- **07** Jam ratings are four numbers (`GameJamRating`); a team learns nothing
  about why.
- **08** Cloning a public deck (`lib/study.server.ts`, `clonedFromId`) is a one-time
  copy: the author's fixes never reach the people studying it.
- **09** A group chat grows only by the owner adding people one by one
  (`lib/group-chat/manage.server.ts`); there is no link to share in a community
  or an event.
- **10** A repeating event (`Event.recurrence`) can only be cancelled whole
  (`cancelEvent` in `lib/events.server.ts`); one holiday means cancelling the
  series or leaving a date nobody will attend.
- **11** A host cannot tell the people coming that the room changed; the only
  event notifications are reminders and cancellation.
- **12** The webhook catalog (`lib/webhooks/events.ts`) is seven social events;
  stream overlays and Discord bots want "new personal best" and "achievement
  unlocked", which sprint 05 04 now records.
- **13** Flashcards have import and export in the UI but nothing in the
  developer API, so a member cannot sync decks from their own notes tool.
- **14** Build comments (`lib/api/routes/user-builds.$id.comments.server.ts`) can
  only be created: no edit, no delete, no creator moderation, no block check,
  no report, and a creator cannot close comments on an old build.
- **15** Posts and messages store `gifUrl` with no description; `GifEmbed.tsx`
  renders every GIF as "Embedded image" even though the picker has the
  provider's description in hand.
- **16** A content warning is one boolean (`RMHark.isSensitive`): readers cannot
  tell a spoiler from a medical photo before choosing to reveal.
- **17** M8's read-receipt and typing switches are per conversation only
  (`ConversationPref.hideReceipts`, `lib/chat-plus/receipts.server.ts`): there
  is no account-wide "off", and message search
  (`lib/messages/api/messages.search.server.ts`) ignores the switch and leaks
  "read". The smallest feature in the sprint; a candidate to cut if a wave
  needs room.
- **18** Only calls have an automatic reply (`lib/call/auto-reply.server.ts`);
  someone on holiday has no way to say so in messages.
- **19** The schema (`RMHarkPollVote.rank`) and an instant-runoff counter
  (`lib/feed/poll-count.ts`) exist, but no poll can be created ranked and the
  vote endpoint ignores rank.
- **20** `reportMatch` (`lib/tournaments/tournament.server.ts`) settles a match
  on one participant's word, advancing the bracket and, at the end, the
  payouts; the opponent has no say.

## Rejected ideas

| Idea                                                       | Why not                                                                                                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticator-app two-factor                               | Touches Better Auth plugins and account recovery; recovery codes and trusted contacts having no product is an open owner decision, and passkeys are the site's stated second factor.    |
| Follow a hashtag                                           | Consolidation audit Tier 2: lists, custom feeds, saved-search alerts, keyword alerts and watches are to be merged into one feed model, not joined by a sixth.                           |
| Saved messages and reminders as `/saves` tabs              | A consolidation move with no new capability; reminders are already a `/saves` view (`SavesHub.tsx`).                                                                                    |
| Translate a message                                        | Sends another member's private words to a paid text provider; that is a consent decision, as the conversation export was in sprint 03.                                                  |
| API key expiry reminders                                   | Too small to be a feature; a line in a later developer-console change.                                                                                                                   |
| Reply drafts that survive navigation                       | A per-viewer convenience of a few dozen lines.                                                                                                                                           |
| RSVP questions for events                                  | Sprint 04 left "standing answers" for repeating events as an owner question; questions would need the same answer.                                                                    |
| A readable archive of one's posts                          | The data export already contains them (`lib/account/api/account.export.server.ts`).                                                                                                     |
| Community calendar as a public ICS feed                    | Thin on its own; the personal feed (`CalendarFeed`, `lib/calendar/feed.server.ts`) already carries every community event a member has answered.                                        |
| Events and RSVPs in the developer API                      | Lower demand than flashcards (13) and would compete with 10 and 11 for `lib/events.server.ts` in the same sprint.                                                                       |
| Archive a community (read-only mode)                       | Overlaps the handover flow (sprint 04 17) and the deletion policy; what happens to an archived community's members is an owner call.                                                    |
| A separate accessibility statement page                    | Conformance claims are the owner's to make; 05 gives barrier reports a structured way in and a reply, which is the part a member needs.                                                |
| MIDI import as its own feature                             | Folded into 04, which owns the Studio's file menu.                                                                                                                                       |
| Hidden replies, post insights, sessions list, swiss rounds | Exist (`hiddenAt` on comments, `InsightsModal.tsx`, `SecurityActivityPanel.tsx`, `lib/tournaments/swiss.ts`).                                                                           |
| Features for Tier 3 verticals (casino, ladder, homes, rideshare, elections) | Wait on owner decisions (consolidation audit Tier 3).                                                                                                                    |

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at
the end of the sprint, measured as `plan.md` §Reporting describes.
