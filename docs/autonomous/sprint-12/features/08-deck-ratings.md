# 08 — Rate a public deck, and find the good ones

Surface: `/study/browse` (sort by rating or by copies), a public deck's page (its rating and "Rate this deck" for
members who studied a copy), the deck owner's view of their rating. Wave 6. Namespace `deck-ratings`. Site tier (Steel).

## User story

As a member looking for a flashcard deck, I want to see which public decks other learners rated well and copied most,
so that I study a good deck instead of the longest one; and as someone who studied a deck, I want to rate it, so that
the next learner benefits.

## Requirements elicitation

- **What exists (verified):**
  - The marketplace: `listMarketplaceDecks` (`lib/study.server.ts`) lists public decks with cards, ordered by
    `cardCount` then `updatedAt`, at most `MARKETPLACE_LIMIT`, with a text filter, "already cloned" flags, editor
    counts and a picture preview; rendered by `components/feed/DeckMarketplaceColumn.tsx` on
    `app/routes/_site/study/browse.tsx`. There is no rating, no count of copies and no other order.
  - Copies record their source (`FlashcardDeck.clonedFromId`, `@@index([userId, clonedFromId])`); every review is
    logged with its deck (`FlashcardReviewLog`, `@@index([userId, deckId, reviewedAt])`), so "has this member studied
    a copy" is one indexed count.
  - Deck reads are classified in `DECK_ACCESS_PATHS` (`lib/study/deck-access.ts`); counters on kept rows are corrected
    at erasure (sprint 10 19's pattern in `lib/account/erasure-follows.server.ts`).
- **Decisions:**
  - **Who may rate:** a signed-in member who is not the owner or an editor of the deck, who has a copy of it
    (`clonedFromId` = the deck) and has logged at least 20 reviews on that copy. Blocks either way refuse. One rating
    per member per deck, 1 to 5 stars, changeable; no written review (a review is the open "game reviews" kind of
    decision).
  - **What is shown:** the average to one decimal and the number of ratings once there are at least 3; below that, "Not
    enough ratings yet". The copies count (`copyCount`) is the number of current copies, counted when a clone is made
    and when a copy is deleted.
  - **Ordering:** "Most cards" (today's order, the default), "Best rated" (a Bayesian average with a prior of 3.5 over
    5 ratings, so one 5-star rating does not top the list), "Most copied". The order is a `tabs.tsx` strip (never
    hand-rolled), remembered in the URL (`?sort=`).
  - **Counters:** `ratingSum`, `ratingCount` and `copyCount` on `FlashcardDeck`, written in the same transaction as the
    rating or the clone, under `lockKey(tx, 'deck-ratings:<deckId>')`.
  - **Erasure:** the member's ratings are erased and each rated deck's sum and count corrected in the same transaction;
    the member's copies are erased by the existing deck rules and `copyCount` of each source corrected. **Export:** the
    member's ratings (deck title, stars, date).

## Functional requirements

1. FR-1 Model `DeckRating` and three columns on `FlashcardDeck` (migration `20261202060100_s12_deck_ratings`); `User`
   back-relation under the Wave 0 anchor.
2. FR-2 `lib/study/deck-ratings.ts` (pure: eligibility from counts, the Bayesian score, display rules),
   `deck-ratings-schema.ts`, `deck-ratings.contract.ts`, `deck-ratings.server.ts` (`rateDeck`, `myRating`,
   `deckRatingErasureOps`, `exportDeckRatings`), classified in `DECK_ACCESS_PATHS` under the Wave 0 anchor.
3. FR-3 `cloneDeck` and the deck delete in `lib/study.server.ts` keep `copyCount` right (a copy deleted by its owner
   decrements the source, floored at zero).
4. FR-4 `listMarketplaceDecks` takes `sort` (`cards | rated | copied`); the endpoint `study.marketplace.server.ts` and
   the route loader pass it.
5. FR-5 Endpoints: `PUT /api/study/decks/$id/rating`, `DELETE` the same (registered module
   `lib/study/api/study.decks.$id.rating.server.ts`, `rateLimit: 'write'`).
6. FR-6 UI: the sort strip in `DeckMarketplaceColumn.tsx`, the rating line on each row, "Rate this deck" on the deck
   page (`components/feed/DeckStudyColumn.tsx`) for eligible members, five labelled radio buttons.
7. FR-7 Refusal: `DECK_RATING_NOT_STUDIED` ("Study your copy of this deck a little more before rating it").

## Non-functional requirements

- **Integrity:** the counters equal the rows (a test rates, changes, removes and erases); concurrent ratings serialise
  on the lock.
- **Privacy:** who rated what is never shown; only the aggregate.
- **Accessibility:** stars are a radio group with text labels ("4 stars"); the average is text.

## Data model and API

- `DeckRating` (`@@map("deck_rating")`): `deckId` → `FlashcardDeck` (`onDelete: Cascade`), `userId` → `User` (relation
  `DeckRatings`), `stars Int`, `createdAt`, `updatedAt`; `@@id([deckId, userId])`, `@@index([userId])`.
- `FlashcardDeck`: `ratingSum Int @default(0)`, `ratingCount Int @default(0)`, `copyCount Int @default(0)` (constant
  defaults, so the migration is additive; existing copies are counted once by the migration's `UPDATE … FROM (SELECT
  "clonedFromId", count(*) …)`).
- Erasure registry: `DeckRating: erase`.

## Testing requirements

- Main suite `lib/study/__tests__/deck-ratings.test.ts`: eligibility (owner, editor, no copy, 19 versus 20 reviews,
  block either way); change and remove keep the counters; the three sorts; the display threshold.
- Product suite `lib/study/__tests__/deck-ratings.product.test.ts`: the Bayesian score ordering.
- Main suite `lib/account/__tests__/deck-ratings-erasure.test.ts`: ratings erased, sums and counts corrected, copy
  counts corrected.
- Gates: `DECK_ACCESS_PATHS` registry test, route table, migration safety, erasure coverage, export test, design
  consistency, Steel flat, the tab-strip rule.

## Acceptance criteria

- [ ] A member who studied 20 cards of their copy rates the source deck; the deck page shows the average after the
      third rating.
- [ ] "Best rated" puts a deck with many good ratings above one with a single 5.
- [ ] The owner cannot rate their own deck.
- [ ] Erasing a member who rated a deck leaves its sum and count matching the remaining ratings.

## Out of scope

Written reviews, ratings of private decks, rating notifications to the owner.
