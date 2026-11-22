/**
 * Song results (`music_song_best`): the best score per learner per song per mode. The rules are
 * the pure `scoring.ts` (`checkSongRun` re-scores the run from its per-note results; the client's
 * own score is never read); this file reads and writes rows. The best is kept by one atomic
 * `INSERT … ON CONFLICT DO UPDATE SET "bestScore" = GREATEST(…)`. A new row's id is a random UUID
 * (the column is text; Prisma's cuid default applies only to rows Prisma creates).
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { isSongId, songById } from './catalog';
import { checkSongRun, isSongMode, type SongMode, type SongRunRecord } from './scoring';
import type { SongBest } from './songs.contract';

export async function loadSongBests(userId: string): Promise<SongBest[]> {
  const rows = await prisma.musicSongBest.findMany({
    where: {
      userId,
    },
    select: {
      songId: true,
      mode: true,
      bestScore: true,
    },
  });
  return rows.flatMap((r): SongBest[] =>
    isSongId(r.songId) && isSongMode(r.mode)
      ? [
          {
            songId: r.songId,
            mode: r.mode,
            bestScore: r.bestScore,
          },
        ]
      : [],
  );
}

export interface SavedSongRun {
  songId: string;
  mode: SongMode;
  bestScore: number;
  /** This run's recomputed score. */
  score: number;
}

/** Keep a run. Null when the song is unknown or the run is not a possible run of it. */
export async function saveSongRun(userId: string, songId: string, run: SongRunRecord): Promise<SavedSongRun | null> {
  const song = songById(songId);
  if (!song) return null;
  const summary = checkSongRun(song, run);
  if (!summary) return null;
  const mode = run.mode;
  // One statement, so two saves at once cannot both read the old best and the lower one win. The
  // table and column names are the migration's (20261115190000_music_song_best).
  const rows = await prisma.$queryRaw<
    {
      bestScore: number;
    }[]
  >`
    INSERT INTO "music_song_best" ("id", "userId", "songId", "mode", "bestScore", "updatedAt")
    VALUES (${randomUUID()}, ${userId}, ${songId}, ${mode}, ${summary.score}, now())
    ON CONFLICT ("userId", "songId", "mode")
    DO UPDATE SET "bestScore" = GREATEST("music_song_best"."bestScore", EXCLUDED."bestScore"), "updatedAt" = now()
    RETURNING "bestScore"`;
  const bestScore = rows[0]?.bestScore ?? summary.score;
  return {
    songId,
    mode,
    bestScore,
    score: summary.score,
  };
}
