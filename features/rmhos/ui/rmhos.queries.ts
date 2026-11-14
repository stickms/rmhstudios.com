/**
 * The rmhOS session (Linux user name + a 60 s relay ticket).
 *
 * Deliberately not cached and not seeded by the route loader: the response is `no-store`, the
 * ticket is single-purpose and short-lived, and a loader prefetch on the server would be
 * dehydrated into the HTML document (app/router.tsx dehydrates the whole QueryClient). The
 * page is client-only anyway (ClientOnly), so the component asks once per page load, fresh,
 * and the entry is dropped as soon as nothing observes it (gcTime 0).
 */
import { contractQuery } from '@/lib/route/route-query';
import { rmhosSessionApi } from '../engine/rmhos.contract';

/** Keyed by account: a sign-out and sign-in on one page never reads the previous account's ticket. */
export const rmhosSessionQuery = (userId: string | null) => ({
  ...contractQuery(['rmhos', 'session', userId ?? 'anonymous'], rmhosSessionApi, undefined, {
    staleTime: 0,
  }),
  gcTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
