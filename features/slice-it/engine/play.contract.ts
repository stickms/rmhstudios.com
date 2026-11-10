/**
 * Contracts for the Slice It play surface (redesign audit C1, batch 8): the
 * song library and the single-song read, leaderboards, replays, and score
 * submission. Client-safe: types only, by `import type`.
 *
 * The song PATCH (multipart cover upload) stays a raw fetch.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { LibrarySong, LibrarySongPage } from '@features/slice-it/engine/library-filters';
import type { ScoreSubmissionZ } from '@features/slice-it/engine/api-schemas';
import type { BeatMap, LeaderboardEntry, SliceSong } from '@features/slice-it/engine/types';
import type { SliceItReplay } from '@/lib/game/replay';

/** The library page: `sort` always, the rest narrow it. `limit` is only sent for the table view. */
export const listLibrarySongsApi = endpoint<{
  query: {
    sort: string;
    dir?: string | undefined;
    q?: string | undefined;
    artist?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  };
  res: LibrarySongPage;
}>()({ method: 'GET', path: '/api/slice-it/songs' });

/** A plain title search for the setlist builder. */
export const searchSongsApi = endpoint<{
  query: { q: string; limit: number };
  res: { songs: SliceSong[] };
}>()({ method: 'GET', path: '/api/slice-it/songs' });

/** The roulette pick; `song` is null when nothing matches the constraints. */
export const randomSongApi = endpoint<{
  query: {
    random: '1';
    durationMin?: number | undefined;
    durationMax?: number | undefined;
    unplayedOnly?: 'true' | undefined;
    likedOnly?: 'true' | undefined;
  };
  res: { song: LibrarySong | null };
}>()({ method: 'GET', path: '/api/slice-it/songs' });

/** One song with its stored chart (`analysisData`) and the signed run receipt. */
export const getSliceSongApi = endpoint<{
  query: { difficulty?: string | undefined };
  res: SliceSong & { analysisData?: BeatMap | null };
}>()({ method: 'GET', path: '/api/slice-it/songs/$id' });

/** Backfill a chart for a song that has none (or a stale one). */
export const patchSongAnalysisApi = endpoint<{
  body: { analysisData: BeatMap & { analysisVersion: number } };
  res: unknown;
}>()({ method: 'POST', path: '/api/slice-it/songs/$id/patch-analysis' });

/**
 * A global-board row, which carries three fields a song row does not. Optional,
 * because one component renders both boards and an older server omits them.
 */
export type BoardEntry = LeaderboardEntry & {
  skillRating?: number;
  totalScore?: number;
  rankedPlays?: number;
};

export interface LeaderboardResponse {
  entries?: BoardEntry[];
  total?: number;
  self?: BoardEntry | null;
  scopeUnavailable?: 'signed-out' | 'no-location';
}

/** A song board (with `songId`) or the global skill board. */
export const getLeaderboardApi = endpoint<{
  query: {
    songId?: string | undefined;
    difficulty?: string | undefined;
    modPool?: string | undefined;
    scope?: string | undefined;
    window?: string | undefined;
  };
  res: LeaderboardResponse;
}>()({ method: 'GET', path: '/api/slice-it/leaderboard' });

/** `userId → replay id` for the leaderboard rows on screen. */
export const getBoardReplaysApi = endpoint<{
  query: { songId: string; userIds: string };
  res: { replays?: Record<string, string> };
}>()({ method: 'GET', path: '/api/slice-it/replay' });

export interface ReplayResponse {
  id: string;
  version: string;
  versionMatch: boolean;
  durationMs: number;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null; handle: string | null };
  data: unknown;
}

export const getReplayApi = endpoint<{ res: ReplayResponse }>()({
  method: 'GET',
  path: '/api/slice-it/replay/$id',
});

/** Attach a run's input log to a stored personal best. */
export const uploadReplayApi = endpoint<{
  body: { replay: SliceItReplay };
  res: { id?: string; inputs?: number };
}>()({ method: 'POST', path: '/api/slice-it/replay' });

/** Submit a finished run. A 4xx may carry `ranked: false` (an unranked chart). */
export const submitScoreApi = endpoint<{
  body: z.input<typeof ScoreSubmissionZ>;
  res: {
    success?: boolean;
    ranked?: boolean;
    /** False for the guest path, which persists nothing. */
    stored?: boolean;
    isNewBest?: boolean;
    previousBest?: number | null;
  };
}>()({ method: 'POST', path: '/api/slice-it/score' });
