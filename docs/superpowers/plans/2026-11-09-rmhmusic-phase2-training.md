# RMH Music Phase 2 — Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the path's "coming soon" lessons into real practice: staff-reading flashcards with spaced repetition, a fretboard and keyboard trainer, pitch matching, interval and chord ear training, and rhythm (metronome, note values, 4/4 vs 3/4, tap the beat).

**Architecture:** Every activity is a pure, tested module in `lib/rmhmusic/learn/` (theory tables, SRS scheduler, scoring) driven by an explicit machine in `machines/` (same `{ initial, step }` shape as `first-note.ts`, run by `useMachine`), rendered by a component in `components/rmhmusic/learn/` and reached through `LessonScreen`'s mode dispatch. One scoring module turns any result into the stars/score `lessonComplete` already stores. Input is always a `NoteEvent` from the existing hub, with on-screen answer buttons as the fallback so nothing needs a microphone or MIDI device. Staves are drawn with the app's own SVG notation (`staff.ts`, `Notehead.tsx`), not a notation library: it keeps the hand-copied-manuscript look and adds no dependency.

**Tech Stack:** TanStack Start, React 19, Zustand, Prisma 7, zod, vitest, Web Audio (`getAudioContext()`), the Phase 1 input hub.

**Spec:** `docs/superpowers/specs/2026-11-08-rmhmusic-learning-design.md` (§Phases 2, §Economy). Read it, `CLAUDE.md`, `components/CLAUDE.md`, `lib/CLAUDE.md`, and Phase 1's `docs/superpowers/plans/2026-11-08-rmhmusic-phase1-foundation.md` Global Constraints.

## PR plan

| PR | Tasks | Nature |
|----|-------|--------|
| D | 1–5 | Reading: scoring + staff maths, SRS, flashcard machine and UI (3 lessons live), SRS persistence + a Practice route. One additive migration. |
| E | 6–9 | Instrument and ear: fretboard/keyboard trainer, pitch match, intervals, chords. No schema change. |
| F | 10–12 | Rhythm: metronome, rhythm lessons, then the path/docs/catalog/site-knowledge close-out. |

Branch is always `claude/hopeful-bohr-99d1vw`. After a PR merges: `git fetch origin main && git merge origin/main` if the remote branch diverged, or restart with `git checkout -B claude/hopeful-bohr-99d1vw origin/main` only when the remote branch holds nothing unmerged (a force-push is not allowed in this session; a merge commit that makes the branch fast-forwardable is). Never run two implementers in the same working tree at once.

## Global Constraints

- Everything in Phase 1's Global Constraints still holds: route `/rmhmusic`, `--app-*` tokens only, `t('key', { defaultValue })` in `c-rmhmusic` with **new keys only** and `pnpm i18n:extract` (revert unrelated locale churn; touch only the 16 shipped locales' `c-rmhmusic.json`), `getAudioContext()` from `@/lib/shared/platform` only, **no new `requestAnimationFrame` loop** (timers and CSS), `*.server.ts` for server code, `defineHandler` + zod for routes, mobile first (360px, targets ≥ 44px, `.app-page`), tests colocated and only for non-obvious pure logic, `PATH=/opt/node24/bin:$PATH`, every commit passes `pnpm check:consistency`, stage with `git add <paths>` in a separate command before `git commit`, trailers `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01TQ742wqbe81SUHkzJceqQR`.
- **Look (owner, 2026-11-09): human, not generated.** Headings IM Fell English (`--app-font-display`), notebook paper, noteheads as markers. **No eyebrows, badges, pills, tag chips, footer text or taglines; no emoji, sparkles or gradient/glow art.** State is carried by notation and by words inside a sentence or an accessible name. Copy is short and literal. Skeletons must equal the loaded height (CLS 0.00); explicit `line-height` on every heading.
- **Economy (spec):** XP and stars only, through the existing `lessonComplete` flow (`xp.ts`: 10 per newly earned star). **No coins per answer**, nothing that rewards answering fast over answering right.
- **Every activity works with no input device and no audio permission** (answer buttons), and with a suspended or blocked `AudioContext` shows a plain message instead of hanging.
- Lesson ids are stored forever: add new ids, never rename. `PATH` in `lib/rmhmusic/learn/content/path.ts` is the single source; `available: true` only once the activity ships.
- Cards, questions and drills use **natural notes only** in Phase 2 (no sharps/flats), so no enharmonic naming is needed.
- Random choices take an injected `rand: () => number` so tests are deterministic.

## Review Focus

1. A double tap, key repeat or two notes in one tick must not answer a question twice or complete a lesson twice (machines ignore events outside the state that accepts them). (Tasks 3, 7, 8, 11)
2. Save failure or sign-out at the end of a session keeps the result on screen with Retry or a sign-in link, like the first-note lesson; nothing is lost or double-paid. (Tasks 3, 4)
3. Device clock wrong, going backwards, or a months-long gap: SRS never produces NaN, a negative interval or a due date in the far past/future; a card never seen is "new", not "overdue". (Task 2)
4. Microphone input is monophonic: chord and polyphonic drills accept answer buttons and MIDI/keys, and say plainly that the mic hears one note at a time instead of failing the learner. (Tasks 7, 9)
5. Tap timing with a negative or large calibrated latency, key auto-repeat, and a first tap before the audio clock starts must not score as a perfect or an impossible beat. (Tasks 10, 11)
6. Notes at the staff's edges (C4 and A2 ledger lines, bass vs treble boundaries, the guitar's low E written an octave up) are placed and named correctly. (Tasks 1, 6)

---

## PR D — Reading

### Task 1: Staff placement for both clefs, and scoring

**Files:**
- Create: `lib/rmhmusic/learn/theory/clef.ts`, `lib/rmhmusic/learn/scoring/stars.ts`
- Test: `lib/rmhmusic/learn/theory/clef.test.ts`, `lib/rmhmusic/learn/scoring/stars.test.ts`

**Interfaces:**
- Consumes: `staffStep`, `TOP_LINE_STEP` from `../staff` (treble: step 0 is the bottom line E4, step 8 the top line F5; a step is one line or space).
- Produces: `type Clef = 'treble' | 'bass'`; `clefStep(clef: Clef, midi: number): number` (diatonic steps above that clef's bottom line: treble bottom E4, bass bottom G2; naturals only, sharps land on their natural's step); `ledgerSteps(step: number): number[]` (even steps beyond the staff that need a ledger line: below 0 → `-2,-4,…` down to `step`, above 8 → `10,12,…` up to `step`, empty inside); `noteLetter(midi: number): 'A'|'B'|'C'|'D'|'E'|'F'|'G'`; `starsFor(score: number): 0|1|2|3` (score 0..100: ≥ 95 → 3, ≥ 80 → 2, ≥ 60 → 1, else 0); `scoreFrom(correct: number, total: number): number` (0..100 rounded, 0 when `total` is 0).

- [ ] **Step 1: Write the failing tests.** `clefStep('treble',64)===0` (E4), `clefStep('treble',60)===-2` (C4, first ledger line below), `clefStep('treble',77)===8`; `clefStep('bass',43)===0` (G2), `clefStep('bass',60)===10` (middle C is the first ledger line above the bass staff), `clefStep('bass',40)===-2`; `ledgerSteps(-4)` equals `[-2,-4]`, `ledgerSteps(12)` equals `[10,12]`, `ledgerSteps(3)` equals `[]`, `ledgerSteps(-1)` equals `[]` (a space just below the staff needs no line) and `ledgerSteps(-2)` equals `[-2]`; `noteLetter(61)==='C'` (a sharp keeps its natural's letter); `starsFor(94)===2`, `starsFor(95)===3`, `starsFor(59)===0`; `scoreFrom(7,10)===70`, `scoreFrom(0,0)===0`.
- [ ] **Step 2: Run to verify FAIL:** `pnpm exec vitest run lib/rmhmusic/learn/theory lib/rmhmusic/learn/scoring`.
- [ ] **Step 3: Implement** the signatures above (diatonic index = octave·7 + letter index; `clefStep` = that index minus the clef's bottom-line index).
- [ ] **Step 4: Run to verify PASS, then commit** `feat(rmhmusic): staff placement for treble and bass, and stars from a score`.

### Task 2: Spaced-repetition scheduler (FSRS-lite)

**Files:**
- Create: `lib/rmhmusic/learn/srs/schedule.ts`
- Test: `lib/rmhmusic/learn/srs/schedule.test.ts`

**Interfaces:**
- Produces: `type Grade = 'again'|'hard'|'good'|'easy'`; `interface CardState { due: number; stability: number; difficulty: number; reps: number; lapses: number; last: number | null }` (times are epoch ms, `stability` in days); `newCard(now: number): CardState` (due = now, stability 0, difficulty 5, reps 0, lapses 0, last null); `review(s: CardState, grade: Grade, now: number): CardState`; `isDue(s: CardState, now: number): boolean`; `dueCards<T extends { state: CardState }>(cards: T[], now: number, limit: number): T[]` (due ones, most overdue first, then at most `limit`); constants `MIN_INTERVAL_DAYS = 0.01` (~15 min for `again`), `MAX_INTERVAL_DAYS = 365`, `DAY_MS = 86_400_000`.

- [ ] **Step 1: Failing tests.** A new card is due at `now`; `again` on a new card sets `lapses 0`, `reps 1`, due within `MIN_INTERVAL_DAYS` of now; `good` twice grows the interval each time (second > first); `easy` grows more than `good` from the same state; `again` after reps ≥ 2 increments `lapses` and shrinks stability below its previous value; interval never exceeds `MAX_INTERVAL_DAYS` after 50 `easy` reviews; **a `now` earlier than `last` (clock went backwards) yields a finite `due ≥ now` and finite stability/difficulty** (Review Focus 3); `difficulty` stays in [1,10]; `NaN`/`Infinity` for `now` throws `RangeError`; `dueCards` orders most overdue first and respects `limit`.
- [ ] **Step 2: FAIL, Step 3: implement** (stability multiplies by a grade factor: hard 1.2, good 2.2, easy 3.5, minus a difficulty term; again resets to `MIN_INTERVAL_DAYS` and counts a lapse; elapsed time is `max(0, now - last)`; clamp everything). **Step 4: PASS, commit** `feat(rmhmusic): a spaced-repetition scheduler for note cards`.

### Task 3: Flashcard deck and session machine

**Files:**
- Create: `lib/rmhmusic/learn/content/decks.ts`, `lib/rmhmusic/learn/machines/flashcards.ts`
- Test: `lib/rmhmusic/learn/content/decks.test.ts`, `lib/rmhmusic/learn/machines/flashcards.test.ts`

**Interfaces:**
- Consumes: `Clef`, `clefStep` (Task 1), `starsFor`, `scoreFrom` (Task 1), `CompleteOutcome` from `./learn-data`, the `Machine` shape from `./runner`.
- Produces: `interface Card { id: string; clef: Clef; midi: number }` (id `treble:64`); `interface Deck { id: string; clef: Clef; midis: number[] }`; `DECKS: Record<string, Deck>` with ids `treble-lines` (E4 G4 B4 D5 F5), `treble-spaces` (F4 A4 C5 E5), `treble-all` (C4–A5 naturals), `middle-c` (C4 plus its neighbours B3 D4 and the C5 above), `bass-all` (E2–C4 naturals); `buildSession(deck: Deck, count: number, rand: () => number): Card[]` (no immediate repeat, every card of a small deck seen before any repeats);
  - machine (`flashcardsMachine: { initial(cards: Card[]): State; step }`): `State = { kind:'asking'; cards: Card[]; index: number; correct: number } | { kind:'feedback'; cards; index; correct; right: boolean; answer: Answer } | { kind:'saving'; correct; total; attempt: number } | { kind:'saved'; correct; total; stars: 0|1|2|3 } | { kind:'failed'; correct; total; attempt: number } | { kind:'signed-out'; correct; total }`; `Answer = { kind:'letter'; letter: string } | { kind:'midi'; midi: number }`; `Event = { type:'answer'; answer: Answer } | { type:'next' } | { type:'answered'; attempt: number; outcome: CompleteOutcome } | { type:'retry' }`; `Effect = { type:'complete'; attempt: number; score: number; stars: number }`. A `letter` answer is right when it equals `noteLetter(card.midi)`; a `midi` answer only when it equals `card.midi`. `answer` is accepted only in `asking`; `next` only in `feedback` (past the last card it moves to `saving` and emits `complete` with `scoreFrom` and `starsFor`).

- [ ] **Step 1: Failing tests** (decks): each deck's midis are naturals; `middle-c` contains 60; `buildSession(DECKS['treble-lines'],10,seeded)` has length 10, no two neighbours equal, and the first 5 are all five distinct cards; (machine) a right letter answer moves to `feedback{right:true}` and `correct` becomes 1; **two `answer` events in a row count once** (second ignored); `next` after the last card emits exactly one `complete` effect with `score 70` for 7/10; `answered saved` → `saved{stars:1}`; `answered unauthorized` → `signed-out`; `failed` then `retry` emits a new `complete` with `attempt 2`; a stale `answered` (old attempt) is ignored; a midi answer one octave off is wrong, a letter answer in any octave is right.
- [ ] **Step 2–4:** FAIL, implement (pure, no React), PASS; commit `feat(rmhmusic): flashcard decks and the session machine`.

### Task 4: Flashcard UI and the first three reading lessons

**Files:**
- Create: `components/rmhmusic/learn/StaffCard.tsx`, `components/rmhmusic/learn/FlashcardLesson.tsx`
- Modify: `components/rmhmusic/learn/LessonScreen.tsx` (mode dispatch: `staff-flashcards` → `FlashcardLesson` with the deck from a lesson→deck map), `lib/rmhmusic/learn/content/path.ts` (mark `staff-what-is-a-staff`, `staff-treble-notes`, `staff-find-middle-c` `available: true`; add `deck` to `Lesson` as `deck?: string`), `components/rmhmusic/rmhmusic.css`, `locales/*/c-rmhmusic.json` (via extract)
- Test: `lib/rmhmusic/learn/content/path.test.ts` (extend: every `staff-flashcards` lesson names an existing deck)

**Interfaces:**
- Consumes: `Card`, `flashcardsMachine`, `DECKS`, `buildSession` (Task 3); `clefStep`, `ledgerSteps` (Task 1); `useMachine` and `useLearnStore.completeLesson` as `FirstNoteLesson` uses them; the hub's note events (`useLearnInput`) for answering on an instrument; `Notehead.tsx`.
- Produces: `StaffCard({ card, state }: { card: Card; state: 'ask' | 'right' | 'wrong' })` (a five-line hand-ruled SVG staff with the clef, ledger lines from `ledgerSteps`, one notehead; viewBox fixed so the card is one reserved height); `FlashcardLesson({ lessonId }: { lessonId: string })`.

- [ ] **Step 1: Failing test** for the path/deck link. **Step 2: FAIL.**
- [ ] **Step 3: Implement.** `FlashcardLesson` runs `flashcardsMachine` with ten cards. Answers: seven letter buttons A–G (a 7-column grid, ≥ 44px, `aria-label` the letter) and any instrument note (`midi` answer; with `screen` input the on-screen keyboard from `FirstNoteLesson` is reused below the staff). Feedback is a sentence ("That was E.", never a badge) and a Next button; a right answer says nothing extra. The staff, the answer row and the feedback line sit in fixed-height boxes so nothing shifts between ask → feedback → saved; the result screen reuses the first-note lesson's saved/failed/sign-in blocks. Stars show as noteheads, state in `sr-only` text. The skeleton equals the loaded height at 320px and 200% text.
- [ ] **Step 4: Verify** `pnpm exec vitest run lib/rmhmusic components/rmhmusic`, then a browser pass (Chromium at 390×844 and 1280×800, light and dark): ask → right → wrong → finish → saved, and the layout-shift observer reads 0 across the whole run; screenshot and look at them.
- [ ] **Step 5: Commit** `feat(rmhmusic): staff flashcards, with the first three reading lessons live`.

### Task 5: Remembered cards and a Practice route

**Files:**
- Modify: `prisma/schema.prisma`, create `prisma/migrations/20261109150000_music_learn_card/migration.sql`
- Create: `lib/rmhmusic/learn/cards.server.ts`, `app/routes/api/rmhmusic/learn/cards.ts`, `app/routes/rmhmusic/practice.tsx`, `components/rmhmusic/learn/PracticeLesson.tsx`
- Modify: `lib/rmhmusic/learn/schemas.ts`, `lib/rmhmusic/learn/store.ts` (+ `machines/learn-data.ts` if the store's data machine owns fetches), `components/rmhmusic/learn/LearnHome.tsx` (a text link "Practice" only when at least one card is due, in the reserved header slot so nothing moves)
- Test: `lib/rmhmusic/learn/cards.server.test.ts`, `lib/rmhmusic/learn/schemas.test.ts` (extend)

**Interfaces:**
- Consumes: `CardState`, `review`, `dueCards`, `newCard` (Task 2), `Card`, `buildSession` (Task 3).
- Produces: model `MusicLearnCard { id, userId, cardId (≤ 64), due DateTime, stability Float, difficulty Float, reps Int, lapses Int, lastReviewAt DateTime?, updatedAt }` mapped `music_learn_card`, unique `(userId, cardId)`, FK to `user` with `ON DELETE CASCADE` (additive migration; follow `20261108170000_music_learn`); `reviewBatchSchema = z.object({ reviews: z.array(z.object({ cardId: z.string().min(1).max(64), grade: z.enum(['again','hard','good','easy']) })).min(1).max(50) })`; `GET /api/rmhmusic/learn/cards` → `{ cards: { cardId: string; due: string; stability: number; difficulty: number; reps: number; lapses: number; lastReviewAt: string | null }[] }` (the learner's cards, at most 200; **the full `CardState` fields, so the client can rebuild a `CardState` exactly: `isDue`/`dueCards` treat `last === null` with `reps > 0` as due now**); `POST /api/rmhmusic/learn/cards` applies `review()` server-side using the **server clock** (never a client time) in one transaction, `rateLimit: 'write'`, only card ids that parse as a known deck card, and returns the updated rows; `loadCards(userId)` / `applyReviews(userId, reviews, now)` in `cards.server.ts`.

- [ ] **Step 1: Failing tests** for `applyReviews` with the prisma client mocked the way `progress.server` tests do (look at `lib/rmhmusic/learn/progress.server.test.ts` or the nearest sibling): unknown card ids are rejected, the same card twice in one batch applies in order, the server clock (not a client value) is used, a first review creates the row via `newCard`. Schema tests: 0 and 51 reviews rejected, a bad grade rejected.
- [ ] **Step 2–4:** FAIL, implement, PASS. `PracticeLesson` builds its session from `dueCards` (limit 10, topped up from the unlocked decks with new cards when fewer are due) and posts each answer's grade (`good` for right, `again` for wrong; no timers) when the session ends; it uses `flashcardsMachine` and the Task 4 UI unchanged. Practice completes no lesson and awards no XP (nothing to farm). Run `pnpm exec prisma validate`, `pnpm exec prisma format --check`, and `node scripts/check-migrations-additive.mjs` if the repo has it (look in `scripts/`); then the focused tests.
- [ ] **Step 5: Commit** `feat(rmhmusic): remembered cards and a Practice route`. Then ship PR D (open PR, CI green, squash-merge).

---

## PR E — Instrument and ear

### Task 6: Fretboard and keyboard trainer

**Files:**
- Create: `lib/rmhmusic/learn/theory/fretboard.ts`, `lib/rmhmusic/learn/machines/find-note.ts`, `components/rmhmusic/learn/FretboardView.tsx`, `components/rmhmusic/learn/FindNoteLesson.tsx`
- Modify: `LessonScreen.tsx` (mode `keyboard-map` and `fretboard`), `path.ts` (`keys-layout-and-strings` available; add lesson `fretboard-first-frets` mode `fretboard`)
- Test: `lib/rmhmusic/learn/theory/fretboard.test.ts`, `lib/rmhmusic/learn/machines/find-note.test.ts`

**Interfaces:**
- Produces: `STANDARD_TUNING: readonly number[]` (open strings low→high `[40,45,50,55,59,64]`, E2 A2 D3 G3 B3 E4); `fretMidi(string: number, fret: number): number`; `positionsOf(midi: number, maxFret: number): { string: number; fret: number }[]`; `writtenMidi(sounding: number): number` (guitar is written an octave above it sounds: open low E sounds 40, is written 52 — **display uses written pitch**, input matching uses sounding pitch); `findNoteMachine` (same shape as the flashcards machine: ten targets, `answer: { string; fret }` or `{ midi }`, right when the position's `fretMidi` equals the target), reusing `scoreFrom`/`starsFor`.
- Consumes: Task 1 scoring, `CompleteOutcome`, `useMachine`.

- [ ] **Step 1: Failing tests:** `fretMidi(0,0)===40`, `fretMidi(1,5)===50`, `fretMidi(5,12)===76`; `positionsOf(64,12)` contains `{string:5,fret:0}`, `{string:4,fret:5}`, `{string:3,fret:9}`; `writtenMidi(40)===52`; machine: same double-answer, retry and stale-answer guarantees as Task 3; a position answer and a midi answer that sound the same pitch are both right.
- [ ] **Step 2–4:** FAIL, implement, PASS. The view: a horizontal fretboard (6 strings × 5 frets, tappable cells ≥ 44px, horizontally scrollable only if it must at 320px, the open strings labelled with the sounding names) for guitar, and for piano the existing `OnScreenKeyboard` with the target's letter shown; the lesson follows `profile.instrument`. Browser pass as Task 4. **Commit** `feat(rmhmusic): a fretboard and keyboard note finder`.

### Task 7: Pitch match

**Files:**
- Create: `lib/rmhmusic/learn/scoring/pitch.ts`, `lib/rmhmusic/learn/machines/match-note.ts`, `components/rmhmusic/learn/MatchNoteLesson.tsx`
- Modify: `LessonScreen.tsx`, `path.ts` (new unit `play-it-back` with lessons `match-c`, `match-white-keys`, mode `play-note`… add `'match-note'` to `LessonMode`), `schemas.ts` only if a field is needed (it should not be)
- Test: `lib/rmhmusic/learn/scoring/pitch.test.ts`, `lib/rmhmusic/learn/machines/match-note.test.ts`

**Interfaces:**
- Produces: `pitchPoints(targetMidi: number, played: { midi: number; cents?: number }): number` (0..100: exact pitch and within 10 cents → 100, falling linearly to 0 at a semitone away; **a different octave scores 0**; the mic's `cents` refines, other sources count as 0 cents); `matchNoteMachine` (a target is played by `playNote` as a hint on request; the learner has three tries per target; best of the tries is that target's points; ten targets; score is the mean).
- Consumes: Task 1 `starsFor`; `playNote` from `audio/voice`; hub note events.

- [ ] **Step 1: Failing tests:** `pitchPoints(60,{midi:60,cents:3})===100`, `pitchPoints(60,{midi:61})===0`, `pitchPoints(60,{midi:60,cents:-50})` between 0 and 100 and monotone in `|cents|`, `pitchPoints(60,{midi:72})===0`; machine: the fourth try is ignored, the best try counts, a note-off is ignored, double events in one tick count once, mean score rounds as `scoreFrom` would.
- [ ] **Step 2–4:** FAIL, implement, PASS. UI: the target on the staff, a "Hear it" text button, the live result as a sentence ("Close: a little flat."), no meters or badges. With the mic as input, a short note about quiet rooms lives in `InputDetails` already: do not add copy here. Browser pass. **Commit** `feat(rmhmusic): match the note you see`.

### Task 8: Interval ear training

**Files:**
- Create: `lib/rmhmusic/learn/theory/intervals.ts`, `lib/rmhmusic/learn/machines/ear.ts`, `components/rmhmusic/learn/EarLesson.tsx`
- Modify: `LessonScreen.tsx` (new mode `'ear-interval'`), `path.ts` (new unit `train-your-ear`, lessons `ear-second-third`, `ear-fifth-octave`), `audio/voice.ts` only if a sequenced play helper is needed (prefer a small `audio/sequence.ts: playSequence(midis: number[], gapMs: number): { cancel(): void }` built on `playNote` and timers)
- Test: `lib/rmhmusic/learn/theory/intervals.test.ts`, `lib/rmhmusic/learn/machines/ear.test.ts`

**Interfaces:**
- Produces: `INTERVALS: Record<'unison'|'second'|'third'|'fourth'|'fifth'|'sixth'|'seventh'|'octave', { semitones: number[]; label: string }>` (major and minor sizes as arrays, e.g. third `[3,4]`); `intervalOf(a: number, b: number): keyof typeof INTERVALS | null`; `makeQuestion(pool: IntervalName[], rand: () => number, root?: number): { notes: [number, number]; answer: IntervalName }` (root in C3–C5, both orders ascending only in Phase 2); `earMachine`: `asking → feedback → … → saving/saved/failed/signed-out` exactly like Task 3 but `answer: { name: IntervalName }`, with `replay` (any number, no penalty) as an event that emits `{ type: 'play'; notes }`.
- Consumes: Task 1 scoring; `playSequence`; `CompleteOutcome`.

- [ ] **Step 1: Failing tests:** `intervalOf(60,67)==='fifth'`, `intervalOf(60,64)==='third'`, `intervalOf(60,61)` is `null` in Phase 2 (a minor second is not in the table; the pool never offers it); `makeQuestion` is deterministic for a seeded `rand` and never leaves the C2–C6 range; machine: replay never changes the score or state, a wrong answer shows the right answer, double answer counts once, the result save path matches Task 3.
- [ ] **Step 2–4:** FAIL, implement, PASS. UI: a "Hear it again" text button, answer buttons labelled with interval names (plain words), no input device needed. **A suspended or blocked audio context shows "Sound isn't playing. Tap to turn it on."** and the first tap resumes it (use `resumeAudio`); the machine never advances on a question the learner could not hear. Browser pass. **Commit** `feat(rmhmusic): interval ear training`.

### Task 9: Chord ear training and a chord to play

**Files:**
- Create: `lib/rmhmusic/learn/theory/chords.ts`, `components/rmhmusic/learn/PlayChordLesson.tsx`
- Modify: `ear.ts` (generalise `makeQuestion` to a `kind` of `'interval' | 'chord'`: **extend, do not duplicate**), `EarLesson.tsx`, `LessonScreen.tsx`, `path.ts` (lessons `ear-major-minor`, `chord-play-c-major`)
- Test: `lib/rmhmusic/learn/theory/chords.test.ts`, extend `ear.test.ts`

**Interfaces:**
- Produces: `CHORDS: Record<'major'|'minor'|'diminished'|'augmented', number[]>` (semitone stacks `[0,4,7]`, `[0,3,7]`, `[0,3,6]`, `[0,4,8]`); `chordNotes(root: number, quality): number[]`; `chordQuality(midis: number[]): quality | null` (order and octave independent); `matchesChord(played: number[], root: number, quality): boolean` (pitch classes only); the play-a-chord lesson collects `NoteEvent`s `on` within a 600 ms window, with input `midi`, `keys` or `screen` only.
- Consumes: Task 8's machine and `playSequence` (a chord plays all notes together via `playNote`).

- [ ] **Step 1: Failing tests:** `chordQuality([60,64,67])==='major'`, `chordQuality([67,72,76])==='major'` (inversion), `chordQuality([60,63,67])==='minor'`, `chordQuality([60,62,67])===null`; `matchesChord([64,67,72],60,'major')===true`; extended `ear.test.ts` covers chord questions.
- [ ] **Step 2–4:** FAIL, implement, PASS. **When the learner's input is the microphone the play-a-chord lesson says (one plain sentence) that the microphone hears one note at a time and offers to switch input (the existing `InputSetup` dialog); it never marks a mic player wrong for a chord** (Review Focus 4). **Commit** `feat(rmhmusic): chord ear training and playing a chord`. Then ship PR E.

---

## PR F — Rhythm

### Task 10: A metronome

**Files:**
- Create: `lib/rmhmusic/learn/audio/metronome.ts`
- Test: `lib/rmhmusic/learn/audio/metronome.test.ts`

**Interfaces:**
- Produces: `createMetronome(ctx: ClickContext, opts: { bpm: number; beatsPerBar: number; onBeat?(beat: number, bar: number, at: number): void }): { start(leadS?: number): void; stop(): void; readonly running: boolean; beatTimes(): number[] }` where `ClickContext` is the same pick `clicks.ts` uses (export that type from `clicks.ts`); clicks are scheduled ahead on `ctx.currentTime` by a timer (look-ahead 100 ms, timer 25 ms), the downbeat is higher-pitched and louder, `bpm` is clamped to 30–240, `beatTimes()` returns the performance-clock ms of every scheduled click (the same one-offset conversion `clicks.ts` documents) so tap scoring can compare; `stop()` silences scheduled clicks and clears the timer and is idempotent.
- Consumes: `scheduleClicks`'s clock conversion (factor it into a shared helper in `clicks.ts` rather than copying it).

- [ ] **Step 1: Failing tests** with a fake context and fake timers (follow `clicks.test.ts`): 4/4 at 120 bpm schedules clicks 0.5 s apart; the first of each bar is the accent; `stop()` twice is safe and no further clicks appear; `bpm: 1000` clamps to 240; a timer that fires late schedules the clicks it missed in order, never in the past.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Commit** `feat(rmhmusic): a metronome on the audio clock`.

### Task 11: Rhythm lessons

**Files:**
- Create: `lib/rmhmusic/learn/scoring/timing.ts`, `lib/rmhmusic/learn/machines/tap-beat.ts`, `components/rmhmusic/learn/NoteValues.tsx`, `components/rmhmusic/learn/TapBeatLesson.tsx`, `components/rmhmusic/learn/RhythmLesson.tsx`
- Modify: `LessonScreen.tsx` (mode `rhythm-basics`), `path.ts` (the three `rhythm-*` lessons available), `rmhmusic.css`
- Test: `lib/rmhmusic/learn/scoring/timing.test.ts`, `lib/rmhmusic/learn/machines/tap-beat.test.ts`

**Interfaces:**
- Produces: `tapScore(beatTimes: number[], taps: number[], latencyMs: number): { score: number; hits: number; early: number; late: number }` (each tap is matched to the nearest unused beat after subtracting the calibrated `latencyMs`; a tap within 70 ms scores 100, linearly to 0 at 200 ms; taps closer than 60 ms to the previous tap are ignored as key repeat/bounce; unmatched beats score 0; score is the mean over beats, rounded); `tapBeatMachine` (`counting-in` → `tapping` of 16 beats → `saving` …, taps only count in `tapping`); `NoteValues` draws whole, half, quarter, eighth notes in the hand-copied style with their counts, in a fixed-height row; `RhythmLesson` picks the activity by lesson id: `rhythm-note-values` (read and tap the correct count for a shown value: a four-question quiz on the answer-button pattern), `rhythm-44-vs-34` (the metronome plays a bar pattern; the learner answers 3 or 4 for five questions, with replay), `rhythm-tap-the-beat` (`tapBeatMachine` with the metronome at 80 bpm).
- Consumes: `createMetronome` (Task 10), Task 1 `starsFor`, the profile's `latencyMs` from the store, hub `on` events, a large tap pad (space/enter and pointer) for `screen`/`keys` input.

- [ ] **Step 1: Failing tests:** `tapScore([0,500,1000,1500],[0,500,1000,1500],0).score===100`; the same taps shifted +60 ms with `latencyMs 60` still 100; a tap 250 ms off scores 0 for that beat; two taps 20 ms apart count as one (key repeat); taps before the first beat minus 200 ms are ignored; `latencyMs: -300` and `+300` never produce a score above 100 or below 0 or NaN; machine: taps in `counting-in` are ignored, and the lesson completes exactly once.
- [ ] **Step 2–4:** FAIL, implement, PASS. Beat visual: the beat marker moves by CSS transition between discrete positions on each `onBeat`, not a keyframe loop and not rAF; `jellyMotion` still stops it. Browser pass at both widths and both modes with the layout-shift observer. **Commit** `feat(rmhmusic): note values, 4/4 versus 3/4, and tapping the beat`.

### Task 12: Close-out

**Files:**
- Modify: `lib/rmhmusic/learn/content/path.ts` (final unit order and `available` flags; every shipped `mode` handled in `LessonScreen`), `lib/catalog/apps/rmhmusic.ts` (description reflects what is live), `docs/` pages that describe the programme (`docs/site-reference` via `pnpm docs:site`; hand-written pages that name lessons), `data/site-knowledge.json` via `pnpm exec tsx scripts/build-site-knowledge.ts`
- Test: `lib/rmhmusic/learn/content/path.test.ts` (extend)

- [ ] **Step 1: Failing tests:** every `available` lesson's `mode` is routed by `LessonScreen` (export the set of handled modes from one module the test and the screen share); every lesson id is unique and ≤ 64 characters; every `deck` exists; no lesson is `available` without a handler.
- [ ] **Step 2–5:** FAIL, implement, PASS; run the generators and the checks (`pnpm docs:site:check`, `pnpm docs:api:check`, `pnpm sdk:check`, `pnpm images:variants:check`); final whole-branch review; ship PR F.

## Self-review notes

Spec §Phase 2 coverage: note-reading flashcards with SRS (1–5), fretboard trainer (6), pitch match (7), intervals then chords (8–9), time-signature and rhythm (10–11), metronome (10), first path units populated (4, 6–9, 11, 12). Deliberately out of Phase 2: sharps/flats in cards (naturals only), descending intervals, rhythm *reading* beyond four note values, FSRS fitted weights (the lite scheduler is enough), a tuner (Phase 3), VexFlow (not needed; the app's SVG notation is used).
