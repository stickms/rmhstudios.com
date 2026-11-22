import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireMod, requireReadable } from '@/lib/communities/guard.server';
import { getModLogApi } from '@/lib/communities/modlog.contract';
import { modLogQuery } from '@/lib/communities/modlog-schema';
import { listModLog, listPublicModLog } from '@/lib/communities/modlog.server';
import { prisma } from '@/lib/prisma.server';

/**
 * GET /api/communities/$slug/modlog?scope=full|public&group=&actor=&cursor= — the
 * community's moderation log, newest first, 50 a page.
 *  - `full` (the default): every action, with the moderator's name. Moderators only.
 *  - `public`: only content decisions with their rule and reason, no actor and no
 *    target member. Anyone who can read the community, once a moderator turned the
 *    public log on; a community without it answers 404.
 */
export const route = apiRoute('/api/communities/$slug/modlog', {
  GET: implement(
    getModLogApi,
    {
      auth: 'optional',
      rateLimit: 'read',
      query: modLogQuery,
    },
    async ({ params, userId, query }) => {
      if (query.scope === 'public') {
        const guard = await requireReadable(params.slug, userId);
        if (!guard.ok) return guard.response;
        const row = await prisma.community.findUnique({
          where: {
            id: guard.value.id,
          },
          select: {
            publicModLog: true,
          },
        });
        if (!row?.publicModLog)
          return Response.json(
            {
              error: 'Not found',
            },
            {
              status: 404,
            },
          );
        const page = await listPublicModLog(guard.value.id, query.cursor);
        return {
          scope: 'public' as const,
          ...page,
        };
      }
      if (!userId)
        return Response.json(
          {
            error: 'Sign in required',
          },
          {
            status: 401,
          },
        );
      const guard = await requireMod(params.slug, userId);
      if (!guard.ok) return guard.response;
      const page = await listModLog(guard.value.id, {
        group: query.group,
        actorId: query.actor,
        cursor: query.cursor,
      });
      return {
        scope: 'full' as const,
        ...page,
      };
    },
  ),
});
