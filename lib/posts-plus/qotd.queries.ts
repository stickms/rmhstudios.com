/** The question-of-the-day archive (today + 29 days) as a route-seeded query (redesign audit B4). */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { routeQueryFn } from '@/lib/route/route-query';
import { listArchive } from '@/lib/posts-plus/qotd.server';
import { getQotdArchiveApi } from '@/lib/posts-plus/qotd.contract';

const getArchiveOnServer = createServerFn({ method: 'GET' }).handler(async () => ({
  days: await listArchive(),
}));

export const qotdArchiveQuery = () =>
  queryOptions({
    queryKey: ['qotd', 'archive'],
    queryFn: routeQueryFn(
      () => getArchiveOnServer(),
      () => api(getQotdArchiveApi, { retries: 0 }),
    ),
    staleTime: 60_000,
  });
