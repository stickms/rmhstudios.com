/**
 * Community moderation log (s03-14, server-only): the one writer, the two readers and
 * the prune. `logModAction` takes the transaction client of the action it records, so a
 * logged action always happened and an action is never unlogged.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import {
  MOD_ACTIONS_BY_GROUP,
  MOD_LOG_EXPORT_MAX_ROWS,
  MOD_LOG_PAGE_SIZE,
  MOD_LOG_REASON_MAX,
  MOD_LOG_RETENTION_DAYS,
  MOD_LOG_RULE_TITLE_MAX,
  PUBLIC_MOD_ACTIONS,
  isModAction,
  modLogToCsv,
  toPublicEntry,
  type ModActionInput,
  type ModLogDetail,
  type ModLogEntryDTO,
  type ModLogGroup,
  type ModLogUserDTO,
  type ModTargetType,
  type PublicModLogEntryDTO,
} from '@/lib/communities/modlog';

const DAY_MS = 86_400_000;

/** Append one row. Call it inside the transaction that performs the action. */
export async function logModAction(tx: Prisma.TransactionClient, input: ModActionInput): Promise<bigint> {
  const row = await tx.communityModAction.create({
    data: {
      communityId: input.communityId,
      actorId: input.actorId,
      action: input.action,
      targetUserId: input.targetUserId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ? input.targetId.slice(0, 64) : null,
      ruleId: input.ruleId ?? null,
      ruleTitle: input.ruleTitle ? input.ruleTitle.slice(0, MOD_LOG_RULE_TITLE_MAX) : null,
      reason: input.reason ? input.reason.slice(0, MOD_LOG_REASON_MAX) : null,
      ...(input.detail
        ? {
            detail: input.detail as Prisma.InputJsonValue,
          }
        : {}),
    },
    select: {
      id: true,
    },
  });
  return row.id;
}

/** The one place a nullable `Json` detail column is read back as a typed value. */
function asDetail(v: Prisma.JsonValue | null): ModLogDetail | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as ModLogDetail;
}

export interface ModLogFilter {
  group?: ModLogGroup | undefined;
  actorId?: string | undefined;
  cursor?: string | undefined;
}

function whereFor(communityId: string, f: ModLogFilter): Prisma.CommunityModActionWhereInput {
  return {
    communityId,
    ...(f.group
      ? {
          action: {
            in: [...MOD_ACTIONS_BY_GROUP[f.group]],
          },
        }
      : {}),
    ...(f.actorId
      ? {
          actorId: f.actorId,
        }
      : {}),
    ...(f.cursor
      ? {
          id: {
            lt: BigInt(f.cursor),
          },
        }
      : {}),
  };
}

async function usersById(ids: (string | null)[]): Promise<Map<string, ModLogUserDTO>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: {
      id: {
        in: unique,
      },
    },
    select: userChipSelect,
    take: unique.length,
  });
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        handle: r.handle,
      },
    ]),
  );
}

export interface FullModLogPage {
  entries: ModLogEntryDTO[];
  nextCursor: string | null;
  moderators: ModLogUserDTO[];
}

async function currentModerators(communityId: string): Promise<ModLogUserDTO[]> {
  const rows = await prisma.communityMember.findMany({
    where: {
      communityId,
      role: {
        in: ['MOD', 'ADMIN'],
      },
    },
    select: {
      user: {
        select: userChipSelect,
      },
    },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.user.id,
    name: r.user.name,
    handle: r.user.handle,
  }));
}

/** Moderators: every action, newest first, 50 a page. */
export async function listModLog(communityId: string, filter: ModLogFilter): Promise<FullModLogPage> {
  const rows = await prisma.communityModAction.findMany({
    where: whereFor(communityId, filter),
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: MOD_LOG_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, MOD_LOG_PAGE_SIZE);
  const [users, moderators] = await Promise.all([
    usersById(page.flatMap((r) => [r.actorId, r.targetUserId])),
    filter.cursor ? Promise.resolve([]) : currentModerators(communityId),
  ]);
  const entries: ModLogEntryDTO[] = page.flatMap((r) =>
    isModAction(r.action)
      ? [
          {
            id: String(r.id),
            action: r.action,
            actor: r.actorId ? (users.get(r.actorId) ?? null) : null,
            targetUser: r.targetUserId ? (users.get(r.targetUserId) ?? null) : null,
            targetType: (r.targetType as ModTargetType | null) ?? null,
            targetId: r.targetId,
            ruleTitle: r.ruleTitle,
            reason: r.reason,
            detail: asDetail(r.detail),
            createdAt: r.createdAt.toISOString(),
          },
        ]
      : [],
  );
  return {
    entries,
    nextCursor: rows.length > MOD_LOG_PAGE_SIZE ? String(page[page.length - 1]!.id) : null,
    moderators,
  };
}

/**
 * Members: the content decisions only. The query selects just the allow-listed columns,
 * so the actor and the target member never leave the database.
 */
export async function listPublicModLog(
  communityId: string,
  cursor: string | undefined,
): Promise<{
  entries: PublicModLogEntryDTO[];
  nextCursor: string | null;
}> {
  const rows = await prisma.communityModAction.findMany({
    where: {
      communityId,
      action: {
        in: [...PUBLIC_MOD_ACTIONS],
      },
      ...(cursor
        ? {
            id: {
              lt: BigInt(cursor),
            },
          }
        : {}),
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: MOD_LOG_PAGE_SIZE + 1,
    select: {
      id: true,
      action: true,
      targetType: true,
      ruleTitle: true,
      reason: true,
      createdAt: true,
    },
  });
  const page = rows.slice(0, MOD_LOG_PAGE_SIZE);
  return {
    entries: page.flatMap((r) => {
      const e = toPublicEntry(r);
      return e ? [e] : [];
    }),
    nextCursor: rows.length > MOD_LOG_PAGE_SIZE ? String(page[page.length - 1]!.id) : null,
  };
}

/** Moderators: the last 365 days as CSV, newest first, capped. */
export async function exportModLog(communityId: string, now = new Date()): Promise<string> {
  const since = new Date(now.getTime() - MOD_LOG_RETENTION_DAYS * DAY_MS);
  const rows = await prisma.communityModAction.findMany({
    where: {
      communityId,
      createdAt: {
        gte: since,
      },
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: MOD_LOG_EXPORT_MAX_ROWS,
  });
  const users = await usersById(rows.flatMap((r) => [r.actorId, r.targetUserId]));
  return modLogToCsv(
    rows.map((r) => ({
      id: String(r.id),
      action: isModAction(r.action) ? r.action : 'settings_changed',
      actor: r.actorId ? (users.get(r.actorId) ?? null) : null,
      targetUser: r.targetUserId ? (users.get(r.targetUserId) ?? null) : null,
      targetType: (r.targetType as ModTargetType | null) ?? null,
      targetId: r.targetId,
      ruleTitle: r.ruleTitle,
      reason: r.reason,
      detail: null,
      createdAt: r.createdAt.toISOString(),
    })),
  );
}

export const MOD_LOG_PRUNE_BATCH = 1000;

/** Delete rows past retention in batches (idempotent; safe to run twice). Returns how many went. */
export async function pruneModLog(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MOD_LOG_RETENTION_DAYS * DAY_MS);
  let total = 0;
  for (;;) {
    const batch = await prisma.communityModAction.findMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        id: 'asc',
      },
      take: MOD_LOG_PRUNE_BATCH,
    });
    if (batch.length === 0) break;
    const res = await prisma.communityModAction.deleteMany({
      where: {
        id: {
          in: batch.map((b) => b.id),
        },
      },
    });
    total += res.count;
    if (batch.length < MOD_LOG_PRUNE_BATCH) break;
  }
  return total;
}
