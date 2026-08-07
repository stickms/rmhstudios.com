/**
 * Slice It — charting as a queued job (`O3`).
 *
 * Beatmap generation ran **inline in the upload route**. The 08-06 work made it
 * 31–37% faster and added a probe so a decode bomb cannot allocate 530 MB from
 * a 4 MB upload — both large improvements, and neither moves the work off the
 * web tier. Two seconds of CPU-bound work still blocked an SSR worker on the
 * container that also serves every page, and an album upload multiplied it by
 * the track count.
 *
 * Follows the platform's existing degradation contract exactly (see
 * `enqueueProgression`): when the queue is unavailable the work runs **inline**
 * rather than being dropped. A missing queue makes uploads slow again; it never
 * makes them chartless.
 *
 * ## What did NOT move
 *
 * The `decode()` stays in the request. It is the upload's *validation* — the
 * probe gives a bound on duration and the decode gives the measurement, and the
 * stored duration is what a score ceiling is derived from. Handing the ceiling
 * a looser number to save a second of request time is the wrong trade. What
 * moved is `generateBeatmap`, which is the expensive part and the part nothing
 * downstream of the upload response needs.
 */

import decode from '@audio/decode';

import { getBoss } from '@/lib/jobs/boss.server';
import { prisma } from '@/lib/prisma.server';
import { BEATMAP_VERSION, decodedToAudioLike, generateBeatmap } from './beatmap';
import { defaultPreviewStart } from './preview';
import { readSongAudio, songDensityStrip } from './songs.server';

export const ANALYSIS_QUEUE = 'slice-it.analyse';

export interface AnalysisJob {
  songId: string;
  /** The uploader's typed BPM, used only as a prior. */
  bpmHint?: number;
  /** C10 — the uploader's −2…2 density bias. */
  densityBias?: number;
}

export type AnalysisState = 'ready' | 'pending' | 'failed';

/**
 * Queue a song for charting, or chart it here if there is no queue.
 *
 * Returns how it was handled so the caller can log it — "queued" and "ran
 * inline because there is no queue" are operationally different facts and
 * collapsing them hides a broken worker.
 */
export async function enqueueAnalysis(job: AnalysisJob): Promise<'queued' | 'inline'> {
  const boss = await getBoss();
  if (boss) {
    try {
      await boss.createQueue(ANALYSIS_QUEUE);
      await boss.send(ANALYSIS_QUEUE, job, {
        // Three attempts: the failure modes are a transient storage read and a
        // genuinely undecodable file, and only the first is worth retrying.
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
        // Two hours. A job older than that is one whose worker was down for a
        // deploy; re-queuing it is the operator's call, not the queue's.
        expireInSeconds: 2 * 60 * 60,
      });
      return 'queued';
    } catch (error) {
      console.error('[slice-it] analysis enqueue failed; charting inline', error);
    }
  }
  await runAnalysis(job);
  return 'inline';
}

/**
 * Chart one song from its stored audio.
 *
 * Re-reads and re-decodes rather than being handed the buffer: a pg-boss
 * payload is a JSON row in Postgres, and putting a 50 MB WAV in one would make
 * the queue the storage layer.
 */
export async function runAnalysis(job: AnalysisJob): Promise<void> {
  const song = await prisma.song.findUnique({
    where: { id: job.songId },
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
  // Deleted between upload and job. Not an error — the row going away is the
  // uploader's decision, and throwing here would retry it three times.
  if (!song) return;

  try {
    const stored = await readSongAudio(song.audioUrl);
    if (!stored) throw new Error(`audio missing for ${song.id}`);

    const audio = decodedToAudioLike(await decode(stored.body));

    const analysis = generateBeatmap(audio, {
      id: song.id,
      name: song.title,
      artist: song.artist,
      bpmHint: job.bpmHint ?? (song.bpm && song.bpm > 0 ? song.bpm : undefined),
      densityBias: job.densityBias,
    });

    await prisma.song.update({
      where: { id: song.id },
      data: {
        analysisData: { ...analysis, analysisVersion: BEATMAP_VERSION } as never,
        // V8 — written wherever `analysisData` is written, or the hover strip
        // silently stops rendering for every song charted by the worker.
        densityStrip: songDensityStrip(analysis, song.duration) ?? undefined,
        bpm: analysis.bpm || song.bpm || 0,
        analysisState: 'ready',
        // C7 — the loudest section, but only when nobody has chosen one. A
        // re-analysis must not move a preview point somebody set by hand.
        ...(song.previewStart === null
          ? {
              previewStart: defaultPreviewStart(analysis.artefacts?.sections ?? [], song.duration),
            }
          : {}),
      },
    });
  } catch (error) {
    console.error('[slice-it] analysis failed', job.songId, error);
    // Recorded rather than left pending. A song stuck on "Charting…" forever is
    // indistinguishable from a worker that is merely busy, and the client's
    // local-generation fallback is exactly what a failed chart should fall
    // through to — which it can only do if the state says so.
    await prisma.song
      .update({ where: { id: job.songId }, data: { analysisState: 'failed' } })
      .catch(() => {});
    throw error;
  }
}

/** Register the worker. Called from `server/jobs/index.ts`. */
export async function registerAnalysisWorker(boss: {
  createQueue: (name: string) => Promise<unknown>;
  work: (
    name: string,
    handler: (jobs: { data: AnalysisJob }[]) => Promise<void>,
  ) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(ANALYSIS_QUEUE);
  await boss.work(ANALYSIS_QUEUE, async (jobs) => {
    // Sequential, not `Promise.all`. Charting is CPU-bound and single-threaded;
    // running a batch concurrently would interleave four decodes in one heap
    // and reintroduce the allocation pressure the probe exists to bound.
    for (const job of jobs) await runAnalysis(job.data);
  });
}
