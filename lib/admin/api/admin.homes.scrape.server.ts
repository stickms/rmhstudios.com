import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody, ERROR_CODES } from '@/lib/errors/codes';
import { runAdminHomesScrapeApi } from '@/lib/admin/homes.contract';
import { queueScrape } from '@/lib/admin/homes.server';

/**
 * POST /api/admin/homes/scrape — queue one `homes.scrape` job with trigger MANUAL. The queue is exclusive, so a second
 * press while one is queued or running answers HOME_SCRAPE_QUEUED. Admin only; audited.
 */
export const route = apiRoute('/api/admin/homes/scrape', {
  POST: implement(runAdminHomesScrapeApi, { auth: 'admin', rateLimit: 'write' }, async ({ session }) => {
    const out = await queueScrape(session.user.id);
    if (out.ok) return { queued: true as const };
    if ('unavailable' in out) {
      return Response.json({ error: 'The job queue is unavailable.' }, { status: 503 });
    }
    return Response.json({ ...refusalBody(out.code) }, { status: ERROR_CODES[out.code].http });
  }),
});
