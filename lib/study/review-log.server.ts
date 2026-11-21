import { prisma } from '@/lib/prisma.server';
import { markReviewed } from '@/lib/study/reminders.server';
import type { SrsState } from '@/lib/rmhstudy/srs';

/**
 * Save the outcome of one review: the card's new SM-2 state and the history row, in one
 * transaction, so a log row never exists without its state change or the reverse.
 */
export async function saveReview(input: {
  userId: string;
  cardId: string;
  deckId: string;
  grade: number;
  next: SrsState & { dueAt: Date };
}): Promise<void> {
  const { userId, cardId, deckId, grade, next } = input;
  const state = {
    easeFactor: next.easeFactor,
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    dueAt: next.dueAt,
  };
  await prisma.$transaction(async (tx) => {
    await tx.flashcardReview.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: { userId, cardId, ...state },
      update: state,
    });
    await tx.flashcardReviewLog.create({
      data: {
        userId,
        cardId,
        deckId,
        grade,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
      },
    });
  });
  // A review ends the idle run the reminder counts. Best-effort: the review is already saved.
  await markReviewed(userId).catch((err: unknown) => {
    console.error('[study-reminders] markReviewed failed:', err);
  });
}
