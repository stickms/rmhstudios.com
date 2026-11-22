# Sprint 08 — Tables nothing writes, TODOs in the code, and what deletion still leaves

Twenty features on surfaces where the code already holds the half of a
feature it was waiting for: a watch-statistics table that the RMHTube profile
card reads and nothing writes, three editor TODOs that a finished linter could
answer, two fan-outs that the owner was told lose members on a restart, a
games capability registry no player ever sees, a bracket a phone shows one
round at a time. Around them, the next things members reach for — pictures on
flashcards, scales in RMH Music, racing your own best in RMHType, recurring
community threads, RSS for communities and builds, keyboard navigation of the
feed — two admin tools for abuse that today takes hundreds of clicks, three
developer API domains (tournaments, scheduled posts, search), webhooks for a
member's own activity, and two features that take 52 of the erasure
registry's 96 `todo` tables off the list with per-table semantics (53 with
01's). Each one
was checked against the sprint 07 branch tip (sprints 1–7, sprint 07 not yet
on `main`) so it repeats nothing that exists. Specifications are in
[`features/`](features/), the build order in [`plan.md`](plan.md), implementer
briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`,
`docs/plans/2026-11-11-steel-design-implementation.md`) on the site tier, and
the app tier's own look (L8) in Slice It, RMHTube, RMHType, RMH Music, the
games library and the games. None resolves a section-18 open decision (D1, D3,
D6, D7, D8, D10, D12) or an open owner decision (moderator notes in the data
export, the deletion grace period, unlisted tournament or listing meta, Apache
`CF-Connecting-IP` stripping, blocked members RSVPing to a blocker's events,
RMHBox per-minigame history privacy, ownership transfer in the public mod log,
emoji reactions under quiet counts, recovery codes and trusted contacts having
no product, a deleted member's follows, game reviews, guides, jam entries and
public decks, uploading Studio samples, how long `RebarReservation` bookings
are kept, a public setting for the RMHTube profile card). Where a feature
meets one, its specification says which default it keeps.

### Decisions taken by default (validation pass, 2026-11-22)

The owner's standing rule is to take the most reasonable decision and record
it. A validation pass against the sprint 07 tip took these:

- **02** confirming a prize-deciding claim through a key is refused
  (`409 confirm_on_site`): no API write can start a coin movement.
- **03** a scheduled community post through the API runs the full community
  gate (AutoMod included) and needs `write:communities`; a held outcome is
  refused. The site's scheduled create is unchanged (follow-up noted).
- **06** co-op Dream Rift applies only Calm visuals and Colour-safe, locally.
- **08** the `key_suspended` error body carries no reason (other people's apps
  see it); the owner sees the reason.
- **09** recurring threads pass `prepareCommunityPost` at fire time; an
  erased author's templates go to the community owner **paused**.
- **15** copied decks share picture objects (reference-counted), never
  duplicate them.
- **18** undo matches the exact removal timestamp, overturns the sweep's
  strike and sends one notice; admins cannot be swept; 10 confirms an hour.
- **19, 20** anonymous tallies on kept models (`Stamp.addCount`,
  `ConnectionsGrid` plays and ratings, `Song.plays`) are left as they are;
  profiles whose children are other players' match rows (`RMHboxProfile`,
  `RmhTypeProfile`) are reset, not deleted; public Slice It setlists stay
  like public decks (an owner decision); the pronunciation clip's file is
  deleted with the résumé files at the deletion request.

## Features

| #   | Feature                                                                                       | Surface                                           | Wave | Schema |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---- | ------ |
| 01  | [RMHTube watch statistics that count](features/01-rmhtube-stats.md)                            | RMHTube hub, `/rmhtube`                           | 2    | yes    |
| 02  | [Tournaments in the developer API](features/02-api-tournaments.md)                             | `/api/v1/tournaments*`                            | 2    | no     |
| 03  | [Drafts and scheduled posts in the developer API](features/03-api-scheduled.md)                | `/api/v1/me/scheduled*`                           | 3    | no     |
| 04  | [Lint on the notes, and a minimap of the whole song](features/04-chart-overview.md)            | Slice It chart editor                             | 1    | no     |
| 05  | [Fan-outs that finish after a restart](features/05-durable-fanouts.md)                         | Jobs worker, post alerts, event updates           | 3    | yes    |
| 06  | [Game assists in Dream Rift and Nightrail](features/06-more-game-assists.md)                   | `/dream-rift`, `/nightrail`, seeded daily run     | 3    | no     |
| 07  | [Move through the feed with the keyboard](features/07-feed-keyboard.md)                        | Every post list, `?` overlay                      | 7    | no     |
| 08  | [Developer API oversight for admins](features/08-admin-api-oversight.md)                       | `/admin/api-keys`, key check, keys manager        | 1    | yes    |
| 09  | [Recurring community threads](features/09-recurring-threads.md)                                | Community mod tools, jobs                         | 2    | yes    |
| 10  | [Scales and key signatures in RMH Music](features/10-music-scales.md)                          | `/rmhmusic` path                                  | 5    | no     |
| 11  | [Race your own best in RMHType](features/11-type-ghost.md)                                     | `/rmhtype/solo`, socket handler                   | 4    | yes    |
| 12  | [Webhooks for your builds, events, reading and tournaments](features/12-webhook-activity.md)   | `lib/webhooks`, endpoint form                     | 4    | no     |
| 13  | [What each game supports, on its page and in the library](features/13-game-access-info.md)    | `/games`, `/games/$gameId`                        | 6    | no     |
| 14  | [Search in the developer API](features/14-api-search.md)                                       | `/api/v1/search/*`                                | 5    | no     |
| 15  | [Pictures on flashcards](features/15-card-images.md)                                           | Card form, review, decks, API                     | 1    | yes    |
| 16  | [Brackets you can read as a list](features/16-bracket-list.md)                                 | `/tournaments/$id`                                | 5    | no     |
| 17  | [RSS for communities, build releases and game updates](features/17-rss-feeds.md)               | Three feed routes, three pages                    | 6    | no     |
| 18  | [Remove a spam account's recent content in one step](features/18-admin-spam-sweep.md)          | `/admin/sweeps`, user view, batch lookup          | 4    | yes    |
| 19  | [Erasure: profile extras, private tools and app data](features/19-erasure-private.md)          | `anonymizeAccount`, the registry                  | 6    | no     |
| 20  | [Erasure: game progress and saves, board by board](features/20-erasure-games.md)               | `anonymizeAccount`, game boards                   | 7    | no     |

### Why each one

- **01** `RmhTubeUserStats` is read by `lib/profile/app-profiles.server.ts`
  ("{{hours}}h watched", owner-only) and written by nothing; the RMHTube hub
  has every event it needs.
- **02** Sprint 07 rejected tournaments in the API only to keep
  `lib/tournaments/*` free for match scheduling, which shipped; game servers
  and bots want to report results.
- **03** Scheduled posts and drafts have no API, and the site's create counts
  `MAX_PENDING` without a lock (`lib/scheduled/api/scheduled.server.ts`); 03
  fixes the race for both.
- **04** `Timeline.tsx`, `NoteInspector.tsx` and `ChartEditor.tsx` carry three
  TODOs (§9 issue rings, §9 inspector list, §12.4 minimap) that the finished
  linter (`engine/editor/lint.ts`) can answer today.
- **05** Owner follow-ups from sprints 05 and 06: post alerts and event updates
  are at-most-once when the worker is killed mid-send.
- **06** `ASSIST_CAPABLE` holds two games; Dream Rift and Nightrail shake,
  flash and time inputs, and claim no accessibility feature.
- **07** No `j`/`k` exists; the shortcut registry and sprint 02's keyboard
  settings make character keys safe to add (WCAG 2.1.4 inherited).
- **08** Admins have no view of developer keys (only sprint 06's wholesale
  revoke); usage and refusal tables already exist per key and day.
- **09** Nothing repeats in communities (`ScheduledPost.scheduledAt` is one
  time); weekly threads are the community staple.
- **10** RMH Music's theory has chords, intervals and clefs but no scales or
  keys; its catalogue entry promises more lessons.
- **11** RMHType records every solo run per passage but offers no pace
  target; a progress curve (not a keystroke log) is enough.
- **12** Webhooks cover posts, follows and games only; five more of the
  member's own actions have obvious emit points.
- **13** `lib/game-capabilities.ts` is an honest registry of input, players,
  accessibility and content warnings that only the API and the assist layer
  read.
- **14** Bots cannot search; the site's operator search
  (`lib/search/parse.ts`) is public-only already.
- **15** Cards are plain text (`card-types.ts`); anatomy, maps and art need a
  picture. Sprint 05 rejected image cards for want of an upload pipeline and a
  storage quota. The pipeline now exists (the one ingest door, `POLICIES`,
  with metadata stripping and a daily upload allowance, and sprint 07 17's
  upload lifecycle); the storage bound is this feature's own 500-picture cap
  per member, with copies sharing objects instead of duplicating them.
- **16** Sprint 07's review fixed the 390 px overflow sprint 06 found
  (`467084b90`), by truncating the winner buttons; on a phone a bracket is
  still one 224 px round per screen with cut-off handles, and a tree is not
  readable with a screen reader.
- **17** RSS exists for blog, news, tags and people (`lib/rss.ts`), not for
  communities, builds or game updates.
- **18** A spam wave means one `moderateContent` call per item; report-group
  decisions cap at 50 and need reports.
- **19** 27 `todo` tables are clearly the member's own (profile extras, saved
  homes and places, ladder data, recipes, inbox arrangement).
- **20** 25 `todo` tables are per-game progress whose boards need checking,
  table by table.

## Rejected ideas

| Idea                                                        | Why not                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Team tournaments                                            | Splitting entry fees and prizes across a roster is a money decision; a team bracket without payouts is half a feature.                       |
| Balatro in the daily seeded run                             | The game runs in a Lua runtime (`features/balatro/engine/lua`); whether a solo run is a pure function of its seed, and how to validate a score, is unknown. |
| Sharing a Studio project read-only                          | A project references samples that live on the owner's device; uploading samples is an owner decision.                                       |
| Restoring a Slice It chart revision                         | Blocked on the chart editor's §17.2 (what an edit does to scores); the route's own TODO pairs them.                                        |
| Waveform and onset ghosts in the chart editor               | Needs the analyser's rejected onset candidates persisted (§6), a beatmap pipeline change.                                                  |
| Webhooks for other members' actions (new follower, comment on my post, RSVP to my event) | Pushes other members' identities to third-party URLs: the consent question sprint 07 recorded.                  |
| "Sign in with RMH Studios" for third-party apps (OAuth)    | Authorization server work with consent screens, token lifetimes and abuse policy; too large and too policy-laden for one feature.         |
| An accessible-name sweep of icon-only buttons               | About 19 instances found; a lint-rule change, not a feature.                                                                                |
| A public RMHTube stats card                                 | The card's own comment waits for a setting; whether watch history may be public is the owner's call (01 keeps it owner-only).             |
| Pinned posts in communities                                 | Communities have no pin of their own (`RMHark.pinnedAt` is a profile pin); how many, who pins and what it does to the feed is its own design. |
| Image occlusion cards                                       | Builds on 15's pictures; next sprint at the earliest.                                                                                       |
| Saves folders and notes in the API                          | A thin extension of `/api/v1/me/bookmarks`.                                                                                                 |
| RSS for events                                              | The personal ICS feed exists (`lib/calendar/feed.server.ts`); a public events feed is thin.                                               |
| Discussion threads on events                                | A new moderation surface on every event; hosts already post updates and anyone can link a post.                                           |
| Saved graphs in the calculator                              | Graphs are computed by a paid model per request (`GraphingCalculator.tsx`); saving them invites re-rendering cost.                         |
| Removing the unused `FeedAnnouncement` tables               | Superseded by the sitewide announcement; deleting dead tables is housekeeping, not a member-facing feature.                               |
| Fixing Studio's `projectDirty` after undo, e-mail change revocation | Small fixes (sprint 06 follow-ups), not features; e-mail change already asks the old address to approve.                            |
| Erasing ratings, activity rows, follows, subscriptions, `RebarReservation` | Product or owner calls recorded in the registry; 19 and 20 leave them `todo` or `owner`.                                    |
| Features for Tier 3 verticals (ladder, homes, rideshare, casino, elections) | Wait on owner decisions (consolidation audit Tier 3); 19 only erases their members' private rows.                         |

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at
the end of the sprint, measured as `plan.md` §Reporting describes, together
with the new `TODO_CEILING` and the tables 19 and 20 left `todo` with their
reasons.
