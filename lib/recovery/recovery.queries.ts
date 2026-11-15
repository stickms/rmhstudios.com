/**
 * The Security settings page's account-recovery reads as route-seeded queries (redesign audit B4):
 * code status, the recovery hold, requests against this account, and trusted contacts. Each is its
 * own query because each fails on its own. Signed out: nothing is seeded.
 */
import {
  getRecoveryCodeStatusApi,
  getRecoveryHoldApi,
  listRecoveryRequestsApi,
  listTrustedContactsApi,
} from '@/lib/recovery/recovery.contract';
import { contractQuery } from '@/lib/route/route-query';

export const recoveryCodeStatusQuery =
  () =>
    contractQuery(
      [
        'account',
        'recovery',
        'codes',
      ],
      getRecoveryCodeStatusApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );

export const recoveryHoldQuery =
  () =>
    contractQuery(
      [
        'account',
        'recovery',
        'hold',
      ],
      getRecoveryHoldApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );

export const recoveryRequestsQuery =
  () =>
    contractQuery(
      [
        'account',
        'recovery',
        'requests',
      ],
      listRecoveryRequestsApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );

export const trustedContactsQuery =
  () =>
    contractQuery(
      [
        'account',
        'recovery',
        'contacts',
      ],
      listTrustedContactsApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );
