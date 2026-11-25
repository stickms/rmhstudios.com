import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { fileReportApi } from '@/lib/daily-puzzles/reports.contract';
import { fileReportBody } from '@/lib/daily-puzzles/reports-schema';
import { fileReport } from '@/lib/daily-puzzles/reports.server';

/**
 * PUT /api/daily-puzzles/report: a member who finished an AI daily puzzle says what is wrong with it. One report per
 * member per puzzle; sending again replaces the kind and the note. The answer is never echoed.
 */
export const route = apiRoute('/api/daily-puzzles/report', {
  PUT: implement(
    fileReportApi,
    {
      rateLimit: { limit: 10, windowMs: 3_600_000, prefix: 'puzzle-report', scope: 'user' },
      body: fileReportBody,
    },
    async ({ userId, body }) => {
      const out = await fileReport(userId, body);
      if (!out.ok) return Response.json({ ...refusalBody(out.code) }, { status: ERROR_CODES[out.code].http });
      return { ok: true as const };
    },
  ),
});
