import { apiRoute } from '@/lib/api/route.server';
import { badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { recordPractice } from '@/lib/rmhmusic/history.server';
import { saveSongRun } from '@/lib/rmhmusic/learn/songs/songs.server';
import { songBestApi } from '@/lib/rmhmusic/learn/songs/songs.contract';
import { songBestBody, songBestRes } from '@/lib/rmhmusic/learn/songs/songs-schema';

/**
 * `POST /api/rmhmusic/songs/best` — keep a finished song run. The server re-scores it from its
 * per-note results (`checkSongRun`) and keeps the best per song per mode. Every finished run, a
 * lower score included, is also logged in the practice log, so a song's progress shows each attempt.
 */
export const route = apiRoute('/api/rmhmusic/songs/best', {
  POST: implement(
    songBestApi,
    { rateLimit: 'write', body: songBestBody, response: songBestRes },
    async ({ userId, body }) => {
      const best = await saveSongRun(userId, body.songId, body.run);
      if (!best) return badRequest('Not a possible run of this song');
      await recordPractice(userId, {
        kind: 'song',
        refId: body.songId,
        mode: best.mode,
        score: best.score,
        durationMs: body.durationMs,
      });
      return { outcome: 'saved' as const, best };
    },
  ),
});
