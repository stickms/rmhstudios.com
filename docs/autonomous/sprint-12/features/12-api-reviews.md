# 12 — Review flashcards through the developer API

Surface: `/api/v1/me/decks/{id}/review` (the cards due, with their text) and
`/api/v1/me/decks/{id}/cards/{cardId}/review` (grade one), their documentation, the SDK. Wave 2. No interface namespace
(the API speaks English JSON). Developer API.

## User story

As a developer who studies with RMHStudy, I want to fetch the cards due in one of my decks and send my grades back from
my own tool — a terminal flashcard app, a watch, a script that quizzes me on my commute — so that my reviews count on
the site's schedule exactly as reviews in the browser do.

## Requirements elicitation

- **What exists (verified):**
  - Flashcards in the API (sprint 06 13, sprint 09 10): `read:study` and `write:study` scopes (`lib/api/scopes.ts`);
    decks and cards CRUD (`/api/v1/me/decks`, `/{id}`, `/{id}/cards`, `/{id}/cards/{cardId}`,
    `/{id}/cards/by-external-id/{externalId}`) and the due counts (`/api/v1/me/decks/{id}/due`,
    `app/routes/api/v1/me/decks/$id/due.ts`, `dueFor` in `lib/api/v1/study.server.ts`: counts only, "No card content").
    Routes use `withDeveloperApi` (`lib/api/with-developer-api.server.ts`: scope, rate limit, the v1 error envelope,
    `idempotent` replay of an `Idempotency-Key`).
  - **No endpoint reviews a card.** The site grades through `POST /api/study/cards/$id/review`
    (`lib/study/api/study.cards.$id.review.server.ts`): it checks `isReviewable` and `canReadDeck`, computes `nextState`
    (`lib/rmhstudy/srs.ts`, `Grade = 0 | 1 | 2 | 3`), saves through `saveReview` (`lib/study/review-log.server.ts`,
    leeches), and records the daily quest (`recordStudyReview`). The site's queue is `reviewQueue`
    (`lib/study/queue.server.ts`), which applies the deck's pace (sprint 10 03), suspensions, leeches and card sounds'
    reader rule (`CARD_SOUND_READ_PATHS`).
- **Decisions:**
  - **One grading path:** the site route's body becomes `reviewCard(userId, cardId, grade)` in a new
    `lib/study/review.server.ts`; the site route and the API both call it, so a review from the API is the same review
    (log, leech, quest, schedule).
  - **The queue:** `GET /api/v1/me/decks/{id}/review?limit=` (1–50, default 20) returns the cards `reviewQueue` would
    show now, in its order: id, kind, front and back text, cloze text and index, picture URLs and their descriptions,
    the external id, and the schedule (due, interval, new or review). **Never card sounds** (they are the recorder's on
    the site; the API is not a listed reader in `CARD_SOUND_READ_PATHS`). Every other card kind is returned in the
    shape `listMyCards` already gives it (read that function first and reuse its mapper). Scope `read:study`.
  - **Grading:** `POST /api/v1/me/decks/{id}/cards/{cardId}/review` with `{ grade: 'again' | 'hard' | 'good' | 'easy' }`
    (names, not the site's numbers), scope `write:study`, `idempotent: true` so a retry with the same
    `Idempotency-Key` never grades twice; answers the new due date, interval and whether the card became a leech. A card
    not in that deck, not reviewable or unreadable is `not_found`; a suspended card is `conflict`.
  - **Limits:** the v1 write rate limit; reviews also count toward the site's own `card-review` limit (120 a minute),
    so the API cannot grade faster than the browser.
  - **Docs:** both endpoints in the registry with examples; a changelog bullet; the SDK regenerated.

## Functional requirements

1. FR-1 `lib/study/review.server.ts`: `reviewCard` (the site route's checks and writes, unchanged in behaviour) and the
   site route calling it; the route's existing tests stay green.
2. FR-2 `lib/api/v1/study.server.ts`: `reviewQueueFor(userId, deckId, limit)` (built on `reviewQueue`, mapped to the API
   card shape without sound fields), `gradeFor(userId, deckId, cardId, grade)`; schemas in `lib/api/v1/study-schema.ts`.
3. FR-3 Route files `app/routes/api/v1/me/decks/$id/review.ts` (GET) and
   `app/routes/api/v1/me/decks/$id/cards/$cardId/review.ts` (POST, `idempotent: true`).
4. FR-4 `lib/api/registry.ts` entries under the Wave 0 anchor (paths, params, examples, errors), `NULLABLE` names in
   `scripts/generate-sdk.ts` under the anchor (checked against existing SDK fields), the changelog bullet under
   `<!-- s12-12 api-reviews -->` in `docs/developer-api/changelog.md`; `pnpm sdk:generate`, `pnpm docs:api`.
5. FR-5 `DECK_ACCESS_PATHS` entries for the new server code under the Wave 0 anchor; `CARD_SOUND_READ_PATHS` unchanged
   (the test that the API never selects the sound columns is FR-6's).

## Non-functional requirements

- **Integrity:** one grade per idempotency key; the same schedule maths as the site (a test grades the same card through
  both paths and compares).
- **Privacy:** an editor's or cloner's queue is their own schedule; another member's deck they cannot read is
  `not_found`; no sound URL in any response.
- **Compatibility:** additive only; no documented field changes.

## Data model and API

No schema change. `GET /api/v1/me/decks/{id}/review` → `{ data: ApiReviewCard[] }`;
`POST /api/v1/me/decks/{id}/cards/{cardId}/review` → `{ data: { dueAt, intervalDays, leech } }`.

## Testing requirements

- Main suite `lib/api/v1/__tests__/study-review.test.ts`: scopes (`read:study` cannot grade); a card of another deck in
  the path is `not_found`; a suspended card is `conflict`; idempotent replay; no sound field in the queue; the queue
  respects the deck's pace.
- Main suite `lib/study/__tests__/review-card.test.ts`: the extracted `reviewCard` gives the site route's results (the
  same grade on the same state yields the same schedule and log row).
- Gates: the API registry and docs tests, SDK generation (`git diff` shows no existing field changed type),
  `DECK_ACCESS_PATHS`, `CARD_SOUND_READ_PATHS`, `DUE_COUNT_READ_PATHS` if the queue's count is reused, the
  `api-handler-adoption` test.

## Acceptance criteria

- [ ] A key with `read:study` and `write:study` fetches five due cards and grades them; the site's review page then
      shows them scheduled as if graded in the browser.
- [ ] Retrying a grade with the same `Idempotency-Key` does not grade twice.
- [ ] No response carries a card sound.

## Out of scope

Practice tests through the API, creating reviews for other members, webhooks on reviews.
