// @vitest-environment node
/**
 * The globe worker protocol (components/radial/globe-protocol.ts): message narrowing, the page-side frame coalescer
 * (at most one frame per animation frame, newest wins, never more than MAX_FRAMES_IN_FLIGHT behind), the clock
 * de-duplication, and the fallback decision for every failure mode.
 */
import { describe, expect, it } from 'vitest';
import {
  FrameCoalescer,
  GLOBE_PROTOCOL_VERSION,
  MAX_CONTEXT_LOSSES,
  MAX_FRAMES_IN_FLIGHT,
  MAX_WORKER_ERRORS,
  afterFailure,
  clockChanged,
  decideGlobeBackend,
  isGlobeOut,
  type CoatClock,
  type CoatSurface,
} from '../globe-protocol';

const surface = (pinch: number, field?: Float32Array, fieldVersion = 0): CoatSurface => ({
  ripples: [0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1],
  gx: 0,
  gy: 0,
  pinch,
  field,
  fieldVersion,
});

const clock = (over: Partial<CoatClock> = {}): CoatClock => ({
  hz: 60,
  idleHz: 30,
  amp: 1,
  active: true,
  held: false,
  engagedUntil: 1000,
  plasma: 0,
  plasmaEaseMs: 180,
  frozen: false,
  ...over,
});

describe('message shapes', () => {
  it('has a protocol version the init carries', () => {
    expect(GLOBE_PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('narrows only the worker messages it knows', () => {
    expect(isGlobeOut({ type: 'ready', version: 1, ok: true })).toBe(true);
    expect(isGlobeOut({ type: 'ack', seq: 3 })).toBe(true);
    expect(isGlobeOut({ type: 'lost' })).toBe(true);
    expect(isGlobeOut({ type: 'drawn' })).toBe(true);
    expect(isGlobeOut({ type: 'skin', ok: false })).toBe(true);
    expect(isGlobeOut({ type: 'frame' })).toBe(false);
    expect(isGlobeOut(null)).toBe(false);
    expect(isGlobeOut('ready')).toBe(false);
  });
});

describe('FrameCoalescer: coalescing and drop-stale', () => {
  it('posts one frame carrying the newest surface and skin', () => {
    const q = new FrameCoalescer();
    q.pushSurface(surface(0.1));
    q.pushSurface(surface(0.2));
    q.pushSkin({ e: 0.1, m: [1, 0, 0, 0, 1, 0, 0, 0, 1], fit: 1 });
    q.pushSkin({ e: 0.2, m: [1, 0, 0, 0, 1, 0, 0, 0, 1], fit: 1 });
    const msg = q.take();
    expect(msg?.type).toBe('frame');
    expect(msg?.seq).toBe(1);
    expect(msg?.surface?.pinch).toBe(0.2);
    expect(msg?.skin?.e).toBe(0.2);
    expect(q.dropped).toBe(2);
    expect(q.take()).toBeNull();
  });

  it('keeps an unsent dough field when a newer surface has none', () => {
    const q = new FrameCoalescer();
    const field = new Float32Array(4);
    q.pushSurface(surface(0.1, field, 7));
    q.pushSurface(surface(0.3));
    const msg = q.take();
    expect(msg?.surface?.pinch).toBe(0.3);
    expect(msg?.surface?.field).toBe(field);
    expect(msg?.surface?.fieldVersion).toBe(7);
  });

  it('a newer field replaces an older unsent one', () => {
    const q = new FrameCoalescer();
    const a = new Float32Array(4);
    const b = new Float32Array(4);
    q.pushSurface(surface(0.1, a, 1));
    q.pushSurface(surface(0.1, b, 2));
    expect(q.take()?.surface?.field).toBe(b);
  });

  it('holds the newest frame back while the worker is MAX_FRAMES_IN_FLIGHT behind, then posts only it', () => {
    const q = new FrameCoalescer();
    for (let i = 0; i < MAX_FRAMES_IN_FLIGHT; i++) {
      q.pushSurface(surface(i));
      expect(q.take()).not.toBeNull();
    }
    expect(q.inFlight).toBe(MAX_FRAMES_IN_FLIGHT);
    for (let i = 0; i < 10; i++) q.pushSurface(surface(10 + i));
    expect(q.take(), 'the worker is behind: nothing is posted').toBeNull();
    expect(q.ack(1)).toBe(true);
    const msg = q.take();
    expect(msg?.surface?.pinch, 'only the newest of the stale frames survives').toBe(19);
    expect(q.dropped).toBe(9);
  });

  it('ignores acks it never sent and resets for a new worker', () => {
    const q = new FrameCoalescer();
    q.pushSurface(surface(1));
    q.take();
    q.ack(99);
    expect(q.inFlight).toBe(1);
    q.pushSurface(surface(2));
    q.reset();
    expect(q.pending).toBe(false);
    expect(q.inFlight).toBe(0);
  });
});

describe('clockChanged', () => {
  it('posts the first state and every real change', () => {
    expect(clockChanged(null, clock())).toBe(true);
    expect(clockChanged(clock(), clock())).toBe(false);
    expect(clockChanged(clock(), clock({ plasma: 0.35 }))).toBe(true);
    expect(clockChanged(clock(), clock({ active: false }))).toBe(true);
    expect(clockChanged(clock(), clock({ frozen: true }))).toBe(true);
    expect(clockChanged(clock(), clock({ hz: 0 }))).toBe(true);
  });

  it('does not post every pointer move: engagedUntil only past the slack', () => {
    expect(clockChanged(clock(), clock({ engagedUntil: 1400 }))).toBe(false);
    expect(clockChanged(clock(), clock({ engagedUntil: 1600 }))).toBe(true);
  });
});

describe('the fallback decision', () => {
  const env = { perfLite: false, hasWorker: true, hasOffscreenCanvas: true, canTransfer: true };

  it('uses the worker where it can', () => {
    expect(decideGlobeBackend(env)).toEqual({ backend: 'worker' });
  });

  it.each([
    [{ perfLite: true }, 'perf-lite'],
    [{ hasWorker: false }, 'no-worker'],
    [{ hasOffscreenCanvas: false }, 'no-offscreen'],
    [{ canTransfer: false }, 'no-offscreen'],
    [{ forced: true }, 'forced'],
  ] as const)('falls back to the CSS globe for %o', (over, reason) => {
    expect(decideGlobeBackend({ ...env, ...over })).toEqual({ backend: 'css', reason });
  });

  it('never retries a worker that could not make a WebGL 2 context or build the program', () => {
    expect(afterFailure('ready-failed', { workerErrors: 0, contextLosses: 0 })).toBe('fallback');
    expect(afterFailure('worker-start', { workerErrors: 0, contextLosses: 0 })).toBe('fallback');
  });

  it('restarts a crashed worker a bounded number of times', () => {
    for (let n = 1; n <= MAX_WORKER_ERRORS; n++)
      expect(afterFailure('worker-error', { workerErrors: n, contextLosses: 0 })).toBe('restart');
    expect(
      afterFailure('worker-error', { workerErrors: MAX_WORKER_ERRORS + 1, contextLosses: 0 }),
    ).toBe('fallback');
  });

  it('survives a bounded number of context losses, then falls back for good', () => {
    for (let n = 1; n <= MAX_CONTEXT_LOSSES; n++)
      expect(afterFailure('context-lost', { workerErrors: 0, contextLosses: n })).toBe('restart');
    expect(
      afterFailure('context-lost', { workerErrors: 0, contextLosses: MAX_CONTEXT_LOSSES + 1 }),
    ).toBe('fallback');
  });
});
