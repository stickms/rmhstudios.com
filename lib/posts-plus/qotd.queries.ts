/** The question-of-the-day archive (today + 29 days) as a route-seeded query (redesign audit B4). */
import { getQotdArchiveApi } from '@/lib/posts-plus/qotd.contract';
import { contractQuery } from '@/lib/route/route-query';

export const qotdArchiveQuery =
  () =>
    contractQuery(
      [
        'qotd',
        'archive',
      ],
      getQotdArchiveApi,
      {
        retries: 0,
      },
      {
        staleTime: 60_000,
      },
    );
