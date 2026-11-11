/** The jams list and one jam as route-seeded queries (redesign audit B4). The list is public; a jam carries the viewer's own ratings. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getJam, listJams } from '@/lib/competitive/jams.server';
import { getJamApi, listJamsApi } from '@/lib/competitive/jams.contract';

const listJamsOnServer = createServerFn({ method: 'GET' }).handler(async () => ({
  jams: await listJams(),
}));

export const jamsQuery = () =>
  queryOptions({
    queryKey: ['jams', 'list'],
    queryFn: routeQueryFn(
      () => listJamsOnServer(),
      () => api(listJamsApi, { retries: 0 }),
    ),
    staleTime: 5_000,
  });

// Same body as GET /api/jams/:slug; an unknown jam fails the fetch, which the page shows as "does not exist".
const getJamOnServer = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const session = await getRequestSession();
    const jam = await getJam(slug, session?.user?.id ?? null);
    if (!jam) throw new Error('Not found');
    return { jam };
  });

export const jamQuery = (slug: string) =>
  queryOptions({
    queryKey: ['jams', 'detail', slug],
    queryFn: routeQueryFn(
      () => getJamOnServer({ data: slug }),
      () => api(getJamApi, { params: { slug }, retries: 0 }),
    ),
    staleTime: 5_000,
  });
