/**
 * The site's QueryClient factory (redesign audit B4).
 *
 * `getRouter()` (app/router.tsx) calls this once per SSR request and once per
 * page load in the browser, puts the client on the router context, and wires
 * the router's `dehydrate` / `hydrate` to it. Route loaders seed that client
 * (`lib/route/route-query.ts`), the server serialises it into the document, the
 * browser rehydrates it before its first loader runs, and `components/Providers`
 * hands the very same client to `QueryClientProvider`. A request never shares a
 * client with another request: the factory is only ever called per router.
 */
import { QueryClient } from '@tanstack/react-query';
import { isRetryable, maxRetries, retryDelayMs } from '@/lib/http';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1 minute — serve cached data before refetching
        gcTime: 10 * 60_000, // keep unused data 10 min so back-nav doesn't refetch
        // Retry only what retrying can fix — a dropped connection, a timeout, a
        // 429 or a 5xx — never a 4xx the user needs to see now. One more attempt
        // on a 2G-class link, exponential backoff with jitter, and a server's
        // Retry-After honoured (lib/http). Offline, React Query's default
        // `networkMode: 'online'` pauses queries and resumes them on reconnect.
        retry: (failureCount, error) => failureCount < maxRetries() && isRetryable(error),
        retryDelay: (attempt, error) => retryDelayMs(attempt, error),
        // Slow-WiFi friendly: don't re-hit the network just because the user
        // tab-switched. Reconnects still revalidate stale data.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
}
