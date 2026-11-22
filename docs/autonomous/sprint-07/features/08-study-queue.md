# 08 — Review everything due, and suspend the cards that will not stick

Surface: a new page `/study/review`, the `/study` deck list, the deck page and
the review session. Wave 1. Namespace `study-queue`.

## User story

As a student with eleven decks, I want one "Review all" that takes me through
every card due today across my decks, so that I do not open eleven pages a day.

As a student with a card I keep failing, I want the site to notice, set it
aside and tell me, and I want to suspend a card myself until I rewrite it, so
that one bad card does not eat every session.

## Requirements elicitation

- **What exists (verified):**
  - Review is per deck: `GET /api/study/decks/$id/review`
    (`lib/study/api/study.decks.$id.review.server.ts`) returns the viewer's
    reviewable cards for one deck (`REVIEWABLE_WHERE`, `CARD_ORDER` from
    `lib/study/card-query.server.ts`), and grading posts to
    `lib/study/api/study.cards.$id.review.server.ts`, which updates
    `FlashcardReview` (SM-2: `easeFactor`, `intervalDays`, `repetitions`,
    `dueAt`; `prisma/schema/rmhstudy.prisma`) and appends
    `FlashcardReviewLog` in the same transaction.
  - "Due" is counted in several places: the deck page and stats
    (`lib/study/stats.server.ts`), the deck list (`lib/study.server.ts`
    `listDecks`), reminders (`lib/study/reminders.server.ts`: "never-reviewed
    cards count as due like the deck page"), and the developer API
    (`app/routes/api/v1/me/decks/$id/due.ts`, sprint 06 13).
  - There is no suspend, bury or leech handling (`grep -ri "suspend\|leech"
    lib/study` finds nothing) and no cross-deck queue.
- **Decisions:**
  - **Suspension is per member and per card**, on the member's
    `FlashcardReview` row (`suspendedAt`, `suspendReason` `manual` | `leech`);
    a card with no review row is suspended by creating one with the default
    schedule. A suspended card is excluded from every due count and every
    review queue, on every path listed above, and nowhere else (it still
    shows in the deck's card list, marked).
  - **Lapses:** `FlashcardReview.lapses Int @default(0)` counts grades of
    "Again" on a card that had `repetitions > 0`. At **8 lapses** the card is
    suspended as a leech in the same transaction as the grade, and the session
    ends that card with one line ("Set aside: you have missed this card 8
    times. Edit it or unsuspend it from the deck."). Unsuspending a leech
    resets `lapses` to 4, so it gets four more tries before it is set aside
    again.
  - **Review all** (`/study/review`): every scheduled card due now from any
    deck the member can still read (their own decks and public decks they have
    review rows for; a deck made private by its owner drops out), plus up to
    **20 new cards** per session from the member's own decks (never-reviewed
    cards, oldest deck first, in `CARD_ORDER`). Ordered by `dueAt`, then deck,
    then `CARD_ORDER`. A session is at most **200 cards**; "Keep going"
    fetches the next batch. Grading uses the existing card review endpoint, so
    the schedule, the log and streaks are unchanged.
  - The `/study` list gains "Review all · {{count}} due" (count excludes
    suspended) and each deck row's due count excludes suspended cards.
  - The deck page gains a "Suspended" filter in its card list and
    Suspend/Unsuspend in each card's menu; a "Leeches" line lists leech-suspended
    cards with "Edit" and "Unsuspend".
  - One read-path registry, `DUE_COUNT_READ_PATHS`, lists every file that counts
    or queues due cards; a source-scan test holds that each one applies the
    shared `ACTIVE_REVIEW_WHERE` (or the documented equivalent for raw counts).
  - Practice tests (`lib/study/tests.server.ts`) are deck-level, not
    schedule-level, and are unchanged.

## Functional requirements

1. FR-1 `/study/review` with the cross-deck queue, the existing card review UI
   (front, reveal, four grades), the deck name above each card (`t-meta`), a
   finish screen with counts, and an empty state ("Nothing due. Come back
   tomorrow.").
2. FR-2 Suspend and unsuspend from the deck page's card menu and from the
   review screen ("Suspend this card", `useConfirm` not needed: undoable).
3. FR-3 Automatic leech suspension and its session line.
4. FR-4 Due counts that exclude suspended cards on the deck list, deck page,
   stats, reminders and the developer API's due endpoint (additive: a
   `suspended` count is added to the API's deck payload).
5. FR-5 The deck page's Suspended filter and Leeches line.

## Non-functional requirements

- **Correctness:** the leech suspension and the lapse increment happen in the
  grade's transaction; suspend/unsuspend are idempotent `upsert`s; the queue
  never returns a card the viewer cannot read (deck privacy re-checked in the
  query).
- **Performance:** the queue is one query on the existing
  `flashcard_review(userId, dueAt)` index with a join to `flashcard` and
  `flashcard_deck` for readability, plus one query for new cards; no N+1 over
  decks. No new index on an existing table.
- **Security:** `auth: 'required'`, `rateLimit: 'read'` for the queue,
  `'write'` for suspend.
- **Privacy:** no new table; the columns go with the review rows erasure
  already deletes; the export gains the member's suspended cards (deck, card id).
- **Steel:** the review page is a plain titled page; the grades are the existing
  controls; one ink primary (Show answer / the selected grade, as the deck
  review does).
- **i18n:** `study-queue`.

## Data model and API

- `FlashcardReview.suspendedAt DateTime?`, `suspendReason String?
  @db.VarChar(8)`, `lapses Int @default(0)`. Migration
  `20261127010100_s07_study_queue`.
- `lib/study/queue.ts` (pure: `LEECH_THRESHOLD = 8`, `LEECH_RESET = 4`,
  `NEW_PER_SESSION = 20`, `SESSION_MAX = 200`, `isLapse`), `queue-schema.ts`,
  `queue.contract.ts`, `queue.server.ts` (`reviewQueue`, `setSuspended`,
  `exportSuspendedCards`), and `ACTIVE_REVIEW_WHERE` beside `REVIEWABLE_WHERE`
  in `card-query.server.ts`.
- Modules `lib/study/api/study.review.server.ts` (GET queue, `?after=` cursor)
  and `lib/study/api/study.cards.$id.suspend.server.ts` (PUT `{ suspended }`).
- The grade path (`study.cards.$id.review.server.ts` or the module it calls)
  increments `lapses` and suspends leeches.
- Page `app/routes/_site/study/review.tsx`; `components/study/ReviewAll.tsx`;
  edits to `components/feed/FlashcardsColumn.tsx`, the deck page's card list
  (`components/study/CardRow.tsx`), `lib/study/stats.server.ts`,
  `lib/study.server.ts`, `lib/study/reminders.server.ts`,
  `app/routes/api/v1/me/decks/$id/due.ts`, `lib/api/registry.ts` (the deck
  schema's `suspended` field, in place).

## Testing requirements

- Main suite `lib/study/__tests__/study-queue.test.ts`: queue across decks in
  order; private deck of another owner excluded; new-card cap; session cap and
  cursor; suspended excluded from queue and every count; the eighth lapse
  suspends in the grade transaction; unsuspend resets lapses to 4; a lapse is
  only counted when `repetitions > 0`.
- `lib/study/__tests__/due-count-read-paths.test.ts`: the source scan.
- Product suite `lib/study/__tests__/queue.product.test.ts`.
- Existing tests that must stay green: `lib/study/__tests__/review-log.test.ts`,
  `deck-updates.test.ts`, the reminders tests, the API flashcards tests.
- Gate tests: sitemap coverage (`/study/review` in `EXCLUDED_ROUTES`), OG
  coverage, `useeffect-fetch-ratchet`.

## Acceptance criteria

- [ ] With cards due in three decks, "Review all" shows them in one session and
      grading updates each deck's schedule as a per-deck review would.
- [ ] A card graded "Again" for the eighth time is set aside and the session
      says so; it no longer counts as due anywhere, including reminders.
- [ ] Suspending a card from the deck page removes it from today's count.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Burying siblings until tomorrow, custom study sessions by tag, changing SM-2
parameters, suspension shared with the deck's author.
