# 09 — One card's history, and starting a card over

Surface: the review session (`/study/review` and a deck's study page: "Card info" on the current card), the deck
editor's card rows ("History"), a dialog with the card's reviews and "Start this card over". Wave 3. Namespace
`card-history`. Site tier (Steel).

## User story

As a member studying flashcards, I want to see how one card has gone — every time I reviewed it, what I answered and
when it comes back — and to start a card over when I learned it wrong, so that I understand why a card keeps coming
back and can reset it without deleting it.

## Requirements elicitation

- **What exists (verified):**
  - Per-member schedule on shared cards: `FlashcardReview (userId, cardId)` (`prisma/schema/rmhstudy.prisma`:
    `easeFactor`, `intervalDays`, `repetitions`, `dueAt`, `suspendedAt`, `suspendReason`, `lapses`), graded through
    `POST /api/study/cards/$id/review` (`lib/study/api/study.cards.$id.review.server.ts`: `nextState` from
    `lib/rmhstudy/srs.ts`, `Grade = 0 | 1 | 2 | 3`, `saveReview` from `lib/study/review-log.server.ts`,
    `canReadDeck` from `lib/study/deck-access.server.ts`).
  - Every review is appended to `FlashcardReviewLog` (`userId`, `cardId`, `deckId`, `grade`, `intervalDays`,
    `easeFactor`, `reviewedAt`; indexes `[userId, reviewedAt]` and `[userId, deckId, reviewedAt]`). It feeds
    `/study/stats` (`lib/study/stats.server.ts`) and the export (`exportStudyStatsData`). **No index leads with the
    card**, and nothing shows one card's log.
  - Suspending and leeches exist (`setSuspended` in `lib/study/queue.server.ts`, `LEECH_RESET` in
    `lib/study/queue.ts`); there is no "forget": a member who memorised a wrong answer can only suspend the card or
    delete it, and deleting a card of a shared deck is the owner's (sprint 11 10).
  - The review screen is `components/study/ReviewAll.tsx` (keys `Space`/`Enter` reveal, `p` plays a card sound, `a`
    listens; `SITE_SHORTCUTS` in `lib/shortcuts/registry.ts` holds the site's bare keys).
- **Decisions:**
  - **Card info** shows: the card's state (new, learning, review, suspended, leech), the next due date in the member's
    locale and time zone, the interval, ease, lapses, total reviews, and the last 100 reviews (date, the grade's name —
    Again, Hard, Good, Easy — and the interval it set), newest first. The member's own rows only.
  - **Start over** resets the member's `FlashcardReview` for that card to a new card (ease 2.5, interval 0, repetitions
    0, lapses 0, due now, not suspended); the log is kept (it is history, and stats count it) and the dialog shows a
    line "Started over on <date>" from a new nullable column `resetAt` on `FlashcardReview`. Confirmation through
    `useConfirm`. Undo is not offered (the confirmation says so).
  - **Who:** any member who can read the deck (`canReadDeck`): an editor's or a cloner's history is their own; a member
    who lost access to a deck (removed as editor, the deck went private) gets 404.
  - **Key:** `i` opens card info in a review session, bound only while the session has focus and not after `g` (the
    existing `afterG` guard), and registered so `findShortcutConflicts()` sees it.
  - **Index:** `@@index([userId, cardId, reviewedAt])` on `FlashcardReviewLog`, built `CONCURRENTLY` in its own
    migration with an `_ensure_valid` follow-up (`20261202030201_s12_card_history_index` and
    `20261202030202_s12_card_history_index_ensure_valid`, copying
    `20261126060101_s06_flashcard_external_id_index`), Prisma's default name
    `flashcard_review_log_userId_cardId_reviewedAt_idx`.

## Functional requirements

1. FR-1 `lib/study/card-history.ts` (pure: card state from a review row, grade names as keys);
   `card-history.server.ts` (`cardHistory`, `startCardOver`), classified in `DECK_ACCESS_PATHS` under the Wave 0
   anchor; `card-history.contract.ts`.
2. FR-2 Registered endpoints `lib/study/api/study.cards.$id.history.server.ts` (GET, `rateLimit: 'read'`) and
   `study.cards.$id.restart.server.ts` (POST, `rateLimit: 'write'`).
3. FR-3 Schema: `FlashcardReview.resetAt DateTime?` (migration `20261202030200_s12_card_history`), and the index
   migrations above (three migrations in all, in timestamp order).
4. FR-4 UI: `components/study/CardHistoryDialog.tsx` (rows on rules, `t-meta` dates and figures), opened from
   `ReviewAll.tsx` ("Card info", key `i`) and from the deck editor's card rows; the card's text in the dialog title is
   member text (`dir="auto"`).
5. FR-5 After a start-over the review queue and due counts refresh (React Query invalidation of the existing keys).

## Non-functional requirements

- **Privacy:** the history of a card is the caller's own rows; an owner never sees an editor's or cloner's history.
- **Performance:** one indexed read (`userId, cardId`) of at most 100 rows.
- **Accessibility:** the dialog's list is a table with headers; the state is text.

## Data model and API

`FlashcardReview.resetAt DateTime?`; the index on `FlashcardReviewLog`. `GET /api/study/cards/$id/history` →
`{ state, dueAt, intervalDays, easeFactor, lapses, total, resetAt, reviews: [{ reviewedAt, grade, intervalDays }] }`;
`POST /api/study/cards/$id/restart` → `{ ok: true }`.

## Testing requirements

- Main suite `lib/study/__tests__/card-history.test.ts`: another member's rows never appear; a removed editor gets 404;
  start-over resets every field and keeps the log; a cloze parent (not reviewable) is 404, as the review route does.
- Product suite `lib/study/__tests__/card-history.product.test.ts`: states and grade names.
- Gates: `DECK_ACCESS_PATHS` registry test, `DUE_COUNT_READ_PATHS` if the start-over reads due counts, shortcut
  registry, migration safety (the `CONCURRENTLY` pair), route table, design consistency, user-text direction.

## Acceptance criteria

- [ ] In a review, `i` opens the current card's history with its last reviews and next due date.
- [ ] "Start this card over" makes it a new card in the next session; the history keeps the old reviews and says when it
      was started over.
- [ ] A member removed as an editor can no longer open the history of that deck's cards.

## Out of scope

Editing past reviews, a per-deck reset, the owner's view of learners' histories.
