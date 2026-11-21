import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listPracticeApi } from '@/lib/rmhmusic/history.contract';
import { entriesQuery } from '@/lib/rmhmusic/history-schema';
import { listPractice } from '@/lib/rmhmusic/history.server';

/** `GET /api/rmhmusic/history/entries?kind=&cursor=` — one page of the learner's own entries, newest first. */
export const route =
  apiRoute(
    '/api/rmhmusic/history/entries',
    {
      GET: implement(
        listPracticeApi,
        {
          rateLimit:
            'read',
          query:
            entriesQuery,
        },
        async ({
          userId,
          query,
        }) =>
          listPractice(
            userId,
            {
              kind: query.kind,
              cursor:
                query.cursor,
            },
          ),
      ),
    },
  );
