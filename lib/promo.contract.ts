/** Contracts for the free-month promo (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

export const getFreeMonthApi = endpoint<{
  res: { eligible: boolean; tier?: string; months?: number };
}>()({ method: 'GET', path: '/api/promo/free-month' });

export const claimFreeMonthApi = endpoint<{
  res: { success: true; tier: string; months: number };
}>()({ method: 'POST', path: '/api/promo/free-month' });
