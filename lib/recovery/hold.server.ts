/**
 * The post-recovery economy hold (I3, "security constraints that are not
 * optional").
 *
 * For 72 hours after a completed recovery the account cannot **move coins,
 * change payout details, or file a `RedemptionRequest`**. Without it, account
 * recovery is the cheapest route into the economy: everything else in the flow
 * only slows a takeover down, and a takeover that can cash out in the first
 * minute does not care.
 *
 * The hold has no column of its own. It is derived from the mandatory
 * `AdminAuditLog` row that a completed recovery writes — which is the right
 * source anyway: the hold and the audit trail can then never disagree about
 * whether a recovery happened, and there is no second piece of state to forget
 * to set.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WIRING (not yet done — those files are outside this change's ownership):
 * the guard has to be *called*. One line at the top of each of these:
 *
 *   lib/coins.server.ts      → awardCoins / any transfer      (throw / refuse)
 *   lib/creator/earnings.server.ts → createRedemptionRequest   (refuse)
 *   the payout-details settings route                          (refuse)
 *
 * `assertNoRecoveryHold(userId)` returns a ready-to-return 403 `Response` or
 * `null`, so the call site is `const held = await assertNoRecoveryHold(userId);
 * if (held) return held;`.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '@/lib/prisma.server';
import { RECOVERY_HOLD_MS } from '@/lib/recovery/policy';

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
        'This account was recently recovered. Coin transfers, payout changes and redemptions are paused for 72 hours.',
      reason: 'recovery-hold',
      until: hold.until?.toISOString() ?? null,
    },
    { status: 403 },
  );
}
