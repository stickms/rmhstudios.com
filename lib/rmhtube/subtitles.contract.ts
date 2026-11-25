/** Contract for reading one subtitle track's cues (sprint 11 16). Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';
import type { SubtitleCue } from '@/lib/rmhtube/subtitles';

export const getSubtitleCuesApi = endpoint<{
  res: {
    id: string;
    label: string;
    lang: string | null;
    cues: SubtitleCue[];
  };
}>()({
  method: 'GET',
  path: '/api/rmhtube/rooms/$roomId/items/$itemId/subtitles/$subtitleId',
});
