# Sprint 11 — More to do in the games and apps, and people to do it with

Twenty features, mostly inside the games and apps the catalogue lists (`lib/catalog`, `features/*/catalog.ts`), where
sprint 10's were mostly in the site's own pages. Most give an app the next thing its members reach for and do not yet
have: bots for a card game that cannot be played alone (01), dice from a character sheet and a party for the person
running the game (02, 03), every chord in every key for learners (04), a maker for the daily Lights Out (05), the
Studio's record button finally recording (08) and its projects shareable as copies (07), the typing course on Dvorak,
Colemak and AZERTY (11), price history on home listings (13). Several are social in the way members already use the site
— in pairs and small groups: today's puzzles among your friends (06), a book read together in a community (09), a
flashcard deck written by a study group (10), a typing race against a friend's best run (12), a quiz for the whole study
room on a break (15). Four are about access: subtitles for any video in a watch party (16), flashcards read aloud (17),
descriptions on listing photos (14), and one sweeping feature that gives every form field a name a screen reader can say
(20). Two are hardening, both from the follow-up list: listing photos limited to their author's own site uploads, an
erasure that really deletes them, and a gate that keeps every picture column known to the media sweep (18), and six
small gaps sprints 09 and 10 wrote down (19). Each was checked against the sprint 10 branch tip (sprints 1–10, sprint 10
not yet on `main`) so it repeats nothing that exists. Specifications are in [`features/`](features/), the build order in
[`plan.md`](plan.md), implementer briefs in [`briefs/`](briefs/).

Every feature follows the Steel design language (`design.md`, `docs/plans/2026-11-11-steel-design-implementation.md`) on
the site tier (05, 06's hub lines aside, 09, 10, 13, 14, 17, 18, 19, 20), and the app tier's own look (L8) in Gabriel's
Horn, RMHCharacters, RMH Music, the daily puzzles, the Studio, RMHType, RMHStudy and RMHTube. None resolves a section-18
open decision (D1, D3, D6, D7, D8, D10, D12) or an open owner decision (moderator notes in the data export, the deletion
grace period, unlisted tournament or listing meta, Apache `CF-Connecting-IP` stripping, blocked members RSVPing to a
blocker's events, RMHBox per-minigame history privacy, ownership transfer in the public mod log, emoji reactions under
quiet counts, recovery codes and trusted contacts having no product, a deleted member's follows, game reviews, guides,
jam entries and public decks, uploading Studio samples, how long `RebarReservation` bookings are kept, a public setting
for the RMHTube profile card, purchased cosmetics and season passes at erasure). Where a feature meets one, its
specification says which default it keeps.

The erasure registry is at four `todo` entries, each needing a product call, so this sprint has no erasure feature:
every new table is classified by the feature that adds it, and `TODO_CEILING` stays 4.

### Validation pass (2026-11-22)

A second pass against the sprint 10 tip changed seven specifications and the briefs; [`plan.md`](plan.md) §Validation
lists each. The largest: 10's erasure rule (decks stay at deletion under the open public-decks decision, so editors on a
deleted owner's decks keep them); 12's passage rule (lore passages only if their ids are stable) and its socket test (no
RMHType handler test existed); 18's dependency wiring (`lib/media/sweep-jobs.server.ts`) and test names; 19's exact
places (the persona's `tagline` and `greeting`, the decline-and-block `updateMany`, `listPublicModLog`); the briefs of
01–03 now add their namespaces to `features/<id>/feature.ts`, which `feature-manifests.test.ts` holds.

### Third pass, after sprint 10 finished integrating (2026-11-22)

A fresh pass against the sprint 10 tip with s10-20 merged changed eleven specifications and every brief;
[`plan.md`](plan.md) §Validation lists each. The largest: 18 was rebuilt (sprint 10 integration had already added the
sweep's listing, e-mail and museum references; the code shows listing photos have no `Media` row, so the s10-19 erasure
deletes none, and 18 now fixes that); 05 gains an exact solver (the existing one is wrong above 15 cells, and maker
boards reach 49); 02 reuses the Toolbox's dice engine instead of writing a second one; 06 is mutual follows only, as the
game boards' friends scope is; 07 empties every audio clip (there is no built-in sample library); 12 settles a race
once, from a full and plausible server-timed finish; 03, 15 and 16 tightened what is shown to whom; the refusal anchors
match the real `useRefusalText` (no `default:`); socket features add rate-limit entries; the briefs' test commands run
product tests under their own config.

### Decisions taken by default (design pass, 2026-11-22)

The owner's standing rule is to take the most reasonable decision and record it. The design pass took these:

- **01** the host adds Easy, Steady or Sharp bots in the lobby; a bot decides from its own seat's view only (never its
  own dice); any game with a bot is a practice table and writes no leaderboard or table-read row.
- **02** rolls are private to the device (a 50-roll log per character), with advantage, criticals, exhaustion and PF2e
  degrees of success, on the Toolbox's existing dice engine (`lib/toolbox/dice.ts`); nothing is sent to the server;
  shared rolls are left for later.
- **03** a party is a game master and up to 8 players, each bringing one character; members see a computed summary
  (never another's raw sheet); the game master opens a sheet read-only only where its player turned that on (off by
  default), and never sees its private notes; the turn order is the game master's; no notices, no report path (members
  only).
- **04** a fifth music unit for piano and guitar, not voice: four qualities by ear, triads read on the staff, all
  twenty-four major and minor triads played, diminished and augmented, inversions; `chord-play-c-major` unchanged.
- **05** member boards are solvable by construction or checked, at least three moves (by a new exact solver: the
  existing one is right only up to 15 cells), verified server-side from the press sequence; boards are kept at erasure
  like Connections grids; a new removable report type.
- **06** a "Friends" board (mutual follows, the game boards' `friends` scope) beside "Everyone"; a one-way follower
  never sees a member's results; members with board privacy on are left out; no notifications.
- **07** a share is a snapshot of a cloud project behind a 128-bit token; every audio clip is emptied (all Studio
  samples are the member's own device files: there is no built-in library), silent and labelled; the copy opens as a new
  device project; shares are erased with the account.
- **08** record makes one new MIDI clip per armed track per take, one undo; audio tracks do not record (that would be
  the open sample decision); MIDI access is asked only when the member chooses it.
- **09** read-along threads are ordinary community posts through the recurring threads' gate, each behind a spoiler
  warning; members mark parts themselves; at erasure a starter's read-along passes to the owner, paused.
- **10** editors edit and study cards on their own schedule; deck settings, deletion, invitations and card sounds stay
  the owner's; one access rule with a registry; rows on a deleted owner's kept decks stay.
- **11** the course is mapped by key position for Dvorak, Colemak and AZERTY, with separate lesson ids per layout;
  AZERTY has the four letter units only; the layout is remembered on the device.
- **12** challenges go only to mutuals, on curated passages only, with a snapshot of the challenger's ghost; the race is
  an ordinary solo run, one attempt, settled only on a full, plausible, server-timed finish; accuracy under 90% loses.
- **13** every price change is recorded by both writers; favouriters get at most one drop notice per listing a week.
- **14** descriptions are an array beside the photos, kept the same length by the server; never required; every listing
  photo gets a text alternative, described or not.
- **15** multiple choice only, built and marked on the server, only while the timer is idle or on a break; a private
  deck only by its owner, with a confirmation (an editor cannot show it to a room); nothing is stored.
- **16** subtitles are plain-text cues parsed in the browser and again on the server, stored per queue item (the file is
  not), capped in size; each viewer chooses; live streams take none; only current room members read them; no report path
  (hosts remove).
- **17** deck languages are the owner's, copied with a clone; listening never grades a card on its own.
- **18** the sweep already keeps listing and e-mail pictures (sprint 10 integration); community listings name their
  author's own site uploads only (existing rows are not rewritten); the erasure deletes an erased member's listing
  photos by URL (they have no `Media` row, so sprint 10 19's deletion found none); a schema gate keeps every picture
  column classified.
- **19** six items, each re-checked at wave start: duplicates scoped to the suggester, a lost decline race still blocks,
  private events out of the public log, isolated names, the reserved suspension reason, a kept persona's prompt erased.
- **20** a field is named by an `aria-label`, `aria-labelledby`, a label linked by `htmlFor`, a wrapping label or a
  primitive's rendered label; the gate reaches zero on the site tier and only falls elsewhere.

## Features

| #   | Feature                                                                                 | Surface                                                      | Wave | Schema |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---- | ------ |
| 01  | [Bots at the Gabriel's Horn table](features/01-gabriels-horn-bots.md)                   | Gabriel's Horn lobby, table, results                         | 1    | no     |
| 02  | [Roll from the character sheet](features/02-character-rolls.md)                         | RMHCharacters sheets (5e, PF2e)                              | 2    | no     |
| 03  | [A party for your table](features/03-character-party.md)                                | RMHCharacters parties, join link                             | 4    | yes    |
| 04  | [Chords in every key in RMH Music](features/04-music-chords.md)                         | RMH Music path, `staff-chords` lessons                       | 1    | no     |
| 05  | [Make and share a Lights Out board](features/05-lights-out-maker.md)                    | `/lights-out/new`, `/lights-out/b/$id`, `/lights-out/boards` | 2    | yes    |
| 06  | [Today's puzzles among your friends](features/06-daily-following.md)                    | `/daily` hub, every daily board                              | 4    | no     |
| 07  | [Share a Studio project, and open a copy](features/07-studio-share.md)                  | Studio Projects menu, `/studio?share=`                       | 3    | yes    |
| 08  | [Record what you play into the Studio](features/08-studio-record.md)                    | Studio transport, armed tracks                               | 5    | no     |
| 09  | [Read a book together in a community](features/09-read-alongs.md)                       | `/c/$slug/read/$id`, mod tools, jobs                         | 6    | yes    |
| 10  | [Edit a flashcard deck together](features/10-deck-coeditors.md)                         | Deck page, editor, `/study`                                  | 2    | yes    |
| 11  | [The typing course on your keyboard layout](features/11-type-layouts.md)                | RMHType lessons, progress                                    | 3    | no     |
| 12  | [Challenge someone to race your best run](features/12-type-challenges.md)               | `/rmhtype/challenges`, solo page                             | 5    | yes    |
| 13  | [Price changes on home listings](features/13-listing-prices.md)                         | Listing detail, cards, filter, inbox                         | 1    | yes    |
| 14  | [Describe the photos on a home listing](features/14-listing-photo-alt.md)               | Listing form, gallery, cards                                 | 5    | yes    |
| 15  | [Quiz your study room on a deck](features/15-room-quiz.md)                              | RMHStudy room                                                | 4    | no     |
| 16  | [Subtitles for any video in an RMHTube room](features/16-rmhtube-subtitles.md)          | RMHTube room, player overlay                                 | 3    | yes    |
| 17  | [Listen to your flashcards](features/17-card-listen.md)                                 | Review session, deck settings                                | 6    | yes    |
| 18  | [Listing photos from the site only, and their erasure](features/18-sweep-references.md) | Listing writes, erasure, a sweep schema gate                 | 7    | no     |
| 19  | [Close the gaps sprints 09 and 10 left open](features/19-s10-gaps.md)                   | Suggestions, public mod log, settings, admin keys, erasure   | 6    | no     |
| 20  | [Every form field has a name](features/20-field-names.md)                               | Every unnamed field, a gate                                  | 7    | no     |

### Why each one

- **01** Gabriel's Horn's server is the game and hides each roller's dice (`viewFor`), yet the game has no computer
  player: one member cannot play, and `MIN_PLAYERS = 2` means a pair waits for company.
- **02** The rules engines compute every modifier (`skillLines`, `attacks`, `strikes`), and the sheets only print them;
  the Toolbox's dice engine (`/tools/dice`) is never wired to a sheet.
- **03** A character is visible to its owner only; a game master asks each player to read their sheet aloud.
- **04** `theory/chords.ts` knows four triads and inversions as pitch classes; the path asks only C, F and G major and
  never reads a chord on the staff.
- **05** There is one Lights Out a day and no way to make one; `lib/lights-out/lights-out.ts` has the board operations,
  and its solver is exact only up to 15 cells.
- **06** The daily board is a global top twenty with no audience scope, though game boards have a friends scope
  (`scopeFilter('friends')`, mutuals).
- **07** Cloud projects have versions and no way out to anyone else.
- **08** `isRecording` and `Track.armed` are set by their buttons and read by nothing.
- **09** Libraries, communities and scheduled threads exist side by side; nothing schedules reading.
- **10** Reviews are already per member on shared cards (`FlashcardReview (userId, cardId)`), but only the owner can
  write a card.
- **11** Key statistics know four layouts (`TYPING_LAYOUTS`); the course and its keyboard are QWERTY only.
- **12** Ghosts are a member's private best; there is no way to race a friend's.
- **13** `priceCents` is overwritten by both writers and nothing tells a member a saved listing got cheaper.
- **14** Every listing photo renders `alt=""` or the title.
- **15** Practice tests can build and mark multiple-choice questions; rooms have a break and nothing to do in it.
- **16** The captions switch only shows tracks a video already carries; most direct files carry none.
- **17** Article Listen (`lib/audio/read-aloud.ts`) exists; review is visual only and decks have no language.
- **18** Listing photos accept any URL, have no `Media` row so the erasure deletes none of them, and nothing keeps a new
  picture column known to the sweep.
- **19** Six follow-ups that are bugs, not designs (s10-04 twice, s10-07, s10-08, s09-14, s09-15).
- **20** About 270 fields in about 130 files may have no accessible name; no gate checks it.

## Rejected ideas

| Idea                                                                        | Why not                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import Anki `.apkg` decks                                                   | An `.apkg` is a zipped SQLite file: reading it in the browser needs a SQLite WebAssembly build, which the site tier dropped (phase 6) and the text import (sprint 02 03) does not need.  |
| Save graphs in RMHCalculator                                                | Every graph is computed by a paid model per request (sprints 08 and 10).                                                                                                                 |
| Scheduled study sessions in RMHStudy                                        | Events already schedule anything with an RSVP and reminders, and study-buddy slots (`StudyBuddyRequest`, mode `slot`) pair members at a time; thin beside 15.                            |
| RMHTube clips and timestamp links                                           | Timed comments exist (`RmhTubeTimedComment`); a timestamp link is too small to be a feature.                                                                                             |
| Practise a failed section in Slice It                                       | Exists (`features/slice-it/engine/drill.ts`, P2).                                                                                                                                        |
| A training room in Kowloon Knockout                                         | Exists (`components/kowloon-knockout/TrainingRoom.tsx`).                                                                                                                                 |
| Daily seeded runs for more games                                            | `lib/arcade/seeded.ts` explains why only Laundry Sort and Dream Rift qualify (the others' seeds are issued per lobby or are not scored).                                                 |
| Keyboard and screen-reader play for the daily puzzles                       | Checked: the cells and answers are labelled buttons with pressed states and live results (`LightsOutGame.tsx`, `SpectrumGame.tsx`); 20 covers any unnamed field.                         |
| A Spectrum or Outcast maker                                                 | Their puzzles are generated with a ranked answer key by a model (`lib/daily-puzzles/generate-core.ts`); one maker this sprint, for the game with a solver.                               |
| Member-written chapters in Versecraft                                       | Writing, not code, and the stories are generated per seed.                                                                                                                               |
| A dyslexia-friendly typeface option in the readers                          | Steel fixes the fonts to Geist and Geist Mono, self-hosted (performance section); a new face would be a design decision, not a feature.                                                  |
| A larger text setting                                                       | Exists (`fontScale`, `FONT_SCALES` in `lib/appearance/prefs.ts`).                                                                                                                        |
| Saved notes and side-by-side comparison of favourite listings               | A third RMHHomes feature beside 13 and 14 in a sprint that already touches the listing files three times; a candidate for the next sprint.                                               |
| Shared roll log in a party                                                  | Builds on 02 and 03 together and needs a privacy decision about who sees which rolls; left for after both ship.                                                                          |
| Icon-only buttons with no name, as their own sweep                          | A syntax scan found about twenty: too small for a feature; 20 names them where it touches the file.                                                                                      |
| A report path for Connections grids                                         | Real gap, noted for the follow-up list: it is a moderation change to an existing surface, and this sprint's two hardening slots went to 18 and 19.                                       |
| Translate subtitles or posts                                                | Sends members' text to a paid provider (the consent decision sprint 06 recorded).                                                                                                        |
| Audio recording in the Studio                                               | Stores member audio: the open "uploading Studio samples" owner decision.                                                                                                                 |
| A GIN index on the sweep's image arrays                                     | The sweep runs nightly over 500-URL chunks; sprint 09 recorded it as a follow-up, and adding an index to a large existing table is a `CONCURRENTLY` change no feature this sprint needs. |
| Erasing `RebarReservation`, `UserInventory`, `UserSeasonProgress`, `Streak` | Owner calls (bookings, purchases, season passes, bought freezes); they stay `todo`.                                                                                                      |

## Totals (filled in at integration)

Code and documentation line counts per feature are reported in `summary.md` at the end of the sprint, measured as
`plan.md` §Reporting describes, together with the `serverError` ratchet's value, 20's field gate baseline and final
count, and the follow-ups 18 and 19 closed.
