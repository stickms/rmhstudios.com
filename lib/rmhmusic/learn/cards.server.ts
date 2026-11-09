/**
 * Remembered staff-reading cards (`music_learn_card`): each one's spaced-repetition state, read
 * by Practice and written only by a Practice review. The schedule itself is the pure
 * `srs/schedule.ts`; this file reads and writes rows, always with the server's clock.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { isKnownCardId } from './content/decks';
import type { CardRow } from './content/practice';
import type { ReviewInput } from './schemas';
import { newCard, review, type CardState } from './srs/schedule';

export type { CardRow };

/** At most this many rows in one listing (the decks hold far fewer cards). */
export const MAX_CARDS_LISTED = 200;

/** Thrown by `applyReviews` for a card id that no deck deals. */
export class UnknownCardError extends Error {
  constructor(cardId: string) {
    super(`Unknown card: ${cardId}`);
    this.name = 'UnknownCardError';
  }
}

interface DbCard {
  cardId: string;
  due: Date;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewAt: Date | null;
}

const SELECT = {
  cardId: true,
  due: true,
  stability: true,
  difficulty: true,
  reps: true,
  lapses: true,
  lastReviewAt: true,
} as const;

function toRow(r: DbCard): CardRow {
  return {
    cardId: r.cardId,
    due: r.due.toISOString(),
    lastReviewAt: r.lastReviewAt ? r.lastReviewAt.toISOString() : null,
    stability: r.stability,
    difficulty: r.difficulty,
    reps: r.reps,
    lapses: r.lapses,
  };
}

function toState(r: DbCard): CardState {
  return {
    due: r.due.getTime(),
    stability: r.stability,
    difficulty: r.difficulty,
    reps: r.reps,
    lapses: r.lapses,
    last: r.lastReviewAt ? r.lastReviewAt.getTime() : null,
  };
}

/** The learner's remembered cards, soonest due first, at most MAX_CARDS_LISTED. Never writes. */
export async function loadCards(userId: string): Promise<CardRow[]> {
  const rows = await prisma.musicLearnCard.findMany({
    where: { userId },
    orderBy: { due: 'asc' },
    take: MAX_CARDS_LISTED,
    select: SELECT,
  });
  return rows.map(toRow);
}

/**
 * Review cards for `userId` at `now` (the server's clock; never a client's), in the order given —
 * the same card twice is reviewed twice, the second from the first's result. Every id must be a
 * deck card or nothing is written. A card's first review starts from `newCard(now)`.
 *
 * One transaction: the missing rows are inserted as new cards (`skipDuplicates`), every touched
 * row is locked (`SELECT ... FOR UPDATE`), then read, reviewed and written. A concurrent batch for
 * the same cards waits on the lock and reviews from the committed state, so no review is lost.
 * Returns the touched rows after the reviews.
 */
export async function applyReviews(
  userId: string,
  reviews: readonly ReviewInput[],
  now: number,
): Promise<CardRow[]> {
  for (const r of reviews) if (!isKnownCardId(r.cardId)) throw new UnknownCardError(r.cardId);
  // Throws RangeError on a non-finite clock, before any write.
  const fresh = newCard(now);
  const ids = [...new Set(reviews.map((r) => r.cardId))];
  if (ids.length === 0) return [];

  return prisma.$transaction(async (tx) => {
    await tx.musicLearnCard.createMany({
      data: ids.map((cardId) => ({
        userId,
        cardId,
        due: new Date(fresh.due),
        stability: fresh.stability,
        difficulty: fresh.difficulty,
        reps: fresh.reps,
        lapses: fresh.lapses,
        lastReviewAt: null,
      })),
      skipDuplicates: true,
    });
    await tx.$queryRaw`SELECT "id" FROM "music_learn_card" WHERE "userId" = ${userId} AND "cardId" IN (${Prisma.join(ids)}) ORDER BY "cardId" FOR UPDATE`;
    const stored = await tx.musicLearnCard.findMany({
      where: { userId, cardId: { in: ids } },
      select: SELECT,
    });

    const states = new Map<string, CardState>(stored.map((r) => [r.cardId, toState(r)]));
    for (const r of reviews) {
      states.set(r.cardId, review(states.get(r.cardId) ?? newCard(now), r.grade, now));
    }

    const out: CardRow[] = [];
    for (const cardId of ids) {
      const s = states.get(cardId)!;
      const row = await tx.musicLearnCard.update({
        where: { userId_cardId: { userId, cardId } },
        data: {
          due: new Date(s.due),
          stability: s.stability,
          difficulty: s.difficulty,
          reps: s.reps,
          lapses: s.lapses,
          lastReviewAt: s.last === null ? null : new Date(s.last),
        },
        select: SELECT,
      });
      out.push(toRow(row));
    }
    return out;
  });
}
