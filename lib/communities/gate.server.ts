/**
 * The one gate every post/comment create in a community passes (server-only).
 *
 * Order, cheapest and most explicit first:
 *   1. flair (N1)         — required flair present and belongs to the community
 *   2. verification (S2)  — email / account age / member age
 *   3. AutoMod (N4)       — in-memory over the cached rules
 *
 * Mods and admins are exempt from 2 and 3 (they write the rules), never from 1.
 * The outcome is a plain value; the caller (the create route) performs the
 * refusal / hold / removal, because only it knows how its own content is stored.
 */
import { prisma } from '@/lib/prisma.server';
import { getCommunitySettings } from '@/lib/communities/settings.server';
import { flairBelongsTo } from '@/lib/communities/flairs.server';
import { getAutomodRules, recordModItem } from '@/lib/communities/automod.server';
import { checkVerification } from '@/lib/communities/verification';
import { evaluateAutomod, type AutomodPostKind } from '@/lib/communities/automod';

export type GateOutcome =
  | { kind: 'allow'; flag?: { ruleName: string } }
  | { kind: 'deny'; status: 400 | 403 | 404; code: string; error: string }
  | { kind: 'hold'; ruleName: string }
  | { kind: 'remove'; ruleName: string };

export async function gateCommunityContent(args: {
  communityId: string;
  userId: string;
  target: 'post' | 'comment';
  content: string;
  postKind: AutomodPostKind;
  flairId?: string | null;
}): Promise<GateOutcome> {
  const [settings, member, user, rules] = await Promise.all([
    getCommunitySettings(args.communityId),
    prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: args.communityId, userId: args.userId } },
      select: { role: true, joinedAt: true },
    }),
    prisma.user.findUnique({
      where: { id: args.userId },
      // Not a display shape: the gate only needs three account facts.
      // eslint-disable-next-line local/no-adhoc-user-select
      select: { emailVerified: true, createdAt: true, image: true },
    }),
    getAutomodRules(args.communityId),
  ]);
  if (!settings || !user) {
    return { kind: 'deny', status: 404, code: 'not_found', error: 'Community not found' };
  }
  const isMod = member?.role === 'MOD' || member?.role === 'ADMIN';

  // 1. Flair (posts only).
  if (args.target === 'post') {
    if (args.flairId) {
      if (!(await flairBelongsTo(args.communityId, args.flairId))) {
        return { kind: 'deny', status: 400, code: 'flair_invalid', error: 'Unknown flair' };
      }
    } else if (settings.flairRequired) {
      return {
        kind: 'deny',
        status: 400,
        code: 'flair_required',
        error: 'Choose a flair for your post — this community requires one.',
      };
    }
  }

  if (isMod) return { kind: 'allow' };

  // 2. Verification level.
  const verdict = checkVerification(settings.verification, {
    emailVerified: user.emailVerified === true,
    accountCreatedAt: user.createdAt,
    memberSince: member?.joinedAt ?? null,
  });
  if (!verdict.ok) {
    return {
      kind: 'deny',
      status: 403,
      code: `verification_${verdict.reason}`,
      error: verdict.message,
    };
  }

  // 3. AutoMod.
  const auto = evaluateAutomod(rules, {
    target: args.target,
    text: args.content,
    postKind: args.postKind,
    accountAgeDays: (Date.now() - user.createdAt.getTime()) / 86_400_000,
    hasAvatar: !!user.image,
  });
  if (!auto) return { kind: 'allow' };
  if (auto.action === 'remove') return { kind: 'remove', ruleName: auto.rule.name };
  if (auto.action === 'hold') return { kind: 'hold', ruleName: auto.rule.name };
  return { kind: 'allow', flag: { ruleName: auto.rule.name } };
}

/** Log content AutoMod refused outright (visible in the mod queue's log). */
export async function logRemoved(args: {
  communityId: string;
  entityType: 'rmhark' | 'comment';
  postId: string | null;
  authorId: string;
  ruleName: string;
  content: string;
}): Promise<void> {
  await recordModItem({
    communityId: args.communityId,
    entityType: args.entityType,
    entityId: null,
    postId: args.postId,
    authorId: args.authorId,
    action: 'remove',
    ruleName: args.ruleName,
    snapshot: args.content,
    status: 'REMOVED',
  }).catch((e) => console.error('automod log error:', e));
}
