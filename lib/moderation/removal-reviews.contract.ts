/** Contracts for removals after a report and the second look (sprint 15, feature 16). Client-safe: types only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AdminQueueUser } from '@/lib/admin/admin-ops.contract';
import type { RemovalState } from '@/lib/moderation/removal-reviews';
import type {
  adminRemovalReviewsQuery,
  decideRemovalReviewBody,
  requestRemovalReviewBody,
} from '@/lib/moderation/removal-reviews-schema';

/**
 * One removal as its author sees it: the kind, the item's own title when it still exists, when it came down and where
 * the review stands. Never the report's id, reason, note or count, the reporter or the moderator.
 */
export interface MyRemoval {
  id: string;
  /** The entity type (`study-deck`, …); the panel writes it through `reportKindLabel`. */
  kind: string;
  title: string | null;
  removedAt: string;
  state: RemovalState;
  /** Reversible, never asked and inside the 14 days. */
  canAsk: boolean;
  /** False for an item that was deleted: the panel says it cannot be restored. */
  reversible: boolean;
  reviewRequestedAt: string | null;
  reviewDecidedAt: string | null;
}

/** The caller's own removals, newest first. */
export const listMyRemovalsApi = endpoint<{
  res: { items: MyRemoval[] };
}>()({ method: 'GET', path: '/api/moderation/removals' });

/** Ask for a second look, once (409 once asked, 409 when it is closed). */
export const requestRemovalReviewApi = endpoint<{
  body: z.infer<typeof requestRemovalReviewBody>;
  res: { success: true };
}>()({ method: 'POST', path: '/api/moderation/removals/$id/review' });

/** One requested review as an admin sees it. */
export interface AdminRemovalReview {
  id: string;
  kind: string;
  title: string | null;
  author: AdminQueueUser;
  removedAt: string;
  reviewRequestedAt: string;
  reviewNote: string | null;
  reviewDecidedAt: string | null;
  outcome: 'upheld' | 'restored' | null;
}

export const listAdminRemovalReviewsApi = endpoint<{
  query: z.infer<typeof adminRemovalReviewsQuery>;
  res: { items: AdminRemovalReview[]; counts: { pending: number; decided: number } };
}>()({ method: 'GET', path: '/api/admin/removal-reviews' });

export const decideRemovalReviewApi = endpoint<{
  body: z.infer<typeof decideRemovalReviewBody>;
  res: { success: true; outcome: 'upheld' | 'restored' };
}>()({ method: 'POST', path: '/api/admin/removal-reviews/$id' });
