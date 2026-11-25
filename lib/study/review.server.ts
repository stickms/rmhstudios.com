/**
 * Grade one flashcard for one member: the site's review route and the developer API's both end here, so a review
 * from either is the same review (the SM-2 state, the history row, the leech rule). The checks are the route's:
 * the card exists, it is one that is reviewed (an authored cloze or occlusion card is not), and the member may
 * read its deck. A refusal is `not_found`, never a different answer for a card that exists and is not theirs.
 *
 * `rewards` is the one difference between callers: the site's daily quest and XP step runs for the browser's
 * grades (`rewards: true`) and never for a script's (`rewards: false`), so a tool grading cards cannot farm
 * quest coins. The rate limit stays with each caller.
 */
import { prisma } from '@/lib/prisma.server';
import { isReviewable } from '@/lib/study/card-types';
import { nextState, type Grade } from '@/lib/rmhstudy/srs';
import { isLapse } from '@/lib/study/queue';
import { saveReview } from '@/lib/study/review-log.server';
import { recordStudyReview } from '@/lib/quests/engine.server';
import { canReadDeck } from '@/lib/study/deck-access.server';

export type ReviewCardResult =
  | {
      ok: true;
      dueAt: Date;
      intervalDays: number;
      leech: boolean;
    }
  | {
      ok: false;
      reason: 'not_found';
    };

export interface ReviewCardOptions {
  /** Progress the daily quest and award XP, as a grade in the browser does. */
  rewards: boolean;
  /** When set, the card must be in this deck; a card of another deck is `not_found`. */
  deckId?: string;
}

/** Save one grade on the member's own schedule for the card. */
export async function reviewCard(
  userId: string,
  cardId: string,
  grade: Grade,
  options: ReviewCardOptions,
): Promise<ReviewCardResult> {
  const card = await prisma.flashcard.findUnique({
    where: { id: cardId },
    select: { id: true, deckId: true, kind: true, sourceId: true, deck: { select: { isPublic: true, userId: true } } },
  });
  if (!card) return { ok: false, reason: 'not_found' };
  if (options.deckId !== undefined && card.deckId !== options.deckId) return { ok: false, reason: 'not_found' };
  // An authored cloze card is never reviewed; its generated cards are.
  if (!isReviewable(card)) return { ok: false, reason: 'not_found' };
  if (!(await canReadDeck(userId, { id: card.deckId, ...card.deck }))) return { ok: false, reason: 'not_found' };

  const existing = await prisma.flashcardReview.findUnique({
    where: { userId_cardId: { userId, cardId } },
    select: { easeFactor: true, intervalDays: true, repetitions: true },
  });
  const prev = existing ?? { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };
  const next = nextState(prev, grade);

  const { leech } = await saveReview({
    lapse: isLapse(grade, prev.repetitions),
    userId,
    cardId,
    deckId: card.deckId,
    grade,
    next,
  });

  // Progress the daily "study" quest + award XP (best-effort, rate-limited): the site's grades only.
  if (options.rewards) await recordStudyReview(userId);

  return { ok: true, dueAt: next.dueAt, intervalDays: next.intervalDays, leech };
}
