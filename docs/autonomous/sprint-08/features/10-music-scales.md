# 10 — Scales and key signatures in RMH Music

Surface: the RMH Music learning path (`/rmhmusic`, app tier): a new unit, two
new lesson activities. Wave 5. Namespace `music-scales`.

## User story

As a piano or guitar learner who has finished the note-reading, ear and chord
lessons, I want to play the major and natural minor scales and to name a key
from its signature, so that the path takes me from single notes and chords to
the thing every piece I want to play is written in.

## Requirements elicitation

- **What exists (verified):**
  - The path is data (`lib/rmhmusic/learn/content/path.ts`: `PATH` for piano
    and guitar, `VOICE_PATH` for singers, `LessonMode` union of ten modes,
    `Lesson.available`, ids stored in `music_learn_lesson_progress` — "renaming
    one orphans learners' progress: add a new id instead"). Every lesson is
    available today; the catalogue entry says "It is a Beta and more lessons
    are still to come" (`lib/catalog/apps/rmhmusic.ts`).
  - Activities are pure machines on a shared session lifecycle
    (`lib/rmhmusic/learn/machines/session.ts`, `runner.ts`; e.g.
    `play-chord.ts`, which collects notes through `input/chord-window.ts`),
    rendered by a lesson component (`components/rmhmusic/learn/PlayChordLesson.tsx`,
    `LessonScreen.tsx`), with theory helpers in
    `lib/rmhmusic/learn/theory/` (`chords.ts`, `intervals.ts`, `clef.ts`,
    `fretboard.ts`) — **no scale or key-signature module**
    (`grep -rli "keySignature\|majorScale" lib/rmhmusic/learn/theory` finds
    nothing).
  - Input comes from microphone, MIDI, computer keys or on-screen keys
    (`useLearnInput.ts`); the staff renders through `LiveStaff.tsx`,
    `StaffCard.tsx`, `staff.ts` and `sheet-layout.ts`.
- **Decisions:**
  - **Theory:** `theory/scales.ts` — major and natural minor (and, for the
    later lesson, harmonic minor) as interval patterns; `scaleNotes(tonic,
    kind)` with correct spelling (F major has B♭, not A♯); key signatures for
    the 15 major and 15 minor keys (`keySignature(key) → { accidental: 'sharp'
    | 'flat' | null, count }`, the order of sharps and flats), relative
    major/minor.
  - **Activity 1, `play-scale`:** the learner is asked for a scale by name
    ("C major, one octave up") and plays it note by note; each note is
    graded in order (pitch class and direction; octave free on guitar), a
    wrong note is marked and the learner continues from it; one scale is one
    answer to the session machine. Piano shows the suggested fingering for
    the five white-key majors; guitar shows one position on the fretboard
    view (`FretboardView.tsx`). Microphone input uses the existing pitch
    detection and its latency calibration.
  - **Activity 2, `key-signature`:** a staff card shows a key signature
    (treble or bass clef, from `clef.ts`); the learner picks the major key
    (and, in the second lesson, the minor) from four buttons. Pure recognition;
    no instrument needed (so it is in the voice path too).
  - **A new unit "Scales and keys"** after the chord unit in `PATH`: five
    lessons with new ids — `scales-major-white` (C, G, D, F major),
    `key-signatures-major`, `scales-major-all` (every major), `key-signatures-minor`
    with `scales-minor-natural`; `VOICE_PATH` gets the two key-signature
    lessons only. Lessons count toward XP and streaks like the others
    (`xp.ts`).
  - Content strings follow the path's own pattern (English defaults in the
    data, rendered through `t()` in the components with **literal keys** —
    new lessons use a literal key map in the component, never a key built
    from the lesson id, so the computed-key ratchet does not grow).

## Functional requirements

1. FR-1 `theory/scales.ts` and `theory/key-signatures.ts` with correct
   spelling for all keys.
2. FR-2 `machines/play-scale.ts` and `machines/key-signature.ts` on the shared
   session machine.
3. FR-3 `PlayScaleLesson.tsx` and `KeySignatureLesson.tsx`, wired in
   `LessonScreen.tsx` by mode.
4. FR-4 The new unit in both paths; progress saved through the existing
   progress endpoint (lesson ids validated against the path).

## Non-functional requirements

- **Correctness:** a scale is right only in order; enharmonic input from MIDI
  maps to the scale's spelling for display; the session machine's "one
  `complete` per attempt" invariant holds.
- **Accessibility:** every staff card has a text equivalent ("Key signature:
  three flats, treble clef"); answers are buttons reachable by keyboard
  (`radio-keys.ts` pattern); input feedback is announced.
- **Design:** app tier (L8): the RMH Music paper look (`rmhmusic.css`).
- **i18n:** `music-scales` for new UI strings; note names through the
  existing note-name formatter.

## Data model and API

- No schema change (lesson ids are strings).
- New `lib/rmhmusic/learn/theory/scales.ts`, `key-signatures.ts`,
  `lib/rmhmusic/learn/machines/play-scale.ts`, `key-signature.ts`,
  `components/rmhmusic/learn/PlayScaleLesson.tsx`, `KeySignatureLesson.tsx`.
- Edits: `content/path.ts` (`LessonMode` gains `play-scale`,
  `key-signature`; the unit), `LessonScreen.tsx`, `PathUnit.tsx` if it maps
  modes to icons.

## Testing requirements

- Colocated tests in the style of the folder (`*.test.ts` beside the module,
  already globbed): `theory/scales.test.ts` (all 30 keys spelled; relative
  keys), `theory/key-signatures.test.ts`, `machines/play-scale.test.ts`
  (order, wrong note, continue, complete once), `machines/key-signature.test.ts`.
- `content/path.test.ts` and `voice-path.test.ts` extended (ids unique, modes
  known, voice path has no instrument lesson).
- Component tests `PlayScaleLesson.test.tsx` with the on-screen keyboard.

## Acceptance criteria

- [ ] On piano with the on-screen keys, "G major" is right only with F♯, in
      order, and the lesson completes and awards XP.
- [ ] On guitar the scale shows one position and accepts any octave.
- [ ] A singer's path shows the key-signature lessons and no scale lesson.
- [ ] A screen reader hears each key signature in words.
- [ ] 390 px and 1280 px, both RMH Music themes, once in `ar`.

## Out of scope

Modes, pentatonics, two-octave scales with fingering for every key, sight
reading melodies, sung scales.
