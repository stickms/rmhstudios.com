import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { MAX_TEAMMATES, teamRefusalMessage, teamRefusalStatus, type TeamRefusal } from '@/lib/competitive/jam-teams';
import { inviteTeammateBody, removeTeammateQuery } from '@/lib/competitive/jam-teams-schema';
import { inviteTeammateApi, listTeamApi, removeTeammateApi } from '@/lib/competitive/jam-teams.contract';
import { inviteTeammate, leaveTeam, listTeam, removeTeammate } from '@/lib/competitive/jam-teams.server';

function refused(code: TeamRefusal, entry?: string): Response {
  return Response.json(
    { error: teamRefusalMessage(code), code, ...(entry === undefined ? {} : { entry }) },
    { status: teamRefusalStatus(code) },
  );
}

/**
 * GET    /api/jams/$slug/entries/$entryId/team            — the team (submitter: every row; others: the accepted ones and their own).
 * POST   /api/jams/$slug/entries/$entryId/team            — the submitter invites a member `{ userId }`.
 * DELETE /api/jams/$slug/entries/$entryId/team?userId=…   — the submitter removes one; a member removes themself (leaves).
 */
export const route = apiRoute('/api/jams/$slug/entries/$entryId/team', {
  GET: implement(listTeamApi, { auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
    const result = await listTeam({ slug: params.slug, entryId: params.entryId, actorId: userId });
    return result.ok
      ? Response.json({ team: result.value, max: MAX_TEAMMATES }, { headers: { 'Cache-Control': 'private, no-store' } })
      : refused(result.code);
  }),

  POST: implement(
    inviteTeammateApi,
    { rateLimit: 'write', body: inviteTeammateBody },
    async ({ params, userId, body }) => {
      const result = await inviteTeammate({
        slug: params.slug,
        entryId: params.entryId,
        actorId: userId,
        userId: body.userId,
      });
      return result.ok ? { member: result.value } : refused(result.code, result.entryTitle);
    },
  ),

  DELETE: implement(
    removeTeammateApi,
    { rateLimit: 'write', query: removeTeammateQuery },
    async ({ params, userId, query }) => {
      const result =
        query.userId === userId
          ? await leaveTeam({ slug: params.slug, entryId: params.entryId, userId })
          : await removeTeammate({ slug: params.slug, entryId: params.entryId, actorId: userId, userId: query.userId });
      return result.ok ? { success: true as const } : refused(result.code);
    },
  ),
});
