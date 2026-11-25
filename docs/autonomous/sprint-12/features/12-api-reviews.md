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
    reader rule (`CARD_SOUND_READ_PATHS`). `reviewQueue(userId, after, now, folderId?, tz?)` has **no deck filter**: it
    is the cross-deck "Review all" session over `readableDeck(userId)` (or one folder).
  - **Reviews were kept out of the API on purpose.** Sprint 06 13 decided "Reviews are **not** writable through the
    API: … a script grading cards would corrupt the member's own statistics", and the shipped catalogue says so:
    `lib/api/scopes.ts` comments "reviews are never writable through the API" and `write:study`'s description ends
    "Reviews cannot be written." Every existing `write:study` key was issued under that promise.
  - Grading also progresses the daily `study` quest and awards XP (`recordStudyReview` in
    `lib/quests/engine.server.ts`: `progressQuests(userId, 'study')`, 4 XP at most every 20 s); quests pay coins.
- **Decisions:**
  - **A new, explicit scope.** Grading needs `write:study-reviews` ("Grade your flashcard reviews from your own tools;
    they count on your schedule and statistics"), group Study, `explicit: true` (s10-13's rule: `*` and `write:*` do not
    grant it, so no existing key gains the power). `write:study` and its description are unchanged and stay true; the
    `scopes.ts` comment becomes "reviews are writable only with the explicit `write:study-reviews`". This supersedes
    sprint 06 13's decision for members who opt in: the risk it named was the member's own statistics, and the member
    now chooses it per key.
  - **One grading path:** the site route's body becomes `reviewCard(userId, cardId, grade)` in a new
    `lib/study/review.server.ts`; the site route and the API both call it, so a review from the API is the same review
    (log, leech, schedule). **The quest and XP step stays on the site route only** (`reviewCard` takes
    `{ rewards: boolean }`, the site passes `true`, the API `false`): a script grading cards must not farm quest coins
    or XP. The rate limit also stays outside `reviewCard` (the site keeps its IP-keyed `card-review` limit).
  - **The queue:** `GET /api/v1/me/decks/{id}/review?limit=` (1–50, default 20) returns the cards `reviewQueue` would
    show now for that one deck, in its order (`reviewQueue` gains an optional `deckId` that narrows `sessionDeck` to
    that deck, still inside `readableDeck`, so pace, suspensions and new-card limits apply unchanged; the existing
    callers pass none): id, kind, front and back text, cloze text and index, picture URLs and their descriptions,
    the external id, and the schedule (due, interval, new or review). **Never card sounds** (they are the recorder's on
    the site; the API is not a listed reader in `CARD_SOUND_READ_PATHS`). Every other card kind is returned in the
    shape `listMyCards` already gives it (read that function first and reuse its mapper). Scope `read:study`.
  - **Grading:** `POST /api/v1/me/decks/{id}/cards/{cardId}/review` with `{ grade: 'again' | 'hard' | 'good' | 'easy' }`
    (names, not the site's numbers), scope `write:study-reviews`, `idempotent: true` so a retry with the same
    `Idempotency-Key` never grades twice; answers the new due date, interval and whether the card became a leech. A card
    not in that deck, not reviewable or unreadable is `not_found`; a suspended card is `conflict`.
  - **Limits:** the v1 write rate limit, plus 120 grades a minute per key owner (`rateLimit(userId, { limit: 120,
    windowMs: 60_000, prefix: 'card-review-api' })`), the site's own ceiling, so the API cannot grade faster than the
    browser. A suspended card is checked in `gradeFor` before `reviewCard` (the site route does not check it today and
    keeps its behaviour).
  - **Docs:** both endpoints in the registry with examples; a changelog bullet; the SDK regenerated.

## Functional requirements

1. FR-1 `lib/study/review.server.ts`: `reviewCard` (the site route's checks and writes, unchanged in behaviour) and the
   site route calling it; the route's existing tests stay green.
2. FR-2 `lib/study/queue.server.ts`: `reviewQueue` gains the optional `deckId` (last parameter or an options field;
   existing callers unchanged). `lib/api/v1/study.server.ts`: `reviewQueueFor(userId, deckId, limit)` (built on `reviewQueue`, mapped to the API
   card shape without sound fields), `gradeFor(userId, deckId, cardId, grade)`; schemas in `lib/api/v1/study-schema.ts`.
3. FR-3 Route files `app/routes/api/v1/me/decks/$id/review.ts` (GET) and
   `app/routes/api/v1/me/decks/$id/cards/$cardId/review.ts` (POST, `idempotent: true`).
4. FR-4 `lib/api/registry.ts` entries under the Wave 0 anchor (paths, params, examples, errors), `NULLABLE` names in
   `scripts/generate-sdk.ts` under the anchor (checked against existing SDK fields), the changelog bullet under
   `<!-- s12-12 api-reviews -->` in `docs/developer-api/changelog.md`; `pnpm sdk:generate`, `pnpm docs:api`.
5. FR-5 `lib/api/scopes.ts`: `write:study-reviews` (`explicit: true`) under the Wave 0 `s12-12` scope anchor, and
   `docs/developer-api/scopes.md`. FR-6 `DECK_ACCESS_PATHS` entries for the new server code under the Wave 0 anchor; `CARD_SOUND_READ_PATHS` unchanged
   (the test that the API never selects the sound columns is in the main suite below).

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

- Main suite `lib/api/v1/__tests__/study-review.test.ts`: scopes (`read:study` and `write:study` cannot grade; `*` and `write:*` keys cannot grade; `write:study-reviews` can); no
  quest progress or XP from an API grade; the limit per key owner; a card of another deck in
  the path is `not_found`; a suspended card is `conflict`; idempotent replay; no sound field in the queue; the queue
  respects the deck's pace.
- Main suite `lib/study/__tests__/review-card.test.ts`: the extracted `reviewCard` gives the site route's results (the
  same grade on the same state yields the same schedule and log row).
- Gates: the API registry and docs tests, SDK generation (`git diff` shows no existing field changed type),
  `DECK_ACCESS_PATHS`, `CARD_SOUND_READ_PATHS`, `DUE_COUNT_READ_PATHS` if the queue's count is reused, the
  `api-handler-adoption` test.

## Acceptance criteria

- [ ] A key with `read:study` and `write:study-reviews` fetches five due cards and grades them; the site's review page then
      shows them scheduled as if graded in the browser.
- [ ] Retrying a grade with the same `Idempotency-Key` does not grade twice.
- [ ] An existing `write:study` (or `*`) key is refused on the grade endpoint.
- [ ] No response carries a card sound.

## Out of scope

Practice tests through the API, creating reviews for other members, webhooks on reviews.
