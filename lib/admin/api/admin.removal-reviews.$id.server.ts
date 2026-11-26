/**
 * POST /api/admin/removal-reviews/$id — decide a requested second look: uphold the removal or restore the item
 * (sprint 15, feature 16). Admin only. A restore clears the takedown stamp and never publishes on the owner's behalf;
 * the decision is audited and the author is told. Reporters are not.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { decideRemovalReviewApi } from '@/lib/moderation/removal-reviews.contract';
import { decideRemovalReviewBody } from '@/lib/moderation/removal-reviews-schema';
import { decideRemovalReview } from '@/lib/moderation/removal-reviews.server';

const refuse = (code: ErrorCode): Response => Response.json(refusalBody(code), { status: ERROR_CODES[code].http });

export const route = apiRoute('/api/admin/removal-reviews/$id', {
  POST: implement(
    decideRemovalReviewApi,
    { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' }, body: decideRemovalReviewBody },
    async ({ session, params, body }) => {
      const result = await decideRemovalReview(session.user.id, params.id, body.action);
      if (result.ok) return { success: true as const, outcome: result.outcome };
      if (result.reason === 'not_found' || result.reason === 'not_requested') return refuse('NOT_FOUND');
      if (result.reason === 'not_reversible') return refuse('INVALID_INPUT');
      return refuse('CONFLICT');
    },
  ),
});
