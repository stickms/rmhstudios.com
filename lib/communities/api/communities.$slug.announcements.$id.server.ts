import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/communities.contract';
import { prisma } from '@/lib/prisma.server';
import { logModAction } from '@/lib/communities/modlog.server';
import { getCommunityBySlug, getRole, canModerate } from '@/lib/communities/access.server';

/** DELETE /api/communities/$slug/announcements/$id — remove (author or mods/admins). */
export const route = apiRoute('/api/communities/$slug/announcements/$id', {
  DELETE: implement(C.deleteCommunityAnnouncementApi, {}, async ({ params, session }) => {
    const community = await getCommunityBySlug(params.slug);
    if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

    const ann = await prisma.communityAnnouncement.findUnique({
      where: { id: params.id },
      select: { id: true, communityId: true, authorId: true },
    });
    if (!ann || ann.communityId !== community.id) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const role = await getRole(community.id, session.user.id);
    const isAuthor = ann.authorId === session.user.id;
    if (!isAuthor && !canModerate(role)) {
      return Response.json({ ...refusalBody('COMMUNITY_NOT_ALLOWED') }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.communityAnnouncement.delete({ where: { id: ann.id } });
      // A moderator taking down an announcement is a moderation action; an author
      // deleting their own post after losing the role is not.
      if (canModerate(role)) {
        await logModAction(tx, {
          communityId: community.id,
          actorId: session.user.id,
          action: 'announcement_removed',
          targetUserId: ann.authorId,
          targetType: 'announcement',
          targetId: ann.id,
        });
      }
    });
    return Response.json({ success: true });
  }),
});
