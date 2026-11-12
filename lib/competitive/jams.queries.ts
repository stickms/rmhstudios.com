/** The jams list and one jam as route-seeded queries (redesign audit B4). The list is public; a jam carries the viewer's own ratings. */
import { getJamApi, listJamsApi } from '@/lib/competitive/jams.contract';
import { contractQuery } from '@/lib/route/route-query';

export const jamsQuery = () =>
  contractQuery(['jams', 'list'], listJamsApi, { retries: 0 }, { staleTime: 5_000 });

/** An unknown jam fails the fetch (404), which the page shows as "does not exist". */
export const jamQuery = (slug: string) =>
  contractQuery(
    ['jams', 'detail', slug],
    getJamApi,
    { params: { slug }, retries: 0 },
    { staleTime: 5_000 },
  );
