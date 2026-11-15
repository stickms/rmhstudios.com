/** Contract for the Spotify track search (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

export interface SpotifyTrackView {
  id: string;
  title: string;
  artist: string;
  previewUrl:
    | string
    | null;
  albumArt:
    | string
    | null;
}

/** Up to ten tracks; an empty query answers an empty list. 502 when Spotify fails. */
export const searchSpotifyApi =
  endpoint<{
    query: {
      q: string;
    };
    res: {
      tracks: SpotifyTrackView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/spotify/search',
    },
  );
