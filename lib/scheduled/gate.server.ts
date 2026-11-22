/**
 * The community gate for a scheduled post (s09-11, server-only).
 *
 * A scheduled community post meets the same rules a live one meets: `prepareCommunityPost` (membership, sanctions,
 * flair, image descriptions, AutoMod, challenge window). This adapter turns a stored draft into its input and the
 * result back into the three things the publisher does: publish, hold into the mod queue, or leave the draft.
 */
import type { ScheduledPost } from '@prisma/client';
import { prepareCommunityPost } from '@/lib/communities/post-gate.server';
import { ALT_REQUIRED_CODE } from '@/lib/communities/alt-required';

export type ScheduledGateOutcome =
  | {
      kind: 'allow';
      /** A rule that flagged the visible post for the moderators, or null. */
      flagRule: string | null;
    }
  | {
      /** AutoMod holds the post: it is stored held and queued, and counts as published. */
      kind: 'hold';
      holdRule: string;
    }
  | {
      /**
       * The draft stays a draft and the author is told once: an image-description refusal keeps its own notice,
       * everything else (not a member, a ban or timeout, a rule the author must fix) gets `scheduled-refused` with the
       * reason. A ban or timeout that ends lets a later due pass publish the draft (`DUE_REFUSAL_BACKOFF_MS`).
       */
      kind: 'refuse';
      notice: 'alt-required' | 'refused';
      reason: string;
    };

export type ScheduledGateInput = Pick<
  ScheduledPost,
  'communityId' | 'userId' | 'content' | 'imageUrls' | 'imageAlts' | 'gifUrl' | 'gifAlt' | 'poll'
>;

/** Run the gate for a stored draft. Only a community post has one; anything else is allowed. */
export async function evaluateScheduledGate(sp: ScheduledGateInput): Promise<ScheduledGateOutcome> {
  if (!sp.communityId) return { kind: 'allow', flagRule: null };
  const prepared = await prepareCommunityPost({
    communityId: sp.communityId,
    userId: sp.userId,
    content: sp.content.trim(),
    imageUrls: sp.imageUrls ?? [],
    imageAlts: sp.imageAlts ?? [],
    gifUrl: sp.gifUrl,
    gifAlt: sp.gifAlt,
    hasPoll: sp.poll != null,
  });
  if (!prepared.ok) {
    const code = prepared.refusal.code;
    return {
      kind: 'refuse',
      notice: code === ALT_REQUIRED_CODE ? 'alt-required' : 'refused',
      reason: prepared.refusal.body.error,
    };
  }
  if (prepared.held) return { kind: 'hold', holdRule: prepared.holdRule };
  return { kind: 'allow', flagRule: prepared.flagRule };
}
