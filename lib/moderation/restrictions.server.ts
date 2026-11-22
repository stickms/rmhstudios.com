/**
 * Per-feature timeouts — the server half. Every write path a timeout can gate
 * calls `restrictionResponse(userId, feature)` before it writes, and refuses
 * with the 403 it returns. The active-row rule lives in `activeRestrictionWhere`
 * only, for the same reason `activeStrikeWhere` exists: a second copy is how
 * the rule drifts.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import { createNotification } from '@/lib/notifications.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import {
  FEATURE_LABELS,
  isRestrictableFeature,
  type FeatureRestrictionView,
  type RestrictableFeature,
} from '@/lib/moderation/restrictions';

/** The link every moderation notice opens: the user's own record. */
export const ACCOUNT_STATUS_LINK = '/settings/account-status';

export function activeRestrictionWhere(userId: string, now = new Date()): Prisma.FeatureRestrictionWhereInput {
  return {
    userId,
    liftedAt: null,
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
  };
}

interface ActiveRow {
  feature: string;
  /** Epoch ms; null = permanent. */
  expiresAt: number | null;
}

const RESTRICTIONS_TTL_MS = 30_000;
const restrictionsKey = (userId: string) => `feature-restrictions:${userId}`;

/**
 * The user's active restrictions. Cached briefly (a write path reads this on
 * every post or reply) and dropped by every writer below, so a new timeout
 * applies on the user's next request on every instance.
 */
async function activeRows(userId: string): Promise<ActiveRow[]> {
  const rows = await cached<ActiveRow[]>(restrictionsKey(userId), RESTRICTIONS_TTL_MS, async () => {
    const found = await prisma.featureRestriction.findMany({
      where: activeRestrictionWhere(userId),
      select: {
        feature: true,
        expiresAt: true,
      },
    });
    return found.map((r) => ({
      feature: r.feature,
      expiresAt: r.expiresAt?.getTime() ?? null,
    }));
  });
  // The cache may outlive a short timeout by up to its TTL: re-check expiry.
  const now = Date.now();
  return rows.filter((r) => r.expiresAt === null || r.expiresAt > now);
}

function invalidate(userId: string): void {
  void invalidateCached(restrictionsKey(userId));
}

/** The active restriction on `feature`, or null. The longest one wins. */
export async function getActiveRestriction(
  userId: string,
  feature: RestrictableFeature,
): Promise<{
  expiresAt: Date | null;
} | null> {
  const rows = (await activeRows(userId)).filter((r) => r.feature === feature);
  if (rows.length === 0) return null;
  if (rows.some((r) => r.expiresAt === null))
    return {
      expiresAt: null,
    };
  return {
    expiresAt: new Date(Math.max(...rows.map((r) => r.expiresAt ?? 0))),
  };
}

/**
 * A 403 response when the user is timed out of `feature`, else null:
 *
 *   const blocked = await restrictionResponse(userId, 'post');
 *   if (blocked) return blocked;
 */
export async function restrictionResponse(userId: string, feature: RestrictableFeature): Promise<Response | null> {
  const active = await getActiveRestriction(userId, feature);
  if (!active) return null;
  const label = FEATURE_LABELS[feature];
  const error = active.expiresAt
    ? `${label} is restricted on your account until ${active.expiresAt.toISOString()}. See Settings → Account status.`
    : `${label} is restricted on your account. See Settings → Account status.`;
  return Response.json(
    {
      error,
      code: 'feature_restricted',
      feature,
      until: active.expiresAt?.toISOString() ?? null,
    },
    {
      status: 403,
    },
  );
}

/** Same check for code that is not an HTTP handler (socket hubs, workers). */
export async function isRestricted(userId: string, feature: RestrictableFeature): Promise<boolean> {
  return (await getActiveRestriction(userId, feature)) !== null;
}

function toView(
  r: {
    id: string;
    feature: string;
    reason: string;
    createdAt: Date;
    expiresAt: Date | null;
    liftedAt: Date | null;
  },
  now: number,
): FeatureRestrictionView | null {
  if (!isRestrictableFeature(r.feature)) return null;
  return {
    id: r.id,
    feature: r.feature,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
    liftedAt: r.liftedAt?.toISOString() ?? null,
    active: !r.liftedAt && (!r.expiresAt || r.expiresAt.getTime() > now),
  };
}

/** Every restriction on a user, newest first (history included). */
export async function listRestrictions(userId: string): Promise<FeatureRestrictionView[]> {
  const rows = await prisma.featureRestriction.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
    select: {
      id: true,
      feature: true,
      reason: true,
      createdAt: true,
      expiresAt: true,
      liftedAt: true,
    },
  });
  const now = Date.now();
  return rows.map((r) => toView(r, now)).filter((v): v is FeatureRestrictionView => v !== null);
}

/** Time a user out of one feature. `durationDays` null = permanent. Notifies the user. */
export async function restrictFeature(input: {
  userId: string;
  adminId: string;
  feature: RestrictableFeature;
  reason: string;
  durationDays: number | null;
}): Promise<FeatureRestrictionView> {
  const expiresAt = input.durationDays != null ? new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000) : null;
  const row = await prisma.featureRestriction.create({
    data: {
      userId: input.userId,
      adminId: input.adminId,
      feature: input.feature,
      reason: input.reason,
      expiresAt,
    },
    select: {
      id: true,
      feature: true,
      reason: true,
      createdAt: true,
      expiresAt: true,
      liftedAt: true,
    },
  });
  invalidate(input.userId);

  const label = FEATURE_LABELS[input.feature];
  await logAdminAction(input.adminId, 'user.restrict', {
    targetType: 'user',
    targetId: input.userId,
    detail: `${input.feature} ${input.durationDays ?? 'permanent'} — ${input.reason}`,
  });
  await createNotification({
    userId: input.userId,
    type: 'SYSTEM',
    entityType: 'moderation',
    entityId: row.id,
    link: ACCOUNT_STATUS_LINK,
    preview: expiresAt
      ? `${label} has been restricted on your account until ${expiresAt.toUTCString()}. Reason: ${input.reason}`
      : `${label} has been permanently restricted on your account. Reason: ${input.reason}`,
  });

  return toView(row, Date.now())!;
}

/** Lift a restriction early. Returns false when it was already lifted or does not exist. */
export async function liftRestriction(input: { id: string; adminId: string }): Promise<{
  lifted: boolean;
  userId: string | null;
}> {
  const row = await prisma.featureRestriction.findUnique({
    where: {
      id: input.id,
    },
    select: {
      userId: true,
      feature: true,
    },
  });
  if (!row)
    return {
      lifted: false,
      userId: null,
    };
  const { count } = await prisma.featureRestriction.updateMany({
    where: {
      id: input.id,
      liftedAt: null,
    },
    data: {
      liftedAt: new Date(),
      liftedById: input.adminId,
    },
  });
  invalidate(row.userId);
  if (count === 0)
    return {
      lifted: false,
      userId: row.userId,
    };

  await logAdminAction(input.adminId, 'user.unrestrict', {
    targetType: 'user',
    targetId: row.userId,
    detail: row.feature,
  });
  if (isRestrictableFeature(row.feature)) {
    await createNotification({
      userId: row.userId,
      type: 'SYSTEM',
      entityType: 'moderation',
      entityId: input.id,
      link: ACCOUNT_STATUS_LINK,
      preview: `The restriction on ${FEATURE_LABELS[row.feature].toLowerCase()} has been lifted.`,
    });
  }
  return {
    lifted: true,
    userId: row.userId,
  };
}
