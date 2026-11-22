# 04 — Flashcard practice tests

Surface: `/study`. Wave 3. Namespace `study-tests`. Builds on the deck page as
03 and 05 left it (both merged in earlier waves).

## User story

As a student with an exam on Friday, I want to turn my deck into a practice test
— multiple choice, typed answers, true or false and matching — get a score and
see exactly which cards I missed, so that I can check whether I actually know
the material rather than just recognising cards I have flipped.

## Requirements elicitation

- **What exists (verified):** flip-card review with SM-2 grading
  (`components/feed/DeckStudyColumn.tsx`, `lib/rmhstudy/srs.ts`,
  `lib/study/api/study.cards.$id.review.server.ts`). There is no test, quiz or
  self-check mode anywhere under `/study` (no `quiz`, `test mode` or
  multiple-choice code in `lib/study` or `components/feed/*Deck*`).
- **Who:** the same students as the deck owners, and anyone studying a public
  deck.
- **Decisions:** a test does not change SM-2 scheduling (mixing recognition
  formats into recall intervals makes the schedule wrong); its result is stored
  separately. Generation is deterministic from a seed so a "retake the same
  test" button reproduces it. Typed answers forgive case, surrounding
  whitespace, punctuation and diacritics; a one-edit slip on answers of six or
  more characters is marked "almost" and the student can accept it.

## Functional requirements

1. FR-1 A setup panel: number of questions (5 to 50, capped at the deck size),
   question kinds (multiple choice, written, true/false, matching; at least
   one), direction (answer with the back, with the front, or mixed).
2. FR-2 Multiple choice: four options, three distractors drawn from other cards'
   answers, preferring similar length; needs at least four cards; otherwise that
   kind is unavailable with a reason.
3. FR-3 Written: a text field; graded with the normalisation above; shows the
   expected answer after submission.
4. FR-4 True/false: shows a pair that is correct half the time.
5. FR-5 Matching: up to six pairs per question, matched by selecting a term then
   a definition (keyboard: arrow keys and Enter), counted as one point per
   correct pair.
6. FR-6 One question per screen with a progress line ("Question 3 of 20");
   answers lock after Check; Next moves on; the student can end early.
7. FR-7 Results: score and percentage, time taken, every question with the
   student's answer and the correct one, and actions: retake the same test (same
   seed), new test, "test me on the missed cards".
8. FR-8 Signed-in students' results are saved; the deck page shows their last
   five scores. Signed-out visitors can take a test of a public deck; the result
   is not saved and the page says so.

## Non-functional requirements

- **Security:** the server stores only what it can bound: `total` must equal the
  number of questions, `correct` is 0 to `total`, `missedCardIds` must all
  belong to the deck, `durationMs` is clamped. Tests of a private deck are
  owner-only (404 otherwise). `rateLimit: 'write'`.
- **Performance:** generation is pure and synchronous; 50 questions from a
  2,000-card deck in under 20 ms.
- **Accessibility:** each question is a `fieldset` with a `legend`; options are
  radio buttons; feedback is announced (`aria-live="polite"`) in words, not only
  colour; matching is fully keyboard operable.
- **i18n:** strings in `study-tests`; normalisation uses `String.normalize`
  (NFKD) and `Intl.Collator` for the current locale, so it works for non-Latin
  scripts; card text keeps `dir="auto"`.
- **Steel:** one question per view, Check (then Next) is the one ink primary;
  correct and wrong states use `--site-success` / `--site-danger` text and an
  icon, never a filled glow; results are rows on rules.

## Data model and API

- New model `FlashcardTestResult` in `prisma/schema/rmhstudy.prisma`:
  `id BigInt @id @default(autoincrement())` (append-only, R0-T7), `userId`,
  `deckId`, `total Int`, `correct Int`, `kinds String[]`, `durationMs Int`,
  `missedCardIds String[]`, `seed Int`, `createdAt`; relations cascade on user
  and deck; `@@index([userId, deckId, createdAt(sort: Desc)])`;
  `@@map("flashcard_test_result")`.
- Migration `20261122030000_s02_flashcard_tests`.
- Pure `lib/study/practice-test.ts` (`buildTest(cards, options, seed)`,
  `gradeWritten(expected, given, locale)`, `scoreTest`), using `mulberry32` from
  `lib/core/rng.ts`.
- Endpoints (contract in `lib/study/tests.contract.ts`):
  `GET /api/study/decks/$id/tests` (the viewer's last 20) and
  `POST /api/study/decks/$id/tests` (record one).
- Route `/study/$deckId/practice` (`app/routes/_site/study/$deckId_.practice.tsx`),
  `EXCLUDED_ROUTES` `'personal'` (`noindex`).
- An `exportStudyTestData(userId)` function for the account export (wired by
  integration, see `plan.md`).

## Testing requirements

- Product suite `lib/study/__tests__/practice-test.product.test.ts`: same seed
  gives the same test; distractors never equal the answer and never repeat; MC
  is unavailable under four cards; written grading accepts case, punctuation and
  diacritic differences and flags one-edit slips as "almost" only at six or more
  characters; matching scores per pair.
- Main suite `lib/study/__tests__/tests-endpoint.test.ts`: private deck of
  someone else is 404; `correct > total` and foreign `missedCardIds` are
  rejected.

## Acceptance criteria

- [ ] A 20-question mixed test on a 30-card deck runs start to finish with the
      keyboard only.
- [ ] "café" typed as "cafe" is correct; "recieve" for "receive" is "almost".
- [ ] Retake gives the identical questions in the identical order.
- [ ] "Test me on the missed cards" builds a test from exactly those cards.
- [ ] The deck page lists the last five scores for a signed-in student.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Timed exam mode, printing tests, sharing a test with a class, feeding test
results into SM-2.
