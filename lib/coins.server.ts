/**
 * Shared coin-award helper. The codebase historically mutated
 * UserProfile.coins inline at each call site and only tips/gifts wrote ledger
 * rows; new features should award through here instead so every system grant
 * lands in the CoinTransaction ledger.
 */

import { prisma } from '@/lib/prisma.server';
import type { CoinTxnType } from '@prisma/client';

export interface AwardCoinsOptions {
  /** Ledger transaction type. Defaults to REWARD (system grant). */
  type?: CoinTxnType;
  /** Short human-readable reason, shown in the wallet ledger. */
  note?: string;
  entityType?: string;
  entityId?: string;
  /** Sending user for peer-to-peer grants; omit for system rewards. */
  senderId?: string | null;
}

/**
 * Credit `amount` coins to a user and record it in the ledger. Best-effort:
 * returns false (and logs) on failure rather than throwing, matching how the
 * rest of the reward pipeline behaves.
 */
export async function awardCoins(
  userId: string,
  amount: number,
  opts: AwardCoinsOptions = {}
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  try {
    await prisma.$transaction([
      prisma.userProfile.upsert({
        where: { userId },
        // New profiles start at 10 coins — keep that baseline when seeding.
        create: { userId, coins: 10 + amount },
        update: { coins: { increment: amount } },
        select: { userId: true },
      }),
      prisma.coinTransaction.create({
        data: {
          senderId: opts.senderId ?? null,
          recipientId: userId,
          amount,
          type: opts.type ?? 'REWARD',
          note: opts.note?.slice(0, 280) ?? null,
          entityType: opts.entityType ?? null,
          entityId: opts.entityId ?? null,
        },
      }),
    ]);
    return true;
  } catch (err) {
    console.error('[coins] award failed:', err);
    return false;
  }
}
