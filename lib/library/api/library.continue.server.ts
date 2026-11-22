import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { continueReadingApi } from '@/lib/library/reader-sync.contract';
import { listContinueReading } from '@/lib/library/reader-sync.server';

/**
 * GET /api/library/continue — the caller's books by latest synced place (up to 6),
 * for the Continue reading row on /library. Finished and no-longer-readable books are left out.
 */
export const route = apiRoute('/api/library/continue', {
  GET: implement(
    continueReadingApi,
    {
      rateLimit: 'read',
    },
    async ({ userId }) => ({
      books: await listContinueReading(userId),
    }),
  ),
});
