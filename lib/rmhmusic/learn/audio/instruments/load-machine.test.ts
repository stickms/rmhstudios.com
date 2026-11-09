import { describe, expect, it } from 'vitest';
import {
  RETRY_AFTER_MS,
  SLOW_MS,
  initial,
  step,
  type LoadEvent,
  type LoadState,
} from './load-machine';

const loading = (over: Partial<Extract<LoadState, { kind: 'loading' }>> = {}): LoadState => ({
  kind: 'loading',
  done: 0,
  total: 3,
  failed: 0,
  startedAt: 0,
  slow: false,
  attempts: 0,
  lastReason: null,
  ...over,
});
const failed = (at = 100, attempts = 1, reason: 'network' | 'cors' = 'network'): LoadState => ({
  kind: 'failed',
  reason,
  attempts,
  at,
});

describe('request', () => {
  it('idle -> loading with a fetch effect', () => {
    const r = step(initial(), { type: 'request', now: 5, user: false, total: 4 });
    expect(r.state).toMatchObject({ kind: 'loading', done: 0, total: 4, startedAt: 5, slow: false });
    expect(r.effects).toEqual([{ type: 'fetch-zones' }]);
  });
  it('is single flight: a request while loading or ready changes nothing', () => {
    for (const s of [loading(), { kind: 'ready', degraded: false } as LoadState]) {
      const r = step(s, { type: 'request', now: 9, user: true, total: 3 });
      expect(r.state).toBe(s);
      expect(r.effects).toEqual([]);
    }
  });
  it('a failed set is retried at once for a user request', () => {
    const r = step(failed(100, 3), { type: 'request', now: 101, user: true, total: 3 });
    expect(r.state.kind).toBe('loading');
    expect(r.effects).toEqual([{ type: 'fetch-zones' }]);
  });
  it('an automatic request retries a network failure only after RETRY_AFTER_MS and under 3 attempts', () => {
    const early = step(failed(100, 1), { type: 'request', now: 100 + RETRY_AFTER_MS - 1, user: false, total: 3 });
    expect(early.state.kind).toBe('failed');
    const late = step(failed(100, 1), { type: 'request', now: 100 + RETRY_AFTER_MS, user: false, total: 3 });
    expect(late.state.kind).toBe('loading');
    expect(late.state).toMatchObject({ attempts: 1 });
    const spent = step(failed(100, 3), { type: 'request', now: 100 + RETRY_AFTER_MS * 9, user: false, total: 3 });
    expect(spent.state.kind).toBe('failed');
  });
  it('an automatic request never retries a cors failure (it is deterministic)', () => {
    const r = step(failed(100, 1, 'cors'), { type: 'request', now: 1e9, user: false, total: 3 });
    expect(r.state.kind).toBe('failed');
  });
});

describe('progress', () => {
  it('zone-ok counts', () => {
    const r = step(loading(), { type: 'zone-ok' });
    expect(r.state).toMatchObject({ kind: 'loading', done: 1 });
  });
  it('zone-failed counts a failure and remembers why', () => {
    const r = step(loading(), { type: 'zone-failed', reason: 'decode' });
    expect(r.state).toMatchObject({ failed: 1, lastReason: 'decode' });
  });
  it('tick marks slow after SLOW_MS but never leaves loading', () => {
    expect(step(loading(), { type: 'tick', now: SLOW_MS - 1 }).state).toMatchObject({ slow: false });
    const r = step(loading(), { type: 'tick', now: SLOW_MS });
    expect(r.state).toMatchObject({ kind: 'loading', slow: true });
  });
});

describe('settled', () => {
  it('coverage ok -> ready, not degraded when every zone loaded', () => {
    const r = step(loading({ done: 3 }), { type: 'settled', coverageOk: true, now: 9 });
    expect(r.state).toEqual({ kind: 'ready', degraded: false });
  });
  it('coverage ok with some zones failed -> ready, degraded', () => {
    const r = step(loading({ done: 2, failed: 1 }), { type: 'settled', coverageOk: true, now: 9 });
    expect(r.state).toEqual({ kind: 'ready', degraded: true });
  });
  it('coverage lost -> failed with the recorded reason, or coverage', () => {
    const net = step(loading({ failed: 3, lastReason: 'network', attempts: 1 }), {
      type: 'settled',
      coverageOk: false,
      now: 77,
    });
    expect(net.state).toEqual({ kind: 'failed', reason: 'network', attempts: 2, at: 77 });
    const cov = step(loading({ done: 2 }), { type: 'settled', coverageOk: false, now: 5 });
    expect(cov.state).toMatchObject({ kind: 'failed', reason: 'coverage', attempts: 1 });
  });
});

describe('dispose', () => {
  it('ready -> idle and frees the buffers', () => {
    const r = step({ kind: 'ready', degraded: false }, { type: 'dispose' });
    expect(r.state).toEqual({ kind: 'idle' });
    expect(r.effects).toEqual([{ type: 'free-buffers' }]);
  });
  it('while loading it is ignored (let the load finish)', () => {
    const s = loading();
    expect(step(s, { type: 'dispose' }).state).toBe(s);
  });
  it('a stale zone-ok or settled after dispose is ignored', () => {
    const idle = initial();
    expect(step(idle, { type: 'zone-ok' }).state).toBe(idle);
    expect(step(idle, { type: 'settled', coverageOk: true, now: 1 }).state).toBe(idle);
  });
});

describe('every state x event pair', () => {
  const states: LoadState[] = [initial(), loading(), { kind: 'ready', degraded: true }, failed()];
  const events: LoadEvent[] = [
    { type: 'request', now: 1, user: true, total: 2 },
    { type: 'request', now: 1, user: false, total: 2 },
    { type: 'zone-ok' },
    { type: 'zone-failed', reason: 'network' },
    { type: 'tick', now: 99999 },
    { type: 'settled', coverageOk: true, now: 1 },
    { type: 'settled', coverageOk: false, now: 1 },
    { type: 'dispose' },
  ];
  it('never throws and always returns a known state', () => {
    for (const s of states)
      for (const e of events) {
        const r = step(s, e);
        expect(['idle', 'loading', 'ready', 'failed']).toContain(r.state.kind);
      }
  });
});
