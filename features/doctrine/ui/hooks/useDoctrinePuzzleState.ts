/**
 * Puzzle game state machine hook.
 * Manages the lifecycle: loading → playing → submitting → complete/failed.
 * Supports both daily puzzles and replays (different submit endpoint).
 */

import { useState, useCallback, useRef } from 'react';

type PuzzlePhase = 'loading' | 'playing' | 'submitting' | 'complete' | 'failed' | 'expired';

interface PuzzleResult {
  correct: boolean;
  score: number;
  xpMultiplier: number;
}

export function useDoctrinePuzzleState(puzzleId: string, isReplay = false) {
  const [phase, setPhase] = useState<PuzzlePhase>('loading');
  const [result, setResult] = useState<PuzzleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const startTime = useRef<number>(Date.now());

  const startPlaying = useCallback(() => {
    setPhase('playing');
    startTime.current = Date.now();
  }, []);

  const submit = useCallback(async (answer: unknown): Promise<PuzzleResult | null> => {
    if (phase !== 'playing') return null;

    setPhase('submitting');
    setAttempts(prev => prev + 1);
    const timeMs = Date.now() - startTime.current;

    const endpoint = isReplay ? '/api/doctrine/puzzles/replay' : '/api/doctrine/puzzles/submit';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puzzleId,
          answer,
          timeMs,
          attempts: attempts + 1,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 410) {
          setPhase('expired');
          setError(data.error);
          return null;
        }
        if (res.status === 409) {
          // Already submitted daily — offer replay
          setError('Already completed today. Try playing again for reduced XP!');
          setPhase('complete');
          return null;
        }
        throw new Error(data.error || 'Submission failed');
      }

      const data = await res.json();
      const submission = data.submission as PuzzleResult;
      setResult(submission);

      if (submission.correct) {
        setPhase('complete');
      } else {
        // Allow retry
        setPhase('playing');
      }

      return submission;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('failed');
      return null;
    }
  }, [phase, puzzleId, attempts, isReplay]);

  const reset = useCallback(() => {
    setPhase('loading');
    setResult(null);
    setError(null);
    setAttempts(0);
    startTime.current = Date.now();
  }, []);

  return {
    phase,
    result,
    error,
    attempts,
    startPlaying,
    submit,
    reset,
    elapsedMs: Date.now() - startTime.current,
  };
}
