# 04 — Chords in every key in RMH Music

Surface: the RMH Music learning path (`/rmhmusic`): a new unit for piano and guitar learners, its lessons and the new
`staff-chords` lesson mode. Wave 1. Namespace `music-chords`. App tier (L8).

## User story

As someone learning an instrument, I want to hear, read and play every major, minor, diminished and augmented triad, in
every key and in its inversions, so that I can recognise and play the chords in the songs I am learning rather than only
C, F and G major.

## Requirements elicitation

- **What exists (verified):**
  - `lib/rmhmusic/learn/theory/chords.ts` knows the four triads (`CHORDS`, `chordNotes`, `chordQuality`,
    `matchesChord`): a chord is its pitch classes, so an inversion or a doubled note is the same chord.
  - The path (`lib/rmhmusic/learn/content/path.ts`) has one ear lesson (`ear-major-minor`, mode `ear-chord`, pool
    `major` and `minor`) and one playing lesson (`chord-play-c-major`, mode `play-chord`: "Play C, E and G together,
    then F major and G major"), both in "Train your ear". `PlayChordLesson.tsx` collects a chord in a 600 ms window
    (`input/chord-window.ts`) and refuses the microphone, which hears one note at a time.
  - Nothing reads a chord on the staff, nothing names diminished or augmented by ear in a lesson, and nothing asks for
    an inversion. Spelling helpers exist for scales, key signatures and spelled staff cards (`theory/scales.ts`,
    `theory/key-signatures.ts`, `content/spelling.ts`: a written note with its alteration, `spelledName`,
    `alterationGlyph`), which the new triads reuse.
  - Sprint 10's rejected list kept chords for a later sprint ("one music unit per sprint"); sprint 10 shipped the bass
    clef unit, so this is the sprint's one music unit.
- **Decisions:**
  - **A new unit, "Chords in every key"**, after "Scales and keys" on `PATH` (guitar) and `PIANO_PATH` (piano), not on
    `VOICE_PATH` (a singer plays no chords; the path's note says so already). Five lessons, new ids only:
    1. `chords-ear-four-qualities` — `ear-chord`, pool `major`, `minor`, `diminished`, `augmented`.
    2. `chords-read-root-position` — new mode `staff-chords`: a root-position triad on the staff (treble; on the piano
       path the bass staff too, in alternate questions); the learner names its root (a letter with ♯ or ♭ where the
       chord is spelled so) and its quality from buttons.
    3. `chords-play-major-minor` — `play-chord` over all twelve major and twelve minor triads (asked by name, spelled
       right: F♯ major is F♯ A♯ C♯).
    4. `chords-play-dim-aug` — `play-chord` over diminished and augmented triads on the seven natural roots.
    5. `chords-read-inversions` — `staff-chords` with inversions: a triad in root position, first or second inversion;
       the learner names the chord and the inversion.
  - **Spelling:** `theory/chords.ts` gains `spellTriad(root, quality)` (letter names that skip one letter each, with the
    accidentals the key needs; doubly altered notes only where the theory requires them, which the five lessons' pools
    avoid) and `inversionOf(notes)`.
  - **Playing lessons per lesson:** `machines/play-chord.ts` takes the lesson's chord set (today it is fixed to C, F,
    G); `chord-play-c-major` keeps its exact questions.
  - **Guitar:** the playing lessons accept any voicing with exactly the chord's pitch classes, as today; on the guitar
    path the screen shows the triad's notes, not a fingering chart (fingerings are out of scope).
  - **Scoring, progress and XP** exactly as every lesson (`scoring/stars.ts`, `progress.server.ts`, `xp.ts`).
  - **Existing learners:** completion shown to friends (`social/friends.server.ts`) drops for anyone who had finished
    the path; accepted as sprint 10 06 accepted it (no gating, no stored progress row changes).
  - **Titles and summaries** are English catalogue strings in `path.ts`, like every unit; the namespace holds the new
    interface strings (quality and inversion button names, the staff card's text alternative).

## Functional requirements

1. FR-1 The unit and its five lessons in `path.ts`, the `staff-chords` member of `LessonMode`, `pool` validation in
   `path.test.ts` extended to the new lessons.
2. FR-2 `spellTriad` and `inversionOf` in `theory/chords.ts`; a chord question generator
   `lib/rmhmusic/learn/machines/staff-chords.ts` (pure, seeded) with root-position and inversion modes.
3. FR-3 `components/rmhmusic/learn/StaffChordsLesson.tsx` drawing the triad with the existing staff layout
   (`staff-card-layout.ts`, `grand-staff-layout.ts` for the piano path's bass questions) and the answer buttons;
   `LessonScreen.tsx` routes `staff-chords` to it.
4. FR-4 `machines/play-chord.ts` reads a per-lesson chord set; `PlayChordLesson.tsx` asks by the spelled name.
5. FR-5 Ear lesson pool widened by data only (`ear-chord` already takes `pool`).

## Non-functional requirements

- **Accessibility:** each staff chord card has a text alternative naming the clef and the three notes ("Treble staff: F
  sharp, A sharp, C sharp"); every answer is a button reachable by keyboard; the microphone line of `PlayChordLesson` is
  unchanged.
- **Correctness:** spelling and inversions are pure and tested against a table of all 48 triads.
- **Design:** app tier; nothing animates at rest.

## Data model and API

- No schema change (progress rows are keyed by lesson id).
- New: `machines/staff-chords.ts`, `components/rmhmusic/learn/StaffChordsLesson.tsx`. Edits: `content/path.ts`,
  `theory/chords.ts`, `machines/play-chord.ts`, `components/rmhmusic/learn/PlayChordLesson.tsx`, `LessonScreen.tsx`,
  `components/rmhmusic/learn/ear-names.ts` (diminished and augmented names, if not present).

## Testing requirements

- Main suite (colocated, as the folder's tests are) `lib/rmhmusic/learn/theory/chords.test.ts` (extended): `spellTriad`
  for all 48 root-quality pairs (each note a third above the last by letter), `inversionOf` for each inversion and for
  doubled notes.
- Main suite `lib/rmhmusic/learn/machines/staff-chords.test.ts`: seeded questions cover the pool; inversions only in the
  inversion lesson; the bass staff only on the piano path.
- `lib/rmhmusic/learn/content/path.test.ts` (extended): new ids unique, unit on guitar and piano paths, absent from the
  voice path, `chord-play-c-major` unchanged.
- Component `components/rmhmusic/learn/StaffChordsLesson.test.tsx` (`renderToStaticMarkup`): the text alternative and
  the button names.

## Acceptance criteria

- [ ] A piano learner sees "Chords in every key" after "Scales and keys"; a singer does not.
- [ ] Playing F♯ A♯ C♯ answers "F♯ major"; playing it as A♯ C♯ F♯ also answers it.
- [ ] The inversion lesson accepts "first inversion" for E G C.
- [ ] The C-major chord lesson asks exactly what it asked before.

## Out of scope

Seventh chords, guitar fingering charts, chord progressions, singing chords.
