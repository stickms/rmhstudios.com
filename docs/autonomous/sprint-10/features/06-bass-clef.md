# 06 — The bass clef and the grand staff in RMH Music

Surface: the RMH Music learning path (`/rmhmusic`), its staff flashcards and the "play what you read" lessons. Wave 1.
Namespace `bass-clef`. App tier (L8): RMH Music keeps its own look.

## User story

As someone learning piano, I want to learn to read the bass clef and then read notes across both staves of the grand
staff and play them, so that I can read real piano music, where the left hand lives below middle C.

## Requirements elicitation

- **What exists (verified):**
  - The path (`lib/rmhmusic/learn/content/path.ts`) teaches the treble clef only: `staff-what-is-a-staff`,
    `staff-treble-notes`, `staff-find-middle-c` (mode `staff-flashcards`), then keyboard, ear, scales and voice units.
    Lesson ids are stored in `music_learn_lesson_progress`, so new lessons get new ids.
  - The theory already knows both clefs: `lib/rmhmusic/learn/theory/clef.ts` (`Clef = 'treble' | 'bass'`, `clefStep`,
    `ledgerSteps`), and decks carry a clef (`lib/rmhmusic/learn/content/decks.ts`: a card id is `<clef>:<midi>`, stable
    for the SRS). The bass clef is used only for a low singer's voice range (`voiceDeck`,
    `lib/rmhmusic/learn/voice/range.ts`) and by `find-note.ts` choosing a clef for one note.
  - The staff renderers lay out one staff (`lib/rmhmusic/learn/staff.ts`, `staff-card-layout.ts`,
    `live-staff-layout.ts`); there is no grand staff (two staves with a brace).
- **Decisions:**
  - **A new unit, "Bass clef and the grand staff",** after "Meet the staff & the keys", **for piano learners only
    (validation pass 2).** `PATH` is shared by piano and guitar and has no per-instrument lesson filter; guitar music is
    written in the treble clef an octave up (`targetStaff` in `machines/find-note.ts`), so the bass clef is not a guitar
    skill. `pathFor('piano')` returns `PATH` with the unit inserted after the first; `pathFor('guitar')` and
    `pathFor('voice')` are unchanged. (`pathFor` today maps piano and guitar to the same `PATH`; its two callers outside
    `path.ts`, `LearnHome.tsx` and `social/friends.server.ts`, already pass the instrument, and `content/practice.ts`
    gathers decks from `pathFor(instrument)`, so piano practice gains the new decks.) Four lessons:
    1. `bass-clef-lines-spaces` — `staff-flashcards`, new decks `bass-lines` (G2 B2 D3 F3 A3) and `bass-spaces` (A2 C3
       E3 G3).
    2. `bass-clef-all` — `staff-flashcards`, deck `bass-all` (E2 to C4, ledger lines included).
    3. `grand-staff-middle` — `staff-flashcards` on the grand staff, deck `grand-middle` (A3 to E4 written on whichever
       staff a pianist reads it: below C4 on the bass staff, C4 on both, shown either way across cards).
    4. `grand-staff-play` — a **new lesson mode `grand-staff-find`** (not `play-note`, which is the "First note played"
       lesson, `FirstNoteLesson.tsx`): the note finder (`machines/find-note.ts`, `FindNoteLesson.tsx`, which already
       draws piano targets below C4 on the bass staff) with a new `FindNoteMode` whose pool is the naturals A2–E4 and
       whose target is drawn on the grand staff; the learner plays it on the on-screen, MIDI or computer keyboard or the
       microphone. `LessonScreen.tsx` routes the new mode to `FindNoteLesson`.
  - **Card ids** stay `<clef>:<midi>`; a grand-staff card is `grand:<staff>:<midi>`, so its schedule is its own (reading
    middle C on the bass staff is a different skill from reading it on the treble).
  - **Grand staff layout:** a pure `grand-staff-layout.ts` placing two staves with the standard gap, a brace drawn as a
    path, ledger lines per staff, and the middle-C ledger belonging to the staff the note is written on.
  - **Voice path and guitar path unchanged** (singers already get their clef from their range).
  - **Existing learners:** the unit adds four lessons to a piano learner's path, so path completion shown to friends
    (`social/friends.server.ts`) drops for anyone who had finished the path; recorded as accepted (nothing is locked:
    the path has no gating, and no stored progress row changes).

## Functional requirements

1. FR-1 The four lessons and the unit in `path.ts` (new ids only, inserted for piano by `pathFor`), the
   `grand-staff-find` member of `LessonMode`, the decks in `decks.ts`.
2. FR-2 `lib/rmhmusic/learn/grand-staff-layout.ts` (pure) and the renderer it feeds (the existing staff card component
   taking a `grand` layout).
3. FR-3 `staff-flashcards` accepts a deck whose cards are grand-staff cards; the note finder accepts the
   `grand-staff-find` mode and draws its target on the grand staff.
4. FR-4 Lesson progress and XP exactly as other lessons record them (`progress.server.ts`, `xp.ts`).
5. FR-5 Unit and lesson titles and summaries are English catalogue strings in `path.ts`, like every other unit
   (`components/rmhmusic/learn/PathUnit.tsx`: "localised in a later phase"); the `bass-clef` namespace holds only the
   new interface strings this feature renders through `t()` (the staff names and positions in the cards' text
   alternatives, the guitar note).

## Non-functional requirements

- **Accessibility:** every staff card has a text alternative naming the clef, the staff and the note position ("Bass
  staff, second line"), never only the drawing; answers can be given by keyboard.
- **Design:** app tier; the staff uses the app's existing ink and line tokens; nothing animates at rest.
- **Correctness:** the layout is pure and covered by snapshot-free assertions on step positions.

## Data model and API

- No schema change (progress rows are keyed by lesson id).
- New `lib/rmhmusic/learn/grand-staff-layout.ts`; edits to `content/path.ts`, `content/decks.ts`,
  `staff-card-layout.ts`, `machines/find-note.ts` (accept a grand target), `components/rmhmusic/learn/StaffCard.tsx`
  (with `FlashcardLesson.tsx` and `FindNoteLesson.tsx` for the grand layout), and
  `components/rmhmusic/learn/LessonScreen.tsx` (routes `grand-staff-find` to `FindNoteLesson`).

## Testing requirements

- Product suite `lib/rmhmusic/learn/__tests__/grand-staff-layout.product.test.ts`: G2 sits on the bass bottom line; C4
  has one ledger line on either staff; E2 has one ledger line below the bass staff (G2 line, F2 space, E2 ledger line) and C2 has two; the gap between staves.
- Product suite `lib/rmhmusic/learn/content/__tests__/bass-path.product.test.ts`: the unit's ids are new (no id in an
  earlier path release changes), decks contain only notes in range, `pathFor('piano')` has the unit second and
  `pathFor('guitar')` equals today's `PATH`.
- Existing `path.test.ts`, `decks.test.ts`, `staff.test.ts`, `live-staff-layout.test.ts` stay green.

## Acceptance criteria

- [ ] A piano learner sees the new unit after "Meet the staff and keys" and can complete all four lessons.
- [ ] A bass-staff card is announced as "Bass staff" with its line or space.
- [ ] Middle C on the grand staff is reviewed separately on each staff.
- [ ] A guitar learner's and a singer's path are unchanged.

## Out of scope

Alto and tenor clefs, reading chords on the grand staff, sight-reading whole pieces, the voice path.
