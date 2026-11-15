/**
 * Contracts for the small /api/slice-it/** reads and writes (redesign audit C1,
 * batch 6): library facet, likes, plays, comments, the daily and the profile
 * showcase. Client-safe: response types come from the server modules by
 * `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { CommentBodyZ } from '@features/slice-it/engine/api-schemas';
import type { ChartSummary } from '@features/slice-it/engine/charts.server';
import type {
  DailyBoardRow,
  DailyState,
} from '@features/slice-it/engine/daily.server';
import type { SliceSong } from '@features/slice-it/engine/types';
import type { ArtistSummary } from '@features/slice-it/engine/library-query.server';
import type { LibrarySong } from '@features/slice-it/engine/library-filters';
import type { PackSummary } from '@features/slice-it/engine/packs';
import type { SliceItShowcaseStats } from '@features/slice-it/engine/showcase.server';

/** The top artists across the public library (a facet, not a page). */
export const listSliceArtistsApi =
  endpoint<{
    query: {
      limit: number;
    };
    res: {
      artists: ArtistSummary[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/songs/artists',
    },
  );

/** Toggle the caller's like; the server returns the resulting state and count. */
export const toggleSongLikeApi =
  endpoint<{
    res: {
      success: true;
      liked: boolean;
      likeCount: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/slice-it/songs/$id/like',
    },
  );

/** Count a play. Anonymous callers are fine. */
export const recordSongPlayApi =
  endpoint<{
    res: {
      success: true;
      plays: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/slice-it/songs/$id/play',
    },
  );

/** The charts the viewer may play on a song. 404 for a song they cannot see. */
export const listSongChartsApi =
  endpoint<{
    res: {
      charts: ChartSummary[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/songs/$id/charts',
    },
  );

export interface SongCommentView {
  id: string;
  content: string;
  /** Seconds into the track, or null for a comment about the song. */
  atSeconds:
    | number
    | null;
  createdAt: string;
  isOwn: boolean;
  user: {
    name: string;
    image:
      | string
      | null;
  };
}

export const listSongCommentsApi =
  endpoint<{
    query: {
      cursor?:
        | string
        | undefined;
      limit: number;
    };
    res: {
      comments: SongCommentView[];
      nextCursor:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/songs/$id/comments',
    },
  );

export const createSongCommentApi =
  endpoint<{
    body: z.infer<
      typeof CommentBodyZ
    >;
    res: SongCommentView;
  }>()(
    {
      method:
        'POST',
      path: '/api/slice-it/songs/$id/comments',
    },
  );

/** Today's challenge, the board and the viewer's attempt. */
export const getDailyApi =
  endpoint<{
    res: DailyState;
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/daily',
    },
  );

/** Files the day's one ranked attempt. 409 when it is already spent. */
export const submitDailyApi =
  endpoint<{
    body: {
      songId: string;
      score: number;
      accuracy: number;
      maxCombo: number;
      cleared: boolean;
    };
    res: {
      ok: true;
      rank: number;
      entry: DailyBoardRow;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/slice-it/daily/submit',
    },
  );

/** Pre-aggregated stats for a profile card; `stats` is null when there are no runs. */
export const getSliceItShowcaseApi =
  endpoint<{
    query: {
      userId: string;
    };
    res: {
      stats: SliceItShowcaseStats | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/showcase',
    },
  );

/**
 * Edit a song's details and replace its cover. Multipart: `title`, `artist`, `bpm`,
 * `description`, `isPublic` and an optional `cover` image. Owner or admin only.
 */
export const updateSongApi =
  endpoint<{
    body: FormData;
    res: {
      success: true;
      song: SliceSong;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/slice-it/songs/$id',
    },
  );

/** Owner or admin only. */
export const deleteSongApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/slice-it/songs/$id',
    },
  );

/** One artist: aggregate stats, their tracks and their albums, in a single read. */
export interface ArtistPageResponse {
  artist: ArtistSummary;
  songs: LibrarySong[];
  albums: PackSummary[];
  /** True when the artist has more tracks than this response carries. */
  hasMore: boolean;
}

/** `$key` is a normalised artist key, never a display name. 404 when the artist is unknown. */
export const getSliceArtistApi =
  endpoint<{
    res: ArtistPageResponse;
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/songs/artist/$key',
    },
  );
