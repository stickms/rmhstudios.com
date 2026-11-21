import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { feedbackRefusalStatus, type FeedbackRefusal } from '@/lib/competitive/jam-feedback';
import { markFeedbackHelpfulApi, unmarkFeedbackHelpfulApi } from '@/lib/competitive/jam-feedback.contract';
import { markHelpful } from '@/lib/competitive/jam-feedback.server';

function refused(code: FeedbackRefusal): Response {
  return Response.json({ error: 'You cannot flag this feedback', code }, { status: feedbackRefusalStatus(code) });
}

/**
 * POST   /api/jams/$slug/feedback/$id/helpful — the entry's team marks a piece Helpful.
 * DELETE /api/jams/$slug/feedback/$id/helpful — and takes it back. Only the submitter and accepted teammates.
 */
export const route = apiRoute('/api/jams/$slug/feedback/$id/helpful', {
  POST: implement(markFeedbackHelpfulApi, { rateLimit: 'write' }, async ({ params, userId }) => {
    const result = await markHelpful({ slug: params.slug, feedbackId: params.id, actorId: userId, helpful: true });
    return result.ok ? { success: true as const } : refused(result.code);
  }),
  DELETE: implement(unmarkFeedbackHelpfulApi, { rateLimit: 'write' }, async ({ params, userId }) => {
    const result = await markHelpful({ slug: params.slug, feedbackId: params.id, actorId: userId, helpful: false });
    return result.ok ? { success: true as const } : refused(result.code);
  }),
});
