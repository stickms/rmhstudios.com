/**
 * Admin audit logging + ban enforcement helpers.
 */

import { prisma } from '@/lib/prisma.server';

/** Record an admin action. Best-effort — never throws into the caller. */
export async function logAdminAction(
  adminId: string,
  action: string,
  opts: { targetType?: string; targetId?: string; detail?: string } = {}
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action: action.slice(0, 64),
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        detail: opts.detail?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed to log action:', err);
  }
}

/** Returns the active ban for a user (if currently banned), else null. */
export async function getActiveBan(userId: string): Promise<{ until: Date | null; reason: string | null } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedUntil: true, banReason: true },
  });
  if (!user?.bannedUntil) return null;
  if (user.bannedUntil.getTime() <= Date.now()) return null; // expired
  return { until: user.bannedUntil, reason: user.banReason };
}
