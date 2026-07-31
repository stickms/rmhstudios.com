/**
 * Shared coin-award helper — now a thin shim over the ledger.
 *
 * This function predates `lib/economy/ledger.server.ts` and is imported all
 * over the reward pipeline, so it keeps its signature and its best-effort
 * contract (returns false instead of throwing). What changed is what it does
 * underneath: `creditCoins` owns the balance write and the ledger row, so a
 * grant made through here is indistinguishable from any other movement and
 * shows up in supply reporting as a faucet.
 *
 * New code should call `creditCoins` directly — it exposes idempotency keys and
 * propagates errors, both of which this shim deliberately swallows.
 */

import { creditCoins, type LedgerOptions } from '@/lib/economy/ledger.server';
import type { CoinTxnType } from '@prisma/client';

export interface AwardCoinsOptions {
  /** Ledger transaction type. Defaults to REWARD (system grant). */
  type?: CoinTxnType;
  /** Short human-readable reason, shown in the wallet ledger. */
  note?: string;
  entityType?: string;
  entityId?: string;
  /**
   * Sending user for peer-to-peer grants; omit for system rewards.
   *
   * @deprecated A grant with a sender is a TRANSFER, and routing one through
   * here credits the recipient without debiting the sender — inventing coins.
   * Call `transferCoins` instead. The parameter is retained so existing callers
   * still compile; it is ignored.
   */
  senderId?: string | null;
  /** Dedupe token — a repeat with the same key does not grant twice. */
  idempotencyKey?: string;
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
    const options: LedgerOptions = {
      type: opts.type ?? 'REWARD',
      note: opts.note,
      entityType: opts.entityType,
      entityId: opts.entityId,
      idempotencyKey: opts.idempotencyKey,
    };
    const result = await creditCoins(userId, Math.floor(amount), options);
    return result.applied || result.replayed;
  } catch (err) {
    console.error('[coins] award failed:', err);
    return false;
  }
}
