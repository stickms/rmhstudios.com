/**
 * Adapters from the v1 moderation shapes (`/api/v1/communities/{slug}/modqueue*` and `/sanctions*`, scope
 * `manage:moderation`) to the functions the site uses. Every function acts as the key owner and takes no other
 * member's id as the actor: the moderator check is the site's rule (`canModerate` on the owner's role in that
 * community, read on every call, never cached on the key); a decision is `decideModItem`; a sanction is the
 * site's `sanction` and `lift`, which hold the rules (moderators act on members, only the owner sanctions a
 * moderator, nobody sanctions the owner) and write the mod log. Held post text goes through the API serialiser.
 */
import type { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { checkRateLimit } from '@/lib/rate-limit.server';
import { RATE_LIMIT_POLICIES } from '@/lib/rate-limit';
import { communityWithRole } from '@/lib/communities/guard.server';
import { canModerate } from '@/lib/communities/access.server';
import { decideModItem } from '@/lib/communities/mod-decisions.server';
import { lift, sanction } from '@/lib/communities/bans.server';
import { activeWhere, asKind } from '@/lib/communities/sanction-read.server';
import { userChipSelect } from '@/lib/user-display';
import { apiAuthorSelect, serializePublicPost, serializeAuthor } from '@/lib/api/serializers.server';
import { citedRule, reporterCount } from '@/lib/communities/rules.server';
import {
  DECISIONS_PER_HOUR,
  DEFAULT_DURATION,
  SANCTIONS_PER_HOUR,
  type createSanctionApiBody,
  type decisionBody,
} from '@/lib/api/v1/moderation-schema';

export type ModerationFailure = {
  code:
    | 'not_found'
    | 'not_moderator'
    | 'invalid_request'
    | 'rule_not_found'
    | 'item_resolved'
    | 'sanction_refused'
    | 'rate_limited';
  message: string;
  status: 400 | 403 | 404 | 409 | 429;
};
export type ModerationResult<T> = { ok: true; result: T } | ({ ok: false } & ModerationFailure);

const fail = (code: ModerationFailure['code'], message: string, status: ModerationFailure['status']) =>
  ({ ok: false, code, message, status }) as const;

export interface ModeratedCommunity {
  id: string;
  slug: string;
  name: string;
  role: 'MOD' | 'ADMIN';
}

/**
 * The community, when the key owner moderates it NOW. A private community of which the owner is not a member is
 * `not_found` (the same answer as a community that does not exist); a member who is not a moderator is
 * `not_moderator`. Read per request: a demoted moderator's key stops working on its next call.
 */
export async function moderatedCommunity(slug: string, userId: string): Promise<ModerationResult<ModeratedCommunity>> {
  const ctx = await communityWithRole(slug, userId);
  if (!ctx || (ctx.isPrivate && !ctx.role)) return fail('not_found', 'Community not found.', 404);
  if (!canModerate(ctx.role) || (ctx.role !== 'MOD' && ctx.role !== 'ADMIN')) {
    return fail('not_moderator', 'Only a moderator of this community can do that.', 403);
  }
  return { ok: true, result: { id: ctx.id, slug: ctx.slug, name: ctx.name, role: ctx.role } };
}

/** The write class, per key owner, on top of the route's own hourly ceiling. */
export async function writeBudgetExceeded(userId: string): Promise<boolean> {
  return !(await checkRateLimit(userId, { ...RATE_LIMIT_POLICIES.write, prefix: 'v1-moderation-write' })).allowed;
}

/** At most 120 decisions and 30 sanctions (create or lift) per key per hour. */
export async function hourlyBudgetExceeded(keyId: string, kind: 'decision' | 'sanction'): Promise<boolean> {
  return !(
    await checkRateLimit(keyId, {
      limit: kind === 'decision' ? DECISIONS_PER_HOUR : SANCTIONS_PER_HOUR,
      windowMs: 3_600_000,
      prefix: `v1-moderation-${kind}`,
      // A ceiling the API documents, so the deployment-wide multiplier does not widen it.
      applyMultiplier: false,
    })
  ).allowed;
}

/* ── The mod queue ─────────────────────────────────────────────────────────────────────────────────────────── */

export interface ApiModItem {
  id: string;
  type: 'post' | 'comment';
  action: 'flag' | 'hold' | 'remove' | 'report';
  status: 'PENDING' | 'APPROVED' | 'REMOVED';
  ruleName: string;
  snapshot: string;
  reporters: number | null;
  citedRule: { position: number; title: string } | null;
  createdAt: string;
  author: ReturnType<typeof serializeAuthor>;
  /** The held or flagged post as the API serialises any post, or null for a comment or a purged post. */
  post: ReturnType<typeof serializePublicPost> | null;
  /** The held text (what the queue is for): the post's, a held comment's, else the queue's own snapshot. */
  text: string;
}

/** One page of the queue, newest first (keyset by item id). */
export async function listQueueForKey(
  community: ModeratedCommunity,
  viewerId: string,
  opts: { view: 'pending' | 'log'; limit: number; cursor?: string | undefined },
): Promise<{ data: ApiModItem[]; nextCursor: string | null }> {
  const rows = await prisma.communityModItem.findMany({
    where: { communityId: community.id, status: opts.view === 'pending' ? 'PENDING' : { not: 'PENDING' } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    include: { author: { select: apiAuthorSelect } },
  });
  const hasMore = rows.length > opts.limit;
  const pageRows = hasMore ? rows.slice(0, opts.limit) : rows;

  // The held text: a post is read even though it is hidden while held (`deletedBy` = the AutoMod marker). Its counts
  // come back through the shared post serialiser with the moderator as the viewer, so the author's quiet-count
  // setting applies here as it does on every other v1 read.
  const postIds = pageRows.filter((r) => r.entityType === 'rmhark' && r.entityId).map((r) => r.entityId as string);
  const posts = postIds.length
    ? await prisma.rMHark.findMany({
        where: { id: { in: postIds }, communityId: community.id },
        select: {
          id: true,
          content: true,
          createdAt: true,
          likeCount: true,
          commentCount: true,
          repostCount: true,
          viewCount: true,
          imageUrls: true,
          imageAlts: true,
          gifUrl: true,
          gifAlt: true,
          isSensitive: true,
          contentWarning: true,
          user: { select: apiAuthorSelect },
        },
      })
    : [];
  const postById = new Map(posts.map((p) => [p.id, p]));

  const data = pageRows.map((r): ApiModItem => {
    const post = r.entityType === 'rmhark' && r.entityId ? postById.get(r.entityId) : undefined;
    const payload = r.payload as { content?: unknown } | null;
    return {
      id: r.id,
      type: r.entityType === 'comment' ? 'comment' : 'post',
      action: r.action as ApiModItem['action'],
      status: r.status as ApiModItem['status'],
      ruleName: r.ruleName,
      snapshot: r.snapshot,
      reporters: r.action === 'report' ? (reporterCount(r.payload) ?? null) : null,
      citedRule: citedRule(r.payload) ?? null,
      createdAt: r.createdAt.toISOString(),
      author: serializeAuthor(r.author),
      post: post ? serializePublicPost(post, viewerId) : null,
      text:
        post?.content ??
        (r.entityType === 'comment' && r.action === 'hold' && typeof payload?.content === 'string'
          ? payload.content
          : r.snapshot),
    };
  });
  return { data, nextCursor: hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null };
}

/** `POST /modqueue/{itemId}`: the site's `decideModItem` with the key owner as the moderator. */
export async function decideForKey(
  community: ModeratedCommunity,
  moderatorId: string,
  itemId: string,
  body: z.infer<typeof decisionBody>,
): Promise<ModerationResult<{ id: string; status: 'APPROVED' | 'REMOVED' }>> {
  const out = await decideModItem({
    community,
    itemId,
    decision: body.decision,
    moderatorId,
    ruleId: body.rule_id,
    message: body.message,
    via: 'api',
  });
  if (out.ok) return { ok: true, result: { id: itemId, status: out.status } };
  if (out.reason === 'rule_not_found') return fail('rule_not_found', 'Rule not found.', 400);
  if (out.reason === 'not_found') return fail('not_found', 'Item not found.', 404);
  if (out.reason === 'resolved') return fail('item_resolved', 'That item has already been decided.', 409);
  return fail('invalid_request', out.error, 400);
}

/* ── Sanctions ─────────────────────────────────────────────────────────────────────────────────────────────── */

export interface ApiSanction {
  id: string;
  kind: 'ban' | 'timeout';
  member: { id: string; name: string | null; handle: string | null } | null;
  moderator: { id: string; name: string | null; handle: string | null } | null;
  endsAt: string | null;
  createdAt: string;
  liftedAt: string | null;
  rule: { id: string; title: string } | null;
  /** The private moderator note; `''` when there is none (the API never returns null here). */
  reason: string;
}

/** One page of sanctions, newest first (keyset by id). `active` = not lifted and not ended; else lifted or ended. */
export async function listSanctionsForKey(
  community: ModeratedCommunity,
  opts: { active: boolean; limit: number; cursor?: string | undefined },
  now: Date = new Date(),
): Promise<{ data: ApiSanction[]; nextCursor: string | null }> {
  const rows = await prisma.communityBan.findMany({
    where: opts.active
      ? { communityId: community.id, ...activeWhere(now) }
      : { communityId: community.id, OR: [{ liftedAt: { not: null } }, { endsAt: { lte: now } }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    select: {
      id: true,
      kind: true,
      endsAt: true,
      createdAt: true,
      liftedAt: true,
      reason: true,
      ruleId: true,
      createdById: true,
      user: { select: userChipSelect },
    },
  });
  const hasMore = rows.length > opts.limit;
  const pageRows = hasMore ? rows.slice(0, opts.limit) : rows;
  const ruleIds = [...new Set(pageRows.map((r) => r.ruleId).filter((v): v is string => !!v))];
  const modIds = [...new Set(pageRows.map((r) => r.createdById).filter((v): v is string => !!v))];
  const [rules, mods] = await Promise.all([
    ruleIds.length
      ? prisma.communityRule.findMany({
          where: { communityId: community.id, id: { in: ruleIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    modIds.length
      ? prisma.user.findMany({ where: { id: { in: modIds } }, select: userChipSelect })
      : Promise.resolve([]),
  ]);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const modById = new Map(mods.map((m) => [m.id, m]));
  const chip = (u: { id: string; name: string | null; handle: string | null } | null | undefined) =>
    u ? { id: u.id, name: u.name, handle: u.handle } : null;
  const data = pageRows.map((r): ApiSanction => ({
    id: r.id,
    kind: asKind(r.kind),
    member: chip(r.user),
    moderator: chip(r.createdById ? modById.get(r.createdById) : null),
    endsAt: r.endsAt ? r.endsAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    liftedAt: r.liftedAt ? r.liftedAt.toISOString() : null,
    rule: r.ruleId && ruleById.has(r.ruleId) ? { id: r.ruleId, title: ruleById.get(r.ruleId)?.title ?? '' } : null,
    reason: r.reason ?? '',
  }));
  return { data, nextCursor: hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null };
}

/**
 * `POST /sanctions`: the site's `sanction`, acting as the key owner. The target is named by handle; whether the
 * owner may act on that member (a moderator on a member, only the owner on a moderator, nobody on the owner) is
 * `sanction`'s own rule, and its reason comes back as `sanction_refused`.
 */
export async function createSanctionForKey(
  community: ModeratedCommunity,
  actorId: string,
  body: z.infer<typeof createSanctionApiBody>,
): Promise<ModerationResult<{ id: string; kind: 'ban' | 'timeout'; endsAt: string | null }>> {
  const [target, row] = await Promise.all([
    prisma.user.findUnique({ where: { handle: body.handle }, select: { id: true } }),
    prisma.community.findUnique({ where: { id: community.id }, select: { id: true, name: true, createdById: true } }),
  ]);
  if (!row) return fail('not_found', 'Community not found.', 404);
  if (!target) return fail('not_found', 'Member not found.', 404);
  const out = await sanction({
    community: row,
    actorId,
    actorRole: community.role,
    targetUserId: target.id,
    kind: body.kind,
    duration: body.duration ?? DEFAULT_DURATION[body.kind],
    ruleId: body.rule_id,
    reason: body.reason,
    via: 'api',
  });
  if (out.ok) return { ok: true, result: { id: out.id, kind: body.kind, endsAt: out.endsAt?.toISOString() ?? null } };
  if (out.error === 'Rule not found') return fail('rule_not_found', 'Rule not found.', 400);
  if (out.status === 404) return fail('not_found', out.error, 404);
  return fail('sanction_refused', out.error, 409);
}

/** `DELETE /sanctions/{id}`: the site's `lift`. An unknown, other-community or already-ended id is `not_found`. */
export async function liftSanctionForKey(
  community: ModeratedCommunity,
  actorId: string,
  banId: string,
): Promise<ModerationResult<null>> {
  const out = await lift({ community: { id: community.id, name: community.name }, banId, actorId, via: 'api' });
  if (!out.ok) return fail('not_found', 'Sanction not found.', 404);
  return { ok: true, result: null };
}
