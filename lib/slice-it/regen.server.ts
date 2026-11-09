/**
 * Slice It — regenerating charts (`C8`).
 *
 * `BEATMAP_VERSION` gates charts, but there is no upgrade path for a song that
 * already plays: a stranger may chart a song with *no* chart, and replacing a
 * working chart is the uploader's or an admin's call. So songs charted at
 * version N stay at version N forever, including the ones charted by the
 * generator that was replaced for being wrong.
 *
 * ## The safety property
 *
 * **Nothing here ever touches a chart with `isGenerated: false`.** That flag is
 * cleared by the editor on first edit, and it is the whole guarantee: a
 * backfill that silently overwrote somebody's hand-edited chart with generator
 * output would destroy work that cannot be recovered, and it would do it in
 * bulk, at night, with no request to trace it to.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { decodeAudio } from '@/lib/audio/decode.server';

import { requeueFailedAnalyses } from './analysis-queue.server';
import { BEATMAP_VERSION, decodedToAudioLike, generateBeatmap } from './beatmap';
import { chartHashOf } from './editor/hash.server';
import { defaultPreviewStart } from './preview';
import { readSongAudio, songDensityStrip } from './songs.server';
import type { Difficulty } from './constants';
import type { Slice } from './types';

export interface RegenResult {
  songId: string;
  /** Chart rows rewritten. Zero is normal — most songs have no `Chart` rows. */
  chartsUpdated: number;
  /** True when `Song.analysisData` was replaced. */
  analysisUpdated: boolean;
}

/**
 * Re-analyse one song and write the result everywhere it belongs.
 *
 * Updates `Song.analysisData` (the generated fallback) and every `Chart` row on
 * that song that is still `isGenerated`. Hand-edited rows are left exactly as
 * they are, and their count is not an error — a song with four edited charts
 * legitimately reports `chartsUpdated: 0` with a fresh `analysisData`.
 */
export async function regenerateSong(
  songId: string,
  options: { densityBias?: number } = {},
): Promise<RegenResult> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: {
      id: true,
      title: true,
      artist: true,
      bpm: true,
      duration: true,
      audioUrl: true,
      previewStart: true,
    },
  });
  if (!song) throw new Error(`song ${songId} not found`);

  const stored = await readSongAudio(song.audioUrl);
  if (!stored) throw new Error(`audio missing for ${songId}`);

  const analysis = generateBeatmap(decodedToAudioLike(await decodeAudio(stored.body)), {
    id: song.id,
    name: song.title,
    artist: song.artist,
    bpmHint: song.bpm && song.bpm > 0 ? song.bpm : undefined,
    densityBias: options.densityBias,
  });

  const generated = await prisma.chart.findMany({
    where: { songId, isGenerated: true },
    select: { id: true, difficulty: true },
  });

  await prisma.$transaction([
    prisma.song.update({
      where: { id: songId },
      data: {
        analysisData: { ...analysis, analysisVersion: BEATMAP_VERSION } as never,
        densityStrip: songDensityStrip(analysis, song.duration) ?? undefined,
        bpm: analysis.bpm || song.bpm || 0,
        analysisState: 'ready',
        // Only when the uploader has not chosen one. A re-analysis must not
        // move a preview point somebody set by hand.
        ...(song.previewStart === null
          ? { previewStart: defaultPreviewStart(analysis.artefacts?.sections ?? [], song.duration) }
          : {}),
      },
    }),
    ...generated.flatMap((chart) => {
      const notes = analysis.slices[chart.difficulty as Difficulty] as Slice[] | undefined;
      // A difficulty the new generator did not produce keeps its old notes
      // rather than being emptied. An empty chart is worse than a stale one.
      if (!Array.isArray(notes)) return [];
      return [
        prisma.chart.update({
          where: { id: chart.id },
          data: {
            notes: notes as never,
            chartHash: chartHashOf(notes),
            generatorVersion: BEATMAP_VERSION,
            // Ratings are computed from the notes, so one that survived a
            // regeneration would describe a chart that no longer exists.
            rating: null,
            ratingVersion: null,
            ratedAt: null,
          },
          // Never select the notes blob back out — it is hundreds of KB and
          // nothing here reads it.
          select: { id: true },
        }),
      ];
    }),
  ]);

  return { songId, chartsUpdated: generated.length, analysisUpdated: true };
}

/**
 * Bring stale generated charts up to the current generator.
 *
 * Oldest-updated first and hard-bounded, because this runs on a schedule
 * against the whole library: an unbounded sweep decodes every song in the
 * database in one pass, which is the same CPU spike `O3` moved off the web tier
 * in the first place.
 *
 * A song whose analysis fails keeps its old chart and is counted as a failure
 * rather than throwing — one undecodable file must not stop the sweep.
 */
export async function backfillStaleCharts(limit = 25): Promise<{
  attempted: number;
  updated: number;
  failed: number;
}> {
  const stale = await prisma.chart.findMany({
    where: { isGenerated: true, generatorVersion: { lt: BEATMAP_VERSION } },
    select: { songId: true },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  // One regeneration per SONG, not per chart: `regenerateSong` rewrites every
  // generated difficulty of a song in one pass, so a song with four stale
  // charts would otherwise be decoded four times.
  const songIds = new Set(stale.map((chart) => chart.songId));
  // Songs with NO chart rows have only their stored analysis (the fallback every
  // play starts from), and the query above never sees them: most of a library.
  for (const id of await staleAnalysisSongIds(limit)) {
    if (songIds.size >= limit) break;
    songIds.add(id);
  }

  let updated = 0;
  let failed = 0;
  let attempted = 0;
  for (const songId of songIds) {
    if (unreadableSongs.has(songId)) continue;
    attempted++;
    try {
      await regenerateSong(songId);
      updated++;
    } catch (error) {
      failed++;
      // Remembered for this process, so one undecodable file at the head of the
      // queue is not retried every hour in front of everything behind it.
      unreadableSongs.add(songId);
      console.error('[slice-it] regen failed', songId, error);
    }
  }
  return { attempted, updated, failed };
}

/** Songs a regeneration failed on in this process; skipped until a restart. */
const unreadableSongs = new Set<string>();

/**
 * Ready songs whose stored analysis was made by an older generator.
 *
 * A missing or non-numeric `analysisVersion` is version 1 — the legacy detector,
 * which wrote no version at all. Raw SQL because the version lives inside the JSON.
 */
async function staleAnalysisSongIds(limit: number): Promise<string[]> {
  const skip = [...unreadableSongs];
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT s.id
    FROM "Song" s
    WHERE s."analysisState" = 'ready'
      AND s."analysisData" IS NOT NULL
      AND (
        CASE
          WHEN (s."analysisData"->>'analysisVersion') ~ '^[0-9]+$'
            THEN (s."analysisData"->>'analysisVersion')::int
          ELSE 1
        END
      ) < ${BEATMAP_VERSION}
      ${skip.length > 0 ? Prisma.sql`AND s.id NOT IN (${Prisma.join(skip)})` : Prisma.empty}
    ORDER BY s.id
    LIMIT ${limit}
  `);
  return rows.map((row) => row.id);
}

/** How many songs the backfill still has to get through. */
export async function staleChartCount(): Promise<number> {
  const [charts, songs] = await Promise.all([
    prisma.chart.count({
      where: { isGenerated: true, generatorVersion: { lt: BEATMAP_VERSION } },
    }),
    staleAnalysisSongIds(1_000_000).then((ids) => ids.length),
  ]);
  return charts + songs;
}

/**
 * C8's scheduled half: bring stale generated charts forward, slowly.
 *
 * Hourly and 60 songs at a time, deliberately. This is a full decode and
 * analysis per song — the exact work `O3` moved off the web tier — so a sweep
 * that tried to catch the library up in one pass would just move the CPU spike
 * to a different container. At this rate a library of a few thousand songs
 * catches up over a couple of days, which is the right speed for "the generator
 * improved" and far too slow to matter for anything urgent.
 */
export const REGEN_QUEUE = 'slice-it.regen-stale';
const REGEN_CRON = '17 * * * *';

export async function registerRegenCron(boss: {
  createQueue: (name: string) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(REGEN_QUEUE);
  // :17 rather than :00 — every other cron in this process fires on the hour,
  // and stacking a decode-heavy sweep on top of the outbox drain and the
  // rarity rollup is how a scheduled job becomes an incident. (The jobs worker
  // runs it at :47 — `server/jobs/queue-policy.ts` — because platform.maintenance
  // also fires at :17, and this is the decode-heavy one.)
  await boss.schedule(REGEN_QUEUE, REGEN_CRON, {}, { tz: 'UTC' });
  await boss.work(REGEN_QUEUE, async () => {
    const result = await backfillStaleCharts(60);
    if (result.attempted > 0) {
      console.info('[slice-it] regen sweep', result, 'remaining:', await staleChartCount());
    }
    // Songs whose first chart failed — see `requeueFailedAnalyses`.
    const requeued = await requeueFailedAnalyses(25);
    if (requeued > 0) console.warn('[slice-it] re-queued failed analyses', requeued);
  });
}
