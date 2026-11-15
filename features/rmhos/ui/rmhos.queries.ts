/**
 * The rmhOS session: the Linux user name, and whether networking is on. The response also carries
 * a 60 s relay ticket, which this query does not use: the machine fetches its own, when it is
 * about to be built (`fetchRelayTicket` in ../engine/relay-ticket.ts). The page asks once on load
 * and again on every restart, so this unused ticket is minted twice for nothing; the endpoint has
 * no way to skip it yet.
 *
 * Deliberately not cached and not seeded by the route loader: the response is `no-store` and a
 * loader prefetch on the server would be dehydrated into the HTML document (app/router.tsx
 * dehydrates the whole QueryClient). The page is client-only anyway (ClientOnly), so the
 * component asks fresh, and the entry is dropped as soon as nothing observes it (gcTime 0).
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
