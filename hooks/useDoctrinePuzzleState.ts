/**
 * Puzzle game state machine hook.
 * Manages the lifecycle: loading → playing → submitting → complete/failed.
 */

import { useState, useCallback, useRef } from 'react';

type PuzzlePhase = 'loading' | 'playing' | 'submitting' | 'complete' | 'failed' | 'expired';

interface PuzzleResult {
  correct: boolean;
  score: number;
  xpMultiplier: number;
}

export function useDoctrinePuzzleState(puzzleId: string) {
  const [phase, setPhase] = useState<PuzzlePhase>('loading');
  const [result, setResult] = useState<PuzzleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const startTime = useRef<number>(Date.now());

  const startPlaying = useCallback(() => {
    setPhase('playing');
    startTime.current = Date.now();
  }, []);

  const submit = useCallback(async (answer: unknown) => {
    if (phase !== 'playing') return;

    setPhase('submitting');
    setAttempts(prev => prev + 1);
    const timeMs = Date.now() - startTime.current;

    try {
      const res = await fetch('/api/doctrine/puzzles/submit', {
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
          return;
        }
        if (res.status === 409) {
          setError(data.error);
          setPhase('complete');
          return;
        }
        throw new Error(data.error || 'Submission failed');
      }

      const data = await res.json();
      setResult(data.submission);

      if (data.submission.correct) {
        setPhase('complete');
      } else {
        // Allow retry
        setPhase('playing');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('failed');
    }
  }, [phase, puzzleId, attempts]);

  return {
    phase,
    result,
    error,
    attempts,
    startPlaying,
    submit,
    elapsedMs: Date.now() - startTime.current,
  };
}
