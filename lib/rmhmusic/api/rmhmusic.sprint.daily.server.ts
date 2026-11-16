import { apiRoute } from '@/lib/api/route.server';
import { badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { loadBoardMe } from '@/lib/rmhmusic/learn/social/board.server';
import { saveSprintDaily } from '@/lib/rmhmusic/learn/sprint/sprint.server';
import { sprintDailyApi } from '@/lib/rmhmusic/learn/sprint/sprint.contract';
import { sprintDailyBody, sprintDailyRes } from '@/lib/rmhmusic/learn/sprint/sprint-schema';

/**
 * `POST /api/rmhmusic/sprint/daily` — keep the dealt date's scored challenge run. 400 for a date
 * outside today (or yesterday within the grace window) or an impossible run; `already-scored`
 * when the date has its scored run; a retried identical POST answers `saved`. `board` says where
 * the date's scored run stands on the Daily board (Phase 6); a failure to read it never fails the
 * save, which has already happened.
 */
export const route = apiRoute('/api/rmhmusic/sprint/daily', {
  POST: implement(
    sprintDailyApi,
    { rateLimit: 'write', body: sprintDailyBody, response: sprintDailyRes },
    async ({ userId, body }) => {
      const now = Date.now();
      const outcome = await saveSprintDaily(userId, body.date, body.results, now);
      if (outcome === 'invalid') return badRequest('Not a possible run for this date');
      const board = await loadBoardMe(userId, body.date, now).catch((err: unknown) => {
        console.error('[rmhmusic] board line after a save failed:', err);
        return undefined;
      });
      return board ? { outcome, board } : { outcome };
    },
  ),
});
