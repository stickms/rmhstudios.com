import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { feedbackRefusalStatus } from '@/lib/competitive/jam-feedback';
import { listJamFeedbackApi } from '@/lib/competitive/jam-feedback.contract';
import { listFeedback } from '@/lib/competitive/jam-feedback.server';

/**
 * GET /api/jams/$slug/entries/$entryId/feedback — the feedback on one entry. Only its submitter, its accepted
 * teammates and admins may read it (anyone else gets 403); an anonymous piece carries no author id unless an admin reads.
 */
export const route = apiRoute('/api/jams/$slug/entries/$entryId/feedback', {
  GET: implement(listJamFeedbackApi, { rateLimit: 'read' }, async ({ params, userId, isAdmin }) => {
    const result = await listFeedback({
      slug: params.slug,
      entryId: params.entryId,
      actorId: userId,
      isAdmin,
    });
    return result.ok
      ? Response.json({ feedback: result.value }, { headers: { 'Cache-Control': 'private, no-store' } })
      : Response.json(
          { error: 'You cannot read this feedback', code: result.code },
          { status: feedbackRefusalStatus(result.code) },
        );
  }),
});
