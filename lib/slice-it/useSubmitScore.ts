/**
 * Submit a finished run to the leaderboard, exactly once.
 *
 * Both results screens — single player and multiplayer — used to carry their
 * own copy of this: two `fetch` calls with the same body, two different
 * "already submitted" guards, and two different sets of effect dependencies.
 * The multiplayer one listed `allFinished` in its deps but never read it, and
 * omitted the ref it actually guarded on, so whether it double-submitted came
 * down to how React happened to schedule the render.
 *
 * The submission is fire-and-forget from the player's point of view — a
 * leaderboard write must never block the results card — but its outcome is
 * returned so the card can show "NEW BEST".
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RANKED_MIN_SPEED } from './constants';
import type { GameEngine } from './engine';
import { useSliceItStore } from './store';
import type { Modifiers } from './types';
import { MIN_TIMING_SAMPLES, type TimingSummary } from './integrity';

export interface SubmitResult {
  status: 'idle' | 'submitting' | 'ok' | 'unranked' | 'failed';
  isNewBest: boolean;
  previousBest: number | null;
}

export interface RunSummary {
  songId: string;
  score: number;
  maxCombo: number;
  accuracy: number;
  modifiers: Modifiers;
  multiplayer: boolean;
  /** Notes the engine actually resolved — cross-checked against the chart. */
  notesResolved?: number;
  /** Signed receipt from the song read; see `run-token.server.ts`. */
  runToken?: string;
  /** Hit-timing distribution; see `integrity.ts`. */
  timing?: TimingSummary;
  /**
   * Song identity for the local timing history, from the engine's loaded map.
   *
   * Not sent to the score endpoint — the server reads the title off the `Song`
   * row and has for a while, deliberately. It is here because
   * {@link useSubmitScore} is the one place that already knows a run has ended
   * exactly once, and the calibration history wants the same moment.
   */
  songTitle?: string;
  durationSec?: number;
}

/**
 * @param run  The finished run, or null while one is not ready to submit.
 */
export function useSubmitScore(run: RunSummary | null): SubmitResult {
  const [result, setResult] = useState<SubmitResult>({
    status: 'idle',
    isNewBest: false,
    previousBest: null,
  });

  // Keyed by song + score so a rematch on the same track still submits, while a
  // re-render of the same result does not.
  const submittedKey = useRef<string | null>(null);

  const submit = useCallback(async (summary: RunSummary) => {
    setResult({ status: 'submitting', isNewBest: false, previousBest: null });
    try {
      const response = await fetch('/api/slice-it/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      });
      const body = (await response.json().catch(() => ({}))) as {
        isNewBest?: boolean;
        previousBest?: number | null;
        ranked?: boolean;
      };

      if (!response.ok) {
        setResult({
          status: body.ranked === false ? 'unranked' : 'failed',
          isNewBest: false,
          previousBest: null,
        });
        return;
      }

      setResult({
        status: 'ok',
        isNewBest: Boolean(body.isNewBest),
        previousBest: body.previousBest ?? null,
      });
    } catch {
      // Network failures are silent to the player: the run happened, and a
      // toast about a leaderboard write is not what they want on a results
      // screen. The status is available for a caller that wants to say so.
      setResult({ status: 'failed', isNewBest: false, previousBest: null });
    }
  }, []);

  useEffect(() => {
    if (!run) return;
    if (!run.songId || run.score <= 0) return;

    const key = `${run.songId}:${run.score}:${run.multiplayer}`;
    const isNewRun = submittedKey.current !== key;

    // Recorded before the unranked check, and for every run: a slowed-down run
    // still measures this device's audio latency perfectly well, and the whole
    // point of a local timing history is to have enough samples to pool. It is
    // the leaderboard that cares about speed, not the calibration advisor.
    if (isNewRun && run.timing && run.timing.samples >= MIN_TIMING_SAMPLES) {
      useSliceItStore.getState().recordTiming({
        songTitle: run.songTitle || 'a run',
        durationSec: run.durationSec ?? 0,
        accuracy: run.accuracy,
        timing: run.timing,
        at: Date.now(),
      });
    }

    // Below 1.0x is unranked, which the server also enforces — checked here too
    // so an unranked run does not spend a rate-limit slot to be told so.
    if (run.modifiers.speed < RANKED_MIN_SPEED) {
      submittedKey.current = key;
      setResult({ status: 'unranked', isNewBest: false, previousBest: null });
      return;
    }

    if (!isNewRun) return;
    submittedKey.current = key;
    void submit(run);
  }, [run, submit]);

  return result;
}

/** Build a {@link RunSummary} from the store's current run state. */
export function useRunSummary(multiplayer: boolean, engine?: GameEngine | null): RunSummary | null {
  const status = useSliceItStore((s) => s.status);
  const songId = useSliceItStore((s) => s.songId);
  const score = useSliceItStore((s) => s.score);
  const maxCombo = useSliceItStore((s) => s.maxCombo);
  const accuracy = useSliceItStore((s) => s.accuracy);
  const modifiers = useSliceItStore((s) => s.modifiers);
  const runToken = useSliceItStore((s) => s.runToken);

  if (status !== 'FINISHED' || !songId) return null;

  const map = engine?.getActiveMap() ?? null;
  const slices = engine?.getSlices() ?? [];
  return {
    songId,
    score,
    maxCombo,
    accuracy,
    modifiers,
    multiplayer,
    ...(runToken ? { runToken } : {}),
    // The engine is the only thing that knows these; a caller without one
    // submits without them and the server simply has less to check.
    ...(engine ? { notesResolved: engine.getState().notesResolved } : {}),
    ...(engine?.getTimingSummary() ? { timing: engine.getTimingSummary()! } : {}),
    ...(map ? { songTitle: map.name } : {}),
    // The chart's own span. The `Song` row's duration is not on the client here,
    // and the last note is close enough for a line in a calibration log.
    ...(slices.length > 0 ? { durationSec: Math.ceil(slices[slices.length - 1]!.time) } : {}),
  };
}
