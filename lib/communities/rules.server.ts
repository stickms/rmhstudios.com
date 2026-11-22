/**
 * Community rules (s03-13, server-only): the ordered list, the "breaks a rule"
 * report that lands in the community's own mod queue, and the rule a removal cites.
 */
import { hashScoped } from '@/lib/hash-ip.server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { logModAction } from '@/lib/communities/modlog.server';
import { canViewPost } from '@/lib/feed/audience.server';
import { RULES_MAX, addReporter, reportDedupeKey, type CommunityRuleDTO } from '@/lib/communities/rules';

export class RulesError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
  }
}

interface RuleRow {
  id: string;
  position: number;
  title: string;
  description: string | null;
}

const toDTO = (r: RuleRow): CommunityRuleDTO => ({
  id: r.id,
  position: r.position + 1,
  title: r.title,
  description: r.description,
});

/** A community's rules in display order (one small query; also rides `/extras`). */
export async function listRules(communityId: string): Promise<CommunityRuleDTO[]> {
  const rows = await prisma.communityRule.findMany({
    where: {
      communityId,
    },
    orderBy: [
      {
        position: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
    take: RULES_MAX,
    select: {
      id: true,
      position: true,
      title: true,
      description: true,
    },
  });
  return rows.map(toDTO);
}

export async function getRequireAgreement(communityId: string): Promise<boolean> {
  const row = await prisma.community.findUnique({
    where: {
      id: communityId,
    },
    select: {
      rulesRequireAgreement: true,
    },
  });
  return row?.rulesRequireAgreement === true;
}

/** Joining needs a tick only when the switch is on AND there is something to read. */
export async function agreementRequired(communityId: string): Promise<boolean> {
  const [required, count] = await Promise.all([
    getRequireAgreement(communityId),
    prisma.communityRule.count({
      where: {
        communityId,
      },
    }),
  ]);
  return required && count > 0;
}

export interface RuleInput {
  id?: string | undefined;
  title: string;
  description?: string | null | undefined;
}

/**
 * Replace the whole ordered list: rules named by `id` are kept (and edited),
 * the rest are created, and any existing rule absent from `inputs` is deleted.
 */
export async function saveRules(
  communityId: string,
  inputs: RuleInput[],
  requireAgreement: boolean,
  actorId: string,
): Promise<void> {
  if (inputs.length > RULES_MAX) {
    throw new RulesError(`A community can have at most ${RULES_MAX} rules`, 400);
  }
  const ids = inputs.map((r) => r.id).filter((id): id is string => !!id);
  if (new Set(ids).size !== ids.length) throw new RulesError('A rule appears twice', 400);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.communityRule.findMany({
      where: {
        communityId,
      },
      select: {
        id: true,
      },
    });
    const known = new Set(existing.map((r) => r.id));
    if (ids.some((id) => !known.has(id))) throw new RulesError('Rule not found', 400);

    await tx.communityRule.deleteMany({
      where: {
        communityId,
        id: {
          notIn: ids,
        },
      },
    });
    for (const [position, r] of inputs.entries()) {
      const data = {
        position,
        title: r.title,
        description: r.description?.trim() || null,
      };
      if (r.id) {
        await tx.communityRule.update({
          where: {
            id: r.id,
          },
          data,
        });
      } else {
        await tx.communityRule.create({
          data: {
            communityId,
            ...data,
          },
        });
      }
    }
    await tx.community.update({
      where: {
        id: communityId,
      },
      data: {
        rulesRequireAgreement: requireAgreement,
      },
    });
    await logModAction(tx, {
      communityId,
      actorId,
      action: 'rules_changed',
      detail: {
        rules: inputs.length,
        requireAgreement,
      },
    });
  });
}

/** One rule of this community, or `null`. */
export async function getRule(communityId: string, ruleId: string): Promise<CommunityRuleDTO | null> {
  const row = await prisma.communityRule.findFirst({
    where: {
      id: ruleId,
      communityId,
    },
    select: {
      id: true,
      position: true,
      title: true,
      description: true,
    },
  });
  return row ? toDTO(row) : null;
}

/* -------------------------------------------------------------------------- */
/* Reports to a community's moderators                                         */
/* -------------------------------------------------------------------------- */

/** What a report item keeps in `payload`. Reporters are stored only as one-way keys. */
interface ReportPayload {
  ruleId: string;
  position: number;
  reporters: number;
  keys: string[];
  cited?: {
    ruleId: string;
    position: number;
    title: string;
  };
}

/** The stored form of a reporter's dedupe key: never the member id itself. */
export function hashReporterKey(communityId: string, userId: string, postId: string, ruleId: string): string {
  return hashScoped(`community-report:${communityId}`, reportDedupeKey(userId, postId, ruleId)).slice(0, 32);
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function readReportPayload(v: unknown): ReportPayload | null {
  const o = asObject(v);
  if (typeof o.ruleId !== 'string' || !Array.isArray(o.keys)) return null;
  return {
    ruleId: o.ruleId,
    position: typeof o.position === 'number' ? o.position : 0,
    reporters: typeof o.reporters === 'number' ? o.reporters : o.keys.length,
    keys: o.keys.filter((k): k is string => typeof k === 'string'),
  };
}

/**
 * A member reports a community post for breaking one of the rules. One pending
 * queue item per (post, rule); a second reporter raises its count, a repeat by the
 * same member changes nothing. The advisory lock serialises the read-modify-write.
 */
export async function reportPostToMods(args: {
  communityId: string;
  userId: string;
  postId: string;
  ruleId: string;
}): Promise<{
  alreadyReported: boolean;
}> {
  const { communityId, userId, postId, ruleId } = args;
  const rule = await getRule(communityId, ruleId);
  if (!rule) throw new RulesError('Rule not found', 404);

  const post = await prisma.rMHark.findUnique({
    where: {
      id: postId,
    },
    select: {
      id: true,
      userId: true,
      content: true,
      audience: true,
      communityId: true,
      deletedAt: true,
    },
  });
  if (!post || post.communityId !== communityId || post.deletedAt || !(await canViewPost(post, userId))) {
    throw new RulesError('Post not found', 404);
  }

  const key = hashReporterKey(communityId, userId, postId, ruleId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`community-report:${postId}:${ruleId}`}))`;
    const open = await tx.communityModItem.findFirst({
      where: {
        communityId,
        entityType: 'rmhark',
        entityId: postId,
        action: 'report',
        status: 'PENDING',
        payload: {
          path: ['ruleId'],
          equals: ruleId,
        },
      },
      select: {
        id: true,
        payload: true,
      },
    });
    if (!open) {
      const payload: ReportPayload = {
        ruleId,
        position: rule.position,
        reporters: 1,
        keys: [key],
      };
      await tx.communityModItem.create({
        data: {
          communityId,
          entityType: 'rmhark',
          entityId: postId,
          postId,
          authorId: post.userId,
          action: 'report',
          ruleName: rule.title.slice(0, 60),
          snapshot: post.content.slice(0, 300),
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        alreadyReported: false,
      };
    }
    const current = readReportPayload(open.payload) ?? {
      ruleId,
      position: rule.position,
      reporters: 0,
      keys: [],
    };
    const { keys, added } = addReporter(current.keys, key);
    if (!added)
      return {
        alreadyReported: true,
      };
    const next: ReportPayload = {
      ...current,
      keys,
      reporters: keys.length,
    };
    await tx.communityModItem.update({
      where: {
        id: open.id,
      },
      data: {
        payload: next as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      alreadyReported: false,
    };
  });
}

/** How many members reported a queue item (the only thing mods ever see of reporters). */
export function reporterCount(payload: unknown): number | undefined {
  return readReportPayload(payload)?.reporters;
}

/** The rule a moderator cited when removing the item, if any. */
export function citedRule(payload: unknown):
  | {
      position: number;
      title: string;
    }
  | undefined {
  const cited = asObject(asObject(payload).cited);
  return typeof cited.title === 'string' && typeof cited.position === 'number'
    ? {
        position: cited.position,
        title: cited.title,
      }
    : undefined;
}

/** Keep the cited rule's text on the item, so deleting the rule later changes nothing. */
export async function recordCitation(itemId: string, rule: CommunityRuleDTO): Promise<void> {
  const item = await prisma.communityModItem.findUnique({
    where: {
      id: itemId,
    },
    select: {
      payload: true,
    },
  });
  const next = {
    ...asObject(item?.payload),
    cited: {
      ruleId: rule.id,
      position: rule.position,
      title: rule.title,
    },
  };
  await prisma.communityModItem.update({
    where: {
      id: itemId,
    },
    data: {
      payload: next as unknown as Prisma.InputJsonValue,
    },
  });
}
