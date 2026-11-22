import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { myStandingApi } from '@/lib/communities/bans.contract';
import { activeSanction } from '@/lib/communities/bans.server';
import { getCommunityBySlug } from '@/lib/communities/access.server';

/**
 * GET /api/communities/$slug/my-standing — the caller's own active ban or timeout
 * (kind and end only: never the moderators' private note or who set it), for the page notice.
 */
export const route = apiRoute('/api/communities/$slug/my-standing', {
  GET: implement(
    myStandingApi,
    {
      rateLimit: 'read',
    },
    async ({ params, userId }) => {
      const community = await getCommunityBySlug(params.slug);
      if (!community)
        return Response.json(
          {
            error: 'Not found',
          },
          {
            status: 404,
          },
        );
      const active = await activeSanction(community.id, userId);
      return {
        standing: active
          ? {
              kind: active.kind,
              endsAt: active.endsAt ? active.endsAt.toISOString() : null,
            }
          : null,
      };
    },
  ),
});
