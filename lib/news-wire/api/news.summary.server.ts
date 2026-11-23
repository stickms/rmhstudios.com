import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { requestNewsSummaryApi } from '@/lib/news-wire/news-wire.contract';
import { getOrCreateSummary } from '@/lib/news-wire/summary.server';

/**
 * POST /api/news/summary — the summary on an RMH News article page (lib/news-wire/summary.server.ts).
 *
 * Open to signed-out readers (`auth: 'none'`): the article is public, and a summary behind a sign-in would be a worse
 * page for the reader most likely to be deciding whether to click through. A cached summary costs one row read; only
 * the first reader of an article reaches the model, and the AI rate limit (per IP) plus the daily cap bound that.
 */
export const route = apiRoute('/api/news/summary', {
  POST: implement(
    requestNewsSummaryApi,
    {
      auth: 'none',
      rateLimit: { policy: 'ai', prefix: 'news-summary', limit: 12, windowMs: 60_000 },
      body: z.object({ slug: z.string().min(1).max(200) }),
    },
    async ({ body }) => {
      const result = await getOrCreateSummary(body.slug);
      if (!result) return Response.json({ error: 'Not found' }, { status: 404 });
      return result;
    },
  ),
});
