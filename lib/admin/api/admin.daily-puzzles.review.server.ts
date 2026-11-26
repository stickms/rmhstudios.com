import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { reviewReportsApi } from '@/lib/daily-puzzles/reports.contract';
import { reviewReportsBody } from '@/lib/daily-puzzles/reports-schema';
import { reviewReports } from '@/lib/daily-puzzles/reports.server';

/**
 * POST /api/admin/daily-puzzles/review: mark a mode-day's open reports reviewed with one outcome (`fault` or `stands`)
 * and an optional note shown to the reporters. Each open report is claimed once, so a second review changes nothing and
 * tells nobody; each claimed reporter gets one notice. The puzzle and the scores are never touched. Audited in the same
 * transaction.
 */
export const route = apiRoute('/api/admin/daily-puzzles/review', {
  POST: implement(
    reviewReportsApi,
    { auth: 'admin', rateLimit: 'write', body: reviewReportsBody },
    async ({ userId, body }) => {
      const out = await reviewReports(userId, body.gameMode, body.dateKey, body.outcome, body.note);
      if (!out.ok) return Response.json({ ...refusalBody(out.code) }, { status: ERROR_CODES[out.code].http });
      return { ok: true as const, reviewed: out.reviewed };
    },
  ),
});
