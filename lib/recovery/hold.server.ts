/**
 * The post-recovery economy hold (I3, "security constraints that are not
 * optional").
 *
 * For 72 hours after an account is recovered the account cannot **move coins,
 * change payout details, or file a `RedemptionRequest`**. Without it, recovery
 * is the cheapest route into the economy: a takeover that can cash out in the
 * first minute does not care how slow everything before it was.
 *
 * Recovery is now one thing: a password reset by email (the recovery codes and
 * trusted contacts it used to cover were removed, owner 2026-11-19). Better
 * Auth's `onPasswordReset` (lib/auth.ts) calls {@link startRecoveryHold}.
 *
 * The hold has no column of its own. It is derived from the `AdminAuditLog` row
 * that a completed recovery writes, so the hold and the audit trail can never
 * disagree about whether a recovery happened. The guard is called by the tip,
 * gift and redeem routes: `const held = await assertNoRecoveryHold(userId); if
 * (held) return held;`.
 */

import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';

/** How long the economy stays paused after a recovery. */
export const RECOVERY_HOLD_MS = 72 * 60 * 60 * 1000;

/** The audit action a completed recovery writes; the hold reads it back. */
export const RECOVERY_COMPLETED_ACTION = 'account.recovery.completed';

export interface RecoveryHold {
  active: boolean;
  /** When the hold lifts. Null when there is no hold. */
  until: Date | null;
  /** When the recovery completed. Null when there is none on record. */
  recoveredAt: Date | null;
}

const NO_HOLD: RecoveryHold = { active: false, until: null, recoveredAt: null };

/** Is this account inside the 72-hour post-recovery hold? */
export async function getRecoveryHold(
  userId: string,
  now: Date = new Date(),
): Promise<RecoveryHold> {
  const since = new Date(now.getTime() - RECOVERY_HOLD_MS);
  const row = await prisma.adminAuditLog.findFirst({
    where: {
      action: RECOVERY_COMPLETED_ACTION,
      targetType: 'user',
      targetId: userId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!row) return NO_HOLD;
  return {
    active: true,
    until: new Date(row.createdAt.getTime() + RECOVERY_HOLD_MS),
    recoveredAt: row.createdAt,
  };
}

/**
 * A 403 `Response` when the account is inside the hold, otherwise `null`.
 *
 * The message names the reason and the time: a user who genuinely just
 * recovered their account and cannot spend needs to know it is temporary and
 * why, or they file a support ticket that a moderator then has to reconstruct.
 */
export async function assertNoRecoveryHold(
  userId: string,
  now: Date = new Date(),
): Promise<Response | null> {
  const hold = await getRecoveryHold(userId, now);
  if (!hold.active) return null;
  return Response.json(
    {
      error:
        "This account's password was reset recently. Coin transfers, payout changes and redemptions are paused for 72 hours.",
      reason: 'recovery-hold',
      until: hold.until?.toISOString() ?? null,
    },
    { status: 403 },
  );
}

/**
 * Record a completed recovery, which starts the hold. `adminId` is the account
 * itself: no admin acted, and the foreign key needs a real user.
 */
export async function startRecoveryHold(userId: string, detail: string): Promise<void> {
  await logAdminAction(userId, RECOVERY_COMPLETED_ACTION, { targetType: 'user', targetId: userId, detail });
}
