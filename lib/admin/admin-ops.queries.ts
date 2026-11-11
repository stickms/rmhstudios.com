/**
 * The admin dashboards' reads (analytics, coin economy, feature flags, redemptions, emoji packs) as
 * route-seeded queries (redesign audit B4). The `/admin` layout route already redirects non-admins in
 * `beforeLoad`; each server half checks `isAdmin` again, as `auth: 'admin'` does for the API route.
 */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import {
  getAdminAnalyticsApi,
  getAdminEconomyApi,
  listAdminEmojiPacksApi,
  listAdminFlagsApi,
  listAdminRedemptionsApi,
} from '@/lib/admin/admin-ops.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { prisma } from '@/lib/prisma.server';
import { getAdminAnalytics } from '@/lib/admin/analytics.server';
import { getEconomySnapshot } from '@/lib/economy/supply.server';
import { COIN_FLOWS, supplyShape } from '@/lib/economy/flows';
import { listPendingRedemptions } from '@/lib/creator/earnings.server';
import { listPendingPacks } from '@/lib/emoji/packs.server';

async function requireAdmin() {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  if (!(session.user as { isAdmin?: boolean }).isAdmin) throw new Error('Forbidden');
}

// Same bodies as the GET handlers under /api/admin/.
const getAnalyticsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin();
  return getAdminAnalytics();
});

const getEconomyOnServer = createServerFn({ method: 'GET' })
  .validator((days: string) => days)
  .handler(async ({ data }) => {
    await requireAdmin();
    const raw = Number(data);
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 365) : 30;
    return { snapshot: await getEconomySnapshot(days), flows: COIN_FLOWS, shape: supplyShape() };
  });

const getFlagsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin();
  return { flags: await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }) };
});

const getRedemptionsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin();
  return { requests: await listPendingRedemptions({}) };
});

const getEmojiPacksOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin();
  return { packs: await listPendingPacks() };
});

export const adminAnalyticsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'analytics'],
    queryFn: routeQueryFn(
      () => getAnalyticsOnServer(),
      () => api(getAdminAnalyticsApi, { retries: 0 }),
    ),
    staleTime: 30_000,
  });

/** `days` is the window as the page holds it: '7' | '30' | '90'. */
export const adminEconomyQuery = (days: string) =>
  queryOptions({
    queryKey: ['admin', 'economy', days],
    queryFn: routeQueryFn(
      () => getEconomyOnServer({ data: days }),
      () => api(getAdminEconomyApi, { query: { days }, retries: 0 }),
    ),
    staleTime: 30_000,
  });

export const adminFlagsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'flags'],
    queryFn: routeQueryFn(
      () => getFlagsOnServer(),
      () => api(listAdminFlagsApi, { retries: 0 }),
    ),
    staleTime: 15_000,
  });

export const adminRedemptionsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'redemptions'],
    queryFn: routeQueryFn(
      () => getRedemptionsOnServer(),
      () => api(listAdminRedemptionsApi, { retries: 0 }),
    ),
    staleTime: 15_000,
  });

export const adminEmojiPacksQuery = () =>
  queryOptions({
    queryKey: ['admin', 'emoji-packs'],
    queryFn: routeQueryFn(
      () => getEmojiPacksOnServer(),
      () => api(listAdminEmojiPacksApi, { retries: 0 }),
    ),
    staleTime: 15_000,
  });
