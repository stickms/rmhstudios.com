/**
 * Song results (`music_song_best`): the best score per learner per song per mode. The rules are
 * the pure `scoring.ts` (`checkSongRun` re-scores the run from its per-note results; the client's
 * own score is never read); this file reads and writes rows.
 */
import { prisma } from '@/lib/prisma.server';
import { isSongId, songById } from './catalog';
import { checkSongRun, isSongMode, type SongMode, type SongRunRecord } from './scoring';
import type { SongBest } from './songs.contract';

export async function loadSongBests(userId: string): Promise<SongBest[]> {
  const rows = await prisma.musicSongBest.findMany({
    where: { userId },
    select: { songId: true, mode: true, bestScore: true },
  });
  return rows.flatMap((r): SongBest[] =>
    isSongId(r.songId) && isSongMode(r.mode) ? [{ songId: r.songId, mode: r.mode, bestScore: r.bestScore }] : [],
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
  return prisma.$transaction(async (tx) => {
    const where = { userId_songId_mode: { userId, songId, mode } };
    const prev = await tx.musicSongBest.findUnique({ where, select: { bestScore: true } });
    const bestScore = Math.max(prev?.bestScore ?? 0, summary.score);
    await tx.musicSongBest.upsert({
      where,
      create: { userId, songId, mode, bestScore },
      update: { bestScore },
    });
    return { songId, mode, bestScore, score: summary.score };
  });
}
