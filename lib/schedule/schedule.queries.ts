/** The "what's on" grid as a route-seeded query (redesign audit B4). Public, same for everyone. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { routeQueryFn } from '@/lib/route/route-query';
import { getGrid } from '@/lib/schedule/grid.server';

const getGridOnServer = createServerFn({ method: 'GET' }).handler(() => getGrid(new Date(), 7));

/** `T` is the wire shape the page declares for `/api/schedule`. */
export const scheduleQuery = <T>() =>
  queryOptions({
    queryKey: ['schedule', 7],
    queryFn: routeQueryFn<T>(
      () => getGridOnServer(),
      async () => {
        const r = await fetch('/api/schedule?days=7');
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as T;
      },
    ),
    // The buckets are floored to midnight UTC server-side; a minute is plenty.
    staleTime: 60_000,
    retry: false,
  });
