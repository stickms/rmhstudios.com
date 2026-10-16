/**
 * N4 — AutoMod rules + the community mod queue (server-only).
 *
 * E1 (a per-community queue) was planned but never built — the only queue that
 * existed was the site-wide `ContentReport` list that admins work. Community
 * mods needed their own, so `community_mod_item` is that queue; AutoMod's
 * "hold for review" lands in it. Nothing here duplicates the admin report queue.
 *
 * Rules are cached per community (5 min) and evaluated in memory on every
 * post/comment; any edit busts the entry in this process.
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { createComment } from '@/lib/social/engagement.server';
import { linkPostHashtags, unlinkPostHashtags } from '@/lib/tags-extract.server';
import {
  AUTOMOD_MAX_RULES,
  automodConditionsSchema,
  type AutomodAction,
  type AutomodAppliesTo,
  type AutomodRule,
  type AutomodRuleInput,
} from '@/lib/communities/automod';
import type { ModItemDTO } from '@/lib/communities/plus-schema';

/** `deletedBy` marker for a post AutoMod is holding (VarChar(12)). */
export const HELD_BY = 'automod_hold';

const RULES_TTL_MS = 5 * 60_000;
const rulesKey = (communityId: string) => `community:automod:${communityId}`;

export function bustAutomod(communityId: string): void {
  apiCache.invalidate(rulesKey(communityId));
}

export class AutomodError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export interface StoredRule extends AutomodRule {
  position: number;
}

export async function getAutomodRules(communityId: string): Promise<StoredRule[]> {
  const hit = apiCache.get<StoredRule[]>(rulesKey(communityId));
  if (hit) return hit;
  const rows = await prisma.communityAutomodRule.findMany({
    where: { communityId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    take: AUTOMOD_MAX_RULES,
  });
  const rules: StoredRule[] = [];
  for (const r of rows) {
    const parsed = automodConditionsSchema.safeParse(r.conditions);
    if (!parsed.success) continue; // a corrupt row must not take posting down
    rules.push({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      appliesTo: r.appliesTo as AutomodAppliesTo,
      action: r.action as AutomodAction,
      conditions: parsed.data,
      position: r.position,
    });
  }
  apiCache.set(rulesKey(communityId), rules, RULES_TTL_MS);
  return rules;
}

export async function createAutomodRule(
  communityId: string,
  input: AutomodRuleInput,
): Promise<StoredRule> {
  const count = await prisma.communityAutomodRule.count({ where: { communityId } });
  if (count >= AUTOMOD_MAX_RULES) {
    throw new AutomodError(`A community can have at most ${AUTOMOD_MAX_RULES} AutoMod rules`, 400);
  }
  const row = await prisma.communityAutomodRule.create({
    data: {
      communityId,
      name: input.name,
      enabled: input.enabled,
      appliesTo: input.appliesTo,
      action: input.action,
      conditions: input.conditions,
      position: count,
    },
  });
  bustAutomod(communityId);
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    appliesTo: row.appliesTo as AutomodAppliesTo,
    action: row.action as AutomodAction,
    conditions: input.conditions,
    position: row.position,
  };
}

export async function updateAutomodRule(
  communityId: string,
  ruleId: string,
  input: Partial<AutomodRuleInput>,
): Promise<void> {
  const res = await prisma.communityAutomodRule.updateMany({
    where: { id: ruleId, communityId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.appliesTo !== undefined ? { appliesTo: input.appliesTo } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
    },
  });
  bustAutomod(communityId);
  if (res.count === 0) throw new AutomodError('Rule not found', 404);
}

export async function deleteAutomodRule(communityId: string, ruleId: string): Promise<void> {
  const res = await prisma.communityAutomodRule.deleteMany({ where: { id: ruleId, communityId } });
  bustAutomod(communityId);
  if (res.count === 0) throw new AutomodError('Rule not found', 404);
}

/* -------------------------------------------------------------------------- */
/* Mod queue                                                                  */
/* -------------------------------------------------------------------------- */

export async function recordModItem(args: {
  communityId: string;
  entityType: 'rmhark' | 'comment';
  entityId: string | null;
  postId: string | null;
  authorId: string;
  action: AutomodAction;
  ruleName: string;
  snapshot: string;
  payload?: { content: string; parentId: string | null };
  status?: 'PENDING' | 'REMOVED';
}): Promise<string> {
  const row = await prisma.communityModItem.create({
    data: {
      communityId: args.communityId,
      entityType: args.entityType,
      entityId: args.entityId,
      postId: args.postId,
      authorId: args.authorId,
      action: args.action,
      ruleName: args.ruleName.slice(0, 60),
      snapshot: args.snapshot.slice(0, 300),
      payload: args.payload ?? undefined,
      status: args.status ?? 'PENDING',
    },
    select: { id: true },
  });
  return row.id;
}

export async function listModItems(
  communityId: string,
  view: 'pending' | 'log',
): Promise<ModItemDTO[]> {
  const rows = await prisma.communityModItem.findMany({
    where: { communityId, status: view === 'pending' ? 'PENDING' : { not: 'PENDING' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { author: { select: userDisplaySelect } },
  });
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType as ModItemDTO['entityType'],
    entityId: r.entityId,
    postId: r.postId,
    action: r.action as ModItemDTO['action'],
    ruleName: r.ruleName,
    snapshot: r.snapshot,
    status: r.status as ModItemDTO['status'],
    createdAt: r.createdAt.toISOString(),
    author: resolveUser(r.author),
  }));
}

export async function pendingModCount(communityId: string): Promise<number> {
  return prisma.communityModItem.count({ where: { communityId, status: 'PENDING' } });
}

/**
 * Resolve a queue item. `approve` lets held content through (or dismisses a
 * flag); `remove` takes it down (or keeps a held item down). Idempotent: only a
 * PENDING item can be resolved, claimed with a conditional update.
 */
export async function resolveModItem(
  communityId: string,
  itemId: string,
  decision: 'approve' | 'remove',
  moderatorId: string,
): Promise<{ status: 'APPROVED' | 'REMOVED' }> {
  const item = await prisma.communityModItem.findFirst({
    where: { id: itemId, communityId },
  });
  if (!item) throw new AutomodError('Item not found', 404);
  if (item.status !== 'PENDING') throw new AutomodError('Already resolved', 409);

  const status = decision === 'approve' ? 'APPROVED' : 'REMOVED';
  const claimed = await prisma.communityModItem.updateMany({
    where: { id: itemId, status: 'PENDING' },
    data: { status, resolvedById: moderatorId, resolvedAt: new Date() },
  });
  if (claimed.count === 0) throw new AutomodError('Already resolved', 409);

  try {
    if (item.entityType === 'rmhark' && item.entityId) {
      await resolvePost(item.entityId, communityId, item.action as AutomodAction, decision);
    } else if (item.entityType === 'comment') {
      await resolveComment(item, decision);
    }
  } catch (e) {
    // Put the item back so a transient failure doesn't lose it from the queue.
    await prisma.communityModItem.updateMany({
      where: { id: itemId },
      data: { status: 'PENDING', resolvedById: null, resolvedAt: null },
    });
    throw e;
  }
  return { status };
}

async function resolvePost(
  postId: string,
  communityId: string,
  action: AutomodAction,
  decision: 'approve' | 'remove',
): Promise<void> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, content: true, deletedAt: true, deletedBy: true },
  });
  if (!post) return; // already purged — nothing to do
  if (action === 'hold') {
    if (decision === 'approve' && post.deletedAt && post.deletedBy === HELD_BY) {
      await prisma.$transaction(async (tx) => {
        await tx.rMHark.update({
          where: { id: postId },
          data: { deletedAt: null, deletedBy: null },
        });
        await linkPostHashtags(tx, postId, post.content);
        await tx.user.update({ where: { id: post.userId }, data: { postCount: { increment: 1 } } });
        await tx.community.update({
          where: { id: communityId },
          data: { postCount: { increment: 1 } },
        });
      });
    } else if (decision === 'remove' && post.deletedBy === HELD_BY) {
      await prisma.rMHark.update({ where: { id: postId }, data: { deletedBy: 'moderator' } });
    }
    return;
  }
  // flag: the content is live. "Approve" just dismisses; "remove" takes it down.
  if (decision === 'remove' && !post.deletedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.rMHark.update({
        where: { id: postId },
        data: { deletedAt: new Date(), deletedBy: 'moderator' },
      });
      await unlinkPostHashtags(tx, postId);
      await tx.user.updateMany({
        where: { id: post.userId, postCount: { gt: 0 } },
        data: { postCount: { decrement: 1 } },
      });
      await tx.community.updateMany({
        where: { id: communityId, postCount: { gt: 0 } },
        data: { postCount: { decrement: 1 } },
      });
    });
  }
}

async function resolveComment(
  item: {
    id: string;
    action: string;
    entityId: string | null;
    postId: string | null;
    authorId: string;
    payload: unknown;
  },
  decision: 'approve' | 'remove',
): Promise<void> {
  if (item.action === 'hold') {
    if (decision !== 'approve') return;
    const payload = item.payload as { content?: string; parentId?: string | null } | null;
    if (!payload?.content || !item.postId) return;
    const result = await createComment({
      userId: item.authorId,
      postId: item.postId,
      content: payload.content,
      parentId: payload.parentId ?? null,
    });
    if (result.ok && result.comment) {
      if (payload.parentId) {
        await prisma.rMHarkComment
          .update({ where: { id: payload.parentId }, data: { replyCount: { increment: 1 } } })
          .catch(() => {});
      }
      await prisma.communityModItem.update({
        where: { id: item.id },
        data: { entityId: result.comment.id },
      });
    }
    return;
  }
  if (decision === 'remove' && item.entityId) {
    await prisma.rMHarkComment.updateMany({
      where: { id: item.entityId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: 'moderator' },
    });
  }
}
