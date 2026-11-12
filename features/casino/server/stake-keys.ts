/**
 * Casino — the ledger idempotency keys of one stake (third-pass audit OP3).
 * Pure; `stake-ledger.ts` explains what the keys mean and reads them back.
 */

export type StakeFate = 'returned' | 'paid';

export interface StakeKeys {
  payout(stakeId: string): string;
  returned(stakeId: string): string;
}

export function stakeKeys(prefix: string): StakeKeys {
  return {
    payout: (stakeId) => `${prefix}-payout:${stakeId}`,
    returned: (stakeId) => `${prefix}-return:${stakeId}`,
  };
}
