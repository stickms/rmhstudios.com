import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listMyTournamentsApi } from '@/lib/tournaments/mine.contract';
import { listMyTournaments } from '@/lib/tournaments/mine.server';
import { refusalBody } from '@/lib/errors/codes';

const mineQuery = z.object({
  cursor: z.string().min(1).max(300).optional(),
});

/**
 * GET /api/tournaments/mine: the caller's own tournaments with their place and prize. `mine` is a static segment
 * beside `$id` (a tournament id is a cuid, never "mine"). The body is the caller's own history, so it is private and
 * `no-store`; nothing here writes.
 */
export const route = apiRoute('/api/tournaments/mine', {
  GET: implement(
    listMyTournamentsApi,
    { auth: 'required', rateLimit: 'read', query: mineQuery },
    async ({ userId, query }) => {
      const page = await listMyTournaments(userId, query.cursor);
      if (page === 'invalid_cursor') return Response.json(refusalBody('INVALID_INPUT'), { status: 400 });
      return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
});
