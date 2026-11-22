import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/handover.contract';
import { offerHandoverBody } from '@/lib/communities/handover-schema';
import { refusalMessage, refusalStatus } from '@/lib/communities/handover';
import { getCommunityBySlug } from '@/lib/communities/access.server';
import { cancelHandover, getHandoverStatus, offerHandover } from '@/lib/communities/handover.server';
import { prisma } from '@/lib/prisma.server';

/**
 * GET    /api/communities/$slug/handover — the viewer's side of the ownership handover: the owner gets the
 *        pending offer and the moderators to choose from, the offered moderator gets the offer, anyone else
 *        nothing.
 * POST   /api/communities/$slug/handover — the owner offers the community to one moderator (7 days).
 * DELETE /api/communities/$slug/handover — the owner withdraws the pending offer.
 *
 * Owner and moderator checks happen again inside the transaction (`handover.server.ts`); the reads here only
 * resolve the community and keep a private community's slug from answering a stranger.
 */
const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

export const route = apiRoute('/api/communities/$slug/handover', {
  GET: implement(C.getHandoverApi, { rateLimit: 'read' }, async ({ params, session }) => {
    const community = await getCommunityBySlug(params.slug);
    if (!community) return notFound();
    return getHandoverStatus(community.id, community.createdById, session.user.id);
  }),
  POST: implement(
    C.offerHandoverApi,
    { rateLimit: 'write', body: offerHandoverBody },
    async ({ params, session, body }) => {
      const found = await prisma.community.findUnique({
        where: { slug: params.slug },
        select: { id: true, slug: true, name: true },
      });
      if (!found) return notFound();
      const result = await offerHandover({
        community: found,
        ownerId: session.user.id,
        toId: body.toId,
      });
      if (!result.ok) {
        return Response.json(
          { error: refusalMessage(result.code), code: result.code },
          { status: refusalStatus(result.code) },
        );
      }
      return { offer: result.value };
    },
  ),
  DELETE: implement(C.cancelHandoverApi, { rateLimit: 'write' }, async ({ params, session }) => {
    const found = await prisma.community.findUnique({
      where: { slug: params.slug },
      select: { id: true, slug: true, name: true },
    });
    if (!found) return notFound();
    const result = await cancelHandover({ community: found, ownerId: session.user.id });
    if (!result.ok) {
      return Response.json(
        { error: refusalMessage(result.code), code: result.code },
        { status: refusalStatus(result.code) },
      );
    }
    return { success: true as const };
  }),
});
