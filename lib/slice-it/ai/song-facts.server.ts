/**
 * Load a song and derive its chart facts. Server-only.
 *
 * Five of the AI routes begin the same way: take a song id from the body, check
 * the caller may see that song, read the stored chart, prepare it under the
 * run's modifiers, and reduce it to statistics. Written once here because the
 * *middle* step is the one that must never be skipped — the visibility rule
 * (`isPublic`, or the caller is the uploader) is what stops an AI route becoming
 * a way to read the metadata of somebody's unlisted upload by guessing ids.
 */

import { prisma } from '@/lib/prisma.server';
import { prepareChart } from '../chart';
import { DEFAULT_MODIFIERS } from '../modifiers';
import type { BeatMap, Modifiers } from '../types';
import type { Difficulty } from '../constants';
import { chartFacts, type ChartFacts } from './facts';

export interface SongWithChart {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  /** Null when the song has no stored chart yet. */
  facts: ChartFacts | null;
}

/**
 * Read a song the caller is entitled to see, with its chart reduced to facts.
 *
 * Returns `null` when the song does not exist **or** the caller may not see it.
 * One return value for both on purpose: distinguishing them tells an anonymous
 * caller which ids exist.
 *
 * `modifiers` matters because the chart the player faced is not the chart in the
 * database — Bombs, Switching and One Track rewrite it. Passing the run's own
 * modifiers is what makes the note counts in a coaching prompt match the notes
 * the player actually saw.
 */
export async function loadSongFacts(
  songId: string,
  viewerId: string | null,
  options: { difficulty?: Difficulty; modifiers?: Modifiers } = {},
): Promise<SongWithChart | null> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: {
      id: true,
      title: true,
      artist: true,
      duration: true,
      isPublic: true,
      uploadedBy: true,
      analysisData: true,
    },
  });
  if (!song) return null;
  if (!song.isPublic && song.uploadedBy !== viewerId) return null;

  const base: Omit<SongWithChart, 'facts'> = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    durationSec: song.duration,
  };

  const map = song.analysisData as BeatMap | null;
  if (!map || typeof map !== 'object') return { ...base, facts: null };

  const modifiers: Modifiers = options.modifiers ?? {
    ...DEFAULT_MODIFIERS,
    ...(options.difficulty ? { difficulty: options.difficulty } : {}),
  };

  try {
    // `prepareChart` is pure and browser-safe; it is the same call the engine
    // makes, so the facts describe the chart the player was given rather than
    // the one on disk.
    const slices = prepareChart({ ...map, id: song.id }, modifiers);
    return { ...base, facts: chartFacts(slices, song.duration) };
  } catch (err) {
    // A chart stored before the current shape, or a row somebody hand-edited.
    // A missing brief is a panel that does not render; a 500 is a song page
    // that does not.
    console.warn('[slice-it/ai] chart prepare failed:', (err as Error)?.message);
    return { ...base, facts: null };
  }
}
