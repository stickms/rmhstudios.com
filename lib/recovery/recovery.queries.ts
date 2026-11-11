/**
 * The Security settings page's account-recovery reads as route-seeded queries (redesign audit B4):
 * code status, the recovery hold, requests against this account, and trusted contacts. Each is its
 * own query because each fails on its own. Signed out: nothing is seeded.
 */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import {
  getRecoveryCodeStatusApi,
  getRecoveryHoldApi,
  listRecoveryRequestsApi,
  listTrustedContactsApi,
} from '@/lib/recovery/recovery.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getRecoveryCodeStatus } from '@/lib/recovery/codes.server';
import { getRecoveryHold } from '@/lib/recovery/hold.server';
import { listApprovableRequests, listOwnRecoveryRequests } from '@/lib/recovery/requests.server';
import { listTrustedContacts, listTrustedFor } from '@/lib/recovery/trusted-contacts.server';

// Same bodies as the GET handlers under /api/account/recovery/.
const getCodeStatusOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getRecoveryCodeStatus(session.user.id);
});

const getHoldOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  const hold = await getRecoveryHold(session.user.id);
  return {
    active: hold.active,
    until: hold.until ? hold.until.toISOString() : null,
    recoveredAt: hold.recoveredAt ? hold.recoveredAt.toISOString() : null,
  };
});

const getRequestsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  const [mine, approvable] = await Promise.all([
    listOwnRecoveryRequests(session.user.id),
    listApprovableRequests(session.user.id),
  ]);
  return { mine, approvable };
});

const getContactsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  const [contacts, trustedFor] = await Promise.all([
    listTrustedContacts(session.user.id),
    listTrustedFor(session.user.id),
  ]);
  return { contacts, trustedFor };
});

export const recoveryCodeStatusQuery = () =>
  queryOptions({
    queryKey: ['account', 'recovery', 'codes'],
    queryFn: routeQueryFn(
      () => getCodeStatusOnServer(),
      () => api(getRecoveryCodeStatusApi),
    ),
    staleTime: 15_000,
  });

export const recoveryHoldQuery = () =>
  queryOptions({
    queryKey: ['account', 'recovery', 'hold'],
    queryFn: routeQueryFn(
      () => getHoldOnServer(),
      () => api(getRecoveryHoldApi),
    ),
    staleTime: 15_000,
  });

export const recoveryRequestsQuery = () =>
  queryOptions({
    queryKey: ['account', 'recovery', 'requests'],
    queryFn: routeQueryFn(
      () => getRequestsOnServer(),
      () => api(listRecoveryRequestsApi),
    ),
    staleTime: 15_000,
  });

export const trustedContactsQuery = () =>
  queryOptions({
    queryKey: ['account', 'recovery', 'contacts'],
    queryFn: routeQueryFn(
      () => getContactsOnServer(),
      () => api(listTrustedContactsApi),
    ),
    staleTime: 15_000,
  });
