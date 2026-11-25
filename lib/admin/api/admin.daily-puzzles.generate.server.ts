import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { generatePuzzleApi } from '@/lib/daily-puzzles/reports.contract';
import { generatePuzzleBody } from '@/lib/daily-puzzles/reports-schema';
import { generateNow } from '@/lib/daily-puzzles/reports.server';

/**
 * POST /api/admin/daily-puzzles/generate: create a missing row for one of the next two days early. It never replaces
 * an existing row (first writer wins, as for the prewarm).
 */
export const route = apiRoute('/api/admin/daily-puzzles/generate', {
  POST: implement(
    generatePuzzleApi,
    { auth: 'admin', rateLimit: 'write', body: generatePuzzleBody },
    async ({ body }) => {
      const out = await generateNow(body.gameMode, body.dateKey);
      if (!out.ok) return Response.json({ ...refusalBody(out.code) }, { status: ERROR_CODES[out.code].http });
      return { created: out.created, source: out.source };
    },
  ),
});
