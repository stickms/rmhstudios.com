/**
 * Responsible play (W8) — the enforcement, bound to a caller-supplied Prisma
 * client.
 *
 * Same split, and the same reason, as `ledger-core.ts`: the casino tables live
 * in `server/socket-server`, which already holds its own client. A `.server`
 * module here would either open a second pool in the hottest process or leave
 * the five busiest risk surfaces on the site unguarded.
 *
 * ## Where this is called from
 *
 * Exactly one place: `debitCoinsOn`, when the debit is classified `WAGER`.
 *
 * That is not a shortcut, it is the reason the feature is small. Every
 * coin-risking path on the site — plinko (`app/routes/api/coins/bet.ts`),
 * predictions (`lib/predictions/predictions.server.ts`), wager escrow
 * (`lib/wager/escrow.server.ts`), and blackjack, baccarat, roulette and hold'em
 * in the socket tier — already books its stake through the ledger as
 * `type: 'WAGER'`. Guarding the ledger guards all of them by construction,
 * including the next one, which is worth more than seven correct call sites.
 *
 * Two deliberate non-targets:
 *
 *   - **Payouts are never blocked.** Only debits are checked, so an excluded
 *     member is still paid what they are owed by a table they were sitting at
 *     when the exclusion started.
 *   - **`CoinStake` is not a risk surface.** It books as `REWARD` because it is
 *     a time deposit with a yield, not a bet, and it is excluded on purpose
 *     rather than by oversight.
 */

import { AppError } from '../errors/codes';
import {
  NO_LIMITS,
  blockedBy,
  dayWindowStart,
  effectiveCap,
  type PlayLimits,
} from './play-limits';
import type { Db } from './ledger-core';

/**
 * Read a member's limits, with the absent row meaning "no limits".
 *
 * Returns the stored shape untouched — `effectiveCap` rather than this function
 * is what folds in a matured pending change, so callers that want to SHOW the
 * pending state (the settings panel) and callers that want to ENFORCE the
 * current one (the ledger) read the same row and interpret it differently.
 */
export async function readPlayLimits(db: Db, userId: string): Promise<PlayLimits> {
  const row = await db.userPlayLimits.findUnique({
    where: { userId },
    select: {
      dailyCoinCap: true,
      selfExcludedUntil: true,
      coolOffUntil: true,
      pendingCap: true,
      pendingCapAt: true,
    },
  });
  return row ?? NO_LIMITS;
}

/** Coins this member has already staked since midnight UTC. */
export async function stakedToday(db: Db, userId: string, now: Date = new Date()): Promise<number> {
  const agg = await db.coinTransaction.aggregate({
    where: {
      senderId: userId,
      type: 'WAGER',
      createdAt: { gte: dayWindowStart(now) },
    },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/**
 * Refuse a stake the member has asked us to refuse.
 *
 * Throws an {@link AppError} — `defineHandler` maps it to the right status with
 * a translatable code, and the socket handlers map the same codes to their
 * error events, so a refused bet reads the same on a table and in a form.
 *
 * Runs INSIDE the ledger's transaction, which matters for the cap: the sum and
 * the decrement are then one unit of work, so two stakes racing each other
 * cannot both observe the same remaining headroom and each pass.
 *
 * `detail` carries numbers the message interpolates ("You've staked 4,800 of
 * your 5,000 today"), never a database message.
 */
export async function assertPlayAllowedOn(
  db: Db,
  userId: string,
  amount: number,
  now: Date = new Date(),
): Promise<void> {
  const limits = await readPlayLimits(db, userId);

  const blocked = blockedBy(limits, now);
  if (blocked === 'SELF_EXCLUDED') {
    throw new AppError('SELF_EXCLUDED', {
      until: limits.selfExcludedUntil?.toISOString() ?? '',
    });
  }
  if (blocked === 'COOL_OFF_ACTIVE') {
    throw new AppError('COOL_OFF_ACTIVE', {
      until: limits.coolOffUntil?.toISOString() ?? '',
    });
  }

  const cap = effectiveCap(limits, now);
  if (cap === null) return;

  const already = await stakedToday(db, userId, now);
  if (already + amount > cap) {
    throw new AppError('STAKE_LIMIT_REACHED', {
      cap,
      staked: already,
      remaining: Math.max(0, cap - already),
    });
  }
}
