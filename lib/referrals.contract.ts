/**
 * Contracts for /api/referrals (redesign audit C1, batch 5). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

/** The caller's invite code (created on first call), share URL, reward and stats. */
export const getMyReferralApi = endpoint<{
  res: { code: string; url: string; reward: number; invited: number; rewarded: number };
}>()({ method: 'GET', path: '/api/referrals/me' });
