/**
 * Contracts for the admin coin adjustments (s04-06). Client-safe: types come from
 * the zod schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AdjustmentSummary, AdjustmentView } from '@/lib/economy/adjustments';
import type { adjustBody } from '@/lib/economy/adjustments-schema';

/** A member's balance, the read-only reconciliation line and their last 20 adjustments. */
export const getCoinAdjustmentsApi = endpoint<{ res: AdjustmentSummary }>()({
  method: 'GET',
  path: '/api/admin/users/$id/coins',
});

/** Add or remove coins through the ledger. A repeat of the same `key` applies once. */
export const adjustCoinsApi = endpoint<{
  body: z.infer<typeof adjustBody>;
  res: { adjustment: AdjustmentView; balance: number; replayed: boolean };
}>()({ method: 'POST', path: '/api/admin/users/$id/coins' });

/** Undo one adjustment with the opposite one; refused if it was already reversed. */
export const reverseCoinAdjustmentApi = endpoint<{
  res: { adjustment: AdjustmentView; balance: number };
}>()({ method: 'POST', path: '/api/admin/users/$id/coins/$adjustmentId/reverse' });
