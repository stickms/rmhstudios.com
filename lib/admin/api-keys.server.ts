/**
 * The server half of /admin/api-keys: a ranked, filtered page of keys with their usage, and the
 * audited suspend / lift / cap change. Admin routes only; the module never selects a key hash, a
 * secret, an allowed range or an e-mail address.
 *
 * A page is a few small reads, none over the whole usage table: the keys ranked by the window's
 * units (a `groupBy` on the rollup, bounded by the window's seven days), then the keys themselves,
 * then per-(key, day) usage, refusals and webhook counts for just those ids.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { userChipSelect } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import { notice, type NoticePreview } from '@/lib/notifications/notice-keys';
import {
  API_KEYS_PAGE_SIZE,
  HIGH_ERROR_RATE,
  decodeCursor,
  encodeCursor,
  errorRate,
  keyStatus,
  sumUsage,
  windowDays,
  type AdminApiKeyRow,
  type AdminApiKeysPage,
  type ApiKeyStatus,
} from '@/lib/admin/api-keys';

/** The entity types of the two owner notices; `components/feed/notification-labels.ts` labels them. */
export const KEY_SUSPENDED_ENTITY = 'api-key-suspended';
export const KEY_RESTORED_ENTITY = 'api-key-restored';

export interface ApiKeysFilters {
  status?: ApiKeyStatus | undefined;
  errors?: 'high' | undefined;
  owner?: string | undefined;
  cursor?: string | undefined;
}

function baseWhere(f: ApiKeysFilters, now: Date): Prisma.DeveloperApiKeyWhereInput {
  const and: Prisma.DeveloperApiKeyWhereInput[] = [
    {
      revokedAt: null,
    },
  ];
  if (f.status === 'suspended')
    and.push({
      suspendedAt: {
        not: null,
      },
    });
  if (f.status === 'active') {
    and.push(
      {
        suspendedAt: null,
      },
      {
        OR: [
          {
            expiresAt: null,
          },
          {
            expiresAt: {
              gt: now,
            },
          },
        ],
      },
    );
  }
  if (f.status === 'expired')
    and.push(
      {
        suspendedAt: null,
      },
      {
        expiresAt: {
          lte: now,
        },
      },
    );
  const handle = f.owner?.replace(/^@/, '');
  if (handle)
    and.push({
      user: {
        handle: {
          equals: handle,
          mode: 'insensitive',
        },
      },
    });
  return {
    AND: and,
  };
}

/** Which key ids make up the page, in display order, and where the next page starts. */
async function pageIds(
  where: Prisma.DeveloperApiKeyWhereInput,
  compactDays: string[],
  cursor: NonNullable<ReturnType<typeof decodeCursor>>,
): Promise<{
  ids: string[];
  next: string | null;
}> {
  const ids: string[] = [];
  let idleAfter: string | null = null;
  if (cursor.phase === 'ranked') {
    const ranked = await prisma.apiUsageDaily.groupBy({
      by: ['keyId'],
      where: {
        day: {
          in: compactDays,
        },
        key: where,
      },
      _sum: {
        units: true,
      },
      orderBy: [
        {
          _sum: {
            units: 'desc',
          },
        },
        {
          keyId: 'asc',
        },
      ],
      skip: cursor.offset,
      take: API_KEYS_PAGE_SIZE + 1,
    });
    ids.push(...ranked.slice(0, API_KEYS_PAGE_SIZE).map((r) => r.keyId));
    if (ranked.length > API_KEYS_PAGE_SIZE) {
      return {
        ids,
        next: encodeCursor({
          phase: 'ranked',
          offset: cursor.offset + API_KEYS_PAGE_SIZE,
        }),
      };
    }
  } else {
    idleAfter = cursor.afterId;
  }
  // Keys with no usage in the window follow the ranked ones, oldest first.
  const room = API_KEYS_PAGE_SIZE - ids.length;
  const idle = await prisma.developerApiKey.findMany({
    where: {
      AND: [
        where,
        {
          usage: {
            none: {
              day: {
                in: compactDays,
              },
            },
          },
        },
        ...(idleAfter
          ? [
              {
                id: {
                  gt: idleAfter,
                },
              },
            ]
          : []),
      ],
    },
    orderBy: {
      id: 'asc',
    },
    take: room + 1,
    select: {
      id: true,
    },
  });
  const taken = idle.slice(0, room).map((k) => k.id);
  ids.push(...taken);
  const more = idle.length > room;
  return {
    ids,
    next: more
      ? encodeCursor({
          phase: 'idle',
          afterId: taken.at(-1) ?? idleAfter,
        })
      : null,
  };
}

/** The display rows for these key ids (in the order given), with usage, refusals and webhook health. */
export async function rowsForKeys(ids: string[], now: Date): Promise<AdminApiKeyRow[]> {
  if (ids.length === 0) return [];
  const days = windowDays(now);
  const keys = await prisma.developerApiKey.findMany({
    where: {
      id: {
        in: ids,
      },
    },
    select: {
      id: true,
      userId: true,
      name: true,
      prefix: true,
      lastFour: true,
      scopes: true,
      testMode: true,
      allowedCidrs: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      suspendedAt: true,
      suspendReason: true,
      rateLimitPerMinute: true,
      adminRateLimitPerMinute: true,
      user: {
        select: userChipSelect,
      },
    },
  });
  const ownerIds = [...new Set(keys.map((k) => k.userId))];
  const [usage, refusals, webhooks] = await Promise.all([
    prisma.apiUsageDaily.groupBy({
      by: ['keyId', 'day'],
      where: {
        keyId: {
          in: ids,
        },
        day: {
          in: days.compact,
        },
      },
      _sum: {
        requests: true,
        units: true,
        clientErrors: true,
        serverErrors: true,
      },
    }),
    prisma.apiKeyRefusalDaily.groupBy({
      by: ['keyId'],
      where: {
        keyId: {
          in: ids,
        },
        day: {
          in: days.dashed,
        },
      },
      _sum: {
        count: true,
      },
    }),
    prisma.webhookEndpoint.groupBy({
      by: ['userId', 'enabled'],
      where: {
        userId: {
          in: ownerIds,
        },
        OR: [
          {
            enabled: true,
          },
          {
            failureCount: {
              gt: 0,
            },
          },
        ],
      },
      _count: {
        _all: true,
      },
    }),
  ]);
  const usageByKey = new Map<
    string,
    Array<{
      day: string;
      requests: number;
      units: number;
      clientErrors: number;
      serverErrors: number;
    }>
  >();
  for (const u of usage) {
    const list = usageByKey.get(u.keyId) ?? [];
    list.push({
      day: u.day,
      requests: u._sum.requests ?? 0,
      units: u._sum.units ?? 0,
      clientErrors: u._sum.clientErrors ?? 0,
      serverErrors: u._sum.serverErrors ?? 0,
    });
    usageByKey.set(u.keyId, list);
  }
  const refusalsByKey = new Map(refusals.map((r) => [r.keyId, r._sum.count ?? 0]));
  const hooksByOwner = new Map<
    string,
    {
      total: number;
      disabled: number;
    }
  >();
  for (const w of webhooks) {
    const h = hooksByOwner.get(w.userId) ?? {
      total: 0,
      disabled: 0,
    };
    h.total += w._count._all;
    if (!w.enabled) h.disabled += w._count._all;
    hooksByOwner.set(w.userId, h);
  }
  const byId = new Map(keys.map((k) => [k.id, k]));
  const out: AdminApiKeyRow[] = [];
  for (const id of ids) {
    const k = byId.get(id);
    if (!k) continue;
    const { today, week } = sumUsage(usageByKey.get(id) ?? [], days.compact[0]!);
    out.push({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      lastFour: k.lastFour,
      testMode: k.testMode,
      owner: {
        id: k.user.id,
        handle: k.user.handle,
        name: k.user.name,
      },
      scopes: k.scopes,
      allowedCidrCount: k.allowedCidrs.length,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      status: keyStatus(k, now),
      suspendedAt: k.suspendedAt?.toISOString() ?? null,
      suspendReason: k.suspendReason,
      rateLimitPerMinute: k.rateLimitPerMinute,
      adminRateLimitPerMinute: k.adminRateLimitPerMinute,
      today,
      week,
      refusals: refusalsByKey.get(id) ?? 0,
      webhooks: hooksByOwner.get(k.userId) ?? {
        total: 0,
        disabled: 0,
      },
    });
  }
  return out;
}

/** True when either error rate over the window is above the "errors above 20%" line. */
export function hasHighErrors(row: AdminApiKeyRow): boolean {
  return (
    errorRate(row.week.clientErrors, row.week.requests) > HIGH_ERROR_RATE ||
    errorRate(row.week.serverErrors, row.week.requests) > HIGH_ERROR_RATE
  );
}

/** One page of keys. `null` when the cursor is not one this module issued. */
export async function listApiKeys(filters: ApiKeysFilters, now: Date = new Date()): Promise<AdminApiKeysPage | null> {
  const cursor = decodeCursor(filters.cursor);
  if (!cursor) return null;
  const { ids, next } = await pageIds(baseWhere(filters, now), windowDays(now).compact, cursor);
  const rows = await rowsForKeys(ids, now);
  // The error filter works on the page's own rates (a ratio cannot be ranked or paged in the database),
  // so a filtered page can hold fewer than 50 rows while `nextCursor` still continues.
  return {
    keys: filters.errors === 'high' ? rows.filter(hasHighErrors) : rows,
    nextCursor: next,
  };
}

export type ApiKeyChange =
  | {
      ok: true;
      key: AdminApiKeyRow;
    }
  | {
      ok: false;
      status: 404 | 409;
      error: string;
    };

class Refused extends Error {
  constructor(
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Suspend, lift or cap one key. Every change is audited inside the same transaction; a suspension
 * and a lift are compare-and-set so two admins cannot both win (and the owner is told once). The
 * owner's notice is sent after the commit and never fails the change.
 */
export async function changeApiKey(
  adminId: string,
  keyId: string,
  change: {
    suspend?:
      | {
          reason: string;
        }
      | null
      | undefined;
    adminRateLimitPerMinute?: number | null | undefined;
  },
  now: Date = new Date(),
): Promise<ApiKeyChange> {
  let owed: {
    userId: string;
    entityType: string;
    preview: NoticePreview;
  } | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const key = await tx.developerApiKey.findUnique({
        where: {
          id: keyId,
        },
        select: {
          id: true,
          userId: true,
          name: true,
          prefix: true,
          lastFour: true,
          revokedAt: true,
          adminRateLimitPerMinute: true,
        },
      });
      if (!key || key.revokedAt) throw new Refused(404, 'Key not found');
      const label = `${key.prefix}…${key.lastFour ?? ''}`;

      if (change.suspend) {
        const { count } = await tx.developerApiKey.updateMany({
          where: {
            id: keyId,
            revokedAt: null,
            suspendedAt: null,
          },
          data: {
            suspendedAt: now,
            suspendReason: change.suspend.reason,
          },
        });
        if (count === 0) throw new Refused(409, 'This key is already suspended.');
        await recordAdminActionIn(tx, adminId, 'api_key.suspend', {
          targetType: 'developer_api_key',
          targetId: keyId,
          detail: `${label}: ${change.suspend.reason}`,
        });
        owed = {
          userId: key.userId,
          entityType: KEY_SUSPENDED_ENTITY,
          preview: notice('api-key-suspended', { name: key.name, reason: change.suspend.reason }),
        };
      } else if (change.suspend === null) {
        const { count } = await tx.developerApiKey.updateMany({
          where: {
            id: keyId,
            suspendedAt: {
              not: null,
            },
          },
          data: {
            suspendedAt: null,
            suspendReason: null,
          },
        });
        if (count === 0) throw new Refused(409, 'This key is not suspended.');
        await recordAdminActionIn(tx, adminId, 'api_key.lift_suspension', {
          targetType: 'developer_api_key',
          targetId: keyId,
          detail: label,
        });
        owed = {
          userId: key.userId,
          entityType: KEY_RESTORED_ENTITY,
          preview: notice('api-key-restored', { name: key.name }),
        };
      }

      if (
        change.adminRateLimitPerMinute !== undefined &&
        change.adminRateLimitPerMinute !== key.adminRateLimitPerMinute
      ) {
        await tx.developerApiKey.update({
          where: {
            id: keyId,
          },
          data: {
            adminRateLimitPerMinute: change.adminRateLimitPerMinute,
          },
        });
        await recordAdminActionIn(tx, adminId, 'api_key.set_cap', {
          targetType: 'developer_api_key',
          targetId: keyId,
          detail: `${label}: ${key.adminRateLimitPerMinute ?? 'none'} -> ${change.adminRateLimitPerMinute ?? 'none'} a minute`,
        });
      }
    });
  } catch (err) {
    if (err instanceof Refused)
      return {
        ok: false,
        status: err.status,
        error: err.message,
      };
    throw err;
  }

  const sent = owed as {
    userId: string;
    entityType: string;
    preview: NoticePreview;
  } | null;
  if (sent) {
    // Best effort: the change is committed, and createNotification applies the owner's preferences.
    await createNotification({
      userId: sent.userId,
      type: 'SYSTEM',
      entityType: sent.entityType,
      entityId: keyId,
      preview: sent.preview,
      link: '/developer',
    }).catch(() => {});
  }
  const [row] = await rowsForKeys([keyId], now);
  if (!row)
    return {
      ok: false,
      status: 404,
      error: 'Key not found',
    };
  return {
    ok: true,
    key: row,
  };
}
