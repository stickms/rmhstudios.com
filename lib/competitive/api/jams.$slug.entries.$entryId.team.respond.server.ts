import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { teamRefusalMessage, teamRefusalStatus } from '@/lib/competitive/jam-teams';
import { respondTeamBody } from '@/lib/competitive/jam-teams-schema';
import { respondTeamApi } from '@/lib/competitive/jam-teams.contract';
import { respondToTeamInvite } from '@/lib/competitive/jam-teams.server';

/**
 * POST /api/jams/$slug/entries/$entryId/team/respond — the invited member accepts (they are credited and the
 * submitter is told) or declines (the invitation is deleted). Only the member it is addressed to can answer.
 */
export const route = apiRoute('/api/jams/$slug/entries/$entryId/team/respond', {
  POST: implement(respondTeamApi, { rateLimit: 'write', body: respondTeamBody }, async ({ params, userId, body }) => {
    const result = await respondToTeamInvite({
      slug: params.slug,
      entryId: params.entryId,
      userId,
      accept: body.accept,
    });
    if (!result.ok) {
      return Response.json(
        {
          error: teamRefusalMessage(result.code),
          code: result.code,
          ...(result.entryTitle === undefined ? {} : { entry: result.entryTitle }),
        },
        { status: teamRefusalStatus(result.code) },
      );
    }
    return { success: true as const, accept: body.accept };
  }),
});
