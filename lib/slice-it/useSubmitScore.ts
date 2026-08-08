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
import { type TimingSummary } from './integrity';
import type { SliceItReplay } from '@/lib/game/replay';

export interface SubmitResult {
  status: 'idle' | 'submitting' | 'ok' | 'unranked' | 'failed';
  isNewBest: boolean;
  previousBest: number | null;
  /** The stored replay's id, once one has been uploaded for this run (`R3`). */
  replayId?: string | null;
}

/**
 * Attach a run's input log to a personal best.
 *
 * Fire-and-forget, and deliberately after the score: the score is what the
 * player is waiting for, the replay is what someone might watch tomorrow. A
 * failure here is silent — the run and its score are already stored, and a toast
 * about a replay upload on a results screen is noise about a feature the player
 * did not ask for.
 */
async function uploadReplay(replay: SliceItReplay): Promise<string | null> {
  try {
    const response = await fetch('/api/slice-it/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replay }),
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return body.id ?? null;
  } catch {
    return null;
  }
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
  /**
   * The run's input log (`R3`) — as a thunk, and never part of the score
   * request.
   *
   * A thunk because the payload is one object per resolved note: on a 2 000-note
   * Expert chart, materialising it is a 2 000-element array build, and
   * `useRunSummary` runs on every render of a results screen that re-renders as
   * the submission resolves. Building it eagerly would pay that cost repeatedly
   * for a run that is usually not a personal best and will therefore never send
   * it. Called at most once, after the server has said the run was a new best —
   * see {@link uploadReplay}.
   *
   * Stripped from the body before the POST regardless. `integrity.ts` is
   * deliberate that *every* submission carries a three-number timing summary
   * rather than per-note samples; a replay is a separate, larger artefact
   * attached to the few runs worth watching, not a tax on every run.
   */
  getReplay?: () => SliceItReplay | null;
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
    // The log never travels with the score. Splitting it out here rather than at
    // the call site is what makes that true for every caller, present and future.
    const { getReplay, ...scoreBody } = summary;
    try {
      const response = await fetch('/api/slice-it/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scoreBody),
      });
      const body = (await response.json().catch(() => ({}))) as {
        isNewBest?: boolean;
        previousBest?: number | null;
        ranked?: boolean;
        /** False for the guest path, which persists nothing. */
        stored?: boolean;
      };

      if (!response.ok) {
        setResult({
          status: body.ranked === false ? 'unranked' : 'failed',
          isNewBest: false,
          previousBest: null,
        });
        return;
      }

      const isNewBest = Boolean(body.isNewBest);
      setResult({ status: 'ok', isNewBest, previousBest: body.previousBest ?? null });

      // Only a new best gets a replay (`R3`). Every other run is a run the
      // player already knows how it went, and storing 40 KB of note-by-note log
      // for each of them buys a board nobody reads and a table that grows with
      // attempts rather than with records. `stored: false` is the guest path —
      // nothing was persisted, so there is nothing to attach a replay to.
      if (!isNewBest || !getReplay || body.stored === false) return;
      const replay = getReplay();
      if (!replay) return;
      const replayId = await uploadReplay(replay);
      if (replayId) {
        setResult((current) => (current.status === 'ok' ? { ...current, replayId } : current));
      }
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

  // P1/P3/R4 — practice, autoplay and replay playback are unrankable BY
  // CONSTRUCTION. The guard is here, at the only place a submittable summary is
  // built, rather than on a hidden button: a hidden button is a convention, and
  // a convention is one refactor away from posting a demo run to a leaderboard.
  if (engine?.isUnrankable()) return null;

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
    // Carried as a thunk, not sent: `submit` strips it out of the score body and
    // calls it only if the server says this was a new best.
    ...(engine ? { getReplay: () => engine.getReplay() } : {}),
  };
}
