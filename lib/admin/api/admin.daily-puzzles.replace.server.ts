import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { replacePuzzleApi } from '@/lib/daily-puzzles/reports.contract';
import { replacePuzzleBody } from '@/lib/daily-puzzles/reports-schema';
import { replaceFuturePuzzle } from '@/lib/daily-puzzles/reports.server';

/**
 * POST /api/admin/daily-puzzles/replace: replace one of the next two days' puzzles in place. Refused with
 * `PUZZLE_ALREADY_STARTED` once the day has started (or is within 10 minutes of it) or anyone has a score for it, and
 * with `PUZZLE_CHANGED` when the row is not the one the page showed. Audited in the same transaction.
 */
export const route = apiRoute('/api/admin/daily-puzzles/replace', {
  POST: implement(
    replacePuzzleApi,
    { auth: 'admin', rateLimit: 'write', body: replacePuzzleBody },
    async ({ userId, body }) => {
      const out = await replaceFuturePuzzle(userId, {
        mode: body.gameMode,
        dateKey: body.dateKey,
        seenId: body.seenId,
        seenCreatedAt: body.seenCreatedAt,
      });
      if (!out.ok) return Response.json({ ...refusalBody(out.code) }, { status: ERROR_CODES[out.code].http });
      return { ok: true as const, source: out.source };
    },
  ),
});
