/**
 * The STFT, across every core the box has.
 *
 * ## Why this exists
 *
 * Measured 2026-08-12 through the real `generateBeatmap` entry point: a
 * 15-minute upload costs ~2.9 s, of which the spectrogram is ~1.9 s (64%), of
 * which the FFT itself is **95%**. It was pinned to one thread of one process,
 * and an album upload multiplies it by the track count.
 *
 * The loop is embarrassingly parallel: every frame reads a disjoint window of
 * the input and writes a disjoint row of the output. So the first fix is cores,
 * not a faster instruction stream — `fft.ts` is already a real-input FFT with
 * precomputed twiddles and no per-frame copy, so a WASM port of the same
 * algorithm would win 2–4× where splitting across 4–8 cores wins 4–8×. (WASM is
 * still worth doing after this, and composes with it; see
 * docs/performance-audit-2026-08-12.md §2.1.)
 *
 * ## Why it degrades instead of failing
 *
 * The worker is a separate build artifact, and build artifacts go missing:
 * a stale `dist-server`, a `tsx` dev run that never produced a `.cjs`, an image
 * built before the esbuild entry was added. Every one of those resolves here to
 * "run it on this thread instead", which matches the contract
 * `enqueueAnalysis` already sets for the queue itself — *a missing worker makes
 * uploads slow again; it never makes them chartless.*
 *
 * The path actually taken is returned and logged, because "parallel" and "fell
 * back to one thread" are operationally different facts and collapsing them
 * hides a broken deploy behind a merely-slow one.
 */

import { availableParallelism } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';

import {
  computeSpectrogramRange,
  spectrogramFromData,
  spectrogramShape,
  type Spectrogram,
} from './spectrum';
import type { StftWorkerData } from './stft.worker';

/**
 * Below this, threading costs more than it saves — spawning a worker is
 * milliseconds, and a short track's whole STFT is not much more than that.
 * ~2,000 frames is about 23 seconds of audio.
 */
const MIN_FRAMES_TO_PARALLELISE = 2000;

/** Never take the whole box: the jobs process has other queues to serve. */
function workerBudget(): number {
  let cores = 4;
  try {
    cores = availableParallelism();
  } catch {
    /* older runtimes — the default is fine */
  }
  return Math.max(1, Math.min(8, cores - 1));
}

/**
 * Where esbuild puts `stft.worker.cjs`.
 *
 * The build uses `--outbase=.`, so `lib/slice-it/beatmap/stft.worker.ts` becomes
 * `dist-server/lib/slice-it/beatmap/stft.worker.cjs` while the jobs bundle is at
 * `dist-server/server/jobs/index.cjs`. Both candidates below are checked rather
 * than one being computed cleverly, because the caller may be the jobs worker OR
 * the web tier (the inline fallback path in `enqueueAnalysis`), and those sit at
 * different depths.
 */
function resolveWorkerPath(): string | null {
  const candidates: string[] = [];
  try {
    // `__dirname` exists in the CJS bundles esbuild emits; in an ESM/tsx dev run
    // it does not, and we simply fall through to the sync path.
    const here = typeof __dirname === 'string' ? __dirname : null;
    if (here) {
      candidates.push(path.resolve(here, 'stft.worker.cjs'));
      candidates.push(
        path.resolve(here, '../../../lib/slice-it/beatmap/stft.worker.cjs'),
      );
      candidates.push(path.resolve(here, '../../lib/slice-it/beatmap/stft.worker.cjs'));
    }
  } catch {
    /* ignore */
  }
  try {
    const req = createRequire(process.cwd() + '/');
    candidates.push(
      req.resolve('./dist-server/lib/slice-it/beatmap/stft.worker.cjs'),
    );
  } catch {
    candidates.push(
      path.resolve(process.cwd(), 'dist-server/lib/slice-it/beatmap/stft.worker.cjs'),
    );
  }
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

export interface ParallelSpectrogramResult {
  spectrogram: Spectrogram;
  /** How it was actually computed — for the caller's log line. */
  mode: 'parallel' | 'inline';
  /** Worker count when `mode === 'parallel'`. */
  workers: number;
}

export async function computeSpectrogramParallel(
  samples: Float32Array,
  sampleRate: number,
  options: { frameSize?: number; hopSize?: number } = {},
): Promise<ParallelSpectrogramResult> {
  const shape = spectrogramShape(samples.length, sampleRate, options);
  const cells = Math.max(0, shape.frames * shape.bands);

  const runInline = (): ParallelSpectrogramResult => {
    const data = new Float32Array(cells);
    computeSpectrogramRange(samples, sampleRate, data, 0, shape.frames, options);
    return { spectrogram: spectrogramFromData(data, shape, sampleRate), mode: 'inline', workers: 1 };
  };

  if (shape.frames < MIN_FRAMES_TO_PARALLELISE) return runInline();

  const workerPath = resolveWorkerPath();
  if (!workerPath) return runInline();

  // `SharedArrayBuffer` is what makes this worth doing: the PCM (up to ~80 MB
  // for a long track at the analysis rate) and the output matrix are mapped into
  // every worker rather than structured-cloned into each one, which would cost
  // more than the transform saves.
  let sharedSamples: SharedArrayBuffer;
  let sharedOut: SharedArrayBuffer;
  try {
    sharedSamples = new SharedArrayBuffer(samples.length * 4);
    sharedOut = new SharedArrayBuffer(cells * 4);
  } catch {
    // No SAB (a hardened runtime, or a flag we do not control).
    return runInline();
  }
  new Float32Array(sharedSamples).set(samples);

  const count = Math.max(1, Math.min(workerBudget(), Math.ceil(shape.frames / 500)));
  if (count < 2) return runInline();

  const chunk = Math.ceil(shape.frames / count);
  const workers: Worker[] = [];

  try {
    await Promise.all(
      Array.from({ length: count }, (_, i) => {
        const from = i * chunk;
        const to = Math.min(shape.frames, from + chunk);
        const data: StftWorkerData = {
          samples: sharedSamples,
          out: sharedOut,
          sampleRate,
          frameSize: shape.frameSize,
          hopSize: shape.hopSize,
          from,
          to,
        };
        return new Promise<void>((resolve, reject) => {
          const worker = new Worker(workerPath, { workerData: data });
          workers.push(worker);
          worker.once('message', () => resolve());
          worker.once('error', reject);
          worker.once('exit', (code) => {
            if (code !== 0) reject(new Error(`stft worker exited with ${code}`));
          });
        });
      }),
    );
  } catch (error) {
    console.error('[slice-it] parallel STFT failed; computing inline', error);
    return runInline();
  } finally {
    for (const worker of workers) void worker.terminate();
  }

  // Copied out of shared memory into a plain Float32Array: everything
  // downstream (`onsets`, `sections`, `bandEnergyRatio`) only reads it, and a
  // normal buffer is what the rest of the pipeline and its tests expect.
  const data = new Float32Array(cells);
  data.set(new Float32Array(sharedOut));
  return { spectrogram: spectrogramFromData(data, shape, sampleRate), mode: 'parallel', workers: count };
}
