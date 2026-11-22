/** Contracts for the cross-deck review queue and per-card suspension. Client-safe: types by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { QueueCard, SuspendReason } from '@/lib/study/queue';
import type { reviewQueueQuery, suspendCardBody } from '@/lib/study/queue-schema';

export interface ReviewQueueRes {
  cards: QueueCard[];
  /** Pass as `?after=` for the next batch; null when this batch reaches the end. */
  next: string | null;
  /** True when new cards were added to this batch. */
  includesNew: boolean;
  /**
   * Paced decks whose allowance for today is used up and that still have new cards: the end screen offers
   * "Learn 10 more" for each (s10-03). Absent unless some deck has a pace.
   */
  learnMore?: { deckId: string; deckTitle: string }[];
}

export const reviewQueueApi = endpoint<{
  query: z.infer<typeof reviewQueueQuery>;
  res: ReviewQueueRes;
}>()({
  method: 'GET',
  path: '/api/study/review',
});

export const suspendCardApi = endpoint<{
  body: z.infer<typeof suspendCardBody>;
  res: {
    success: true;
    suspended: boolean;
    reason: SuspendReason | null;
  };
}>()({
  method: 'PUT',
  path: '/api/study/cards/$id/suspend',
});
