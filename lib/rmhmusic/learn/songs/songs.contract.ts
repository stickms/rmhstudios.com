/**
 * Contracts for the song results endpoints. Client-safe: types come from the zod schemas by
 * `import type`, so this file ships no zod. The rules the server applies are `scoring.ts`
 * `checkSongRun` and `songs.server.ts`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { songBestBody, songBestRes, songBestsRes } from './songs-schema';

export type SongBest = z.infer<typeof songBestsRes>['bests'][number];

/** The learner's best score per song per mode. */
export const songBestsApi = endpoint<{
  res: z.infer<typeof songBestsRes>;
}>()({
  method: 'GET',
  path: '/api/rmhmusic/songs',
});

/** Keep a finished run: the server re-scores it and keeps the best per song per mode. */
export const songBestApi = endpoint<{
  body: z.infer<typeof songBestBody>;
  res: z.infer<typeof songBestRes>;
}>()({
  method: 'POST',
  path: '/api/rmhmusic/songs/best',
});
