import { apiRoute } from '@/lib/api/route.server';
import { badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { boardDateOk } from '@/lib/rmhmusic/learn/social/board';
import { loadBoard } from '@/lib/rmhmusic/learn/social/board.server';
import { dailyBoardApi } from '@/lib/music-social/social.contract';
import { boardQuery, boardRes } from '@/lib/rmhmusic/learn/social/social-schema';

/**
 * `GET /api/rmhmusic/sprint/board?date=YYYY-MM-DD&scope=everyone|friends` — the sight reading Daily
 * board (Phase 6): the top 50 and "around you", the viewer's own line, names and avatars only, the
 * viewer's blocks applied both ways. Only today's and yesterday's boards exist; any other date is
 * a 400. Per viewer, so no HTTP cache; the server caches the date's list (`board.server.ts`).
 */
export const route = apiRoute('/api/rmhmusic/sprint/board', {
  GET: implement(
    dailyBoardApi,
    { rateLimit: 'read', query: boardQuery, response: boardRes },
    async ({ userId, query }) => {
      const now = Date.now();
      if (!boardDateOk(query.date, now)) return badRequest('Only the boards of today and yesterday exist');
      return loadBoard(userId, query.date, query.scope, now);
    },
  ),
});
