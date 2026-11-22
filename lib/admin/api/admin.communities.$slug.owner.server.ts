import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/handover.contract';
import { assignOwnerBody } from '@/lib/communities/handover-schema';
import { refusalMessage, refusalStatus } from '@/lib/communities/handover';
import { assignOwnerAsAdmin } from '@/lib/communities/handover.server';
import { prisma } from '@/lib/prisma.server';

/**
 * PUT /api/admin/communities/$slug/owner — give a community to one of its moderators. Admin only, and only
 * while the owner is a deletion tombstone or banned: an active owner hands over through an offer. Recorded in
 * the admin audit log and the community's mod log.
 */
export const route = apiRoute('/api/admin/communities/$slug/owner', {
  PUT: implement(
    C.assignCommunityOwnerApi,
    { auth: 'admin', rateLimit: 'write', body: assignOwnerBody },
    async ({ params, session, body }) => {
      const community = await prisma.community.findUnique({
        where: { slug: params.slug },
        select: { id: true, slug: true, name: true },
      });
      if (!community) return Response.json({ error: 'Not found' }, { status: 404 });
      const result = await assignOwnerAsAdmin({
        community,
        adminId: session.user.id,
        toId: body.userId,
      });
      if (!result.ok) {
        return Response.json(
          { error: refusalMessage(result.code), code: result.code },
          { status: refusalStatus(result.code) },
        );
      }
      return { success: true as const };
    },
  ),
});
