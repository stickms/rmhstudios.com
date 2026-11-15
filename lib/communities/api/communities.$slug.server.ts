import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/communities.contract';
import { getCommunity } from '@/lib/community.server';

/** GET /api/communities/$slug — community details + viewer membership. */
export const route = apiRoute('/api/communities/$slug', {
  GET: implement(C.getCommunityApi, { auth: 'optional' }, async ({ params, session }) => {
    const community = await getCommunity(params.slug, session?.user.id ?? null);
    if (!community) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(community);
  }),
});
