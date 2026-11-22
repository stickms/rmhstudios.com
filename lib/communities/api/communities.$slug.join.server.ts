import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/communities.contract';
import { joinCommunityBody } from '@/lib/communities/communities-schema';
import { prisma } from '@/lib/prisma.server';
import { acceptInvite } from '@/lib/communities/invites.server';
import { agreementRequired } from '@/lib/communities/rules.server';
import { activeSanction } from '@/lib/communities/bans.server';
import { denyCode, denyText } from '@/lib/communities/bans';
import { recordMemberEvent } from '@/lib/communities/member-events.server';

/**
 * POST /api/communities/$slug/join — toggle membership (join-only with an invite).
 *
 * A private community can only be joined with `{ invite: code }` (or by a
 * moderator approving a join request); the code is validated and consumed
 * atomically in `acceptInvite`, and every invalid code answers the same generic
 * 404. Without a valid invite it is a plain 404 as for a missing community.
 */
export const route = apiRoute('/api/communities/$slug/join', {
  POST: implement(
    C.joinCommunityApi,
    {
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'community-join' },
      body: joinCommunityBody,
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

      // A banned member cannot join, with or without an invite (FR-3).
      if (!existing) {
        const banned = await activeSanction(community.id, userId);
        if (banned) {
          return Response.json(
            {
              error: denyText(banned.kind, banned.endsAt),
              code: denyCode(banned.kind),
              endsAt: banned.endsAt ? banned.endsAt.toISOString() : null,
            },
            { status: 403 },
          );
        }
      }

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
          return Response.json({ ...refusalBody('COMMUNITY_INVITE_INVALID') }, { status: 404 });
        }
        return Response.json({ success: true, joined: true });
      }

      if (existing) {
        // The creator can't leave their own community.
        if (community.createdById === userId) {
          return Response.json(
            { ...refusalBody('COMMUNITY_CREATOR_CANNOT_LEAVE') },
            { status: 400 },
          );
        }
        await prisma.$transaction([
          prisma.communityMember.delete({ where: { id: existing.id } }),
          prisma.community.update({
            where: { id: community.id },
            data: { memberCount: { decrement: 1 } },
          }),
          recordMemberEvent(prisma, community.id, userId, 'leave'),
        ]);
        return Response.json({ success: true, joined: false });
      }

      // "Require agreement": the Join only completes once the member ticked the rules.
      // (A private community's invite join cannot show them first, so it is not gated.)
      if (!body?.acceptRules && (await agreementRequired(community.id))) {
        return Response.json(
          { error: 'Read and accept the community rules to join', code: 'rules-agreement-required' },
          { status: 400 },
        );
      }

      await prisma.$transaction([
        prisma.communityMember.create({
          data: {
            communityId: community.id,
            userId,
            ...(body?.acceptRules ? { rulesAcceptedAt: new Date() } : {}),
          },
        }),
        prisma.community.update({
          where: { id: community.id },
          data: { memberCount: { increment: 1 } },
        }),
        recordMemberEvent(prisma, community.id, userId, 'join'),
      ]);
      return Response.json({ success: true, joined: true });
    },
  ),
});
