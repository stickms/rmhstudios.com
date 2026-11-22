/**
 * The three ways a flashcard query reads a deck, so no query invents its own:
 * the EDITOR and the deck page list authored cards only, REVIEW and practice tests
 * read reviewable cards (every row except an authored cloze card, which only holds
 * the text its generated cards are made from), and both order a card's generated
 * siblings right after it.
 */
import type { Prisma } from '@prisma/client';

/** What the owner wrote: generated siblings are not listed, counted or exported. */
export const AUTHORED_WHERE = { sourceId: null } satisfies Prisma.FlashcardWhereInput;

/** What a member studies and is tested on. */
export const REVIEWABLE_WHERE = {
  NOT: { kind: 'cloze', sourceId: null },
} satisfies Prisma.FlashcardWhereInput;

/**
 * A review row that is in play: not suspended. Every due count and review queue applies it (the registry is
 * `DUE_COUNT_READ_PATHS` in `lib/study/queue.ts`); a raw SQL count says `"suspendedAt" IS NULL` instead.
 */
export const ACTIVE_REVIEW_WHERE = { suspendedAt: null } satisfies Prisma.FlashcardReviewWhereInput;

/** Deck order: by position, then the authored card before its siblings, then by cloze index. */
export const CARD_ORDER = [
  { position: 'asc' },
  { sourceId: { sort: 'asc', nulls: 'first' } },
  { clozeIndex: 'asc' },
] satisfies Prisma.FlashcardOrderByWithRelationInput[];
