# 07 — RMHType touch-typing lessons

Surface: RMHType (`/rmhtype`, full-screen app tier, sign-in gated). Wave 1.
Namespace `rmhtype-lessons`.

## User story

As someone who types with two fingers, I want a step-by-step course that teaches
me the home row first and then one new group of keys at a time, shows me which
finger to use for the next key, and tells me when I am ready for the next
lesson, so that I can actually learn to touch-type instead of only racing.

## Requirements elicitation

- **What exists (verified):** RMHType offers races, solo tests from curated,
  code and lore passages (`lib/rmhtype/sources.ts`), custom tests and a
  "practice your worst keys" generator (`lib/rmhtype/custom-test.ts`), and a
  per-key heatmap (`components/rmhtype/TypingStats.tsx`, `RmhTypeKeyStat`).
  There is **no curriculum**: nothing teaches key positions or fingering; every
  mode assumes the learner can already type.
- **Decisions:** QWERTY only for this feature (`RmhTypeKeyStat.layout` exists
  but every source is QWERTY); English letters and ASCII punctuation, like the
  rest of RMHType. Every lesson is open — nothing is locked — and the next
  recommended lesson is marked, because locking content behind a speed target
  shuts out the learners who need it most. Lesson runs do not count for any
  leaderboard (`isLeaderboardEligible` stays the authority) but do feed the
  per-key statistics, which closes the loop with "practice your worst keys".

## Functional requirements

1. FR-1 A course of 6 units and about 24 lessons: home row (f j, d k, s l, a ;,
   g h), top row, bottom row, capitals with Shift, numbers, punctuation, with a
   review lesson ending each unit. Each lesson declares its new keys, the keys
   allowed, a drill generator and star targets (accuracy and speed).
2. FR-2 Drills are generated, seeded and deterministic: letter groups first,
   then real English words built only from the allowed keys (filtered from the
   built-in word pool in `custom-test.ts`), then short phrases.
3. FR-3 A lesson run shows the text, the current character, an on-screen
   keyboard with the next key and its finger named in words ("left index") and
   indicated on the key, live accuracy, and a result screen with speed,
   accuracy, stars (0 to 3) and the keys missed most.
4. FR-4 Backspace is allowed and counted; the lesson ends when the text is done
   or on Escape (no result saved).
5. FR-5 The lessons index lists units and lessons with best stars and best
   speed, marks the recommended next lesson, and links to the worst-keys
   practice once a unit is complete.
6. FR-6 Progress is stored per member and lesson (best speed, best accuracy,
   best stars, attempts, first completion date).
7. FR-7 Each run's per-key timings are sent through the existing key-stats
   contract (`lib/rmhtype/keystats.contract.ts`).

## Non-functional requirements

- **Security:** the progress endpoint bounds what it accepts (speed 0 to 250
  wpm, accuracy 0 to 100, lesson id in the curriculum, stars recomputed on the
  server from speed and accuracy, never trusted); `rateLimit: 'write'`.
- **Performance:** input handling does no layout reads per keystroke; the
  keyboard highlights by toggling one attribute; no rAF loop, no timer at rest
  (the elapsed time is computed from timestamps).
- **Accessibility:** the text is a single live region updated per word, not per
  character; finger guidance is text as well as the highlight; works with the
  physical keyboard only; the on-screen keyboard is `aria-hidden` decoration
  with the guidance duplicated in text.
- **i18n:** UI strings in `rmhtype-lessons`; drill text is English by design (as
  every RMHType source), and the text block is `dir="ltr"` and `lang="en"`.
- **Design:** app tier — RMHType shell and `--app-*` (L8); no idle motion (R5);
  key highlight changes instantly or within 90 ms.

## Data model and API

- New model `RmhTypeLessonProgress` in `prisma/schema/rmhtype.prisma`: `userId`,
  `lessonId String @db.VarChar(32)`, `bestWpm Float`, `bestAccuracy Float`,
  `stars Int`, `attempts Int @default(0)`, `completedAt DateTime?`,
  `updatedAt DateTime @updatedAt`; `@@id([userId, lessonId])`; cascades on user;
  `@@map("rmhtype_lesson_progress")`.
- Migration `20261122010100_s02_rmhtype_lessons`.
- Pure `lib/rmhtype/lessons.ts` (curriculum data, `FINGER_OF`,
  `drillFor(lesson, seed)`, `starsFor(wpm, accuracy, lesson)`), and
  `lib/rmhtype/typing-run.ts` (keystroke accounting: wpm, accuracy, per-key
  timings).
- Contract `lib/rmhtype/lessons.contract.ts`; endpoints
  `GET /api/rmhtype/lessons/progress`, `POST /api/rmhtype/lessons/progress`.
- Routes `app/routes/rmhtype/lessons.index.tsx` and
  `app/routes/rmhtype/lessons.$lessonId.tsx`; both `EXCLUDED_ROUTES`
  `'auth-gated'` (the layout gates on sign-in).

## Testing requirements

- Product suite `lib/rmhtype/__tests__/lessons.product.test.ts`: every lesson's
  drill uses only its allowed keys; drills are deterministic per seed; every key
  on the keyboard is introduced by exactly one lesson; star thresholds are
  monotonic; finger map covers every allowed key.
- Product suite `lib/rmhtype/__tests__/typing-run.product.test.ts`: wpm and
  accuracy with corrections and backspaces.
- Main suite `lib/rmhtype/__tests__/lesson-progress.test.ts`: server recomputes
  stars; out-of-range speed is rejected; best values never decrease.

## Acceptance criteria

- [ ] A new member opening Lessons sees lesson 1 recommended.
- [ ] Lesson 1's drill contains only f, j and spaces.
- [ ] Finishing a lesson at the target shows three stars and marks the next
      lesson recommended; reloading keeps the stars.
- [ ] The finger for the next key is named in text.
- [ ] Per-key statistics update after a lesson.

## Out of scope

Other layouts (AZERTY, Dvorak, Colemak), non-English drills, typing games inside
lessons, certificates.
