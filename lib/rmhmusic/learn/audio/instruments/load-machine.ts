/**
 * The loading state machine of one sampled instrument — pure, in the repo's `{ initial, step }`
 * shape. `idle -> loading -> ready | failed`. The loader (`loader.ts`) carries out its effects and
 * feeds back what happened; nothing here fetches, decodes or reads a clock.
 */
import type { Machine } from '../../machines/runner';

/** After this long without finishing, a load is "slow" (the lesson says so, then gives up). */
export const SLOW_MS = 2500;
/** A failed network load is retried automatically only this long after it failed. */
export const RETRY_AFTER_MS = 60_000;
/** Automatic retries stop after this many failed attempts; a learner's own request never does. */
export const MAX_AUTO_ATTEMPTS = 3;

export type FailReason = 'network' | 'cors' | 'decode' | 'coverage' | 'unsupported';

export type LoadState =
  | { kind: 'idle' }
  | {
      kind: 'loading';
      done: number;
      total: number;
      /** Zones that failed (kept: coverage may still hold without them). */
      failed: number;
      startedAt: number;
      slow: boolean;
      /** Failed attempts before this one. */
      attempts: number;
      lastReason: FailReason | null;
    }
  /** `degraded`: some zones are missing but every note in range is still covered. */
  | { kind: 'ready'; degraded: boolean }
  | { kind: 'failed'; reason: FailReason; attempts: number; at: number };

export type LoadEvent =
  | { type: 'request'; now: number; user: boolean; total: number }
  | { type: 'zone-ok' }
  | { type: 'zone-failed'; reason: FailReason }
  | { type: 'tick'; now: number }
  | { type: 'settled'; coverageOk: boolean; now: number }
  | { type: 'dispose' };

export type LoadEffect = { type: 'fetch-zones' } | { type: 'free-buffers' };

export function initial(): LoadState {
  return { kind: 'idle' };
}

const same = (state: LoadState): { state: LoadState; effects: LoadEffect[] } => ({
  state,
  effects: [],
});

export function step(s: LoadState, e: LoadEvent): { state: LoadState; effects: LoadEffect[] } {
  switch (e.type) {
    case 'request': {
      if (s.kind === 'loading' || s.kind === 'ready') return same(s);
      let attempts = 0;
      if (s.kind === 'failed') {
        // A learner's own request (the Sound picker, a lesson) always tries again. An automatic
        // one only retries a plain network failure, later, and not forever.
        const auto =
          s.reason === 'network' &&
          e.now - s.at >= RETRY_AFTER_MS &&
          s.attempts < MAX_AUTO_ATTEMPTS;
        if (!e.user && !auto) return same(s);
        attempts = s.attempts;
      }
      return {
        state: {
          kind: 'loading',
          done: 0,
          total: e.total,
          failed: 0,
          startedAt: e.now,
          slow: false,
          attempts,
          lastReason: null,
        },
        effects: [{ type: 'fetch-zones' }],
      };
    }
    case 'zone-ok':
      return s.kind === 'loading' ? same({ ...s, done: s.done + 1 }) : same(s);
    case 'zone-failed':
      return s.kind === 'loading'
        ? same({ ...s, failed: s.failed + 1, lastReason: e.reason })
        : same(s);
    case 'tick':
      return s.kind === 'loading' && !s.slow && e.now - s.startedAt >= SLOW_MS
        ? same({ ...s, slow: true })
        : same(s);
    case 'settled':
      if (s.kind !== 'loading') return same(s);
      if (e.coverageOk) return same({ kind: 'ready', degraded: s.failed > 0 });
      return same({
        kind: 'failed',
        reason: s.lastReason ?? 'coverage',
        attempts: s.attempts + 1,
        at: e.now,
      });
    case 'dispose':
      if (s.kind === 'ready') return { state: { kind: 'idle' }, effects: [{ type: 'free-buffers' }] };
      if (s.kind === 'failed') return same({ kind: 'idle' });
      return same(s);
  }
}

export const loadMachine: Machine<LoadState, LoadEvent, LoadEffect> = {
  initial: initial(),
  step,
};
