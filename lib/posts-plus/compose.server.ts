/**
 * posts-plus hooks for POST /api/rmharks: validate before the transaction,
 * record inside it, follow up after it. Keeping the three steps here leaves the
 * (hot, already long) route handler with three one-line calls.
 */

import type { Prisma } from '@prisma/client';
import { seriesComposeError, appendToSeriesTx, notifySeriesFollowers } from './series.server';
import { qotdAnswerError, recordQotdAnswer, afterQotdAnswer } from './qotd.server';
import { recordExpiryTx } from './lifecycle.server';
import { ttlToExpiry, type PostTtl } from './constants';

export interface PostsPlusInput {
  ttl?: PostTtl;
  seriesId?: string;
  qotdDay?: string;
}

export interface PostsPlusPlan {
  expiresAt: Date | null;
  seriesId: string | null;
  qotdDay: string | null;
}

export const EMPTY_PLAN: PostsPlusPlan = { expiresAt: null, seriesId: null, qotdDay: null };

/** Validate the optional fields. `error` is a user-facing message (HTTP 400). */
export async function planPostsPlus(
  userId: string,
  input: PostsPlusInput & { audience?: string; communityId?: string },
): Promise<{ plan: PostsPlusPlan; error: null } | { plan: null; error: string }> {
  if (!input.ttl && !input.seriesId && !input.qotdDay) return { plan: EMPTY_PLAN, error: null };

  if (input.seriesId) {
    const err = await seriesComposeError(userId, input.seriesId, input.audience, input.communityId);
    if (err) return { plan: null, error: err };
  }
  if (input.qotdDay) {
    if ((input.audience ?? 'PUBLIC') !== 'PUBLIC') {
      return { plan: null, error: 'Answers to the question of the day are public posts' };
    }
    const err = await qotdAnswerError(userId, input.qotdDay);
    if (err) return { plan: null, error: err };
  }
  return {
    plan: {
      expiresAt: input.ttl ? ttlToExpiry(input.ttl) : null,
      seriesId: input.seriesId ?? null,
      qotdDay: input.qotdDay ?? null,
    },
    error: null,
  };
}

/** Inside the create transaction, after the post row exists. */
export async function recordPostsPlusTx(
  tx: Prisma.TransactionClient,
  postId: string,
  userId: string,
  plan: PostsPlusPlan,
): Promise<void> {
  if (plan.expiresAt) await recordExpiryTx(tx, postId, userId, plan.expiresAt);
  if (plan.seriesId) await appendToSeriesTx(tx, plan.seriesId, postId);
  if (plan.qotdDay) await recordQotdAnswer(tx, postId, userId, plan.qotdDay);
}

/** After the response is decided; never throws. */
export function afterPostsPlus(postId: string, userId: string, plan: PostsPlusPlan): void {
  if (plan.seriesId) void notifySeriesFollowers(plan.seriesId, postId, userId);
  if (plan.qotdDay) void afterQotdAnswer(userId);
}
