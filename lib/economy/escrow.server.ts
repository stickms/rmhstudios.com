/**
 * The web tier's binding of `escrow-core.ts`: escrow whose balance movements go
 * through the coin ledger (`ledger.server.ts`), inside the caller's
 * transaction. Pools and community goals use it.
 *
 * The rationale and the ordering rule (claim, then credit) are documented in
 * `escrow-core.ts`. The hub imports that module directly and never this one.
 */

import type { Prisma } from '@prisma/client';
import { creditCoins, debitCoins, type LedgerOptions } from '@/lib/economy/ledger.server';
import type { EscrowLedger } from '@/lib/economy/escrow-core';

export {
  holdEscrow,
  settleEscrow,
  refundEscrow,
  readSettledKeys,
  type EscrowCredit,
  type EscrowHolding,
  type EscrowLedger,
  type EscrowRefundPlan,
  type EscrowRefundResult,
  type EscrowTxRunner,
} from '@/lib/economy/escrow-core';

/** How a ledger-backed escrow movement is booked. The transaction is the escrow's. */
export type LedgerMovement = Omit<LedgerOptions, 'tx' | 'onlyIfBalanceBelow'>;

/**
 * Holds are ledger SINKs (`debitCoins`, which throws `InsufficientFundsError`
 * inside its conditional update) and payouts are ledger FAUCETs
 * (`creditCoins`), both joined to the escrow's transaction so the movement and
 * the escrow's own rows commit together.
 */
export const ledgerEscrow: EscrowLedger<Prisma.TransactionClient, LedgerMovement> = {
  debit: (tx, userId, amount, movement) => debitCoins(userId, amount, { ...movement, tx }),
  credit: (tx, userId, amount, movement) => creditCoins(userId, amount, { ...movement, tx }),
};
