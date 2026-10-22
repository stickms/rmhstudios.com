import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { acceptInvite } from '@/lib/communities/invites.server';
import { dropCommunityWatch } from '@/lib/discovery/watch.server';

/**
 * POST /api/communities/$slug/join — toggle membership (join-only with an invite).
 *
 * A private community can only be joined with `{ invite: code }` (or by a
 * moderator approving a join request); the code is validated and consumed
 * atomically in `acceptInvite`, and every invalid code answers the same generic
 * 404. Without a valid invite it is a plain 404 as for a missing community.
 */
export const Route = createFileRoute('/api/communities/$slug/join')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'community-join' },
          body: z.object({ invite: z.string().min(1).max(64).optional() }),
          allowEmptyBody: true,
        },
        async ({ params, session, body }) => {
          const community = await prisma.community.findUnique({
            where: { slug: params.slug },
            select: { id: true, createdById: true, isPrivate: true },
          });
          if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

          const userId = session.user.id;
          const existing = await prisma.communityMember.findUnique({
            where: { communityId_userId: { communityId: community.id, userId } },
            select: { id: true },
          });

          // An invite is a request to join, never a toggle: repeating it (a double
          // submit, a second open invite tab) must not turn into a leave.
          if (body?.invite && existing) {
            return Response.json({ success: true, joined: true });
          }

          if (community.isPrivate && !existing) {
            const accepted = body?.invite
              ? await acceptInvite(community.id, userId, body.invite)
              : null;
            if (!accepted?.ok) {
              return Response.json({ error: "This invite isn't valid" }, { status: 404 });
            }
            return Response.json({ success: true, joined: true });
          }

          if (existing) {
            // The creator can't leave their own community.
            if (community.createdById === userId) {
              return Response.json(
                { error: 'The creator cannot leave the community' },
                { status: 400 },
              );
            }
            await prisma.$transaction([
              prisma.communityMember.delete({ where: { id: existing.id } }),
              prisma.community.update({
                where: { id: community.id },
                data: { memberCount: { decrement: 1 } },
              }),
              // Leaving ends the community watch (private previews stop flowing).
              dropCommunityWatch(community.id, userId),
            ]);
            return Response.json({ success: true, joined: false });
          }

          await prisma.$transaction([
            prisma.communityMember.create({ data: { communityId: community.id, userId } }),
            prisma.community.update({
              where: { id: community.id },
              data: { memberCount: { increment: 1 } },
            }),
          ]);
          return Response.json({ success: true, joined: true });
        },
      ),
    },
  },
});
