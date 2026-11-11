/**
 * The per-account preference reads behind the settings pages as route-seeded queries
 * (redesign audit B4). Each server half runs the same body as its GET route
 * (`lib/settings/prefs.server.ts` or the feature's own `.server` module) and reads
 * the request's own session; signed out, nothing is seeded and the panel shows what
 * it always did.
 */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getAltTextSettingApi } from '@/lib/feed/alt-text.contract';
import { getAutoDeleteApi } from '@/lib/posts-plus/auto-delete.contract';
import { getAssistsApi } from '@/lib/game/assist.contract';
import { getCallAnswerApi, getCallPrivacyApi, listCallMutesApi } from '@/lib/call/calls.contract';
import {
  getNotificationMatrixApi,
  getNotificationTogglesApi,
  getPresencePrefsApi,
} from '@/lib/preferences/preferences.contract';
import {
  getDiscoveryMemoriesApi,
  listDiscoveryAlertsApi,
} from '@/lib/discovery/discovery.contract';
import { getRequireAltText } from '@/lib/feed/alt-text.server';
import { getAutoDelete } from '@/lib/posts-plus/lifecycle.server';
import { getAssists } from '@/lib/game/assist.server';
import { ASSIST_CAPABLE } from '@/lib/game/assist';
import { listAlerts } from '@/lib/discovery/alerts.server';
import { getMemoriesOptIn } from '@/lib/discovery/memories.server';
import {
  getCallAnswer,
  getCallPrivacy,
  getNotificationMatrix,
  getNotificationToggles,
  getPresencePrefs,
  listActiveCallMutes,
} from '@/lib/settings/prefs.server';

const getAltTextOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return { requireAltText: await getRequireAltText(session.user.id) };
});

const getAutoDeleteOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  // No `preview`: the window count is fetched on demand when a window is picked.
  return getAutoDelete(session.user.id);
});

const getAssistsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return {
    assists: await getAssists(session.user.id),
    honouredBy: [...ASSIST_CAPABLE].sort(),
  };
});

const getPresenceOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getPresencePrefs(session.user.id);
});

const getCallPrivacyOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getCallPrivacy(session.user.id);
});

const getCallMutesOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return listActiveCallMutes(session.user.id);
});

const getCallAnswerOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getCallAnswer(session.user.id);
});

const getNotificationTogglesOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getNotificationToggles(session.user.id);
});

const getNotificationMatrixOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getNotificationMatrix(session.user.id);
});

const getDiscoveryAlertsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return { alerts: await listAlerts(session.user.id) };
});

const getDiscoveryMemoriesOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return { enabled: await getMemoriesOptIn(session.user.id) };
});

export const altTextSettingQuery = () =>
  queryOptions({
    queryKey: ['settings', 'alt-text'],
    queryFn: routeQueryFn(
      () => getAltTextOnServer(),
      () => api(getAltTextSettingApi),
    ),
    staleTime: 30_000,
  });

export const autoDeleteSettingQuery = () =>
  queryOptions({
    queryKey: ['settings', 'auto-delete'],
    queryFn: routeQueryFn(
      () => getAutoDeleteOnServer(),
      () => api(getAutoDeleteApi),
    ),
    staleTime: 30_000,
  });

export const gameAssistsQuery = () =>
  queryOptions({
    queryKey: ['settings', 'game-assists'],
    queryFn: routeQueryFn(
      () => getAssistsOnServer(),
      () => api(getAssistsApi, { retries: 0 }),
    ),
    staleTime: 30_000,
  });

export const presencePrefsQuery = () =>
  queryOptions({
    queryKey: ['settings', 'presence'],
    queryFn: routeQueryFn(
      () => getPresenceOnServer(),
      () => api(getPresencePrefsApi),
    ),
    staleTime: 30_000,
  });

export const callPrivacyQuery = () =>
  queryOptions({
    queryKey: ['settings', 'call-privacy'],
    queryFn: routeQueryFn(
      () => getCallPrivacyOnServer(),
      () => api(getCallPrivacyApi, { retries: 0 }),
    ),
    staleTime: 30_000,
  });

export const callMutesQuery = () =>
  queryOptions({
    queryKey: ['settings', 'call-mutes'],
    queryFn: routeQueryFn(
      () => getCallMutesOnServer(),
      () => api(listCallMutesApi, { retries: 0 }),
    ),
    staleTime: 15_000,
  });

export const callAnswerQuery = () =>
  queryOptions({
    queryKey: ['settings', 'call-answer'],
    queryFn: routeQueryFn(
      () => getCallAnswerOnServer(),
      () => api(getCallAnswerApi, { retries: 0 }),
    ),
    staleTime: 30_000,
  });

export const notificationTogglesQuery = () =>
  queryOptions({
    queryKey: ['settings', 'notification-toggles'],
    queryFn: routeQueryFn(
      () => getNotificationTogglesOnServer(),
      () => api(getNotificationTogglesApi),
    ),
    staleTime: 30_000,
  });

export const notificationMatrixQuery = () =>
  queryOptions({
    queryKey: ['settings', 'notification-matrix'],
    queryFn: routeQueryFn(
      () => getNotificationMatrixOnServer(),
      () => api(getNotificationMatrixApi),
    ),
    staleTime: 30_000,
  });

export const discoveryAlertsQuery = () =>
  queryOptions({
    queryKey: ['settings', 'discovery-alerts'],
    queryFn: routeQueryFn(
      () => getDiscoveryAlertsOnServer(),
      () => api(listDiscoveryAlertsApi, { retries: 0 }),
    ),
    staleTime: 15_000,
  });

export const discoveryMemoriesQuery = () =>
  queryOptions({
    queryKey: ['settings', 'discovery-memories'],
    queryFn: routeQueryFn(
      () => getDiscoveryMemoriesOnServer(),
      () => api(getDiscoveryMemoriesApi, { retries: 0 }),
    ),
    staleTime: 30_000,
  });
