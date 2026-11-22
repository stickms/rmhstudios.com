import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { reviewQueueApi } from '@/lib/study/queue.contract';
import { reviewQueueQuery } from '@/lib/study/queue-schema';
import { reviewQueue } from '@/lib/study/queue.server';
import { ownsFolder } from '@/lib/study/folders.server';

/** GET /api/study/review?after= — the signed-in member's cross-deck review session (one batch). */
export const route = apiRoute('/api/study/review', {
  GET: implement(
    reviewQueueApi,
    {
      rateLimit: 'read',
      query: reviewQueueQuery,
    },
    async ({ userId, query }) => {
      // A folder that is unknown or someone else's is a 404, never an empty queue.
      if (query.folder && !(await ownsFolder(userId, query.folder)))
        return Response.json(
          {
            error: 'Not found',
          },
          {
            status: 404,
          },
        );
      return reviewQueue(userId, query.after, new Date(), query.folder);
    },
  ),
});
