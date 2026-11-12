import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { voteRequestApi } from '@/lib/requests/requests.contract';
import { toggleVote, RequestBoardError } from '@/lib/requests/board.server';

/**
 * POST /api/requests/:id/vote — toggle the caller's single vote.
 *
 * The response carries the id the vote actually landed on, which is not always
 * the id in the URL: voting on a merged duplicate credits its merge target, so
 * the client re-renders the row that changed rather than the one that was
 * clicked.
 */
export const route = apiRoute('/api/requests/$id/vote', {
  POST: implement(
    voteRequestApi,
    { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'request-vote', scope: 'user' } },
    async ({ params, userId }) => {
      try {
        return Response.json(await toggleVote(userId, params.id));
      } catch (error) {
        if (error instanceof RequestBoardError) {
          return Response.json(
            { error: error.message },
            { status: error.code === 'NOT_FOUND' ? 404 : 409 },
          );
        }
        throw error;
      }
    },
  ),
});
