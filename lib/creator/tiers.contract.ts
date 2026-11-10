/** Contracts for /api/studio/tiers (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { SerializedTier } from '@/lib/creator/tiers.server';

export interface TierDraftBody {
  id?: string | undefined;
  name: string;
  priceCoins: number;
  perks: string[];
  sortOrder: number;
}

/** Replace the caller's tier set (1-3). A refused set answers 400 `{ error }`. */
export const saveTiersApi = endpoint<{
  body: { tiers: TierDraftBody[] };
  res: { tiers: SerializedTier[] };
}>()({ method: 'PUT', path: '/api/studio/tiers' });
