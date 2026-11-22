import { prisma } from '@/lib/prisma.server';
import { markReviewed } from '@/lib/study/reminders.server';
import type { SrsState } from '@/lib/rmhstudy/srs';
import { isLeech } from '@/lib/study/queue';

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
  /** The grade was "Again" on a card that had been learned (`isLapse`). */
  lapse?: boolean;
}): Promise<{ leech: boolean }> {
  const { userId, cardId, deckId, grade, next } = input;
  const state = {
    easeFactor: next.easeFactor,
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    dueAt: next.dueAt,
  };
  let leech = false;
  await prisma.$transaction(async (tx) => {
    // The lapse is counted in this transaction, and the eighth one sets the card aside in it too.
    const row = await tx.flashcardReview.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: { userId, cardId, ...state },
      update: input.lapse ? { ...state, lapses: { increment: 1 } } : state,
    });
    if (input.lapse && row && isLeech(row.lapses) && !row.suspendedAt) {
      await tx.flashcardReview.update({
        where: { userId_cardId: { userId, cardId } },
        data: { suspendedAt: new Date(), suspendReason: 'leech' },
      });
      leech = true;
    }
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
  return { leech };
}
