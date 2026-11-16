import { apiRoute } from '@/lib/api/route.server';
import { badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { saveSongRun } from '@/lib/rmhmusic/learn/songs/songs.server';
import { songBestApi } from '@/lib/rmhmusic/learn/songs/songs.contract';
import { songBestBody, songBestRes } from '@/lib/rmhmusic/learn/songs/songs-schema';

/**
 * `POST /api/rmhmusic/songs/best` — keep a finished song run. The server re-scores it from its
 * per-note results (`checkSongRun`) and keeps the best per song per mode.
 */
export const route = apiRoute('/api/rmhmusic/songs/best', {
  POST: implement(
    songBestApi,
    { rateLimit: 'write', body: songBestBody, response: songBestRes },
    async ({ userId, body }) => {
      const best = await saveSongRun(userId, body.songId, body.run);
      if (!best) return badRequest('Not a possible run of this song');
      return { outcome: 'saved' as const, best };
    },
  ),
});
