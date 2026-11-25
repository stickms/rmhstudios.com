/** Contracts for one card's history and starting it over (s12-09). Client-safe: no zod ships. */
import { endpoint } from '@/lib/contract/endpoint';
import type { CardState } from '@/lib/study/card-history';

export interface CardHistoryReview {
  reviewedAt: string;
  /** 0 Again, 1 Hard, 2 Good, 3 Easy. */
  grade: number;
  intervalDays: number;
}

export interface CardHistoryRes {
  state: CardState;
  /** When the card is next due; null while it has no schedule yet. */
  dueAt: string | null;
  intervalDays: number;
  easeFactor: number;
  lapses: number;
  /** Every review of this card the member has, not only the ones listed. */
  total: number;
  /** When the member last started the card over; null when never. */
  resetAt: string | null;
  /** The newest 100, newest first. */
  reviews: CardHistoryReview[];
}

export const cardHistoryApi = endpoint<{ res: CardHistoryRes }>()({
  method: 'GET',
  path: '/api/study/cards/$id/history',
});

export const restartCardApi = endpoint<{ res: { ok: true } }>()({
  method: 'POST',
  path: '/api/study/cards/$id/restart',
});
