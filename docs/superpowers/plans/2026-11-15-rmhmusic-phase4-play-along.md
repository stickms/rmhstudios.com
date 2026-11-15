# RMH Music Phase 4 — songs: sheet music and tab play-along

Date: 2026-11-15. Roadmap: `docs/rmhmusic/roadmap.md` §3 (Phase 4). Branch
`claude/hopeful-bohr-99d1vw` (after PR #1653, the tuner).

## Decisions

- **Content: a small built-in songbook, public domain only.** Eight beginner melodies, transcribed
  by hand into a small typed format in `lib/rmhmusic/learn/songs/` — no third-party files, no
  copyrighted arrangements. Traditional tunes and composers dead for more than 70 years: Mary Had
  a Little Lamb, Twinkle Twinkle Little Star, Ode to Joy (Beethoven's theme), Frère Jacques,
  Lightly Row, Au clair de la lune, Minuet in G (the theme, attributed to Christian Petzold) and
  Amazing Grace (the tune "New Britain"; its first and last lines). Each is one melody line in C or
  G major, 4/4 or 3/4, with a tempo; one has a pickup. Titles and composers are proper names and
  stay data (not translated keys).
- **The format** is a tiny text notation parsed by a pure, tested function
  (`songs/notation.ts`): `E4 D4:2 | F#4:0.5 …` — a pitch (letter, optional `#`/`b`, octave) and a
  duration in beats (default 1), bars split by `|`. A song carries `key` (`C`, `G` or `F`), `time`
  (beats per bar), `bpm`, `pickup` (beats of an opening partial bar, or 0). The catalogue test
  holds every bar to its time signature, every note to the drawable range, every guitar note to a
  fret, and ids to a URL-safe shape.
- **Two versions from one score.** The staff is written once. Piano plays it as written. Guitar
  reads the same staff with the octave clef (the small 8) and SOUNDS an octave lower — the real
  guitar convention (`theory/fretboard.ts` `writtenMidi`) — so every song lies in open position.
  The guitar version adds a **tab staff** under the staff; its string and fret come from a pure
  `fingerFor(sounding)` (`songs/fingering.ts`): the lowest fret wins, which keeps a note in open
  position (frets 0–4) whenever it can be (B3 is the open B string, not the G string's 4th fret),
  and a note above open position takes its lowest fret too (A4 → 1st string, 5th fret). A note
  below the low E has no fingering (the catalogue test forbids one).
- **Spelling.** Sharps in C and G, flats in F; an accidental is printed when the note differs from
  the key signature and from an earlier note of the same letter in the bar (`songs/score.ts`).
- **Two modes, one pure module of machines** (`songs/machine.ts`, `{ initial, step }`, strict
  island):
  - **Wait for me:** the cursor waits on each note until the right one is played. A note-on is
    right by the Sprint rule (`sprint/machine.ts` `sameNote`): MIDI must play the exact sounding
    pitch, the computer keys, the on-screen keys and the microphone any octave. Note-offs never
    answer; a note timed before the run started is ignored. A wrong note is marked and counted; the
    note stays until it is right. Points per note: 100 first time, 50 after one wrong note, 0 after
    more; the score is their mean.
  - **Play along:** a one-bar metronome count-in (plus the beats before a pickup), then the cursor
    moves in time and every note is scored by pitch and timing. Each note-on goes to the nearest
    unanswered note whose window it falls in, with the tap lesson's windows (`scoring/timing.ts`:
    100 within `PERFECT_MS` 70 ms, falling to 0 at `ZERO_MS` 200 ms) after subtracting
    `effectiveLatencyMs` of the profile; the right pitch scores its timing points, a wrong pitch
    marks the note wrong (0). A note-on that answers no note costs `EXTRA_TAP_COST` of a note, as
    in `tapScore`, so hammering keys cannot help. A note whose window passes unanswered is missed.
    The microphone reports a note once it has settled, so a mic note's time is taken back by
    `MIC_ONSET_MS` (60 ms, reasoned, not measured). The run ends when the last window closes.
  - Results: a sentence ("28 of 32 notes right, 3 early, 1 late") and stars via `starsFor`.
  - Times come only from `NoteEvent.time` and the metronome's own `beatTimes()` / `onBeat` (same
    `performance.now()` clock). The screen sends `tick { at }` at the machine's `nextDue` (one
    `setTimeout` at a time, while a run is under way); nothing runs at rest and there is no
    `requestAnimationFrame`. A hidden tab, a window away long enough to throttle timers
    (`watchAway`), a dialog opening, or sound stopping drops a play-along run (Start again).
- **Rendering: a multi-bar score that wraps by system** (`songs/layout.ts`, pure, tested): bars are
  laid left to right at a width proportional to their notes, a system takes as many whole bars as
  fit the measured width, and every system but a short last one is justified. The system height is
  fixed per version (piano 108 units, guitar 162 with the tab), and the score is shown in a fixed
  window of 324 units — three piano systems or two guitar systems — so the box is one height for
  every width, instrument, state and the loading placeholder. The window scrolls itself (native
  scrolling, so a learner can look ahead) to keep the cursor's system in view. The SVG is drawn at
  a fixed scale (1 unit = 1.1 px), measured once before paint and again on resize. Notes,
  stems, flags and beamed eighth pairs, dots, ledger lines, key and time signatures, bar lines and
  the final double bar reuse the card's hand-ruled staff, clefs, sharps, flats and now mark
  (`staff-card-layout.ts`). A pencil tick or a red-pencil cross marks each note once it has passed.
  All SVG text is `direction="ltr"`.
- **Hear it** plays the four-bar phrase the cursor is in through the learner's sound
  (`audio/sequence.ts` `playSequence`, extended to take a gap per note), disabled while a run is
  under way. **Tempo**: Normal or Slower (two thirds), as the sanctioned `<Tabs>`.
- **Routes:** `/rmhmusic/songs` (the list) and `/rmhmusic/songs/$songId` (play), inside the
  auth-gated `rmhmusic` layout, excluded from the sitemap (`'personal'` and the `$songId` dynamic
  route), both on the sign-in return-path allowlist (a song id of the catalogue's shape). A quiet
  "Songs" text link beside "Sight reading" and "Tuner" at the foot of the learn home. Mode is
  chosen with the sanctioned `<Tabs>` (Wait for me / Play along).
- **Persistence:** a best score per user per song per mode (`MusicSongBest`, additive migration
  `20261115190000_music_song_best`). A contract (`songs/songs.contract.ts`) bound with `implement()`:
  `GET /api/rmhmusic/songs` (the learner's bests) and `POST /api/rmhmusic/songs/best` (zod,
  rate limit `write`). The server recomputes the score from the per-note results with the same
  pure functions (`songs/scoring.ts`; the client's score is ignored; the note count must equal the
  song's) and keeps the higher. The screen talks to a `SongSaver` seam (API saver, memory saver for
  tests), as the Sprint does.

## Tasks (TDD: tests first, seen failing; one commit per task)

1. Plan (this file), `.prettierignore` entry.
2. `songs/notation.ts`, `songs/score.ts` (spelling, onsets, sounding pitch, phrases),
   `songs/fingering.ts`, `songs/catalog.ts` (the songbook) with tests; strict island.
3. `songs/layout.ts` with tests (wrap, fixed system height, every note once, inside the width,
   bars whole, beams, accidentals, key and time signature, tab rows).
4. `songs/scoring.ts` + `songs/machine.ts` (wait and play-along) with tests.
5. `playSequence` gap per note (test), persistence: schema, migration, zod, contract, server,
   `implement()` modules, `pnpm api:routes`, saver (tests for record rules and the saver).
6. UI: `ScoreView`, `SongList`, `SongScreen`, routes, sitemap, return path, LearnHome link,
   styles; route tree regenerated; strings extracted (16 shipped `c-rmhmusic.json` only).
7. Docs: roadmap §1/§2/§3, `pnpm docs:site`, `pnpm facts:generate`.
8. Chromium smoke (harness copied from t34 to t35): Wait for me on computer keys and MIDI;
   Play along with fake MIDI at exact beat times (top marks) and late (lower); guitar tab frets;
   390 and 1280 in Day and Night; CLS 0; skeleton parity; no rAF at rest; screenshots looked at.

## Verification

- `pnpm exec vitest run lib/rmhmusic components/rmhmusic` and the gates in `lib/__tests__/` that
  the commit gate runs; a scoped `tsc` over the changed files (`pnpm typecheck`, `tsc -b`, is
  OOM-killed in the agent container).
- The smoke above; anything not run is listed in the roadmap.
