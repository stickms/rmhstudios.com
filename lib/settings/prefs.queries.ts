/**
 * The per-account preference reads behind the settings pages as route-seeded queries
 * (redesign audit B4). Each is its GET route, run in-process by the loader with the
 * request's own session; signed out, nothing is seeded and the panel shows what it
 * always did.
 */
import { getAltTextSettingApi } from '@/lib/feed/alt-text.contract';
import { getAutoDeleteApi } from '@/lib/posts-plus/auto-delete.contract';
import { getAssistsApi } from '@/lib/game/assist.contract';
import {
  getCallAnswerApi,
  getCallPrivacyApi,
  listCallMutesApi,
} from '@/lib/call/calls.contract';
import {
  getNotificationMatrixApi,
  getNotificationTogglesApi,
  getPresencePrefsApi,
} from '@/lib/preferences/preferences.contract';
import {
  getDiscoveryMemoriesApi,
  listDiscoveryAlertsApi,
} from '@/lib/discovery/discovery.contract';
import { contractQuery } from '@/lib/route/route-query';

export const altTextSettingQuery =
  () =>
    contractQuery(
      [
        'settings',
        'alt-text',
      ],
      getAltTextSettingApi,
      undefined,
      {
        staleTime: 30_000,
      },
    );

// No `preview`: the window count is fetched on demand when a window is picked.
export const autoDeleteSettingQuery =
  () =>
    contractQuery(
      [
        'settings',
        'auto-delete',
      ],
      getAutoDeleteApi,
      undefined,
      {
        staleTime: 30_000,
      },
    );

export const gameAssistsQuery =
  () =>
    contractQuery(
      [
        'settings',
        'game-assists',
      ],
      getAssistsApi,
      {
        retries: 0,
      },
      {
        staleTime: 30_000,
      },
    );

export const presencePrefsQuery =
  () =>
    contractQuery(
      [
        'settings',
        'presence',
      ],
      getPresencePrefsApi,
      undefined,
      {
        staleTime: 30_000,
      },
    );

export const callPrivacyQuery =
  () =>
    contractQuery(
      [
        'settings',
        'call-privacy',
      ],
      getCallPrivacyApi,
      {
        retries: 0,
      },
      {
        staleTime: 30_000,
      },
    );

export const callMutesQuery =
  () =>
    contractQuery(
      [
        'settings',
        'call-mutes',
      ],
      listCallMutesApi,
      {
        retries: 0,
      },
      {
        staleTime: 15_000,
      },
    );

export const callAnswerQuery =
  () =>
    contractQuery(
      [
        'settings',
        'call-answer',
      ],
      getCallAnswerApi,
      {
        retries: 0,
      },
      {
        staleTime: 30_000,
      },
    );

export const notificationTogglesQuery =
  () =>
    contractQuery(
      [
        'settings',
        'notification-toggles',
      ],
      getNotificationTogglesApi,
      undefined,
      {
        staleTime: 30_000,
      },
    );

export const notificationMatrixQuery =
  () =>
    contractQuery(
      [
        'settings',
        'notification-matrix',
      ],
      getNotificationMatrixApi,
      undefined,
      {
        staleTime: 30_000,
      },
    );

export const discoveryAlertsQuery =
  () =>
    contractQuery(
      [
        'settings',
        'discovery-alerts',
      ],
      listDiscoveryAlertsApi,
      {
        retries: 0,
      },
      {
        staleTime: 15_000,
      },
    );

export const discoveryMemoriesQuery =
  () =>
    contractQuery(
      [
        'settings',
        'discovery-memories',
      ],
      getDiscoveryMemoriesApi,
      {
        retries: 0,
      },
      {
        staleTime: 30_000,
      },
    );
