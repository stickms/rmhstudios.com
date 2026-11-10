/** One series (header + parts) as a route-seeded query (redesign audit B4). A missing series fails the fetch. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getSeriesView } from '@/lib/posts-plus/series.server';
import { getSeriesApi } from '@/lib/posts-plus/series.contract';

const getSeriesOnServer = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const session = await getRequestSession();
    const view = await getSeriesView(id, session?.user.id ?? null);
    if (!view) throw new Error('Not found');
    return view;
  });

export const seriesDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ['series', 'detail', id],
    queryFn: routeQueryFn(
      () => getSeriesOnServer({ data: id }),
      () => api(getSeriesApi, { params: { id } }),
    ),
    staleTime: 5_000,
  });
