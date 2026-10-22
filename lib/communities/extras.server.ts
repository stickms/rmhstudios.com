/**
 * The lazy "extras" bundle for a community page (server-only).
 *
 * The `/c/$slug` loader is deliberately untouched: flairs, the Related rail,
 * the viewer's posting status and any pending onboarding questions arrive in ONE
 * request the page makes after first paint, from cached reads wherever possible.
 */
import { prisma } from '@/lib/prisma.server';
import { listFlairs } from '@/lib/communities/flairs.server';
import { getSisters } from '@/lib/communities/sisters.server';
import { getUnansweredQuestions } from '@/lib/communities/onboarding.server';
import { getCommunitySettings } from '@/lib/communities/settings.server';
import { checkVerification } from '@/lib/communities/verification';
import type { CommunityExtrasDTO, PostingStatusDTO } from '@/lib/communities/plus';

export async function getCommunityExtras(
  slug: string,
  viewerId: string | null,
): Promise<CommunityExtrasDTO | null> {
  const community = await prisma.community.findUnique({
    where: { slug },
    select: { id: true, isPrivate: true },
  });
  if (!community) return null;

  const [settings, flairs, sisters, member, user] = await Promise.all([
    getCommunitySettings(community.id),
    listFlairs(community.id),
    getSisters(community.id),
    viewerId
      ? prisma.communityMember.findUnique({
          where: { communityId_userId: { communityId: community.id, userId: viewerId } },
          select: { role: true, joinedAt: true, followedFlairIds: true, roleTags: true },
        })
      : Promise.resolve(null),
    viewerId
      ? prisma.user.findUnique({
          where: { id: viewerId },
          select: { emailVerified: true, createdAt: true },
        })
      : Promise.resolve(null),
  ]);
  if (!settings) return null;
  // Members-only: a non-member of a private community gets "not found".
  if (community.isPrivate && !member) return null;

  const isMod = member?.role === 'MOD' || member?.role === 'ADMIN';
  let posting: PostingStatusDTO = { ok: true };
  if (viewerId && user && !isMod) {
    const v = checkVerification(settings.verification, {
      emailVerified: user.emailVerified === true,
      accountCreatedAt: user.createdAt,
      memberSince: member?.joinedAt ?? null,
    });
    if (!v.ok) {
      posting = {
        ok: false,
        reason: v.reason,
        remainingMs: v.remainingMs,
        value: v.value,
        message: v.message,
      };
    }
  }

  const onboarding = viewerId && member ? await getUnansweredQuestions(community.id, viewerId) : [];

  return {
    flairs,
    flairRequired: settings.flairRequired,
    starThreshold: settings.starThreshold,
    verification: settings.verification,
    posting,
    sisters,
    member: member
      ? {
          followedFlairIds: member.followedFlairIds,
          roleTags: member.roleTags,
          onboarding,
        }
      : null,
  };
}
