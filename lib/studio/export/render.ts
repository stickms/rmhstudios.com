/**
 * Offline mixdown. `Tone.Offline` renders the project in an `OfflineAudioContext`, faster than real time, using the
 * same graph builder as live playback (`engine/graph.ts`). Nothing here runs unless the member asks for an export:
 * no frame loop, and the progress timer lives only while a render does.
 */
import {
  buildProjectGraph,
  type GraphProject,
  type ToneModule,
} from '../engine/graph';
import {
  audibleTracks,
  type BitDepth,
  type ExportRange,
} from './range';
import { encodeWav } from './wav';

export const EXPORT_CHANNELS = 2;
/** How often the progress estimate refreshes. */
export const PROGRESS_INTERVAL_MS = 250;
/** Offline rendering is usually this many times faster than real time; only the first estimate uses it. */
const ASSUMED_SPEEDUP = 8;

export type RenderFailure =
  | 'cancelled'
  | 'failed';

export class RenderError extends Error {
  constructor(
    readonly reason: RenderFailure,
  ) {
    super(
      reason,
    );
  }
}

export interface RenderOptions {
  project: GraphProject;
  range: Extract<
    ExportRange,
    {
      ok: true;
    }
  >;
  /** The live context's rate. */
  sampleRate: number;
  bitDepth: BitDepth;
  buffers: ReadonlyMap<
    string,
    AudioBuffer
  >;
  signal?: AbortSignal;
  /** 0-1 fraction and elapsed milliseconds, from a coarse timer. Never reaches 1 before the render ends. */
  onProgress?: (
    fraction: number,
    elapsedMs: number,
    estimatedTotalMs: number,
  ) => void;
  /** Injected for tests. */
  now?: () => number;
  setTimer?: (
    fn: () => void,
    ms: number,
  ) => unknown;
  clearTimer?: (
    handle: unknown,
  ) => void;
}

/** Load the decoded buffers the audible audio clips need. A missing sample is left out (it is silent in playback too). */
export async function loadClipBuffers(
  project: GraphProject,
  getBuffer: (
    id: string,
  ) => Promise<AudioBuffer | null>,
): Promise<
  Map<
    string,
    AudioBuffer
  >
> {
  const ids =
    new Set<string>();
  for (const track of audibleTracks(
    project.tracks,
  )) {
    for (const clipId of track.clipIds) {
      const clip =
        project
          .clips[
          clipId
        ];
      if (
        clip &&
        clip.type ===
          'audio'
      )
        ids.add(
          (
            clip as {
              bufferId: string;
            }
          )
            .bufferId,
        );
    }
  }
  const out =
    new Map<
      string,
      AudioBuffer
    >();
  for (const id of ids) {
    const buffer =
      await getBuffer(
        id,
      ).catch(
        () =>
          null,
      );
    if (
      buffer
    )
      out.set(
        id,
        buffer,
      );
  }
  return out;
}

/** Render to planar channel data. Rejects with `RenderError('cancelled')` when the signal fires. */
export async function renderChannels(
  tone: ToneModule,
  opts: RenderOptions,
): Promise<
  Float32Array[]
> {
  const {
    signal,
  } =
    opts;
  if (
    signal?.aborted
  )
    throw new RenderError(
      'cancelled',
    );
  const now =
    opts.now ??
    (() =>
      Date.now());
  const setTimer =
    opts.setTimer ??
    ((
      fn,
      ms,
    ) =>
      setInterval(
        fn,
        ms,
      ));
  const clearTimer =
    opts.clearTimer ??
    ((
      h,
    ) =>
      clearInterval(
        h as ReturnType<
          typeof setInterval
        >,
      ));
  const tracks =
    audibleTracks(
      opts
        .project
        .tracks,
    );
  const startedAt =
    now();
  const estimatedTotalMs =
    Math.max(
      500,
      (opts
        .range
        .durationSeconds *
        1000) /
        ASSUMED_SPEEDUP,
    );

  let timer: unknown =
    null;
  let onAbort:
    | (() => void)
    | null =
    null;
  const stopTimer =
    () => {
      if (
        timer !==
        null
      )
        clearTimer(
          timer,
        );
      timer =
        null;
    };
  try {
    if (
      opts.onProgress
    ) {
      const report =
        opts.onProgress;
      timer =
        setTimer(
          () => {
            const elapsed =
              now() -
              startedAt;
            // An estimate, held below 95% until the render really finishes.
            report(
              Math.min(
                0.95,
                elapsed /
                  estimatedTotalMs,
              ),
              elapsed,
              estimatedTotalMs,
            );
          },
          PROGRESS_INTERVAL_MS,
        );
    }
    const cancelled =
      new Promise<never>(
        (
          _,
          reject,
        ) => {
          onAbort =
            () =>
              reject(
                new RenderError(
                  'cancelled',
                ),
              );
          signal?.addEventListener(
            'abort',
            onAbort,
            {
              once: true,
            },
          );
        },
      );
    const rendered =
      tone.Offline(
        () => {
          buildProjectGraph(
            tone,
            opts.project,
            {
              startBeat:
                opts
                  .range
                  .startBeat,
              durationSeconds:
                opts
                  .range
                  .durationSeconds,
              buffers:
                opts.buffers,
              tracks,
            },
          );
        },
        opts
          .range
          .durationSeconds,
        EXPORT_CHANNELS,
        opts.sampleRate,
      );
    // A cancelled render still finishes inside the browser; its late result or failure is dropped.
    rendered.catch(
      () =>
        undefined,
    );
    const buffer =
      await Promise.race(
        [
          rendered,
          cancelled,
        ],
      );
    const audio =
      buffer.get();
    if (
      !audio
    )
      throw new RenderError(
        'failed',
      );
    const channels: Float32Array[] =
      [];
    for (
      let i = 0;
      i <
      EXPORT_CHANNELS;
      i++
    ) {
      channels.push(
        audio.getChannelData(
          Math.min(
            i,
            audio.numberOfChannels -
              1,
          ),
        ),
      );
    }
    return channels;
  } catch (e) {
    if (
      e instanceof
      RenderError
    )
      throw e;
    throw new RenderError(
      'failed',
    );
  } finally {
    stopTimer();
    if (
      onAbort
    )
      signal?.removeEventListener(
        'abort',
        onAbort,
      );
  }
}

/** Render and encode: the WAV, ready to download. */
export async function renderMix(
  tone: ToneModule,
  opts: RenderOptions,
): Promise<Blob> {
  const channels =
    await renderChannels(
      tone,
      opts,
    );
  if (
    opts
      .signal
      ?.aborted
  )
    throw new RenderError(
      'cancelled',
    );
  return encodeWav(
    channels,
    opts.sampleRate,
    opts.bitDepth,
  );
}
