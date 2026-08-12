/**
 * STFT worker — one slice of the spectrogram, on its own thread.
 *
 * Bundled as its own esbuild entry (see the `build` script in package.json) so
 * it lands at `dist-server/lib/slice-it/beatmap/stft.worker.cjs`, next to the
 * service bundles. It is spawned only by `spectrum.parallel.server.ts`, which
 * falls back to the single-threaded kernel if this file cannot be found or
 * started — so a packaging mistake here makes analysis slow, never broken.
 *
 * It imports `computeSpectrogramRange` rather than reimplementing it: the
 * numeric kernel has exactly one definition, and workers and the reference path
 * cannot drift into producing different charts on different hardware.
 */
import { parentPort, workerData } from 'node:worker_threads';

import { computeSpectrogramRange } from './spectrum';

export interface StftWorkerData {
  /** Shared PCM — read-only here, never copied. */
  samples: SharedArrayBuffer;
  /** Shared `frames × bands` output. Each worker owns a disjoint row range. */
  out: SharedArrayBuffer;
  sampleRate: number;
  frameSize: number;
  hopSize: number;
  from: number;
  to: number;
}

const data = workerData as StftWorkerData;

computeSpectrogramRange(
  new Float32Array(data.samples),
  data.sampleRate,
  new Float32Array(data.out),
  data.from,
  data.to,
  { frameSize: data.frameSize, hopSize: data.hopSize },
);

// The result is already in shared memory; this is just the completion signal.
parentPort?.postMessage(null);
