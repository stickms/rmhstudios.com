import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/handover.contract';
import { respondHandoverBody } from '@/lib/communities/handover-schema';
import { refusalMessage, refusalStatus } from '@/lib/communities/handover';
import { respondHandover } from '@/lib/communities/handover.server';
import { prisma } from '@/lib/prisma.server';

/**
 * POST /api/communities/$slug/handover/respond — the offered moderator accepts (the community becomes theirs,
 * the previous owner becomes a moderator, the mod log records it) or declines. Only the member the offer is
 * addressed to may answer, and an accept re-checks in its transaction that they are still a moderator.
 */
export const route = apiRoute('/api/communities/$slug/handover/respond', {
  POST: implement(
    C.respondHandoverApi,
    { rateLimit: 'write', body: respondHandoverBody },
    async ({ params, session, body }) => {
      const community = await prisma.community.findUnique({
        where: { slug: params.slug },
        select: { id: true, slug: true, name: true },
      });
      if (!community) return Response.json({ error: 'Not found' }, { status: 404 });
      const result = await respondHandover({
        community,
        userId: session.user.id,
        action: body.action,
      });
      if (!result.ok) {
        return Response.json(
          { error: refusalMessage(result.code), code: result.code },
          { status: refusalStatus(result.code) },
        );
      }
      return { success: true as const, action: body.action };
    },
  ),
});
