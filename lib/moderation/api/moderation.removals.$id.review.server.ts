/**
 * POST /api/moderation/removals/$id/review — ask for a second look at one of your own removals (sprint 15, feature 16).
 * Once per removal, within 14 days, for a removal that can be undone. Someone else's removal answers 404, exactly like
 * one that does not exist.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { requestRemovalReviewApi } from '@/lib/moderation/removal-reviews.contract';
import { requestRemovalReviewBody } from '@/lib/moderation/removal-reviews-schema';
import { requestRemovalReview } from '@/lib/moderation/removal-reviews.server';

const refuse = (code: ErrorCode): Response => Response.json(refusalBody(code), { status: ERROR_CODES[code].http });

export const route = apiRoute('/api/moderation/removals/$id/review', {
  POST: implement(
    requestRemovalReviewApi,
    { rateLimit: 'write', body: requestRemovalReviewBody, allowEmptyBody: true },
    async ({ session, params, body }) => {
      const result = await requestRemovalReview(session.user.id, params.id, body.note);
      if (result === 'not_found') return refuse('NOT_FOUND');
      if (result === 'already_asked') return refuse('REMOVAL_REVIEW_ALREADY_ASKED');
      if (result === 'closed') return refuse('REMOVAL_REVIEW_CLOSED');
      return { success: true as const };
    },
  ),
});
