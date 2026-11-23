# 05 — Read and tap rhythms in RMH Music

Surface: RMH Music path (every instrument, voice included), a new unit "Read rhythms" after "Rhythm basics", its lesson
screen. Wave 1. Namespace `music-rhythms`. App tier (L8).

## User story

As a learner who can name note values and keep a beat, I want to read a written rhythm — quarters, eighths, rests, a
dotted note, a tie — and tap it in time, so that I can play what is on the page and not only the pitches.

## Requirements elicitation

- **What exists (verified):**
  - The rhythm unit (`RHYTHM_UNIT` in `lib/rmhmusic/learn/content/path.ts`, id `rhythm-basics`, on `PATH`,
    `PIANO_PATH` and `VOICE_PATH`) has three lessons: note values (`rhythm-note-values`), 4/4 versus 3/4
    (`rhythm-44-vs-34`) and tapping a steady beat (`rhythm-tap-the-beat`). Their machines are
    `lib/rmhmusic/learn/machines/rhythm.ts` (`rhythmActivity`, `NOTE_VALUES`, `BEATS_OF`) and
    `lib/rmhmusic/learn/machines/tap-beat.ts` (count-in of `COUNT_IN = 4`, `BEATS = 16` at `BPM = 80`, taps scored by
    `tapScore` in `lib/rmhmusic/learn/scoring/timing.ts` with `PERFECT_MS = 70`, `ZERO_MS = 200`, the learner's latency
    from calibration through `effectiveLatencyMs`). The screens are `components/rmhmusic/learn/RhythmLesson.tsx`,
    `TapBeatLesson.tsx` and `NoteValues.tsx`; `LessonScreen.tsx` routes `mode: 'rhythm-basics'`.
  - Nothing asks a learner to read a rhythm: the beat lesson taps evenly spaced clicks, and the song lessons
    (`lib/rmhmusic/learn/songs/`) grade pitch with "Wait for me" or a tempo, not a rhythm read from the staff.
  - Lesson ids are stored with progress (`lib/rmhmusic/learn/progress.server.ts`, `getLesson` in `path.ts`); the path
    comment says "add new ones, never rename".
- **Decisions:**
  - **A fifth rhythm lesson mode, `rhythm-reading`,** in a new unit `read-rhythms` placed directly after
    `rhythm-basics` on all three paths (rhythm needs no instrument and no voice range, so `needsVoiceRange` stays false
    for it, as for the rhythm unit).
  - **Five lessons**, each eight one-bar patterns in 4/4 (the last in 3/4) at 72 BPM:
    `rhythm-read-quarters-halves` (quarter and half notes, whole note), `rhythm-read-eighths` (beamed eighth pairs),
    `rhythm-read-rests` (quarter and half rests), `rhythm-read-dotted` (dotted half, dotted quarter and eighth),
    `rhythm-read-ties-34` (ties across the beat, and bars of 3/4).
  - **How a pattern is played:** the bar is drawn on a one-line percussion staff; "Listen" plays it on the metronome's
    click sound once (it must be heard once, as the ear lessons require); then a count-in of one bar and the learner
    taps each note's start (a key, a pointer press, a MIDI note or the microphone, through the lesson's existing input
    modes). Rests are silence: a tap in a rest counts as an extra tap.
  - **Scoring:** onsets are matched to the nearest written onset within `ZERO_MS`; each matched onset scores as a beat
    tap does today; an unmatched written note scores 0; an extra tap costs `EXTRA_TAP_COST`. A pattern passes at 70%;
    stars per lesson as the other lessons (`scoring/stars`). Learning mode repeats a missed pattern; Test mode does not.
  - **Feedback:** after each pattern, the bar is drawn again with each note marked early, on time or late (a word under
    the note, not a colour alone).
  - **No new storage:** progress is the existing lesson progress; tempo is fixed per lesson.

## Functional requirements

1. FR-1 `lib/rmhmusic/learn/content/rhythm-patterns.ts`: the forty patterns as data (`{ meter, notes: [{ value, dotted,
   rest, tieToNext }] }`) with a check that every bar's durations add up to its meter.
2. FR-2 `lib/rmhmusic/learn/theory/rhythm.ts` (pure): onset times in beats and ms for a pattern at a tempo, tie
   merging, and the beaming groups for drawing.
3. FR-3 `lib/rmhmusic/learn/scoring/onsets.ts`: `onsetScore(expectedMs, tapsMs, latencyMs)` built on `timing.ts`'s
   constants; `tapScore` is unchanged.
4. FR-4 `lib/rmhmusic/learn/machines/rhythm-reading.ts`: the session lifecycle of `session.ts` (listen, count-in, tap,
   feedback, next; one `complete` per attempt; a late answer from an abandoned run ignored by its token), like
   `tap-beat.ts`.
5. FR-5 `LessonMode` gains `rhythm-reading`; `READ_RHYTHMS_UNIT` added after `RHYTHM_UNIT` in `PATH` and `VOICE_PATH`
   (`PIANO_PATH` follows `PATH`); `content/routing.ts` marks the mode available.
6. FR-6 UI: `components/rmhmusic/learn/RhythmReadLesson.tsx` and `RhythmBar.tsx` (SVG notation: noteheads, stems, beams,
   rests, dots, ties, a time signature), routed from `LessonScreen.tsx`; the metronome and click sounds are
   `lib/rmhmusic/learn/audio/metronome.ts` and `clicks.ts`.

## Non-functional requirements

- **Timing:** taps carry the input event's own timestamp, never a clock read in a handler (the tap-beat rule).
- **Accessibility:** each bar has a text equivalent ("Quarter, quarter, two eighths, quarter rest"); feedback is words.
- **Motion:** nothing moves at rest; the playhead is drawn only while the pattern sounds and stops with it.

## Data model and API

No schema change; five new lesson ids.

## Testing requirements

- `lib/rmhmusic/learn/theory/rhythm.test.ts` (colocated, as the folder's tests are): onsets for every pattern; ties;
  every bar sums to its meter (all forty).
- `lib/rmhmusic/learn/scoring/onsets.test.ts`: on time, early, late, a missed note, a tap
  in a rest, latency.
- `lib/rmhmusic/learn/machines/rhythm-reading.test.ts`: must listen first, Learning
  repeats, Test does not, one `complete`, an abandoned run's late events change nothing.
- Existing tests that must stay green: `lib/rmhmusic/learn/content/path.test.ts`, `voice-path.test.ts`,
  `machines/tap-beat.test.ts`.
- `components/rmhmusic/learn/RhythmBar.test.tsx` (`renderToStaticMarkup`, colocated like `NoteValues.test.tsx`): the
  text equivalent and the feedback words.

## Acceptance criteria

- [ ] On every path, "Read rhythms" follows "Rhythm basics" with five lessons.
- [ ] Tapping a dotted-quarter-and-eighth bar on time passes; tapping evenly does not.
- [ ] A tap during a rest is counted as extra and shown under the rest.
- [ ] A singer reaches the unit without choosing a range.

## Out of scope

Sixteenth notes, triplets, compound meters, two-hand rhythms, sight-reading songs.
