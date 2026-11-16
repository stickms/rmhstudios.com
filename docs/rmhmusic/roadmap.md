# RMH Music — roadmap, work in progress and audit notes

> **For LLMs and auditors:** this is the single place for RMH Music (`/rmhmusic`, the beginner
> piano, guitar and singing programme) status, unfinished work, future features, known gaps and
> hand-off steps. Written 2026-11-09 when work was paused for an audit; last updated 2026-11-15
> (Phase 5: more instrument sounds, and voice as a learner instrument). If this file disagrees
> with the code, the code wins; fix this file. Plans live in `docs/superpowers/plans/`.

## 1. What shipped (in production on `main`)

| PR | What |
| --- | --- |
| Phase 1 | The old Spotify listening-party app was replaced by a learning programme: new home, setup for input (mic / MIDI / computer keys / on-screen keys), first lesson, notebook-paper design (light and dark), animated staff backdrop, new logo and OG card. Old tables dropped (`20261109120000_drop_rmhmusic_legacy`). |
| #1504, #1507 | Cleanup, site knowledge regenerated, RMH Music isolated from the site's jelly/lightning material (`lib/native-material-routes.ts`), OG embed image and `appHubHead` previews. |
| PR D | Reading: staff flashcards with spaced repetition (`lib/rmhmusic/learn/srs/`, table `music_learn_card`), find-middle-C, Practice (`/rmhmusic/practice`). |
| #1525 (PR E) | Fretboard + keyboard note finder, pitch match (3 tries, cents-based points, mic echo guard), interval and chord ear training, play-a-chord. |
| #1526 (PR F) | Metronome, rhythm lessons (note values, 4/4 vs 3/4, tap the beat), shared routed-modes module, catalog text and docs, large-text wrapping on the learn home. |
| #1651 | Realistic instrument sounds (piano, steel-string guitar, violin, flute samples; Sound setting and dialog; `/rmhmusic/credits`) and the sight reading game "Sprint" (`/rmhmusic/sprint`: Freeplay and the Daily challenge, bests and daily rows `MusicSprintBest` / `MusicSprintDaily`). Details in §2.1 and §2.2. |
| #1653 | Phase 3: the tuner and note reader (`/rmhmusic/tuner`). Details in §2.0. |
| #1654 | Phase 4: songs — sheet music and tab play-along (`/rmhmusic/songs`, `MusicSongBest`). Details in §2.00. |

Where things live: pure logic `lib/rmhmusic/learn/{theory,scoring,srs,content,machines,input,audio,sprint,tuner,songs}`;
UI `components/rmhmusic/learn/`; lesson path and units `lib/rmhmusic/learn/content/path.ts`
(every `available` lesson's `mode` must be in `content/routing.ts` `ROUTED_MODES`); styles
`components/rmhmusic/rmhmusic.css`; catalog `lib/catalog/apps/rmhmusic.ts`; progress API
`app/routes/api/rmhmusic/learn/`; strings `locales/<lang>/c-rmhmusic.json`.
Architecture rule: every lesson is an explicit `{initial, step}` state machine in `machines/`;
all sound goes through `audio/voice.ts` / `audio/sequence.ts` (lifecycle callbacks `onStart`,
`onNoteStart`, `onAllStarted`).

## 2. Recent work

### 2.00000 Friends' progress and Share a result (Phase 6, PR C and PR D) — done

- Plan: `docs/superpowers/plans/2026-11-15-rmhmusic-phase6-social.md` (tasks 8–13; owner decisions
  §5: friends see the music-only Daily challenge streak; share links last 90 days and can be
  stopped any time). Built on the PR A + B branch (§2.0000).
- **PR C, friends' progress:** `social/friends.ts` (pure: `finishedUnits` — every available lesson
  starred, on the friend's own path — `friendDaily` over scored dates, the order, song bests from
  the songbook) and `friends.server.ts` behind `GET /api/rmhmusic/friends?limit=3|100`
  (`lib/music-social/friends.contract.ts`). Mutual follows only (the board's cached mutuals, 30 s,
  dropped by the viewer's own switch), whose friends switch is on, not banned, deleted or a bot,
  minus blocks both ways on every read (fail closed: the cached mutuals can hold a pair for 30 s
  after a block). Reciprocal: the viewer's own switch is required. Names and avatars only; the
  handler sends `friendsRes.parse(result)`, which drops anything else. UI: `/rmhmusic/friends` ("Friends and sharing": the two
  switches, the friends list with `<details>` song bests, the shared links), seeded by its route
  loader (`lib/music-social/social.queries.ts`, the one RMH Music social query module, redesign
  audit B4); the learn home's fourth
  footer link and up to three friend rows at the very end of the page (`HomeFriends`, rendered only
  once the list arrives, then faded in, so nothing moves). The Privacy page's friends hint no
  longer says "later" (a new key).
- **PR D, Share a result:** `MusicShare` (migration `20261116110000_music_share`, CREATE TABLE only:
  a 128-bit token, owner, kind, subject, the stored row it points at, the server-built snapshot,
  `showName` off by default, `expiresAt` 90 days, `stoppedAt`, `hiddenAt`). `social/share.ts`
  (pure: snapshots, token shape, the card's English lines) and `share.server.ts`: `POST
  /api/rmhmusic/share` (`{ kind: 'daily', date } | { kind: 'song', songId, mode }` + `showName`;
  the snapshot from the learner's own scored, unhidden Daily row or song best; reuse of the live link
  for the same result and name choice; 409 past 50 live links; 400 nothing to share; 20 an hour),
  `GET` (live links), `DELETE` (stop all), `DELETE /share/$id` (owner-scoped). One "gone" for every
  reason a link cannot be seen (malformed or unknown token, stopped, expired, hidden, a Daily run a
  moderator took off the board, a banned, deleted or bot author (`eligibleUser`, as on the board
  and the friends list), a viewer in a block pair with the sharer, a failed block lookup). The card `GET /api/og/music/$token` (`renderPageCard`, English,
  404 once gone, `public, max-age=600, s-maxage=600`, `X-Robots-Tag: noindex` on every answer), `ogCardPath('music', token)`. The public page
  `app/routes/rmhmusic_.r.$token.tsx` (outside the auth-gated layout; signed-out viewers allowed;
  notebook paper, no animated backdrop; "A learner" unless the link shows the name; Try RMH Music
  the one primary; Report and "Play today's challenge" for signed-in viewers, no Report on your
  own link; a skeleton while loading, and a failed request is an error line with Try again, never
  the gone sentence), read through `GET
  /api/rmhmusic/r/$token` as a route-seeded query; `buildMeta` with its own card and copy plus
  `noindex, nofollow`; a gone link heads with the app's catalogue card. Sitemap `null`, robots.txt
  unchanged (crawlable for unfurl bots), FOUC fixture; `share-route.test.ts` holds those rules.
  `ShareDialog` (lines exactly as public, name checkbox off, Copy link creates the link and copies
  it, "Link copied" in a polite live region, a selected read-only field when the clipboard is
  refused, "More ways to share" through the share sheet once the link exists) behind a secondary
  Share button on the Daily result and "Share best" on a song result; the Shared links list with
  Stop sharing (described by its row's link) and Stop sharing all (asks first, `useConfirm`). `music-share` is removable: "Resolve & remove content" sets
  `MusicShare.hiddenAt`; shares are in the export and the deletion sweep; the maintenance job
  deletes links 30 days after they expire.
- **Review fixes (after the merge):** `implement()` checks a `response` schema only outside
  production and sends the handler's own object, so it filtered nothing in production; the friends
  and the public shared-result handlers now send `friendsRes.parse(…)` / `sharedResultRes.parse(…)`
  (zod's object parse strips unknown keys), and `social-routes.server.test.ts` holds that an extra
  id, handle or e-mail never reaches either response. The public read sends the share `id` (what
  Report names) to a signed-in viewer only, plus `mine`, so the page hides Report on the viewer's
  own link. The card answers `X-Robots-Tag: noindex`. The share's author check reuses
  `eligibleUser`, so a bot's links are gone like its board and friends rows. The share page maps
  its query through the pure `sharedPageState` (pending, error, gone, live; tested): only the
  server's own gone answer reads "no longer shared". Friend rows carry no stable id (none leaves
  the server), so they are keyed by fetch time and position and a refetch closes any open song
  bests.
- **Also:** the social contract moved to `lib/music-social/social.contract.ts` (the site's Privacy
  page imports it, and the site sheet does not scan `lib/rmhmusic`), the same move the PR #1657
  branch makes; the new contracts sit beside it.
- **Deviations from the plan:** `GET /api/rmhmusic/social` still carries no `shares` (the list is
  its own `GET /api/rmhmusic/share`); the learner's stop is `stoppedAt` (the plan's `revokedAt`);
  the share page reads a contract endpoint as a route-seeded query rather than a `createServerFn`
  (the loader also hands the result to `head()`); friends rows carry no `useFreshUser` (no id
  leaves the server); a Daily share also goes dark when a moderator hides the run itself.
- **Verified:** unit tests (`friends.ts`, `friends.server.ts` with an in-memory database:
  reciprocity, mutuals only, bans, tombstones, bots, blocks both ways and fail closed, the limit, no
  identifying field; `share.ts`, `share.server.ts`: snapshots, reuse, the cap, owner-scoped stop,
  every gone reason, 10,000 unique tokens, the sweep; the card route; `share-route.test.ts`;
  moderation and account coverage; `friends-text`, `share-text`, which equals the card in English).
  One Chromium smoke against a throwaway Postgres (the dev server, four seeded learners), 42/42:
  friends only for mutual follows with both switches on, a block hiding the pair both ways, a
  one-way follower never shown, the home's Friends link and the friend row last on the page with
  CLS 0, the friends page's streak, units and song bests; a Daily link made through the API (name
  off by default, reused on a second press), opened signed out (200, no redirect, "A learner", no
  Report; `noindex, nofollow`, an absolute `og:image` of its own card, its own title and
  description), the card a 1200×630 PNG cached ten minutes; signed in, Report and "Play today's
  challenge"; a blocked viewer gets "gone"; Stop sharing (another learner's id stops nothing) turns
  the page to the gone sentence with the app's card and the card to 404; the 51st live link is a 409
  with its sentence, Stop sharing all stops 50; the name shown only on a link that chose it; a
  report on a share resolves its owner and "Resolve & remove content" takes the page and card down;
  the friends page, the learn home and the share page (live and gone) at 390 and 1280 in Day and
  Night with CLS 0, no horizontal scroll and no page errors (screenshots looked at). The migration
  applied to that Postgres and `prisma migrate diff` showed no music drift. The strict island is
  clean; a scoped `tsc` over the route tree, every RMH Music file, the card, the admin, report,
  export, maintenance and Privacy modules was clean except the base branch's `board-text.test.ts`
  spy, which the PR #1657 branch already fixed.
- **Not verified:** the Share dialog in a browser (Copy link, "Link copied", the clipboard-refused
  field, the share sheet) and the Share buttons on a real Daily or song result (no run was played
  in the browser; links were made through the API), 320 px, `ar`/RTL, 200 % text, Firefox and
  WebKit, `pnpm audit:pages`, real translations (the new strings are English in all 16
  catalogues), and a whole-repo `pnpm typecheck`.

### 2.0000 The Daily board (Phase 6, PR A and PR B)

- Plan: `docs/superpowers/plans/2026-11-15-rmhmusic-phase6-social.md` (owner decisions §5). PR C
  (friends' progress) and PR D (Share a result) are in §2.00000.
- **PR A, the board's evidence (invisible to learners):** `sprint/plausible.ts` (no-start, clock,
  too-fast, too-even; `needsReview`), recorded by `saveSprintDaily` in the same fill that scores a
  run (`ranked`, `unrankedReason`, migration `20261116090000_music_sprint_daily_ranked`; rows
  scored before it stay unranked, no backfill). A failing run is kept for the streak and not
  ranked. A ranked perfect run with a mean under 450 ms, or the third ranked 100 in seven days,
  files one `[Auto]` `music-score` report (`sprint/review.server.ts`, deduplicated 30 days per
  learner). Moderation: `music-score` and `music-share` report types; "Resolve & remove content"
  sets `hiddenAt` (`lib/rmhmusic/learn/moderation.server.ts`), from the one list
  `REMOVABLE_REPORT_ENTITY_TYPES`. **Q4:** every RMH Music table is in the account export and the
  deletion sweep (`learn/account-data.server.ts`); a test reads the model list from the schema.
- **PR B, consent and the board:** `MusicSocial` (both switches off by default; migration
  `20261116100000_music_social`), `GET/PUT /api/rmhmusic/social`, `GET /api/rmhmusic/sprint/board`
  (`social/board.ts` pure, `board.server.ts` cached per date 30 s and dropped on a toggle, a newly
  ranked run and a hide; blocks through `getBlockedAuthorIds`, fail closed; Friends = mutual
  follows with either switch on, needing the viewer's own friends switch), the `board` line on the
  daily save response, the page `/rmhmusic/daily` (today / `?day=yesterday`, Everyone / Friends,
  around you, report button per row), the Daily result's line with "Show it on the board" and "See
  today's board", "Today's board" on the Daily intro, and the "RMH Music" group on the site Privacy
  page (`components/settings/MusicPrivacyControls.tsx`, strings in `feed`).
- **After review (same branch):** note times are the input event's own `timeStamp` (MIDI, keys,
  on-screen keys and the tap pads; `input/event-time.ts`, falling back to `performance.now()` for a
  stamp that is 0 or more than 1 s off), so a main-thread stall no longer merges two notes. A bar is
  too fast only on its first note's reaction floor or when most of its gaps are under 40 ms, and a
  run needs three too-fast prompts to be unranked (`plausible.ts`). The board list is cached under a
  per-date generation in Redis (`social/board-cache.server.ts`): a switch, a newly ranked run, a
  hide, a ban, an unban, a strike's auto-ban, a lifted ban and an account deletion bump it, so a
  rebuild already running in another process cannot put the old list back; without Redis the list
  lives 5 s per process. Board rows carry no user id. The Daily result's line is the save's `board`
  field (no board request); "Show it on the board" says what it does on every board and links to
  the Privacy page. The Friends tab's line is the place among friends; yesterday's page names
  yesterday; a run scored before the board existed says so. Private runs (board switch off) file no
  `[Auto]` review. The Privacy group disables a switch while it saves, queues saves in tap order and
  says when one fails; so does the board page's switch.
- **Residual limits:** the server still cannot know which notes were played: the clock check caps
  the claimed answer times by wall time only (a scripted run that records its start and waits out
  the clock passes it), and the timing checks bound how human a fabricated run must look, nothing
  more; moderation is the backstop. A private run that is later shown on the board was never
  reviewed. The event-stamp fallback trusts a stamp up to 1 s old, so a longer stall still stamps at
  handler time. Other viewers' cached friends lists still expire on their own (30 s).
- **Deviations from the plan:** the row "menu" is a single 44 px Report button (one action);
  board rows are not routed through `useFreshUser` (its shape needs a handle the board must not
  send; names are resolved fresh on every request instead); `GET /api/rmhmusic/social` carries no
  `shares` until PR D; `music-share` is reportable but has no owner lookup or takedown until shares
  exist; the friends switch's only app-side control before PR C is the board's Friends tab.
- **Verified:** unit tests (plausibility, the save's verdict and review, the board's order, gaps,
  slices and would-place, the server's filters with an in-memory database, prefs, moderation, the
  account coverage, board-text); one Chromium smoke against a throwaway Postgres with six seeded
  learners (runs posted through the API with the start time moved back, not played with fake MIDI):
  25/25 — opt-in off hides everything and shows "would place", the page switch puts A on the board,
  blocks hide both ways with a rank gap, the Friends tab shows only mutuals, a fabricated 30 × 100 ms
  run is kept and unranked with its sentence state, a quick perfect run files one `[Auto]` report,
  the admin action hides it from every board, the Privacy page mirrors and writes the same switches,
  and the board and Privacy pages at 390 and 1280 in Day and Night have CLS 0 and no horizontal
  scroll. Both migrations applied to that Postgres and `prisma migrate diff` showed no music drift.
- **Not verified:** a run played in the browser with fake MIDI (the board line on a real Daily
  result was seen only through the API's `board` field), 320 px, `ar`/RTL, 200 % text, Firefox and
  WebKit, `pnpm audit:pages`, real translations (the new strings are English in all 16 catalogues),
  and a whole-repo `pnpm typecheck` (a scoped `tsgo` run over the route tree, the music code, the
  Privacy and admin pages was clean).

### 2.000 More sounds and voice (Phase 5)

- Plan: `docs/superpowers/plans/2026-11-15-rmhmusic-phase5-instruments-voice.md`.
- **Sounds** (six more, mono 44.1 kHz CBR 64 kbps MP3, each under the 0.6 MB budget the assets test
  holds; built by `scripts/rmhmusic/build-instruments.ts` from pinned `sources.json` entries):
  | Id | Source and licence (read from the downloaded files) | Zones | Bytes |
  | --- | --- | --- | --- |
  | `cello` | VSCO 2 CE Cello Section `susvib` v3 — repo `LICENSE` CC0 1.0 | 13, C2–F5 | 369,720 |
  | `clarinet` | VSCO 2 CE Clarinet `susLong` v2 — CC0 1.0 | 11, D3–F6 | 312,840 |
  | `oboe` | VSCO 2 CE Oboe `Sus` (v3; F5 from v1) — CC0 1.0 | 9, A♯3–F6 | 255,960 |
  | `guitar-nylon` | FreePats Spanish Classical Guitar 2019-06-18 — `cc0.txt` + `readme.txt` in the 7z, CC0 1.0 | 21, E2–B5 | 421,899 |
  | `ukulele` | FreePats Ukulele 2026-08-11 (Flight Fireball tenor, Mateusz Dąbrowski) — `LICENSE.txt` + `README.txt` in the 7z, CC0 1.0 | 13, C4–C6 | 203,162 |
  | `organ` | VCSL Pipe Organ, quiet stop on manual III (Simon Dalzell / Ivy Audio) — repo `LICENSE` CC0 1.0, README "even make commercial software, no credit", folder `Info.txt` encourages credit (credited) | 13, C3–C6 | 369,720 |

  Total added 1,933,301 bytes (all ten sounds 3,866,336). Traps the build's YIN caught: the VSCO cello
  names are an octave low (like the winds); the clarinet file named F♯5 sounds F6; the loud oboe F5
  is dominated by its second harmonic (the soft layer is used); the loud organ stop's pitch is
  ambiguous between octaves, and the quiet (stopped-flute) stop sounds an octave above its file
  names and is used from C3 only (below that its third harmonic outweighs the fundamental). Every
  zone plays within 10 cents after `tuneCents` (build check); rendered in Chromium through the
  sampler: every tested note within ±2.5 cents, onset 7–74 ms (the clarinet's attack is the slow one),
  C-major triads on nylon guitar, ukulele and organ peak at 0.52, 0.61 and 0.29 (no clipping);
  one ear lesson per new sound played its samples (sampler spied, YIN on the master tap heard both
  pitches). Polyphony: cello, clarinet and oboe mono (chord lessons fall back as for violin and
  flute); nylon guitar (8 voices, 14 ms strum), ukulele (4, 16 ms) and organ (8, block) play chords.
  The Sound dialog is one radio group under four plain family headings (keyboards, plucked strings,
  bowed strings, winds); the arrow keys walk across families; the dialog scrolls on a phone.
  `CREDITS.txt` and `/rmhmusic/credits` carry the three new credits. Nobody has listened to any of it.
- **Voice** (`instrument: 'voice'`, `MusicLearnProfile.voiceRange`, migration
  `20261115200000_music_learn_voice_range`, additive): ranges in `lib/rmhmusic/learn/voice/range.ts`
  (strict island) — soprano C4–G5 and alto G3–D5 on the treble staff (an alto reads on the low
  card, `staffCardRange`, since G3 is below the deck card's two ledger lines), tenor C3–G4 on the
  treble staff with the small 8 (written an octave up), baritone/bass G2–C4 on the bass staff. The
  Voice tab ("Learn to sing") opens no dialog (the tabs activate on arrow keys); while a singer has
  no range, the input row has a "Choose your voice" link to Set up input, which for a singer starts
  with "Your voice" (a radio group with each range's compass) and says singers answer with the
  microphone, and a lesson in the range asks for one first (`needsVoiceRange`) rather than assume
  alto. `VOICE_PATH` (`pathFor`): Read your staff (`voice-staff-notes`: the range's deck;
  `voice-first-note`), Sing it back (`voice-match-five`, `voice-match-range`: match-note in the range,
  graded in cents at the sounding pitch), Sing intervals (new mode `sing-interval` on the match
  screen, echo matching: the first note sounds by itself as each target starts, through the guarded
  hint so the mic ignores it; nothing sung counts until it has sounded; Hear it replays it alone;
  "Hear the answer" plays both after a miss; the line names the interval and the second is sung; `voice-interval-steps` second/third, `voice-interval-leaps`
  third/fifth/octave, natural notes only), and the shared rhythm unit. No chord, keyboard or
  fretboard lesson. Sprint: single-note levels only, prompts moved by octaves onto the range's staff
  (`forVoice`), chord prompts skipped in the daily run. Songs: `songs/transpose.ts` keeps a song as
  written if it fits, else moves it by octaves, else into the nearest drawable key (C G D A F B♭ E♭,
  signatures on both staves), respelled by letter; versions `voice-treble`, `voice-tenor`,
  `voice-bass`. Tuner unchanged (chromatic for a singer). Hints play through the chosen sound
  (default piano).
- **Smoke (2026-11-15, Chromium only, dev server + throwaway Postgres, harness `t36/voice.cjs` and
  `t36/smoke.cjs` in the session scratchpad):** see the Phase 5 commit report; summary: Sound dialog
  by keyboard at 390/1280 × Day/Night (one radio group, Tab lands on the chosen row, arrows walk
  piano → organ → acoustic guitar → nylon guitar, Space picks the organ, it loads and previews C4,
  saved; CLS 0, no horizontal scroll); an alto learner through onboarding at all four (Voice tab →
  dialog → arrows + Space pick Alto → Microphone row with a fake oscillator mic → saved
  `voice mic alto`; heading "Learn to sing", the four voice units); staff lesson: alto treble, tenor
  treble with the 8, bass on the bass clef; pitch match with the fake mic (alto B3/C4, bass D3/A2 at
  −6 cents → Spot on, bass clef); interval singing (alto: "Sing a second above A3", Hear it played
  piano 57 then 59, sung 59 → Spot on; tenor: thirds above C4/B3 → Spot on); Sprint for a bass lists
  the four single-note levels.
- **Not done:** a real voice and microphone (the oscillator is a pure tone; vibrato, breath and
  octave errors of real singers untested), Firefox / WebKit / iOS, 200 % text, RTL with real
  strings, listening to the new sounds; a tenor
  answering a staff card on the on-screen keys must press the written pitch (as a guitarist does);
  lesson titles of the voice path are English catalogue strings like the others; `pnpm typecheck`
  (OOM here; a scoped `tsc` over every RMH Music file and `typecheck:strict` passed).
- **Review fixes (2026-11-16):** the organ credit names the quiet stop shipped (a credits test
  checks every work line against `sources.json`); interval singing as above; Practice deals a
  singer their range's deck (tenor with the 8, alto on the low card); the `/rmhmusic` layout
  route's auth check also selects the profile's instrument and range (`getLearnerShape`, route
  context, `useLearnerShape`), so the home placeholder is built from the learner's own path and
  the Sprint placeholder lists a singer's levels: skeleton = loaded height in Chromium at 390 and
  1280 for piano, guitar, an alto and a singer with no range (home, Sprint picker, the alto's
  flashcard and match lessons); the first-note staff reads bass and treble-8; a song moved into
  another key says so.

### 2.00 Songs: sheet music and tab play-along (Phase 4) — shipped in #1654

- Plan: `docs/superpowers/plans/2026-11-15-rmhmusic-phase4-play-along.md`. Routes `/rmhmusic/songs`
  (the songbook) and `/rmhmusic/songs/$songId` (play), inside the auth-gated layout, noindex,
  sitemap-excluded (`'personal'` / the dynamic route), on the sign-in return-path allowlist, a FOUC
  fixture for the song route; a quiet "Songs" link beside "Sight reading" and "Tuner" on the learn
  home.
- **Songbook** (`lib/rmhmusic/learn/songs/`, strict island): eight public-domain melodies transcribed
  by hand (Mary Had a Little Lamb, Twinkle Twinkle, Lightly Row, Ode to Joy, Au clair de la lune,
  Frère Jacques, Amazing Grace — the first line's opening run into the last line's close, Minuet in G — first eight bars) in a tiny
  notation (`notation.ts`); titles and composers are data, not translated. One staff for both
  versions: piano as written; guitar reads it with the octave clef, sounds an octave lower and gets
  a tab staff whose frets come from `fingering.ts` (`fingerFor`: the lowest fret, so open position
  whenever possible). The version follows the learner's instrument.
- **Modes** (`machine.ts`, one `{initial, step}` machine): **Wait for me** (the cursor waits for the
  right note; MIDI exact sounding pitch, the other inputs any octave, as in the Sprint; 100 / 50 / 0
  points for 0 / 1 / more wrong notes) and **Play along** (a bar of count-in clicks, then each
  note-on less the latency, and less `MIC_ONSET_MS` 60 ms for the mic, answers the nearest open
  note within the tap lesson's windows: 100 within 70 ms, 0 at 200 ms; a wrong pitch marks the note
  wrong, a note answering nothing costs half a note, an unanswered note is missed). Results are a
  sentence and `starsFor` stars. The screen ticks only at the machine's `nextDue` (one `setTimeout`),
  the metronome's first click fixes the beat grid; a hidden tab, the input dialog or lost sound
  drops a play-along run.
- **Score** (`layout.ts` + `components/rmhmusic/learn/songs/ScoreView.tsx`): systems wrap to the
  measured width by whole bars and are justified; each system reuses the flashcard's hand-ruled
  staff, clefs and accidentals; beams for eighth pairs, flags, dots, ledger lines, key and time
  signatures, final bar; a fixed window three piano or two guitar systems tall (356 px), which
  scrolls itself to the cursor's system. Pencil tick / red-pencil cross over each passed note, the
  now mark and accent ink on the note to play. "Hear it" plays the cursor's four-bar phrase through
  the learner's sound (`playSequence` now takes a gap and a hold per note); notes are ignored while
  it and its echo tail sound. "Slower" plays at two thirds.
- **Persistence:** `MusicSongBest` (user, song, mode, best score), migration
  `20261115190000_music_song_best`; `GET /api/rmhmusic/songs`, `POST /api/rmhmusic/songs/best`
  (contracts + `implement()`, zod, rate limit `write`); the server re-scores the run from its
  per-note results (`scoring.ts` `checkSongRun`) and keeps the best with one atomic
  `INSERT … ON CONFLICT DO UPDATE SET "bestScore" = GREATEST(…)`. Not anti-cheat: a fabricated run
  can raise the learner's own best (accepted: it is their own row, no coins or XP depend on it).
- **Review fixes (2026-11-15, after a read-only review):** a cancelled "Hear it" stops holding input
  at the cancel (`hear-gate.ts`: only the mic waits its echo tail, and Start with it); the mic onset
  (`MIC_ONSET_MS`) is taken off only while the latency is the uncalibrated default — a calibrated
  latency holds the delay of the input it was measured with, so a learner who calibrated on the
  keys and plays on the mic still reads about 60 ms late (accepted, documented); a note-on goes to
  the open note of its own pitch first (overlapping eighths); a run token stops a second metronome;
  the mic segmenter's opt-in re-attack (a 6 dB rise within 80 ms after a decay to half the peak, same
  pitch) is on only on the songs screen, with a mic hint on repeated notes and "Skip this note"
  after 6 s in Wait for me (counts as wrong); the mode tabs and Change input are locked during
  either run; Amazing Grace no longer asks a tied D5 twice; every song's parsed score is pinned by
  a snapshot; "Traditional" is translated; the keys help names the black keys; the live region
  says each note with its number and a pickup as "Pickup". An unknown song id shows the friendly
  "Song not found" page with HTTP 200 (a 404 status would need a route loader and `notFound()`,
  which would swap in the site's own 404 page; left as is).
- **Smoke (2026-11-15, Chromium only, dev server + throwaway Postgres, harness in the session
  scratchpad `t35/songs.cjs`):** Wait for me on the computer keys (Mary Had a Little Lamb, one wrong
  note → 25 of 26 first time, score 98, saved, row in `music_song_best`) and on fake MIDI (Ode to
  Joy, an octave-off note counted wrong and named as another octave); Play along with fake MIDI at
  exact beat times (+ the uncalibrated 40 ms latency) → 30 of 30, score 100, three stars, offsets
  −1…6 ms; the same 150 ms late → 30 late, score 38, no stars; guitar Minuet in G shows the 8 and
  tab frets D4 = B string 3, G3 open, A3 = G string 2, F♯4 = high E 2, F♯3 = D string 4; 320, 390 and
  1280 in Day and Night: no horizontal scroll, CLS 0 (fixed during the smoke: Start and Stop took
  different widths), skeleton boxes equal loaded boxes (score window, sheet, input region), 0
  `requestAnimationFrame` at rest and after a run with Jelly motion Still (the only rAF on the page
  is the shared `PaperBackdrop`, which runs while motion is not Still, as on every RMH Music page);
  the learn home's three footer links sit on one row at 390; "Hear it" toggles and ends. Fixed during
  the smoke: a fully answered play-along run never ended (no tick was due), a timer firing early
  stalled the cursor, end focus, the octave-off sentence, flags touching the next note. Screenshots
  looked at: notebook paper, no chips or badges.
- **Not done:** Firefox / WebKit / iOS Safari, 200 % text, RTL with real strings (English until
  `pnpm i18n:translate`), a real MIDI keyboard, the microphone in either mode (untested in the
  browser; known limit: the mic segmenter only reports a repeated note after a short silence, so
  repeated notes on a sustaining instrument may be missed, and `MIC_ONSET_MS` is reasoned, not
  measured; the re-attack thresholds are tuned on synthetic levels only), audible check of "Hear it" (headless has no output; the sequence started and ended),
  a calibrated latency other than the 40 ms default, the shared `<Tabs>` is 40 px tall without a
  coarse pointer (the primitive's rule), choosing the other version on the page, more songs, rests
  and ties in the notation, a song longer than the window shows bars already played only by
  scrolling, `pnpm typecheck` on a bigger machine (a scoped `tsgo` over the changed files and the
  route table, and `typecheck:strict`, passed).

### 2.0 Tuner and note reader (Phase 3) — shipped in #1653

- Plan: `docs/superpowers/plans/2026-11-15-rmhmusic-phase3-tuner.md`. Route `/rmhmusic/tuner`
  (auth-gated, sitemap `'auth-gated'`, a sign-in return path), the sanctioned `<Tabs>` for **Tune**
  and **Read notes**, a quiet "Tuner" link beside "Sight reading" at the foot of the learn home.
- **Tuner:** the pure machine `lib/rmhmusic/learn/tuner/machine.ts` (strict island):
  `silent → listening → locked(target, cents)`, level (RMS 0.01) and clarity (0.9) floors, the
  median of the last 9 voiced frames, hysteresis (another target must be 0.4 semitone nearer, for
  4 frames once locked), in tune = ±5 cents held 300 ms (left at 8 cents), silent after a 400 ms
  gap. Presets: any note (chromatic) and guitar strings (`STANDARD_TUNING`; the reading is folded
  by octaves onto each string, so an octave of a string is that string with the folded cents;
  "Tune up / Tune down / In tune", and "Not near a string" naming the note heard when more than
  100 cents from every string). The median is the lower one (never the mean of two notes); the
  advice has hysteresis at the band edge (5 in, 8 out); a reference tone mutes the reading until
  it ends plus `ECHO_TAIL_MS` (400 ms). Frames come from the mic adapter's own 25 ms poll
  (`createMicInput({ onFrame })` → store `subscribeMicFrames`): no `requestAnimationFrame`, nothing
  while the mic is off or the page hidden. The dial (`components/rmhmusic/learn/tuner/TunePanel.tsx`)
  is a static SVG with one needle written straight to the DOM; React renders on a new note, advice
  or phase only; the live region says the note and the advice ("A2: Tune up") once per change
  and keeps its last words through silence. Reference
  tones (A4, or each guitar string) play through the learner's sound. Without the microphone the
  tab says it needs it and offers to switch.
- **Note reader** (`ReadPanel.tsx`, placement `tuner/read.ts`): any input's note-on is written on
  the low card (piano treble from C4 / bass below; guitar an octave up with the small 8) with its
  name and octave, the mic's cents and the last five notes (kept across the tabs); notes off the
  card are named and said to be too high or too low on their own staff. Guitar notes above written
  C6 (sounding C♯5 and up, the high E string's 10th fret on) show "Too high": the card has two
  ledger lines over the staff.
- **Smoke (2026-11-15, Chromium only, dev server + throwaway Postgres, fake mic: an oscillator in a
  fake `getUserMedia` stream through the real YIN pipeline):** 440 Hz locks A4 at 0 cents (the
  rounded readout, so within ±0.5) and says In tune, steady for 2 s (one name, one advice, one
  live-region change); 435 Hz says Tune up at −20 cents; 446 Hz Tune down +23; guitar preset (the
  default for a guitar learner): 108.73 Hz → A2 Tune up −20, 110 Hz → A2 In tune, 435 Hz → A2 Tune
  up −20 (A4 folded onto the A string), 176.6 Hz → "F3", Not near a string; pressing Play A2 says
  Listening… until the tone and its echo tail end, then A2 In tune again; ±10 cents 5 Hz vibrato on 440 Hz: A4 / In tune in all 160 samples over 4 s; hiding the page
  stops the mic and the reading; the reader writes MIDI C4, C♯4 (sharp), G2 (bass staff), F♯6
  (too high) and computer-key notes, and the mic's E4 at +7 cents; 390 and 1280 in Day and Night:
  no horizontal scroll, CLS 0 (fixed during the smoke: re-centred text lines), skeleton height
  equals loaded height, 0 rAF callbacks at rest and 0 while the mic is live; at 320 the six string
  buttons are 44 px and the home's Sight reading / Tuner links sit on one row apart from the Sound
  button. Screenshots looked at: notebook paper, no chips or badges.
- **Review fixes (2026-11-15, after a read-only review):** string folding and "Not near a string",
  the reference-tone mute, spoken advice, lower median, advice hysteresis, the reader's clef for
  notes off the card, the reader's history across tabs, and a mic frame fan-out that isolates a
  throwing listener; re-checked in Chromium at 390 (CLS 0, skeleton = loaded height, 0 rAF at rest).
- **Not done:** Firefox / WebKit / iOS Safari, 200 % text, RTL with real strings (strings are
  English until `pnpm i18n:translate`), a real microphone and instrument (thresholds are reasoned
  and tested on synthetic tones only), alternate guitar tunings or other instruments' presets, the
  shared `<Tabs>` is 40 px tall without a coarse pointer (the primitive's own rule;
  44 px on touch), `pnpm typecheck` on a bigger machine (scoped `tsc` passed).

### 2.1 Realistic instrument sounds — shipped in #1651
- Plan (approved by the owner): `docs/superpowers/plans/2026-11-09-rmhmusic-instrument-sounds.md`.
  v1 instruments: **piano** (Salamander Grand V3, CC BY 3.0 — attribution required), **steel-string
  guitar** ("Ella Gitauru", MIT plus one sentence about attributing alterations; the CC0 nylon
  guitar was NOT needed: the steel guitar built), **violin** and **flute** (VSCO 2 Community
  Edition, CC0). Decisions the owner confirmed: default sound follows the learner's instrument; no
  "Mixed" option; credits page `/rmhmusic/credits` linked from the Sound dialog (not a footer);
  chord lessons use only piano/guitar (violin/flute fall back with one plain sentence in the dialog).
- **Built (merged in #1651):**
  - Samples: `public/music/rmhmusic/instruments/<id>/<midi>.mp3`, 66 zones, mono 44.1 kHz CBR 64 kbps,
    **1,933,035 bytes** (piano 565,476 · guitar 593,874 · violin 489,285 · flute 284,400). Built by
    `scripts/rmhmusic/build-instruments.ts` from `scripts/rmhmusic/sources.json` (commit-pinned
    URLs + SHA-256, guitar RAR from the author's Google Drive; per-fret pitch restore with
    `asetrate`; loudness baked in; bit-exact, re-runs give identical files; YIN on every encoded
    file fails the build at ≥0.35 st). Generated `zones-data.ts`; `assets.test.ts` holds files to it.
  - Engine: `instruments/sampler.ts` (the `Instrument`), `instruments/engine.ts` (registry, master
    gain + compressor, the lesson **sound session**: `loading` for at most `LOAD_WAIT_MS` 2.5 s, then
    the samples, or the synth for the rest of that session), wired into `voice.ts` / `sequence.ts`
    (`PlayOptions.instrument`, chord trim 1/√n, guitar strum). `soundReleaseMs` = the longer of the
    instrument's and the synth's release (the echo guard). Metronome clicks stay the synth click.
  - Setting: nullable `MusicLearnProfile.sound` (migration `20261115160000_music_learn_sound`),
    `profileSchema.sound` (zod enum of `INSTRUMENT_IDS`, optional so old clients leave it alone),
    store `setSound`, `resolveSound` / `chordSoundFor` in `catalog.ts`; `SoundDialog` from LearnHome;
    `/rmhmusic/credits` (`SoundCredits`, full Ella MIT text, Salamander attribution); every pitched
    lesson (ear, chord, match, find/fretboard, flashcards, first note, Practice) gets `{ instrument }`.
  - Smoke after merging the Sprint (2026-11-15, Chromium, 390/1280 × Day/Night): one ear lesson
    per instrument played its samples (sampler spied, YIN on the master tap heard the asked
    pitches), the Sound dialog by keyboard picks and stores a sound and links the credits, and the
    merged LearnHome shows both the Sound button and the Sight reading link without crowding at
    320/390/1280 (no overlap, no horizontal scroll, CLS 0).
- **Not done / still open:** the owner's **audition** (nobody has listened to any sample; checks
  were YIN pitch, onset and peak on decoded/rendered audio only); Safari / iPhone (silent switch
  mutes Web Audio; decoding MP3 on iOS) never tried; ear questions are moved by octaves into the
  sound's range (`fitToRange`), but a note the learner taps or is asked to match outside the
  sound's range (e.g. a C3 key with the flute) plays on the synth for that note (plan §5.2 range
  plumbing into the generators not done); the 2.5 s wait counts from when the audio context runs;
  the R2 sync re-versions `public/music` (games' music URLs change once); no second piano velocity
  layer; no offline cache. The full `tsc -b` could not run in the agent container (OOM-killed);
  a scoped check of the changed files passed — run `pnpm typecheck` once on a bigger machine.

### 2.2 Sight reading game ("Sprint") — shipped in #1651 (S1–S5 built, S6 smoke run in Chromium)
- Plan: `docs/superpowers/plans/2026-11-09-rmhmusic-note-sprint.md`. Timed MIDI reading game:
  levels one note → accidentals → chords → short bars; **Freeplay** (20-prompt runs, personal bests)
  and a **Daily challenge** (one run per UTC day, 6 escalating levels, seeded by date, the first
  started run scored, daily streak). No leaderboard until the owner decides.
- Built: `lib/rmhmusic/learn/sprint/` (levels and pars, seeded generators, `dailyRun`/`utcDate`,
  scoring, the `{initial, step}` machine), `sheetLayout` + `SprintSheet` (accidentals, stacked
  chords, bars with a now mark), `components/rmhmusic/learn/sprint/` and `/rmhmusic/sprint`, and a
  "Sight reading" link at the foot of the learn home. MIDI must play the written pitch for notes,
  accidentals and bars; chords count their pitch classes in any octave on every input (by design);
  the computer keys, on-screen keys and microphone count any octave (the hint says which). Guitar
  reads the treble staff only (octave clef, low card); the daily run deals the same prompts to
  everyone and draws a bass prompt an octave up on treble for guitar. The input is locked during a run.
- **S5 persistence (built):** `MusicSprintBest` (per user per level: best score and, independently,
  fastest average) and `MusicSprintDaily` (per user per UTC date: score, avgMs, played, skipped,
  the recomputed per-prompt results), migration `20261115170000_music_sprint`. Endpoints are
  contracts (`sprint/sprint.contract.ts`) bound with `implement()` in
  `lib/rmhmusic/api/rmhmusic.sprint*.server.ts`: `GET /api/rmhmusic/sprint?date=` (bests, the
  date's state `open`/`started`/`scored`, streak), `POST …/freeplay`, `POST …/daily`,
  `POST …/daily-start`. The rules are pure in `sprint/record.ts`: the dealt date is accepted only
  for today or for yesterday within 10 minutes of UTC midnight and never relabelled; every
  prompt's points are recomputed from its time with the game's `promptPoints` (client points and
  summary ignored; lengths, level order, kinds and skips checked); the daily row is filled once
  (`UPDATE … WHERE score IS NULL`), a second run answers `already-scored`, an identical retried POST
  answers `saved`. **Started tracking:** a scored daily run writes its row when Start is pressed,
  so an abandoned run reads `started` and later runs that day are practice (the start is best
  effort; the save makes the row itself). The server cannot know which notes were played, so this
  keeps an honest client honest; it is not anti-cheat. `createApiSaver` is the screen's saver;
  picker rows say each level's best as a plain sentence; the Daily challenge says where today
  stands and the run of days played (streak from scored dates, today or yesterday back).
- **S6 smoke (2026-11-15, Chromium only, dev server + throwaway Postgres):** picker skeleton equals
  loaded height at 320/390/1280 in Day and Night (fixed: the placeholder now wraps like the hints);
  a freeplay run on the computer keys reached and played by keyboard only (any octave), saved, best
  shown on return, focus back on the row; MIDI through a fake hub: one note at the exact pitch (an
  octave-off answer is wrong), triads graded when the window closes; the microphone lists the chord
  levels as unplayable with one sentence; the daily run records its start, saves once, a second run
  says practice, an abandoned start makes the next run practice; failed save → Try again → saved;
  session ended mid-run → "Not saved: sign in again" with a Sign in link; no layout move between
  ready, asking and the result; CLS 0 (fixed: the centred count/caption lines were re-centred text);
  the prompt image is named by kind and staff only while asking; focus lands on the end action
  (fixed: it was lost while saving). Screenshots looked at: notebook paper, no chips or badges.
- Not yet: the rest of S6's matrix (Firefox/WebKit, 200% text, RTL, a real MIDI keyboard, iOS);
  the mic learner's picker placeholder is still 20px shorter at 390 (the placeholder cannot know
  the input before the profile loads, and the mic sentence wraps); a new best is not called out in
  the result (it says "Saved."); level unlocking (every level is open); `pnpm typecheck` on a bigger
  machine (the container OOM-kills `tsc -b`; scoped checks passed).

## 3. Future features

- **Phase 3:** tuner and note reader — **shipped** in #1653 (§2.0); left: the browser/device matrix and a
  real-microphone check listed there, alternate tunings and other instruments' presets.
- **Phase 4:** sheet music / tab play-along — **built** (§2.00); left: the browser/device matrix and
  the real-hardware checks listed there, the mic in play-along, more songs (and rests, ties, other
  keys), a version switch on the page.
- **Phase 5:** more instruments and voice — **built** (§2.000): cello, clarinet, oboe, nylon guitar,
  ukulele and organ sounds; voice as a learner instrument with four ranges. Left: the owner's
  audition of the sounds, counsel on the CC0 claims (VSCO, VCSL organ `Info.txt`, FreePats), a real
  singer and microphone, a range prompt in Sprint and Songs (a singer with no range is still read
  as alto there), choir (several parts) and harmony singing,
  per-range presets in the tuner, a second sound layer, lesson titles in the locales.
- **Phase 6:** social. **Built:** the Daily board and consent (§2.0000, PR A and PR B), friends'
  progress and Share a result (§2.00000, PR C and PR D). Left: PR E's remaining browser pass
  (320 px, `ar`, Firefox and WebKit, `pnpm audit:pages`).
- Rhythm *reading* beyond four note values; sharps/flats in flashcards (naturals only today);
  descending intervals; minor seconds (the interval table has `second` = major second only).

## 4. Known gaps, debt and things an audit should check

- **The Daily board's limits (Phase 6):** the checks make a fabricated run slow and human-shaped;
  they cannot prove a note was played. A patient cheater with human-looking times can still rank;
  moderation (the `[Auto]` review and "Resolve & remove content") is the backstop. Several accounts
  per person are not addressed. Inputs differ in difficulty (MIDI must play the written octave) and
  share one board. Boards begin on the day PR A deploys; earlier Daily runs are never ranked.
- **Shared results (Phase 6):** the card is English; unfurls other services already fetched
  outlive "Stop sharing" (our card is cached ten minutes); a link is a capability: anyone holding
  it sees the result until it stops. Other viewers' cached mutuals lists expire on their own
  (30 s), so a friend who unfollows can see progress for up to 30 s longer (consent and blocks are
  read fresh). Open, the owner's choice: whether an unranked Daily run (one that failed the
  board's checks) may be shared; today any scored, unhidden run can be. Accepted: a viewer the
  sharer blocked sees "gone", and can confirm the block by opening the link in a private window
  (signed out, the link is live); a capability link cannot hide that.

- **Translations:** every new string in the 15 non-English shipped locales is the English default
  until `pnpm i18n:translate` is run (only the 16 shipped `locales/*/c-rmhmusic.json` were kept
  when extracting; do not commit the thousands of other extractor files).
- **Never tested on real hardware:** microphone + speaker (echo guard timings 250 ms confirm /
  400 ms tail are reasoned; the tuner's level/clarity floors, median window and hysteresis were
  tuned on synthetic tones only), MIDI controllers, Bluetooth output latency (`OUTPUT_LATENCY_MS = 40`
  default for uncalibrated devices), a real iPhone / Mac Safari (silent switch, audio interruption).
- **Verification gaps:** the full 320 px / 200 % text / RTL / Firefox / WebKit matrix was run on
  PR E's lessons only partly (Firefox/WebKit smoke on the learn home and note finder; RTL only the
  find-note lessons and learn home) and **not** for the ear, chord and rhythm lessons. RTL with real
  Arabic strings was not seen (placeholders are English).
- **Layout:** at 200 % text on 320 px the sheets grow past their 1x-sized skeletons (chord lesson
  non-input CLS 0.135; learn home +24 px once the Practice link appears). Accepted trade-off:
  showing all text beats zero shift; revertible (`7f5b4f8de`, `ce8ebfac4`).
- **Accepted behaviours:** one mic note-on = one try in pitch match (a scoop up to the note costs a
  try); `isKnownCardId` accepts unshipped bass deck ids; a lost-POST retry can double-review a card;
  `second` interval is major only.
- **Library:** the old Library "Music" section was turned into video-only "Playlists", not removed
  — ask the owner where video playlists should live.
- **Ops (owner, by hand):** the Apache vhost must be hand-installed (copy conf, `configtest`,
  graceful reload; verify `Permissions-Policy` allows `midi` and the CSP with curl). Not automated
  by deploy.
- **Licences to confirm with counsel before launching sounds:** the guitar's MIT+sentence terms and
  the CC0 claims resting on repository LICENSE files for VSCO and VCSL (the organ folder's `Info.txt`
  is a separate "bearer may redistribute, credit encouraged" note from Ivy Audio's recordings; VSCO's
  `Readme.txt` asks that the samples not be sold as such), and the FreePats CC0 files (the ukulele
  bank's archive has one member, `chuck.wav`, that fails its CRC; it is not used). Not legal advice.
- **Test hygiene:** `build-site-knowledge.ts` has no `--check`; component tests run in node without a
  DOM (logic is extracted into pure helpers to be testable); `pnpm check:consistency --fast` is what
  the commit hook runs, the full gate was run on the PR E branch only.

## 5. How the work was done (for the audit)

Subagent-driven development: plan → implementer (tests first) → read-only reviewer → fix round →
browser pass (Playwright harness in the session scratchpad, not in the repo) → PR → CI → squash
merge. SDD ledger: `.superpowers/sdd/2026-11-09-rmhmusic-phase2-training/` (briefs, reports,
review diffs). Plans: `docs/superpowers/plans/2026-11-09-rmhmusic-*.md`. Commit-gate hook:
`.claude/hooks/commit-gate.sh` → `pnpm check:consistency --fast`.

## 6. Implementation stubs (sketches for whoever picks this up)

These are design sketches in plain TypeScript/SQL/JSON, **not compiled and not in the code tree**.
Check them against the real files named in each heading before using them; where they differ,
the code and the two plan files win. Task order for each feature is in its plan.

### 6.1 Sampler engine (instrument sounds, plan §3 and §6) — implemented

The sketches that were here are now code; read the files, not a sketch:
`lib/rmhmusic/learn/audio/instruments/` (`sampler.ts`, `engine.ts`, `catalog.ts` with
`resolveSound` / `chordSoundFor`, `credits.ts`, generated `zones-data.ts`), `audio/voice.ts`,
`audio/sequence.ts`, `scripts/rmhmusic/build-instruments.ts` + `sources.json`,
`components/rmhmusic/learn/SoundDialog.tsx`, `SoundCredits.tsx`, `app/routes/rmhmusic/credits.tsx`.
Rebuild the samples: `pnpm exec tsx scripts/rmhmusic/build-instruments.ts [piano guitar violin flute]`
(needs `ffmpeg` with libmp3lame and `unar`; `RMHMUSIC_ARCHIVE_DIR` may point at an already
downloaded `BJAM 5.26.04.rar`). Next steps if wanted: pass the instrument's `range` into the
question generators of the match / find lessons (plan §5.2), a "Change sound" link in the ear sound row, a second Salamander
velocity layer (+0.53 MB), an offline cache.

### 6.2 Sight reading game — Sprint (plan: `2026-11-09-rmhmusic-note-sprint.md`)

```ts
// lib/rmhmusic/learn/sprint/levels.ts
export type SprintLevel = 'note' | 'accidental' | 'chord' | 'bar';
export interface SprintPrompt {
  level: SprintLevel;
  notes: readonly number[];   // sounding MIDI; 1 for note/accidental, 3 for chord, 4 in order for bar
  clef: 'treble' | 'bass';
}
export const PAR_MS: Record<SprintLevel, number> = { note: 1200, accidental: 1600, chord: 2400, bar: 2000 };
// bar par = 2000 + 700 * (notes.length - 1)

// lib/rmhmusic/learn/sprint/scoring.ts
// promptPoints(level, elapsedMs, correct, noteCount?) -> 0..100: 100 at or under par, linear to 0
// at 4x par, 0 if wrong. runScore = mean; stars via starsFor().

// lib/rmhmusic/learn/sprint/generate.ts
// makePrompt(level, rand: () => number, opts): SprintPrompt   // seeded, inside ledger-line limit
// dailySeed(utcDate: string): number                          // e.g. FNV-1a of "2026-11-09"
// dailyRun(utcDate): readonly SprintPrompt[]                  // 6 levels x 5 prompts, escalating
// utcDate(now: number): string                                // the ONLY place "the day" is decided

// lib/rmhmusic/learn/sprint/machine.ts — explicit {initial, step}, like machines/match-note.ts
export type SprintState =
  | { kind: 'ready' } | { kind: 'countdown'; beat: 0 | 1 | 2 }
  | { kind: 'asking'; index: number; shownAt: number; got: readonly number[] }
  | { kind: 'feedback'; index: number; correct: boolean }
  | { kind: 'complete'; points: readonly number[] }
  | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed' } | { kind: 'signed-out' };
// Events: start, tick, shown{at}, note{midi, time}, next, complete{outcome}, retry.
// Rules: a prompt cannot be answered before it is drawn; note-offs and held keys from the previous
// prompt are ignored; chord = pitch classes inside a 600 ms window (reuse input/chord-window.ts);
// bar = notes in order, per-note time from the previous note; a wrong note ends the prompt (no
// retry); exactly one `complete` per run; times come from NoteEvent.time, never Date.now().
```

```prisma
// As built (prisma/schema/rmhmusic.prisma): MusicSprintBest { userId, level, bestScore, bestAvgMs?,
// updatedAt; @@unique([userId, level]) } and MusicSprintDaily { userId, date VarChar(10), score?,
// avgMs?, played?, skipped?, results Json?, scoredAt?, createdAt; @@unique([userId, date]) } — a
// daily row with score NULL is a started run. Rules: lib/rmhmusic/learn/sprint/record.ts.
```

UI: `components/rmhmusic/learn/sprint/*` + `app/routes/rmhmusic/sprint.tsx` (auth-gated like
`practice.tsx`, listed in `EXCLUDED_ROUTES` as `'personal'` in the sitemap test). Needs `StaffCard`
(+ `staff-card-layout.ts`) extended for accidentals, stacked chord noteheads (second-interval
offset) and a bar of notes with a "now" mark; keep `direction="ltr"` on all SVG text and a
fixed-height sheet per level (skeleton equals loaded height). Mic is offered for note / accidental /
bar only; for chords say once that the microphone hears one note at a time and never mark it wrong.

### 6.3 Phase 3 (tuner and note reader) — implemented

The sketch that was here is now code; read the files: `lib/rmhmusic/learn/tuner/{machine,read}.ts`,
`lib/rmhmusic/learn/input/mic.ts` (`onFrame`), `lib/rmhmusic/learn/store.ts` (`subscribeMicFrames`),
`components/rmhmusic/learn/tuner/`, `app/routes/rmhmusic/tuner.tsx`. Possible next steps: tuning
presets beyond guitar standard (drop D, ukulele, violin), a "tune by ear" mode (reading while the
reference tone sounds, which the mute now prevents; it would need echo cancellation), and a calibration offset (A4 = 442 Hz).
