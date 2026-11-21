/**
 * Drives one offline mix export for the dialog and the challenge button: range check, engine start, render with a
 * coarse progress estimate, cancel. The render itself is `lib/studio/export/render.ts`; this is the React side.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StudioEngine } from '@/lib/studio/engine/StudioEngine';
import { SampleManager } from '@/lib/studio/samples/SampleManager';
import {
  exportRange,
  type BitDepth,
  type ExportMode,
  type RangeRefusal,
} from '@/lib/studio/export/range';
import {
  loadClipBuffers,
  renderMix,
  RenderError,
} from '@/lib/studio/export/render';
import { useStudioStore } from '@/lib/studio/store';

export type MixState =
  | {
      kind: 'idle';
    }
  | {
      kind: 'rendering';
      fraction: number;
      elapsedMs: number;
      totalMs: number;
    }
  | {
      kind: 'done';
    }
  | {
      kind: 'cancelled';
    }
  | {
      kind: 'error';
      reason:
        | RangeRefusal
        | 'failed';
    };

export interface MixRequest {
  mode: ExportMode;
  bitDepth: BitDepth;
  /** Render at this rate instead of the live context's. */
  sampleRate?: number;
}

export function useMixRender() {
  const [
    state,
    setState,
  ] =
    useState<MixState>(
      {
        kind: 'idle',
      },
    );
  const abortRef =
    useRef<AbortController | null>(
      null,
    );

  // Leaving the screen cancels a render in flight.
  useEffect(
    () =>
      () =>
        abortRef.current?.abort(),
    [],
  );

  const cancel =
    useCallback(
      () =>
        abortRef.current?.abort(),
      [],
    );
  const reset =
    useCallback(
      () =>
        setState(
          {
            kind: 'idle',
          },
        ),
      [],
    );

  const render =
    useCallback(
      async (
        req: MixRequest,
      ): Promise<Blob | null> => {
        const s =
          useStudioStore.getState();
        const range =
          exportRange(
            {
              mode: req.mode,
              bpm: s.bpm,
              tracks:
                s.tracks,
              clips:
                s.clips,
              loopStart:
                s.loopStart,
              loopEnd:
                s.loopEnd,
            },
          );
        if (
          !range.ok
        ) {
          setState(
            {
              kind: 'error',
              reason:
                range.reason,
            },
          );
          return null;
        }
        // The live transport stays stopped while the export runs.
        s.setIsPlaying(
          false,
        );
        const controller =
          new AbortController();
        abortRef.current =
          controller;
        setState(
          {
            kind: 'rendering',
            fraction: 0,
            elapsedMs: 0,
            totalMs: 0,
          },
        );
        try {
          const engine =
            StudioEngine.getInstance();
          await engine.initialize();
          const tone =
            engine.getTone();
          const project =
            {
              bpm: s.bpm,
              masterVolume:
                s.masterVolume,
              tracks:
                s.tracks,
              clips:
                s.clips,
              patterns:
                s.patterns,
            };
          const samples =
            SampleManager.getInstance();
          const buffers =
            await loadClipBuffers(
              project,
              (
                id,
              ) =>
                samples.getBuffer(
                  id,
                ),
            );
          if (
            controller
              .signal
              .aborted
          )
            throw new RenderError(
              'cancelled',
            );
          const blob =
            await renderMix(
              tone,
              {
                project,
                range,
                sampleRate:
                  req.sampleRate ??
                  tone.getContext()
                    .sampleRate,
                bitDepth:
                  req.bitDepth,
                buffers,
                signal:
                  controller.signal,
                onProgress:
                  (
                    fraction,
                    elapsedMs,
                    totalMs,
                  ) =>
                    setState(
                      {
                        kind: 'rendering',
                        fraction,
                        elapsedMs,
                        totalMs,
                      },
                    ),
              },
            );
          setState(
            {
              kind: 'done',
            },
          );
          return blob;
        } catch (e) {
          setState(
            e instanceof
              RenderError &&
              e.reason ===
                'cancelled'
              ? {
                  kind: 'cancelled',
                }
              : {
                  kind: 'error',
                  reason:
                    'failed',
                },
          );
          return null;
        } finally {
          if (
            abortRef.current ===
            controller
          )
            abortRef.current =
              null;
        }
      },
      [],
    );

  return {
    state,
    render,
    cancel,
    reset,
  };
}
