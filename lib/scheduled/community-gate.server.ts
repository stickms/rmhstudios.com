/**
 * The community checks a scheduled/draft post must pass (server-only).
 *
 * The direct compose path (app/routes/api/rmharks.ts) refuses a community post
 * unless the author is a member and the community gate (flair, verification,
 * AutoMod) lets it through. A scheduled post used to store a client-supplied
 * `communityId` and publish it with none of that, so a banned/removed member, an
 * unverified newcomer, or text AutoMod would remove could be posted by scheduling
 * it. The same checks now run at SCHEDULE time (fail fast) and again at PUBLISH
 * time (membership and rules change in between).
 */
import { prisma } from '@/lib/prisma.server';
import { gateCommunityContent, logRemoved } from '@/lib/communities/gate.server';
import { derivePostKind } from '@/lib/communities/automod';

export type ScheduledCommunityVerdict =
  | {
      ok: true;
      /** AutoMod `hold`: publish as a held (invisible) post and queue it for mods. */
      held: boolean;
      /** The rule that held / flagged it, for the mod-queue entry. */
      ruleName: string | null;
      flagged: boolean;
    }
  | { ok: false; status: number; code: string; error: string; removedBy?: string };

export interface ScheduledCommunityInput {
  userId: string;
  communityId: string;
  content: string;
  gifUrl?: string | null;
  imageUrls?: readonly string[] | null;
  hasPoll?: boolean;
}

export async function checkScheduledCommunityPost(
  input: ScheduledCommunityInput,
): Promise<ScheduledCommunityVerdict> {
  const member = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: input.communityId, userId: input.userId } },
    select: { id: true },
  });
  if (!member) {
    return {
      ok: false,
      status: 403,
      code: 'not_member',
      error: 'Join the community to post in it',
    };
  }

  const gate = await gateCommunityContent({
    communityId: input.communityId,
    userId: input.userId,
    target: 'post',
    content: input.content,
    postKind: derivePostKind({
      content: input.content,
      gifUrl: input.gifUrl,
      imageUrls: input.imageUrls,
      hasPoll: !!input.hasPoll,
    }),
    // Scheduled posts carry no flair: a flair-required community refuses them
    // (`flair_required`) exactly as it would an unflaired direct post.
    flairId: null,
  });
  if (gate.kind === 'deny') {
    return { ok: false, status: gate.status, code: gate.code, error: gate.error };
  }
  if (gate.kind === 'remove') {
    return {
      ok: false,
      status: 422,
      code: 'automod_removed',
      error: `Your post was removed by this community's AutoMod rule "${gate.ruleName}".`,
      removedBy: gate.ruleName,
    };
  }
  if (gate.kind === 'hold')
    return { ok: true, held: true, ruleName: gate.ruleName, flagged: false };
  if (gate.flag) return { ok: true, held: false, ruleName: gate.flag.ruleName, flagged: true };
  return { ok: true, held: false, ruleName: null, flagged: false };
}

/** Log content AutoMod refused outright, as the direct path does. */
export async function logScheduledRemoval(
  input: ScheduledCommunityInput,
  ruleName: string,
): Promise<void> {
  await logRemoved({
    communityId: input.communityId,
    entityType: 'rmhark',
    postId: null,
    authorId: input.userId,
    ruleName,
    content: input.content,
  });
}
