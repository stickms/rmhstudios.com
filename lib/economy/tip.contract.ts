/** Contract for /api/coins/tip (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { TipInput } from '@/lib/economy/tip-schema';

export const tipApi = endpoint<{
  body: TipInput;
  res: { success: true; newBalance: number };
}>()({ method: 'POST', path: '/api/coins/tip' });
