import { apiRoute } from '@/lib/api/route.server';
import { badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { getSongProgressApi } from '@/lib/rmhmusic/history.contract';
import { songProgressQuery } from '@/lib/rmhmusic/history-schema';
import { getSongProgress } from '@/lib/rmhmusic/history.server';
import { isSongId } from '@/lib/rmhmusic/learn/songs/catalog';

/**
 * `GET /api/rmhmusic/history/songs/$songId?mode=` — the learner's own attempts at one song, the
 * lower scores included, oldest first. Owner-only: the query is scoped to the caller.
 */
export const route = apiRoute('/api/rmhmusic/history/songs/$songId', {
  GET: implement(
    getSongProgressApi,
    {
      rateLimit: 'read',
      query: songProgressQuery,
    },
    async ({ userId, params, query }) => {
      if (!isSongId(params.songId)) return badRequest('Unknown song');
      return getSongProgress(userId, params.songId, query.mode);
    },
  ),
});
