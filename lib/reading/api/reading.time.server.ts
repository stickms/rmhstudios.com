import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteReadingTimeApi, readingTimeSummaryApi, recordReadingTimeApi } from '@/lib/reading/time.contract';
import { recordTimeBody, timeSummaryQuery } from '@/lib/reading/time-schema';
import { deleteReadingTime } from '@/lib/reading/time.server';
import { readingTimeSummary, recordReadingTime } from '@/lib/reading/time-record.server';

/**
 * POST   /api/reading/time — one flush of accumulated reading seconds for a document.
 * GET    /api/reading/time — this week, the last four weeks and the month's top documents.
 * DELETE /api/reading/time — delete every row of the caller's reading time.
 * Private to the caller: no public reader, profile, card or developer-API path.
 */
export const route = apiRoute('/api/reading/time', {
  POST: implement(
    recordReadingTimeApi,
    {
      rateLimit: {
        limit: 30,
        windowMs: 60_000,
        prefix: 'reading-time',
        scope: 'user',
      },
      body: recordTimeBody,
    },
    async ({ userId, body }) => {
      const r = await recordReadingTime(userId, body);
      if (!r.ok)
        return Response.json(
          {
            error: r.error,
          },
          {
            status: r.status,
          },
        );
      return {
        recorded: r.recorded,
      };
    },
  ),
  GET: implement(
    readingTimeSummaryApi,
    {
      rateLimit: 'read',
      query: timeSummaryQuery,
    },
    async ({ userId, query }) => {
      const s = await readingTimeSummary(userId, query);
      return Response.json(s, {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      });
    },
  ),
  DELETE: implement(
    deleteReadingTimeApi,
    {
      rateLimit: 'write',
    },
    async ({ userId }) => {
      await deleteReadingTime(userId);
      return {
        ok: true as const,
      };
    },
  ),
});
