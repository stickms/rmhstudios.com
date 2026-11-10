/**
 * The wager list as a route-seeded query (redesign audit B4). The "open" tab is
 * public; "mine" needs a session and is only fetched by the client.
 */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { listWagers, expireStaleWagers, type SerializedWager } from '@/lib/wager/wager.server';

export type WagerFilter = 'open' | 'mine';

const listWagersOnServer = createServerFn({ method: 'GET' })
  .validator((filter: WagerFilter): WagerFilter => (filter === 'mine' ? 'mine' : 'open'))
  .handler(async ({ data: filter }) => {
    const session = await getRequestSession();
    const viewerId = session?.user?.id ?? null;
    if (filter === 'mine' && !viewerId) throw new Error('Unauthorized');
    // Opportunistically refund challenges that timed out (no cron tier), as the API route does.
    void expireStaleWagers().catch(() => {});
    return listWagers({ viewerId, filter });
  });

export const wagersQuery = (filter: WagerFilter) =>
  queryOptions({
    queryKey: ['wager', 'list', filter],
    queryFn: routeQueryFn<SerializedWager[]>(
      () => listWagersOnServer({ data: filter }),
      async () => {
        const res = await fetch(`/api/wager?filter=${filter}`);
        const data = await res.json().catch(() => ({ wagers: [] }));
        return res.ok ? ((data.wagers ?? []) as SerializedWager[]) : [];
      },
    ),
    staleTime: 5_000,
  });
