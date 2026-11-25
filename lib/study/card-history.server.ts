/**
 * One card's history for the member studying it, and starting the card over (s12-09). Both read and write the
 * caller's own rows only: a card's history is never the owner's to see, and a card of a deck the member may not
 * read (removed as an editor, the deck went private) is not found, as is an authored cloze or occlusion card,
 * which is never reviewed (its generated cards are).
 */
import { prisma } from '@/lib/prisma.server';
import { isReviewable } from '@/lib/study/card-types';
import { canReadDeck } from '@/lib/study/deck-access.server';
import { cardState, emptyHistory, FRESH_SCHEDULE, HISTORY_LIMIT } from '@/lib/study/card-history';
import type { CardHistoryRes } from '@/lib/study/card-history.contract';

/** The card when the member may study it, else null. */
async function readableCard(userId: string, cardId: string): Promise<boolean> {
  const card = await prisma.flashcard.findUnique({
    where: { id: cardId },
    select: { id: true, deckId: true, kind: true, sourceId: true, deck: { select: { isPublic: true, userId: true } } },
  });
  if (!card) return false;
  if (!isReviewable(card)) return false;
  return canReadDeck(userId, { id: card.deckId, ...card.deck });
}

/** The member's own history of one card; null when the card is not theirs to read. */
export async function cardHistory(userId: string, cardId: string): Promise<CardHistoryRes | null> {
  if (!(await readableCard(userId, cardId))) return null;

  const [review, total, rows] = await Promise.all([
    prisma.flashcardReview.findUnique({
      where: { userId_cardId: { userId, cardId } },
      select: {
        easeFactor: true,
        intervalDays: true,
        repetitions: true,
        dueAt: true,
        suspendedAt: true,
        suspendReason: true,
        lapses: true,
        resetAt: true,
      },
    }),
    prisma.flashcardReviewLog.count({ where: { userId, cardId } }),
    // The one indexed read: (userId, cardId, reviewedAt), newest first.
    prisma.flashcardReviewLog.findMany({
      where: { userId, cardId },
      orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_LIMIT,
      select: { reviewedAt: true, grade: true, intervalDays: true },
    }),
  ]);

  const reviews = Array.isArray(rows) ? rows : [];
  const newest = reviews[0]?.reviewedAt;
  const reviewedSinceReset = newest !== undefined && (!review?.resetAt || newest >= review.resetAt);
  const base = review
    ? {
        dueAt: review.dueAt.toISOString(),
        intervalDays: review.intervalDays,
        easeFactor: review.easeFactor,
        lapses: review.lapses,
      }
    : emptyHistory();

  return {
    state: cardState({ review, reviewedSinceReset }),
    ...base,
    total: typeof total === 'number' ? total : reviews.length,
    resetAt: review?.resetAt ? review.resetAt.toISOString() : null,
    reviews: reviews.map((r) => ({
      reviewedAt: r.reviewedAt.toISOString(),
      grade: r.grade,
      intervalDays: r.intervalDays,
    })),
  };
}

/**
 * Make the card a new one on the member's own schedule: ease 2.5, interval 0, no repetitions or lapses, due now,
 * not suspended. The review log is never touched (it is history, and the stats count it). False when the card is
 * not theirs to read.
 */
export async function startCardOver(userId: string, cardId: string, now: Date = new Date()): Promise<boolean> {
  if (!(await readableCard(userId, cardId))) return false;
  const fresh = { ...FRESH_SCHEDULE, dueAt: now, suspendedAt: null, suspendReason: null, resetAt: now };
  await prisma.flashcardReview.upsert({
    where: { userId_cardId: { userId, cardId } },
    create: { userId, cardId, ...fresh },
    update: fresh,
  });
  return true;
}
