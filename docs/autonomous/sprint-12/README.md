# Sprint 12 — Members' work, made trustworthy and findable

Twenty features. Most are about what members make and do on the site, and whether others can trust and find it: a roll
the whole table sees, rolled by the site from the real sheet (01); a friend's ghost to race (03); grids that can be
drafted, tried and fixed before strangers play them (06); a profile module that shows what a member has made (07);
ratings that find the good public decks (08); notes and a side-by-side comparison of saved homes (10). Several give an
app the next thing its members reach for: a new RMHBox minigame (02, one of eight that were stubs), the Slice It chart
versions the editor has been saving and nobody could see (04), rhythms read from the page and tapped in RMH Music (05),
a card's history and a way to start it over (09). Two open the developer API to study and tabletop tools (12, 13). Two
give admins pages they have had to do without: account deletions in progress and failing (14), and the feeds that fill
RMHHomes (15). One is access: every page change announced to a screen reader (11). Five are hardening, from the
follow-up lists: a report path for four kinds of member-made content with takedowns that stick (16), RMHType results
checked by the server (17), a deletion request that stops the membership's billing (18), the last English notices in
the reader's language (19) and seven small gaps sprints 10 and 11 recorded (20). Each was checked against the sprint 11
branch tip (designed on `83d19d02b`, re-validated on `5714f0006`, sprints 1–11, sprint 11 not yet on `main`) so it repeats nothing that exists. Specifications
are in [`features/`](features/), the build order in [`plan.md`](plan.md), implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`, `docs/plans/2026-11-11-steel-design-implementation.md`)
on the site tier (06, 07, 08, 09, 10, 14, 15, 16, 18, 19, 20 where it is site tier; 11 adds nothing visible), and the
app tier's own look (L8) in RMHCharacters, RMHBox, Neon Driftway, Slice It, RMH Music and RMHType. None resolves a
section-18 open decision (D1, D3, D6, D7, D8, D10, D12) or an open owner decision (moderator notes in the data export,
the deletion grace period, unlisted tournament or listing meta, Apache `CF-Connecting-IP` stripping, blocked members
RSVPing to a blocker's events, RMHBox per-minigame history privacy, ownership transfer in the public mod log, emoji
reactions under quiet counts, recovery codes and trusted contacts having no product, a deleted member's follows, game
reviews, guides, jam entries and public decks, uploading Studio samples, how long `RebarReservation` bookings are kept,
a public setting for the RMHTube profile card, purchased cosmetics and season passes at erasure). Where a feature meets
one, its specification says which default it keeps.

The erasure registry is at four `todo` entries, each needing a product call, so this sprint has no erasure feature:
every new table is classified by the feature that adds it, and `TODO_CEILING` stays 4.

### Decisions taken by default (design pass, 2026-11-23)

The owner's standing rule is to take the most reasonable decision and record it. The design pass took these:

- **01** the server rolls a table roll from the stored sheet (a client never sends a modifier or a result); rolls are
  `table`, `gm` (the roller and the game master) or `secret` (the game master's own); the newest 200 per party are kept;
  names are joined, never copied; the device-only log of sprint 11 02 stays.
- **02** five items a round from sets of six to eight stable, sourced facts; footrule scoring; nothing about the order
  reaches a client before the reveal.
- **03** mutual follows only, never across a block or for a member hidden from boards; a friend's ghost only up to the
  friend's validated board score (the `top` rule); no notices.
- **04** restore is an undoable edit in the editor, saved through the existing save path (so a published chart's lint
  still applies, and no new rule for its board is invented); a nightly prune keeps named and published versions.
- **05** a "Read rhythms" unit on every path, voice included, after "Rhythm basics": five lessons, 4/4 and 3/4, scored
  by matching onsets within the existing timing windows.
- **06** drafts are private and count toward the cap; a grid can be edited until another member plays it (a
  compare-and-set); "Try it" checks guesses in the browser and writes nothing; drafts are erased with the account.
- **07** "Made here" is an opt-in profile module listing up to four of each published thing; nothing unpublished,
  hidden, private or moderated.
- **08** only a member who studied a copy (20 reviews) may rate; stars only, no written review (reviews are an open
  owner decision); averages shown from 3 ratings; "Best rated" is a Bayesian average.
- **09** the history is the member's own rows; "Start over" resets the schedule and keeps the log; key `i`; one
  `CONCURRENTLY` index.
- **10** notes are private plain text on the saved row; compare up to four saved listings; the distance place stays on
  the device; saved homes join the data export.
- **11** announce the new title on a pathname change only, politely; move focus to the content only after a
  keyboard-started navigation on the site tier; a title gate with a shrinking duplicate baseline.
- **12** one grading path for the site and the API; grading needs a new explicit scope `write:study-reviews` (sprint 06
  13 kept reviews out of the API and `write:study` promises "Reviews cannot be written"); an API grade earns no quest
  progress or XP; grade names, not numbers; idempotent grading; no card sound in any response.
- **13** read-only (`read:characters`); summaries computed by the site's functions; never another player's sheet;
  `portrait` removed from sheets.
- **14** attempts recorded with the error's name only; "Try again now" only for an overdue erasure, audited and claimed;
  no "delete now".
- **15** pause and resume as compare-and-set; RSS feeds added by admins through the SSRF guard (Craigslist regions stay
  in code); "Run now" queues one `MANUAL` scrape.
- **16** four new report types, all removable; takedowns set a `moderatedAt` that the owner's own toggle cannot undo;
  the owner keeps their copy; external listings are not reportable; no restore path (none exists for any report type).
- **17** one check (`evaluateFinish`, moved to `run-check.ts`) for solo and room runs; a failed check is shown "Not
  ranked" with its reason; historic bests are not rewritten.
- **18** cancel at the period's end on request (no refund, no proration), resume on restore what the request changed,
  cancel immediately at erasure; one reconciling job decides from the member's state when it runs, so a withdrawn
  request always ends renewing; Stripe outside transactions, retried, faked in every test; the erasure waits for
  billing to stop.
- **19** frames are translated, quoted words (a moderator's message, an admin's reason, a recipe's text, a job title)
  are params; e-mail and Discord alerts stay English.
- **20** seven items (an eighth, the Studio recorder faults, was fixed on the sprint 11 branch and dropped), each re-checked at wave start; an item already fixed is reported, not redone.

## Features

| #   | Feature                                                                                          | Surface                                                     | Wave | Schema |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---- | ------ |
| 01  | [Roll for the table](features/01-party-rolls.md)                                                 | RMHCharacters party, sheets' roll bar                       | 1    | yes    |
| 02  | [Ranking File, a new RMHBox minigame](features/02-ranking-file.md)                               | RMHBox picker, rounds, history                              | 3    | no     |
| 03  | [Race a friend's ghost in Neon Driftway](features/03-friend-ghosts.md)                           | Neon Driftway ghost switch, friend picker                   | 4    | no     |
| 04  | [Earlier versions of a Slice It chart](features/04-chart-history.md)                             | Chart editor "Versions", a nightly prune                    | 6    | no     |
| 05  | [Read and tap rhythms in RMH Music](features/05-music-rhythms.md)                                | RMH Music path, "Read rhythms" unit                         | 1    | no     |
| 06  | [Draft, test and fix your Connections grids](features/06-connections-maker.md)                   | `/connections/new`, `/connections/mine`, grid page          | 2    | yes    |
| 07  | ["Made here": what a member has made, on their profile](features/07-profile-made.md)             | Profile showcase module                                     | 5    | no     |
| 08  | [Rate a public deck, and find the good ones](features/08-deck-ratings.md)                        | `/study/browse`, deck page                                  | 6    | yes    |
| 09  | [One card's history, and starting a card over](features/09-card-history.md)                      | Review session, deck editor                                 | 3    | yes    |
| 10  | [Notes on saved homes, and comparing them side by side](features/10-homes-compare.md)            | `/homes/manage` Saved, `/homes/compare`, listing page       | 1    | yes    |
| 11  | [Say where you are after every page change](features/11-route-announce.md)                       | Every route, a title gate                                   | 7    | no     |
| 12  | [Review flashcards through the developer API](features/12-api-reviews.md)                        | `/api/v1/me/decks/{id}/review`, card review                 | 2    | no     |
| 13  | [Characters and parties in the developer API](features/13-api-characters.md)                     | `/api/v1/me/characters*`, `/api/v1/me/parties*`             | 4    | no     |
| 14  | [Account deletions, for admins](features/14-admin-deletions.md)                                  | `/admin/deletions`, the finalise job                        | 5    | yes    |
| 15  | [The home listing feeds, for admins](features/15-admin-homes.md)                                 | `/admin/homes`, the homes worker                            | 3    | no     |
| 16  | [Report a puzzle grid, a public deck, a persona or a listing](features/16-member-reports.md)     | Four pages' menus, admin reports, Your reports              | 4    | yes    |
| 17  | [RMHType results the server can stand behind](features/17-type-scoring.md)                       | RMHType solo and rooms                                      | 5    | no     |
| 18  | [A deletion request ends the membership too](features/18-deletion-billing.md)                    | Delete-account panel, deletion pause, erasure               | 2    | yes    |
| 19  | [The last English notices, in the reader's language](features/19-notice-helpers.md)              | Inbox: ladder alerts, key notices, decisions, admin alerts  | 6    | no     |
| 20  | [Close the gaps sprints 10 and 11 left open](features/20-s11-gaps.md)                            | Study, admin keys, mod log, Studio, events, admin users     | 7    | no     |

### Why each one

- **01** Sheet rolls stay on the device (sprint 11 02) and a party shows summaries (sprint 11 03); a table still reads
  its dice aloud, and sprint 11 left shared rolls for after both shipped.
- **02** Eight RMHBox minigames are commented out of `MINIGAME_REGISTRY` and render "Minigame coming soon…"; Ranking
  File's entry already says what it is.
- **03** Ghosts are your own best or the world's top five; the boards have a friends scope and the ghosts do not.
- **04** `ChartRevision` rows are written on every save and listed by an endpoint no screen calls; restore is a TODO; no
  prune.
- **05** "Rhythm basics" names note values and taps a steady beat; nothing asks a learner to read a rhythm.
- **06** A Connections grid publishes on the first click and cannot be edited; there is no list of your own grids.
- **07** Grids, boards, public decks, charts and builds have pages and no link from their maker's profile.
- **08** The deck marketplace orders by card count only; copies record their source and nobody counts them.
- **09** `FlashcardReviewLog` has every review and no per-card view; a wrongly learned card can only be suspended.
- **10** Saved homes are a list with no notes; sprint 11 named comparison as the next homes feature.
- **11** A single-page app announces nothing on navigation; focus stays on the link or falls to the body.
- **12** The API reads decks and due counts but cannot grade a card.
- **13** No developer API scope reaches RMHCharacters.
- **14** A failing erasure is a `console.error`; nobody can see pending or overdue deletions.
- **15** `HomeRunTrigger.MANUAL` exists and nothing writes it; sources change only by SQL.
- **16** Connections grids, public decks, public personas and community listings have no report path; owners can undo
  any takedown by toggling.
- **17** Solo and room runs take the client's position unbounded (sprint 11 12's recorded follow-up).
- **18** No step cancels a Stripe subscription at a deletion request or at erasure.
- **19** Five helpers still pass English to `createNotification` (`PASSED_THROUGH_HELPERS`).
- **20** Seven recorded bugs: a banned editor's deck reads, a reserved reason's toast, short mod-log pages, audio
  track names in shares, a stale events list, a grant on a tombstone, two forms' field names.

## Rejected ideas

| Idea                                                              | Why not                                                                                                                                                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hide a community from Home (sprint 10's candidate)                | Checked: the Home timeline already excludes community posts (`communityId: null` in `lib/feed/timeline.ts`), so there is nothing to hide there.                                                |
| RMHStudy streaks and break time (sprint 02 follow-up)             | Already fixed: the streak is read before the upsert stamps the date, and breaks are persisted (`server/socket-server/handlers/rmhstudy.ts`, `persistBreak`).                                    |
| Keyed IP hashes (sprint 02 follow-up)                             | Already fixed: `lib/hash-ip.server.ts` is an HMAC keyed from `IP_HASH_SECRET` or a key derived from `BETTER_AUTH_SECRET`.                                                                      |
| A practice drill from your weak keys                              | Exists (`lib/rmhtype/custom-test.ts`, the `practice` test built from the slowest keys).                                                                                                        |
| Practise a song slower or loop a section                          | Exists (`SLOW_TEMPO`, spot practice and "Keep looping" in `components/rmhmusic/learn/songs/SongScreen.tsx`).                                                                                  |
| Import MIDI into the Studio                                       | Exists (`components/studio/ImportMidiDialog.tsx`, `lib/studio/midi/convert.ts`).                                                                                                               |
| Search messages                                                   | Exists (`lib/messages/api/messages.search.server.ts`).                                                                                                                                         |
| Tasks in a study room                                             | Exist (`rmhstudy:task:*` events in `lib/rmhstudy/events.ts`).                                                                                                                                  |
| An archive of past daily puzzles                                  | Exists (`components/daily-puzzles/PastPuzzlesSection.tsx`).                                                                                                                                   |
| Follow-up reminders for job applications                          | Exist (`LadderApplication.followUpDate` read by the ladder alert dispatch and the calendar).                                                                                                   |
| A wallet statement export                                         | Exists (`lib/economy/statement.server.ts`, `components/wallet/StatementPanel.tsx`).                                                                                                           |
| Images without text alternatives, as a sweep                      | A scan found 34 `<img>` tags without `alt` in 14 files, most inside primitives that receive one by prop; too small for a feature, and sprint 11 20's sweep pattern would gate it later.        |
| The other seven RMHBox stubs                                      | One minigame a sprint; Sequence Sam, Human Keyboard, Cursor Curling, Human Tetris, Pixel Pushers and Scroll & Soul are action games needing real-time physics or input sync; Identity Crisis needs moderated free-text questions. |
| Written reviews of public decks                                   | Reviews are the open "game reviews" owner decision; 08 rates with stars only.                                                                                                                  |
| Refunds on deletion                                               | A billing policy for the owner; 18 stops renewal and keeps paid time.                                                                                                                          |
| Shared rolls in the developer API                                 | Who may read another player's rolls through a key is a privacy call; 13 reads characters and summaries only.                                                                                   |
| Live alt-text updates in other open clients (sprint 05 follow-up) | Needs a new server-sent event kind for one field; small, and the refetch already shows the change.                                                                                             |
| Legacy RMHTube playlist durations in seconds (sprint 05 follow-up) | A data fix whose rows cannot be told apart from short media with certainty; a one-off migration is an owner call.                                                                             |
| Hub notices honouring push and e-mail preferences (sprint 11 12)  | The socket hubs cannot call the web tier's `createNotification`; a cross-tier notification queue is a design of its own.                                                                      |
| Dates in the reader's locale in engine helpers (sprint 05 11)     | Covered by the locale-format ratchet (`lib/__tests__/locale-format-ratchet.test.ts`), which lets the count only fall; a sweep belongs with that ratchet's owner.                              |

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at the end of the sprint, measured as
`plan.md` §Reporting describes, together with the `serverError` ratchet's value, 11's title baseline, 17's count of
historic bests above `MAX_WPM`, and the follow-ups 17–20 closed.
