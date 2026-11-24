/**
 * Practice mode, pure (roadmap item 6): the countdown's reducer and the picking of a question. The component owns the
 * one-second interval and dispatches `tick` while the state is `running`; nothing here reads a clock.
 */

export const PRACTICE_SECONDS = [60, 120, 180] as const;
export type PracticeSeconds = (typeof PRACTICE_SECONDS)[number];

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

export interface TimerState {
  status: TimerStatus;
  /** The chosen length. */
  duration: PracticeSeconds;
  /** Whole seconds left. */
  remaining: number;
}

export type TimerAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'reset' }
  | { type: 'tick' }
  | { type: 'duration'; seconds: PracticeSeconds };

export const initialTimer = (duration: PracticeSeconds = 120): TimerState => ({
  status: 'idle',
  duration,
  remaining: duration,
});

export function timerReducer(s: TimerState, a: TimerAction): TimerState {
  switch (a.type) {
    case 'start':
      // A finished timer needs a reset first; a press on start then does nothing.
      return s.status === 'idle' || s.status === 'paused' ? { ...s, status: 'running' } : s;
    case 'pause':
      return s.status === 'running' ? { ...s, status: 'paused' } : s;
    case 'reset':
      return initialTimer(s.duration);
    case 'tick': {
      if (s.status !== 'running') return s;
      const remaining = Math.max(0, s.remaining - 1);
      return remaining === 0 ? { ...s, remaining, status: 'done' } : { ...s, remaining };
    }
    case 'duration':
      return initialTimer(a.seconds);
  }
}

/** `m:ss`, from whole seconds (never negative). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A random index in `[0, count)`, never `current` when there is another. `random` is `Math.random` in the page. */
export function pickRandomIndex(count: number, current: number, random: () => number = Math.random): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  const hasCurrent = current >= 0 && current < count;
  const pool = hasCurrent ? count - 1 : count;
  const r = Math.min(pool - 1, Math.floor(random() * pool));
  return hasCurrent && r >= current ? r + 1 : r;
}

/** The next index, wrapping; from none it is the first. */
export function pickNextIndex(count: number, current: number): number {
  if (count <= 0) return -1;
  return current < 0 || current >= count ? 0 : (current + 1) % count;
}
