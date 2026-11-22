# Sprint 10 — Joining up what members already have, and the doors that skipped the rules

Twenty features, mostly for members, after two sprints heavy on hardening. Most join two things the site already has but
never connected: reading highlights and flashcards (01), short recordings and cards (02), a community and its events
(07, whose backend exists and whose page never did), a build and its bugs (09), a reader and a link to one sentence
(11), a typing app and the texts a member actually types (05), a privacy setting and a way to see what it does (08).
Around them, the next things members reach for in the apps they use most — a per-day study pace with a test date (03),
corrections that flow back to a public deck's author (04), the bass clef for piano learners (06), mutes that end on
their own (10) — three developer-API surfaces (hosting events, moderating a community, RMHTube), three admin tools
(webhook oversight, the speedrun review queue whose API was built and never given a page, community oversight), one
hardening feature that closes six doors the follow-up lists name (including a profile form that skips the handle reclaim
block), one erasure feature that takes the registry from 17 `todo` tables to 4, and one sweeping feature that puts
refusals into the reader's language through the error taxonomy the site already has. Each was checked against the sprint
09 branch tip (sprints 1–9, sprint 09 not yet on `main`) so it repeats nothing that exists. Specifications are in
[`features/`](features/), the build order in [`plan.md`](plan.md), implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`, `docs/plans/2026-11-11-steel-design-implementation.md`) on
the site tier, and the app tier's own look (L8) in RMHType (05), RMH Music (06) and the library's book reader (11). None
resolves a section-18 open decision (D1, D3, D6, D7, D8, D10, D12) or an open owner decision (moderator notes in the
data export, the deletion grace period, unlisted tournament or listing meta, Apache `CF-Connecting-IP` stripping,
blocked members RSVPing to a blocker's events, RMHBox per-minigame history privacy, ownership transfer in the public mod
log, emoji reactions under quiet counts, recovery codes and trusted contacts having no product, a deleted member's
follows, game reviews, guides, jam entries and public decks, uploading Studio samples, how long `RebarReservation`
bookings are kept, a public setting for the RMHTube profile card, purchased cosmetics and season passes at erasure).
Where a feature meets one, its specification says which default it keeps.

### Validation pass (2026-11-22)

A second pass against the sprint 09 tip corrected 01, 02, 03, 06, 07, 10, 12, 13, 14, 17 and 18 (each specification's
"What exists" now matches the code) and found three follow-ups already fixed; [`plan.md`](plan.md) §Validation lists
each change.

### Second validation pass (2026-11-22)

A fresh pass against the code changed eleven specifications; [`plan.md`](plan.md) §Validation pass 2 lists each. The
largest: 10 had re-specced muted-word expiry, which sprint 05 shipped (now account mutes only, no new model); 03's
per-day default would have changed every member's queue (now opt-in); 02 would have shared member audio with copiers (an
open owner decision; now private to the recorder, with an upload policy and caps); 13's scope would have reached every
wildcard key; 19 erased RMHTube channel subscriptions, which are follows of a member (now `owner`); 04's suggestions are
now off until the author turns them on.

### Decisions taken by default (design pass, 2026-11-22)

The owner's standing rule is to take the most reasonable decision and record it. The design pass took these:

- **01** a card from a highlight is basic (the member writes the question) or cloze (up to five picked words); the card
  text must be a substring of the highlight; the link back to the highlight is the owner's only and never copied with a
  public deck.
- **02** one sound per side, up to 15 s and 512 KB, a transcript required (the sound's text alternative); nothing
  autoplays; a sound is heard by its recorder only — copies, sync and other members' payloads never carry it, because
  member audio heard by others is the open audio-storage owner decision and public decks have no report path; uploads
  are sniffed, `PENDING`-claimed like pictures, capped at 200 sounded cards and the pictures' daily allowance; the
  recordings are erased at deletion though the cards stay; the API reads the owner's sounds, it does not write them.
- **03** the pace is opt-in per deck: a deck with no pace keeps today's 20-new-cards-per-session behaviour exactly (a
  site-wide per-day default would silently change every member's queue); a test date suggests a pace and never changes
  it on its own.
- **04** suggestions edit the text of an existing basic, reversible or cloze card only; they are off until the deck's
  author turns them on (default off, existing decks included); per-member, per-day and per-deck caps and duplicate
  refusal bound the author's inbox; the author accepts through the normal edit, so copies get it through sync;
  suggestions are private to the two people; the suggester's are erased.
- **05** up to 50 private texts per member, never on a board; editing a text's body resets its bests.
- **06** a new unit after "Meet the staff & the keys" with four lessons and new ids, for piano learners only (guitar
  music is written in the treble clef; guitar and voice paths unchanged); grand-staff cards are scheduled per staff; the
  playing lesson is a new note-finder mode, not `play-note`.
- **07** community events get an Events tab (no count in its label, which would query on every page view); only
  moderators host (the backend's rule); a new event posts nothing to the feed and sends no post alert; hosting and
  cancelling are mod-log actions.
- **08** two audiences are computed for real (signed out, a signed-in stranger through a reserved id that no write path
  may use); every other member's item is also checked against the owner's own view, so the preview never shows the owner
  something they could not open (a blocker's post, a circle they are outside); follow lists are reported, not listed;
  followers and mutuals are described from the settings, not simulated.
- **09** issues of a public build are public; the creator can hide one (it stays visible to its reporter); a deleted
  reporter's issues stay under "Deleted user", their "me too" marks go.
- **10** account mutes for a day, a week, 30 days or until undone, with the durations muted words already have
  (`lib/feed/muted-expiry.ts`, sprint 05: words are not re-specced); read-time filtering makes an expiry exact, a daily
  job only tidies; nobody is told when a mute ends; no new model, so no erasure change.
- **11** a passage link carries the anchor in the URL (`?p=`), with no server row; the canonical URL is unchanged.
- **12** hosting through the API is a new `manage:events` scope (`write:events` keeps its RSVP-only meaning); co-hosts
  and occurrence overrides stay on the site.
- **13** `manage:moderation`, granted only when chosen by name (`*` and `manage:*` do not include it, so no existing
  wildcard key gains ban power) and checked against the key owner's moderator role on every request; the site route's
  approve and remove side effects move into one shared function both paths call.
- **14** RMHTube: Watch later read and write, parties read and "going", own statistics read; no party creation.
- **15** an admin disable of a webhook carries a reason the owner reads and blocks re-enabling; lifting it leaves the
  endpoint off; no admin view shows a secret, a payload, a signature or the URL beyond its host and first path segment
  (webhook URLs often carry tokens).
- **16** verdicts are compare-and-set on `pending`, audited and told to the runner; a decided run can be reopened with a
  reason (today's overwrite is how a wrong verification is reversed); the reverify pass runs nightly.
- **17** the only admin action on a community is "out of discovery" with a reason (members, page and feed unchanged); no
  freeze, archive or deletion (sprint 06 recorded archiving as an owner call).
- **18** the profile form's handle change goes through `changeHandle` (one cooldown rule, the reclaim block, the history
  row); an assisted run sets no ghost; both recurring-thread claims guard each other; the API's held hint includes
  AutoMod; sweep items are written atomically; cancelling the membership grant grants nothing.
- **19** subscriptions to feeds, series and watches are erased with their counters corrected — they are not the `Follow`
  graph the owner decision covers, which stays `owner`; `RmhTubeSubscription` becomes `owner` beside it, because an
  RMHTube channel is a member (`channelId` → `User`), so erasing it would decide the follows question; RSVPs, activity
  rows, listings, the roommate profile, the driver application, own collections, quota requests and quest progress are
  erased; handle history is kept for the rest of its 30-day reclaim window and then erased by a job. `Streak` stays
  `todo` beside the purchase tables, because it holds freeze tokens that may be bought.
- **20** refusals carry a `code` beside their English `error`; the client renders the code's `errors:` key and falls
  back to the server text; at least 100 of the about 250 `serverError` call sites move this sprint (the `t()` switch
  lives in `components/`, where the extractor reads), and a ratchet holds the rest.

## Features

| #   | Feature                                                                                         | Surface                                                      | Wave | Schema |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---- | ------ |
| 01  | [Flashcards from your highlights](features/01-highlight-cards.md)                               | Highlights notebook, highlight menu, deck editor             | 1    | yes    |
| 02  | [Sound on flashcards](features/02-card-sound.md)                                                | Card form, review, decks, API (read)                         | 2    | yes    |
| 03  | [A study pace for each deck, and a test date](features/03-study-pace.md)                        | Deck page, review session                                    | 3    | yes    |
| 04  | [Suggest a correction to a public deck](features/04-deck-suggestions.md)                        | Public deck page, copied cards, deck editor                  | 4    | yes    |
| 05  | [Your own texts in RMHType](features/05-type-texts.md)                                          | `/rmhtype/texts`, solo page                                  | 3    | yes    |
| 06  | [The bass clef and the grand staff in RMH Music](features/06-bass-clef.md)                      | RMH Music path, staff flashcards, play-the-note              | 1    | no     |
| 07  | [Events on a community's page](features/07-community-events.md)                                 | `/c/$slug` Events tab, event composer, mod log               | 2    | no     |
| 08  | [See your profile as others see it](features/08-profile-preview.md)                             | `/settings/preview`, own profile                             | 6    | no     |
| 09  | [Bug reports on user builds](features/09-build-issues.md)                                       | `/builds/$slug/issues`, build page                           | 5    | yes    |
| 10  | [Mute an account for a day, a week or a month](features/10-timed-mutes.md)                      | Post menu, `/settings/blocked`                               | 5    | yes    |
| 11  | [A link to any passage, and posting one](features/11-passage-links.md)                          | Article and book readers, selection menu, `/share`           | 5    | no     |
| 12  | [Host your events through the developer API](features/12-api-events.md)                         | `/api/v1/events*` writes, `manage:events`                    | 1    | no     |
| 13  | [Moderate a community through the developer API](features/13-api-moderation.md)                 | `/api/v1/communities/{slug}/modqueue*`, `…/sanctions*`       | 3    | no     |
| 14  | [RMHTube in the developer API](features/14-api-rmhtube.md)                                      | `/api/v1/me/rmhtube/*`, `/api/v1/rmhtube/parties*`           | 4    | no     |
| 15  | [Webhook oversight for admins](features/15-admin-webhooks.md)                                   | `/admin/webhooks`, owner's console                           | 4    | yes    |
| 16  | [The speedrun review queue](features/16-speedrun-queue.md)                                      | `/admin/speedruns`, jobs, runner notices                     | 2    | yes    |
| 17  | [Community oversight for admins](features/17-admin-communities.md)                              | `/admin/communities`, discovery readers                      | 6    | yes    |
| 18  | [Close the gaps sprints 08 and 09 left open](features/18-race-fixes.md)                         | Handles, ghosts, recurring threads, held hint, sweeps, grant | 6    | no     |
| 19  | [Erasure: subscriptions, activity, RSVPs, handles and listings](features/19-erasure-follows.md) | `anonymizeAccount`, the registry, one job                    | 7    | no     |
| 20  | [Error messages in the reader's language](features/20-error-language.md)                        | Every refusal toast in ten domains, the error taxonomy       | 7    | no     |

### Why each one

- **01** Highlights (`lib/reading/highlights.server.ts`) and flashcards (`lib/study/deck-editor.server.ts`) never
  reference each other; a reader who studies copies text between two apps by hand.
- **02** Card pictures exist (sprint 08 15) and a safe short-audio pipeline exists (sprint 08 19's pronunciation clip,
  `lib/profile/audio-sniff.ts`); cards have no sound, which language learners need most.
- **03** `NEW_PER_SESSION = 20` (`lib/study/queue.ts`) is per session, not per day or per deck: five sessions in an
  evening introduce 100 new cards, and there is no way to aim at a test date. The fix is opt-in per deck, so nobody's
  queue changes unasked.
- **04** Sync runs author → copies only (sprint 06 08); every copier fixes the same typo privately.
- **05** The pasted custom test (sprint 09 02, `CustomTestPanel.tsx`) keeps nothing; there is no history per text.
- **06** The path teaches the treble clef only, though `theory/clef.ts` and the decks already model the bass clef (used
  today only for low singers).
- **07** `EventComposer`'s `communityId` prop has no caller and `GET /api/events?scope=community` no client: a moderator
  cannot create a community event, and a community page cannot list one.
- **08** Members set many audiences (presence, follow lists, shelves, leaderboards, activity) and can check none; admins
  have a view-as for the other direction only.
- **09** Bug reports are comments with no status, steps or link to the release that fixed them.
- **10** `UserMute` has no end, though muted words have expired since sprint 05; temporary mutes are the common case
  (events, spoilers).
- **11** Text anchors exist (`lib/library/text-anchor.ts`) and the composer opens from `/share`; no reader accepts a
  passage in its URL.
- **12** The API reads events and RSVPs (sprint 07 10) but cannot host; the site functions are complete.
- **13** Mod bots are the most-asked-for automation for communities; the queue and sanctions are complete on the site.
- **14** RMHTube has Watch later, parties and stats (sprint 08 01) and no API.
- **15** Webhooks auto-disable after 20 failures and nothing else lets an admin see or stop one; sprint 08 08 gave API
  keys this, not webhooks.
- **16** `lib/speedrun/api/speedrun.verify.server.ts` is a complete admin API with no page, and its drain pass says it
  waits to be "wired into `server/jobs`"; verdicts are unaudited and silent.
- **17** `/admin` has no community page; the only community tool is taking over an ownerless one.
- **18** Six follow-ups that are bugs, not designs: `lib/api/routes/profile.server.ts` bypasses `changeHandle` (its own
  note says so), the ghost POST has no assist check (s09 17), the two recurring claims race (s09 11), the held hint
  misses AutoMod (s09 11), the sweep's crash window and failed-run undo (s08 18, s09 13), the grant that cancels into a
  month (s04 19).
- **19** 13 of the 17 `todo` tables can leave `todo` without a new owner call (12 erased, one filed under the existing
  follows decision).
- **20** `ERROR_CODES` (`lib/errors/codes.ts`) was built for translated refusals and holds 19 codes; about 250 call
  sites still show the server's English through `serverError`.

## Rejected ideas

| Idea                                                                        | Why not                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A first-week checklist (`FirstWeekCard.tsx`, `/api/onboarding` unused)      | Claiming it pays `ONBOARDING_REWARD = 100` coins (`lib/onboarding.server.ts`); putting it on screen turns on a coin faucet, which is a money decision for the owner.                           |
| Game assists in a fourth pair of games                                      | The games left are a WebGL fighting game (Kowloon Knockout), Velum 2099 under `@ts-nocheck`, and card games that already claim `no-timed-input` (Gabriel's Horn); little to gain for the work. |
| The daily puzzle archive                                                    | Exists: the puzzle endpoint serves 60 past days and the history UI shows 14 (`lib/daily-puzzles/api/daily-puzzles.puzzle.server.ts`).                                                          |
| Import a Goodreads export into shelves                                      | Shelves hold library items only (`ReadingShelfEntry.docSlug`); books outside the library have nowhere to go.                                                                                   |
| Post edit history, search inside a community, community flair               | Exist (`RMHarkEdit` and `EditHistory.tsx`; `in:<slug>` in `lib/search/posts.server.ts`; `lib/communities/flairs.server.ts`).                                                                   |
| Pinned messages, message search, chat folders                               | Exist (`ChatPin`, `/api/messages/search`, `ChatFolder`).                                                                                                                                       |
| Typed answers for flashcards                                                | Exist in practice tests (`components/study/questions/Written.tsx`).                                                                                                                            |
| The RMHStudy hub streak that never increments                               | Already fixed (`lib/rmhstudy/streak.ts`, `recompute-streaks.server.ts`); the follow-up line is stale.                                                                                          |
| The card-picture lock races (sprint 08 15 follow-up)                        | Already fixed: `applyUpdates` gathers every URL, takes the locks once in sorted order and re-reads the cards under them (`lib/study/deck-sync.server.ts`, s09-03).                             |
| The quiz edit that writes before refusing (sprint 07 follow-up)             | Already fixed: the quiz edit runs after every other check (`lib/feed/api/rmharks.$id.server.ts`).                                                                                              |
| Webhooks for community moderators (report filed, item held)                 | Pushes other members' content and identities to third-party URLs: the consent question sprints 07 and 08 recorded; 13 is pull-only.                                                            |
| Hide a community from Home without leaving it                               | Thin beside 10, and it needs a decision about community alerts; a candidate to build on 10's expiry model later.                                                                               |
| Chords in every key in RMH Music                                            | One music unit per sprint; the bass clef unblocks reading piano music, which chords do not.                                                                                                    |
| Tournaments limited to a community's members                                | Competes with 07 for the community page; entry fees and prizes make member-only entry an owner question.                                                                                       |
| Translate posts                                                             | Sends members' words to a paid provider: the consent decision sprint 06 recorded for messages.                                                                                                 |
| Delete one notification; edit a profile link (unused contracts)             | `deleteNotificationApi` and `updateProfileLinkApi` have no caller, but each is one button: too small to be features.                                                                           |
| Support tiers (`SupportTierPicker.tsx` unused), gifting coins               | Money.                                                                                                                                                                                         |
| An admin page of pending deletions                                          | Still next to the deletion-grace owner decision (sprint 09).                                                                                                                                   |
| Saving graphs in RMHCalculator                                              | Every graph is computed by a paid model per request (sprint 08's reason stands).                                                                                                               |
| Versecraft endings, restoring a Slice It chart revision                     | Writing, not code; blocked on the chart editor's §17.2 (sprints 07–09).                                                                                                                        |
| Erasing `RebarReservation`, `UserInventory`, `UserSeasonProgress`, `Streak` | Owner calls: how long bookings are kept, purchased cosmetics and season passes (and bought streak freezes). 19 leaves them `todo`.                                                             |

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at the end of the sprint, measured as
`plan.md` §Reporting describes, together with the new `TODO_CEILING`, the `serverError` ratchet's baseline and the
tables 19 left `todo` with their reasons.
