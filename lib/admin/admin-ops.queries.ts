/**
 * The admin dashboards' reads (analytics, coin economy, feature flags, redemptions, emoji packs) as
 * route-seeded queries (redesign audit B4). Each is its GET route, run in-process by the loader
 * (`contractQuery`, third-pass audit AR2), so `auth: 'admin'` on the route is the one admin check.
 */
import {
  getAdminAnalyticsApi,
  getAdminEconomyApi,
  listAdminEmojiPacksApi,
  listAdminFlagsApi,
  listAdminRedemptionsApi,
} from '@/lib/admin/admin-ops.contract';
import { contractQuery } from '@/lib/route/route-query';

export const adminAnalyticsQuery = () =>
  contractQuery(
    ['admin', 'analytics'],
    getAdminAnalyticsApi,
    { retries: 0 },
    { staleTime: 30_000 },
  );

/** `days` is the window as the page holds it: '7' | '30' | '90'. */
export const adminEconomyQuery = (days: string) =>
  contractQuery(
    ['admin', 'economy', days],
    getAdminEconomyApi,
    { query: { days }, retries: 0 },
    { staleTime: 30_000 },
  );

export const adminFlagsQuery = () =>
  contractQuery(['admin', 'flags'], listAdminFlagsApi, { retries: 0 }, { staleTime: 15_000 });

export const adminRedemptionsQuery = () =>
  contractQuery(
    ['admin', 'redemptions'],
    listAdminRedemptionsApi,
    { retries: 0 },
    { staleTime: 15_000 },
  );

export const adminEmojiPacksQuery = () =>
  contractQuery(
    ['admin', 'emoji-packs'],
    listAdminEmojiPacksApi,
    { retries: 0 },
    { staleTime: 15_000 },
  );
