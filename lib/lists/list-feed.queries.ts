/** A list's first timeline page as a route-seeded query (redesign audit B4). Later pages are "load more", client-owned. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getListDetail, listTimeline } from '@/lib/lists/lists.server';
import { listFeedApi } from '@/lib/lists/lists.contract';

// Same rule as GET /api/lists/:id/feed: no visible list, no feed.
const listFeedOnServer = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const session = await getRequestSession();
    const viewerId = session?.user.id ?? null;
    if (!(await getListDetail(id, viewerId))) throw new Error('Not found');
    return listTimeline(viewerId, id);
  });

export const listFeedQuery = (id: string) =>
  queryOptions({
    queryKey: ['lists', 'feed', id],
    queryFn: routeQueryFn(
      () => listFeedOnServer({ data: id }),
      () => api(listFeedApi, { params: { id } }),
    ),
    staleTime: 15_000,
  });
