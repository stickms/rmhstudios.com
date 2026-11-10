/** Contracts for the account-status page (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { AccountStanding } from '@/lib/moderation/standing.server';

export const accountStandingApi = endpoint<{ res: AccountStanding }>()({
  method: 'GET',
  path: '/api/account/standing',
});

/** Contest one strike; the text is 20-2000 characters. */
export const appealStrikeApi = endpoint<{
  body: { text: string };
  res: { success: true; appealStatus: 'PENDING' };
}>()({ method: 'POST', path: '/api/account/strikes/$id/appeal' });
