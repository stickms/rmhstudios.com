# Sprint 09 — Halves that never met: data nobody shows, backends with no page, and what deletion still leaves

Twenty features on surfaces where one half of a feature was built and the other half never arrived: a drafts page that
can publish or discard a post but not edit it although the edit endpoint exists, an RMHType key-statistics panel with a
heatmap that no page renders, a complete community wiki service with no page at all, game-guide revisions that are
written on every save and never shown, a media sweep that is tested and unwired, a "Save replay" button no game uses,
and a data model of feeds and lists the developer API cannot read. Around them, the next things members and owners reach
for — picture-occlusion flashcards on top of sprint 08's card pictures, moderator-pinned posts in communities, game
assists in two more games, the "hide me from leaderboards" switch reaching every board, system notices in the reader's
own language, and text that reads correctly in any script direction — four hardening features taken straight from sprint
08's follow-ups (scheduled posts skipping AutoMod, a double "Post now", reclaim sweeps that fail runs during a worker
outage, the unwired media sweep, keys and webhooks that keep running after a deletion request), and two erasure features
that take 26 of the registry's 43 `todo` tables off the list. Each one was checked against the sprint 08 branch tip
(sprints 1–8, sprint 08 not yet on `main`) so it repeats nothing that exists. Specifications are in
[`features/`](features/), the build order in [`plan.md`](plan.md), implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`, `docs/plans/2026-11-11-steel-design-implementation.md`) on
the site tier, and the app tier's own look (L8) in RMHType, Lights Out, Neon Driftway and Laundry Sort. None resolves a
section-18 open decision (D1, D3, D6, D7, D8, D10, D12) or an open owner decision (moderator notes in the data export,
the deletion grace period, unlisted tournament or listing meta, Apache `CF-Connecting-IP` stripping, blocked members
RSVPing to a blocker's events, RMHBox per-minigame history privacy, ownership transfer in the public mod log, emoji
reactions under quiet counts, recovery codes and trusted contacts having no product, a deleted member's follows, game
reviews, guides, jam entries and public decks, uploading Studio samples, how long `RebarReservation` bookings are kept,
a public setting for the RMHTube profile card, purchased cosmetics and season passes at erasure). Where a feature meets
one, its specification says which default it keeps.

### Validation pass (2026-11-22)

A second, skeptical pass against the sprint 08 tip replaced the original 01 (a Slice It miss heatmap whose recorder can
never run: see Rejected ideas) with "Edit a draft or scheduled post", re-sequenced the waves so no two features of a
wave edit the same unanchored file (06 moved to wave 3 beside 15's neighbour entries in the erasure registry, 18 to wave
7 after 07's change to the replay board reader), rescoped 12 onto the exclusions sprint 08's integration adds, and
corrected claims in 04, 05, 06, 08, 09, 11, 13, 15, 16, 17, 18 and 19 (each specification's "What exists" now matches
the code).

### Decisions taken by default (design pass, 2026-11-22)

The owner's standing rule is to take the most reasonable decision and record it. The design pass took these:

- **01** a draft's text, time, audience, content warning and image descriptions can be edited; its images, GIF, poll,
  community and price cannot (discard and rewrite); time capsules stay sealed.
- **02** key statistics are recorded from solo and daily runs as well as lessons; multiplayer races are not recorded
  (the socket hub owns them).
- **04** wiki pages follow the community's visibility; a private community's pages are readable by members only; banned
  members cannot edit; edits are rate-limited by the existing handlers; a stale edit is refused (409); the data export
  lists the member's edits without bodies (a revision holds the text before the edit, usually someone else's).
- **05** a guide's history is visible to its author (and readable by admins); only the author restores, and restoring
  writes a new revision (history is never rewritten); guides join the data export with their history.
- **06** at most three pinned top-level posts per community, pinned by moderators; pins show at the top of the
  community's own feed only, never in Home; the developer API's community feed is unchanged except for an additive
  `pinned` field.
- **11** a scheduled community post that AutoMod would hold is held into the mod queue at publish time, exactly as a
  live post is, and the author is told once.
- **12** the media sweep builds on sprint 08's exclusions (scheduled posts, card pictures, build screenshots, added at
  sprint 08's integration) and classifies every other surface; emoji packs and chat media stay excluded until their own
  lifecycle releases them; a swept row takes its size variants with it; the nightly and weekly jobs stay off until the
  owner turns the flag on after reading a preview.
- **13** a reclaim counts against a run only when a worker actually started it since the previous reclaim; an outage no
  longer fails runs.
- **14** a deletion request signs every session out, suspends the member's API keys and disables their webhooks, holds
  their scheduled posts; signing back in restores exactly what the request paused (sessions excepted). The account's
  visibility during the grace period is unchanged (owner decision).
- **15, 16** public personas and public custom feeds are kept like posts (published content under the tombstone; a feed
  is public if either its legacy `isPublic` flag or its visibility says so); everything private goes, Marathon lists
  included (their share links stop working); decided join requests stay for the moderators without the member's message;
  other members' "less of this author" signals naming the member stay (inert, and unindexed). Ratings and puzzle
  reputation are erased (the boards were erased by sprint 05's leaderboard privacy; ratings were the gap). Anonymous
  tallies on kept models are left as they are (sprint 08's counter rule).
- **17** Laundry Sort gets colour-safe glyphs and an untimed solo match; it has no flash, shake or quick-tap input, so
  it claims no calm-visuals or hold-to-press support.
- **18** the Lights Out replay board is ordered fewest moves first (it stores moves as its score), and can be filtered
  to one day's seed.
- **19** in-app notification text is rendered from a key in the reader's language; push and e-mail keep the stored
  English preview (the server has no per-member catalogue at send time).

## Features

| #   | Feature                                                                                     | Surface                                             | Wave | Schema |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---- | ------ |
| 01  | [Edit a draft or scheduled post](features/01-draft-edit.md)                                 | `/drafts`, the row's edit dialog                    | 5    | no     |
| 02  | [Your slow and missed keys in RMHType](features/02-weak-keys.md)                            | `/rmhtype/progress`, solo and daily runs            | 1    | no     |
| 03  | [Picture-occlusion flashcards](features/03-occlusion-cards.md)                              | Card form, review, API                              | 1    | yes    |
| 04  | [Community wiki pages](features/04-community-wiki.md)                                       | `/c/$slug/wiki`, `/c/$slug/wiki/$page`              | 2    | no     |
| 05  | [A game guide's history](features/05-guide-history.md)                                      | Guide page, `…/guides/$guideId/history`             | 3    | no     |
| 06  | [Pinned posts in communities](features/06-community-pins.md)                                | `/c/$slug`, post menu, mod log                      | 3    | yes    |
| 07  | [Leaderboard privacy on every board](features/07-board-privacy.md)                          | Every board reader, the setting's text              | 6    | no     |
| 08  | [Feeds and lists in the developer API](features/08-api-feeds.md)                            | `/api/v1/me/feeds*`, `/api/v1/feeds/*`              | 1    | no     |
| 09  | [Practice in the developer API](features/09-api-practice.md)                                | `/api/v1/me/typing*`, `/music*`, `/focus*`          | 3    | no     |
| 10  | [Deletions in the sync APIs](features/10-api-sync-deletions.md)                             | `/api/v1/me/deleted`, highlights, decks, bookmarks  | 5    | yes    |
| 11  | [Scheduled posts through the same gate, once](features/11-scheduled-gate.md)                | Scheduled publish, recurring "Post now"             | 2    | no     |
| 12  | [Uploads nobody uses, cleaned up safely](features/12-media-sweep.md)                        | Jobs, `/admin/media-sweep`                          | 4    | no     |
| 13  | [Reclaims that wait for the worker](features/13-durable-reclaims.md)                        | Bulk clean-ups, fan-outs, spam sweeps, jobs console | 4    | yes    |
| 14  | [A deletion request stops everything at once](features/14-deletion-pause.md)                | Account deletion, sign-in cancel                    | 5    | yes    |
| 15  | [Erasure: private tools, lists and study data](features/15-erasure-lists.md)                | `anonymizeAccount`, the registry                    | 4    | no     |
| 16  | [Erasure: ratings, puzzle boards and names in match records](features/16-erasure-boards.md) | `anonymizeAccount`, the registry, three indexes     | 6    | yes    |
| 17  | [Game assists in Neon Driftway and Laundry Sort](features/17-driftway-laundry-assists.md)   | `/neon-driftway`, `/laundry-sort`, assists page     | 2    | no     |
| 18  | [Save and share a Lights Out solve](features/18-lights-out-replays.md)                      | `/daily/lights-out`, replays, composer              | 7    | no     |
| 19  | [System notices in the reader's language](features/19-notice-language.md)                   | `createNotification`, every SYSTEM emitter, inbox   | 7    | yes    |
| 20  | [Text that reads right in any direction](features/20-text-direction.md)                     | Every renderer of member-written text               | 7    | no     |

### Why each one

- **01** `updateScheduledApi` (`PATCH /api/scheduled/$id`, the same `updateScheduledPost` the developer API uses) has no
  client caller; the drafts page can only publish or discard, so a typo, a new time or a description a community asks
  for (11's refusal) means rewriting the post.
- **02** `components/rmhtype/TypingStats.tsx` and `KeyHeatmap.tsx` (655 lines, a colour-vision-safe heatmap and a
  "practice your worst keys" test) are imported by nothing (`docs/_generated/knip-report.txt`), and only lessons send
  key statistics (`LessonRunner.tsx`).
- **03** Sprint 08 rejected image occlusion only because card pictures did not exist yet; they do (`frontImageUrl`,
  `card-images.server.ts`).
- **04** `lib/communities/pages.server.ts` (create, edit, roll back, delete, edit policies, trusted editors) and three
  registered endpoints have no page; `components/communities/DocEditor.tsx` was written for them and is imported by
  nothing.
- **05** `updateGuide` (`lib/games/meta.server.ts`) snapshots a `GameGuideRevision` on every body change; nothing reads
  them.
- **06** Communities have announcements but no way to keep a member's post at the top; sprint 08 deferred it as "its own
  design" — this is that design.
- **07** Sprint 05's follow-up: "hide me from leaderboards" covers the game boards and XP only; daily puzzles, RMHType
  daily, ranked, speedrun, Doctrine, pick'em, forecasting, tips, community contributors and Nightrail tricks read
  without it.
- **08** `CustomFeed` (feeds, lists, saved searches, alerts) is read through one module (`lib/feeds/feeds.server.ts`)
  and has no API.
- **09** Typing, music and focus practice are recorded per member and have no API; bots and personal dashboards ask for
  them.
- **10** Sprint 07's follow-up: the highlights since-sync cannot report deletions (`me/highlights/$id.ts`: "Not
  tombstoned"); decks, cards and bookmarks have the same hole.
- **11** Sprint 08's follow-ups: "site scheduled community posts never run AutoMod" and "'Post now' double-click posts
  twice".
- **12** `sweepUnreferencedMedia` is unwired (sprint 08's integration adds the exclusions that make wiring it safe);
  rows name only the full-size variant, so smaller variants would be left behind; sprint 08 19's pronunciation clips can
  be orphaned.
- **13** Sprint 07 15's and sprint 08 05's follow-ups: about five minutes of jobs-worker downtime can fail a run that
  was never attempted; sprint 08 18's crash window loses an undo record.
- **14** Account deletion's own follow-up: the 30-day window leaves keys, webhooks and other devices' sessions running.
- **15** 18 `todo` tables are the member's own lists, tools and study data.
- **16** 8 `todo` tables are ratings and puzzle boards; sprint 08 20 left names in match snapshots and an unretried
  scrub.
- **17** `ASSIST_CAPABLE` holds four games; Neon Driftway (described as `flashing`) and Laundry Sort claim no
  accessibility feature at all (`lib/game-capabilities.ts`).
- **18** `components/replays/SaveReplayButton.tsx` and `submitReplayApi` are used by nothing, though `replayableGames`
  verifies Lights Out solves; the Lights Out replay board sorts `score desc` over a move count.
- **19** 134 `SYSTEM` notification sites in 95 files, plus five direct row writers, build English `preview` text on the
  server; every other locale reads English.
- **20** Sprint 07's browser pass: English text in `ar` shows punctuation on the wrong side; post, comment and message
  bodies carry no `dir="auto"`.

## Rejected ideas

| Idea                                                                                                             | Why not                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A Slice It miss heatmap in the chart editor (the original 01)                                                    | Its premise fails: `recordNoteStats` needs a chart id, and no run has one — the chart picker sets `selectedChartId`, which nothing reads, so every run plays `Song.analysisData` and submits no `chartId` (`resolveChart`'s own comment says so). The heatmap waits for authored charts to be playable (C2 playback), which changes ranked boards and meets §17.2. |
| Voting in polls through the API                                                                                  | One endpoint beside `POST /api/v1/posts` (which already creates polls) and `GET /api/v1/posts/{id}` (which already returns results); too thin.                                                                                                                                                                                                                     |
| Notification read state in the API                                                                               | A mark-read endpoint and a count; thin, and it adds little a client cannot already do on the site.                                                                                                                                                                                                                                                                 |
| Versecraft endings                                                                                               | `unlockedEndings` is always `[]` (`persistence.ts:181`), but the twelve endings are not written in any chapter; this is a writing task and a game-design call on unlock rules.                                                                                                                                                                                     |
| Live updates for edited image descriptions                                                                       | A one-event change to `useFeedSSE` (sprint 05 follow-up); not a feature.                                                                                                                                                                                                                                                                                           |
| Fixing legacy RMHTube playlist durations                                                                         | A one-off data fix (sprint 05 follow-up).                                                                                                                                                                                                                                                                                                                          |
| Restoring a Slice It chart revision                                                                              | Still blocked on the chart editor's §17.2 (what an edit does to scores).                                                                                                                                                                                                                                                                                           |
| Vega's "damage core" (`EntityManager.ts:65`)                                                                     | One game-mechanic TODO; a design call for the game, not a feature.                                                                                                                                                                                                                                                                                                 |
| RMHHomes affordability panel, distance filter; RMHLadder answer bank and prep sheet                              | Unused components in Tier 3 verticals, which wait on owner decisions (consolidation audit); the prep sheet also needs a paid model.                                                                                                                                                                                                                                |
| Gifting coins (`GiftCoinsButton.tsx`), the remix revenue share (`lib/remix`)                                     | Coin movements; money changes are owner decisions.                                                                                                                                                                                                                                                                                                                 |
| Friends rail, notifications popover, activity line                                                               | Unused shell pieces; the Steel layout (plan §9) fixes what the shell holds, and the sidebar's content is next to D3.                                                                                                                                                                                                                                               |
| Cancelling the Stripe subscription at deletion                                                                   | Needs Stripe credentials this program does not have, and is money.                                                                                                                                                                                                                                                                                                 |
| Hiding an account on every read path during the grace period                                                     | What the 30 days look like from outside is the deletion-grace owner decision; 14 stops only what acts on the member's behalf.                                                                                                                                                                                                                                      |
| Warning about remapped shortcuts that clash with feed keys                                                       | A settings-page line (sprint 08 07's follow-up), not a feature.                                                                                                                                                                                                                                                                                                    |
| Team tournaments                                                                                                 | Still a money decision (splitting fees and prizes).                                                                                                                                                                                                                                                                                                                |
| An admin page of pending deletions                                                                               | Lists members who are leaving, next to the grace-period decision; small.                                                                                                                                                                                                                                                                                           |
| Erasing activity, RSVPs, follow-like rows, inventory, quests, season progress, streaks, listings, handle history | Product or owner calls recorded in the registry; 15 and 16 leave them `todo`.                                                                                                                                                                                                                                                                                      |
| Community join-request withdrawal on its own                                                                     | Folded into 15 (a pending request from a deleted account is withdrawn).                                                                                                                                                                                                                                                                                            |
| Discussion threads on events, RSS for events                                                                     | Still rejected for sprint 08's reasons.                                                                                                                                                                                                                                                                                                                            |

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at the end of the sprint, measured as
`plan.md` §Reporting describes, together with the new `TODO_CEILING` and the tables 15 and 16 left `todo` with their
reasons.
