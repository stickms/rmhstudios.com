import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { loadSongBests } from '@/lib/rmhmusic/learn/songs/songs.server';
import { songBestsApi } from '@/lib/rmhmusic/learn/songs/songs.contract';
import { songBestsRes } from '@/lib/rmhmusic/learn/songs/songs-schema';

/** `GET /api/rmhmusic/songs` — the learner's best score per song per mode. Never writes. */
export const route = apiRoute('/api/rmhmusic/songs', {
  GET: implement(songBestsApi, { rateLimit: 'read', response: songBestsRes }, async ({ userId }) => ({
    bests: await loadSongBests(userId),
  })),
});
