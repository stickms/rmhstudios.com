/** One series (header + parts) as a route-seeded query (redesign audit B4). A missing series fails the fetch. */
import { getSeriesApi } from '@/lib/posts-plus/series.contract';
import { contractQuery } from '@/lib/route/route-query';

export const seriesDetailQuery = (id: string) =>
  contractQuery(['series', 'detail', id], getSeriesApi, { params: { id } }, { staleTime: 5_000 });
