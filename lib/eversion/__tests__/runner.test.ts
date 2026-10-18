// @vitest-environment node
/**
 * The run orchestration's SEQUENCE, against scripted ports (tasks T31; spec §3.2,
 * §6.3, §9.2). The real ports (host, DOM, router) are exercised by
 * `testing/e2e/eversion-controller.mjs`; this file proves the order of events,
 * which a browser test can only sample.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AFTER_CAPTURE_TIMEOUT_MS, BEFORE_WAIT_MS, MAX_RUN_MS } from '../constants';
import { EversionRunner, HOST_READY_TIMEOUT_MS, OVERLAY_MOUNT_TIMEOUT_MS } from '../runner';
import type { RunnerDeps } from '../runner';
import type { SettleReport, SettleRequest } from '../settle';
import type {
  CaptureApi,
  EversionHost,
  EversionNode,
  FromWorker,
  GlobeStartState,
  ToWorker,
  Viewport,
} from '../types';

const NODE = {
  id: 'n',
  href: '/games',
  tKey: 'k',
  label: 'Games',
  icon: {},
} as unknown as EversionNode;
const GLOBE: GlobeStartState = {
  yaw: 0,
  pitch: 0,
  yawVel: 0,
  pitchVel: 0,
  centre: [100, 100],
  radius: 50,
};
const COLOURS = {
  bg: [0, 0, 0, 1],
  veil: [0, 0, 0, 1],
  accent: [1, 1, 1, 1],
  cageMinor: [1, 1, 1, 0.2],
  cageParallel: [1, 1, 1, 0.1],
  cageMajor: [1, 1, 1, 0.3],
  cageRipple: [1, 1, 1, 0.5],
  cageWidth: 1,
} as const;

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

interface Rig {
  deps: RunnerDeps;
  /** Everything that happened, in order, as short strings. */
  log: string[];
  posted: ToWorker[];
  emit(message: FromWorker): void;
  routerIdle: { resolve(): void };
  input(): void;
  traverse(): void;
  resize(viewport: Viewport): void;
  capture: { captureViewport: ReturnType<typeof vi.fn> };
  /** The readiness gate: every request it was given, and a way to script what it answers. */
  settle: {
    requests: SettleRequest[];
    /** Hold the gate until `release()` (a destination whose content is late). */
    hold(): void;
    release(report?: Partial<SettleReport>): void;
    /** Replace the answer. */
    answer(impl: (request: SettleRequest) => Promise<SettleReport>): void;
  };
  runner: EversionRunner;
}

const SETTLED: SettleReport = {
  settled: true,
  reason: 'settled',
  waitedMs: 0,
  frames: 2,
  last: null,
};

function rig(patch: Partial<RunnerDeps> = {}, captureImpl?: () => Promise<unknown>): Rig {
  const log: string[] = [];
  const posted: ToWorker[] = [];
  const listeners = new Set<(m: FromWorker) => void>();
  const host: EversionHost = {
    mode: 'worker',
    post(message) {
      posted.push(message);
      log.push(`post:${message.type}`);
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    dispose() {},
  };
  let resolveIdle!: () => void;
  const idle = new Promise<void>((r) => (resolveIdle = r));
  let inputCb: (() => void) | null = null;
  let traversalCb: (() => void) | null = null;
  let resizeCb: ((v: Viewport) => void) | null = null;
  const settleRequests: SettleRequest[] = [];
  let settleImpl: (request: SettleRequest) => Promise<SettleReport> = async () => SETTLED;
  let releaseHold: ((report: SettleReport) => void) | null = null;
  const capture = {
    captureViewport: vi.fn(
      captureImpl ??
        (async () => ({ bitmap: bitmap(), width: 1, height: 1, scale: 1, durationMs: 1 })),
    ),
  };
  const deps: RunnerDeps = {
    host: {
      ready: async () => host,
      discardCanvas: () => log.push('discardCanvas'),
    },
    overlay: {
      mount: async () => void log.push('overlay:mount'),
      fade: () => log.push('overlay:fade'),
      unmount: () => log.push('overlay:unmount'),
    },
    page: {
      onResize(cb) {
        resizeCb = cb;
        return () => {
          resizeCb = null;
        };
      },
      viewport: () => ({ w: 800, h: 600, dpr: 1 }),
      tier: () => 'mid',
      colours: () => COLOURS,
      setCover: (on) => log.push(`cover:${on ? 'on' : 'off'}`),
      setLive: (on) => log.push(`live:${on ? 'on' : 'off'}`),
      setSettle: (on) => log.push(`settle:${on ? 'on' : 'off'}`),
      watchSettle: () => ({
        async whenSettled(request) {
          settleRequests.push(request);
          log.push('gate');
          const report = await settleImpl(request);
          log.push(`gate-done:${report.reason}`);
          return report;
        },
        dispose: () => void log.push('watch:dispose'),
      }),
      nextFrame: async () => void log.push('raf'),
      onInput(cb) {
        inputCb = cb;
        return () => {
          inputCb = null;
        };
      },
      currentHref: () => '/here',
    },
    router: {
      navigate(href) {
        log.push(`navigate:${href}`);
      },
      whenIdle: () => idle.then(() => void log.push('router-idle')),
      onTraversal(cb) {
        traversalCb = cb;
        return () => {
          traversalCb = null;
        };
      },
    },
    ineligibleReason: () => null,
    awaitBefore: async () => bitmap(),
    capture: () => capture as unknown as CaptureApi,
    openCapture: async () => capture as unknown as CaptureApi,
    placeholder: async () => bitmap(),
    projection: () => 'mercator',
    lut: () => null,
    requested: () => 'random',
    mark: (name, detail) =>
      log.push(
        `mark:${name}${name === 'fallback' ? `:${(detail as { reason: string }).reason}` : ''}`,
      ),
    now: () => 0,
    ...patch,
  };
  return {
    deps,
    log,
    posted,
    emit: (m) => {
      for (const l of [...listeners]) l(m);
    },
    routerIdle: { resolve: resolveIdle },
    input: () => inputCb?.(),
    traverse: () => traversalCb?.(),
    resize: (v) => resizeCb?.(v),
    capture,
    settle: {
      requests: settleRequests,
      hold() {
        settleImpl = () =>
          new Promise<SettleReport>((resolve) => {
            releaseHold = resolve;
          });
      },
      release(report = {}) {
        releaseHold?.({ ...SETTLED, ...report });
      },
      answer(impl) {
        settleImpl = impl;
      },
    },
    runner: new EversionRunner(deps),
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const DONE: FromWorker = { type: 'done', frames: 10, dropped: 1, p95: 17 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('eversion runner: the fallback paths (today runs; no overlay, no navigate)', () => {
  it('ineligible: returns the reason, marks fallback, touches nothing', async () => {
    const r = rig({ ineligibleReason: () => 'reduced-motion' });
    const out = await r.runner.run(NODE, GLOBE);
    expect(out).toEqual({ fallback: 'reduced-motion' });
    expect(r.log).toEqual(['mark:fallback:reduced-motion']);
  });

  it('BEFORE missing: falls back before mounting anything', async () => {
    const r = rig({ awaitBefore: async () => null });
    const out = await r.runner.run(NODE, GLOBE);
    expect(out.fallback).toBe('before-missing');
    expect(r.log).not.toContain('overlay:mount');
    expect(r.log.some((l) => l.startsWith('navigate'))).toBe(false);
  });

  it('BEFORE that took the whole wait is a timeout', async () => {
    let t = 0;
    const r = rig({
      now: () => t,
      awaitBefore: async () => {
        t += BEFORE_WAIT_MS;
        return null;
      },
    });
    expect((await r.runner.run(NODE, GLOBE)).fallback).toBe('before-timeout');
  });

  it('a BEFORE that rejects is before-failed, never a throw', async () => {
    const r = rig({
      awaitBefore: async () => {
        throw new Error('boom');
      },
    });
    expect((await r.runner.run(NODE, GLOBE)).fallback).toBe('before-failed');
  });

  it('host that cannot start: host-error, BEFORE closed, no navigate', async () => {
    const before = bitmap();
    const r = rig({
      awaitBefore: async () => before,
      host: {
        ready: async () => {
          throw new Error('no gl');
        },
        discardCanvas: () => {},
      },
    });
    const out = await r.runner.run(NODE, GLOBE);
    expect(out.fallback).toBe('host-error');
    expect(before.close).toHaveBeenCalled();
    expect(r.log.some((l) => l.startsWith('navigate'))).toBe(false);
  });

  it('overlay that never attaches: host-error', async () => {
    const r = rig({ overlay: { mount: () => new Promise(() => {}), fade() {}, unmount() {} } });
    const p = r.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(OVERLAY_MOUNT_TIMEOUT_MS + 50);
    expect((await p).fallback).toBe('host-error');
  });

  it('gives the BEFORE bitmap one bounded budget, BEFORE_WAIT_MS (amended 2026-10-18)', async () => {
    // The release waits for the picture (in flight, else taken on demand: the
    // controller's half) instead of skipping the effect at once; one budget, and a
    // bounded one, because the hub sits still meanwhile.
    const waits: number[] = [];
    const r = rig({
      awaitBefore: async (grace) => {
        waits.push(grace);
        return null;
      },
    });
    expect((await r.runner.run(NODE, GLOBE)).fallback).toBe('before-missing');
    expect(waits).toEqual([BEFORE_WAIT_MS]);
    expect(BEFORE_WAIT_MS).toBeGreaterThan(50);
    expect(BEFORE_WAIT_MS).toBeLessThanOrEqual(1500);
  });

  it('a host that never answers costs HOST_READY_TIMEOUT_MS, then falls back', async () => {
    const r = rig({
      host: {
        ready: (_tier, ms) => new Promise((_, reject) => setTimeout(reject, ms)),
        discardCanvas() {},
      },
    });
    const started = Date.now();
    const p = r.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(HOST_READY_TIMEOUT_MS + 50);
    expect((await p).fallback).toBe('host-error');
    expect(Date.now() - started).toBeLessThanOrEqual(HOST_READY_TIMEOUT_MS + 50);
  });

  it('placeholder failure (before start): host-error and no navigate', async () => {
    const r = rig({
      placeholder: async () => {
        throw new Error('2d');
      },
    });
    const out = await r.runner.run(NODE, GLOBE);
    expect(out.fallback).toBe('host-error');
    expect(r.log.some((l) => l.startsWith('navigate'))).toBe(false);
    expect(r.runner.state().phase).toBe('idle');
  });

  it('a second run while one is in flight falls back (the caller navigates as today)', async () => {
    const r = rig();
    void r.runner.run(NODE, GLOBE);
    await flush();
    expect((await r.runner.run(NODE, GLOBE)).fallback).toBe('busy');
  });
});

describe('eversion runner: the sequence', () => {
  function started(r: Rig) {
    return r.runner.run(NODE, GLOBE, 'release');
  }

  it('primes, uploads BEFORE and the placeholder, then start and navigate in one task', async () => {
    const r = rig();
    const p = started(r);
    await flush();
    void p;
    const order = r.log.filter((l) => /^(post|navigate|mark:start)/.test(l));
    expect(order).toEqual([
      'post:prime',
      'post:texture',
      'post:texture',
      'mark:start',
      'post:start',
      'navigate:/games',
    ]);
    // Nothing between start and navigate: they are adjacent entries of the log.
    const i = r.log.indexOf('post:start');
    expect(r.log[i + 1]).toBe('navigate:/games');
    expect(r.posted.filter((m) => m.type === 'texture').map((m) => m.slot)).toEqual([
      'before',
      'placeholder',
    ]);
  });

  it('navigates to the URL at START, before any frame has been reported', async () => {
    const r = rig();
    void started(r);
    await flush();
    expect(r.log).toContain('navigate:/games');
    expect(r.log).not.toContain('mark:cover');
    expect(r.log).not.toContain('mark:done');
  });

  it('cover class is on only between cover and uncover', async () => {
    const r = rig();
    const p = started(r);
    await flush();
    expect(r.log).not.toContain('cover:on');
    r.emit({ type: 'cover' });
    expect(r.runner.state().coverActive).toBe(true);
    expect(r.log.filter((l) => l.startsWith('cover:'))).toEqual(['cover:on']);

    r.emit({ type: 'uncover' });
    await flush();
    const onAt = r.log.indexOf('cover:on');
    const offAt = r.log.indexOf('cover:off');
    const revealAt = r.log.indexOf('post:reveal');
    expect(onAt).toBeGreaterThan(-1);
    expect(offAt).toBeGreaterThan(onAt);
    // Off BEFORE reveal, with two rAFs between (spec §6.6).
    expect(revealAt).toBeGreaterThan(offAt);
    const between = r.log.slice(offAt, revealAt).filter((l) => l === 'raf');
    expect(between.length).toBeGreaterThanOrEqual(2);
    expect(r.runner.state().coverActive).toBe(false);

    r.emit(DONE);
    const out = await p;
    expect(out).toEqual({
      fallback: null,
      end: 'done',
      stats: { frames: 10, dropped: 1, p95: 17 },
    });
    // never turned on again
    expect(r.log.filter((l) => l === 'cover:on')).toHaveLength(1);
  });

  it('the live page is handed back sharp from the first cover, and released only after the run has ended', async () => {
    const r = rig();
    const p = started(r);
    await flush();
    expect(r.log).not.toContain('live:on');
    r.emit({ type: 'cover' });
    // Live goes on with (and just before) the cover class: the blur is dropped while the page is invisible.
    expect(r.log.indexOf('live:on')).toBeGreaterThan(-1);
    expect(r.log.indexOf('live:on')).toBeLessThan(r.log.indexOf('cover:on'));
    r.emit({ type: 'uncover' });
    await flush();
    // The cover comes off at uncover; the page stays sharp (it is what the canvas dissolves onto).
    expect(r.log).toContain('cover:off');
    expect(r.log).not.toContain('live:off');
    r.emit(DONE);
    await p;
    await flush();
    // Released a couple of frames after the run (the hub has left `everting` by then), never before `done`.
    expect(r.log.indexOf('live:off')).toBeGreaterThan(r.log.indexOf('mark:done'));
    expect(r.log.filter((l) => l === 'live:on')).toHaveLength(1);
  });

  it('a duplicate uncover posts reveal once', async () => {
    const r = rig();
    void started(r);
    await flush();
    r.emit({ type: 'cover' });
    r.emit({ type: 'uncover' });
    r.emit({ type: 'uncover' });
    await flush();
    expect(r.posted.filter((m) => m.type === 'reveal')).toHaveLength(1);
  });

  it('done unmounts the overlay, leaves nothing on the document, and resolves', async () => {
    const r = rig();
    const p = started(r);
    await flush();
    r.emit({ type: 'cover' });
    r.emit(DONE);
    await p;
    expect(r.log).toContain('overlay:unmount');
    expect(r.log.filter((l) => l.startsWith('mark:')).at(-1)).toBe('mark:done');
    expect(r.runner.state()).toMatchObject({ phase: 'done', coverActive: false });
    // The cover class does not outlive the run even if uncover never came.
    expect(r.log.lastIndexOf('cover:off')).toBeGreaterThan(r.log.lastIndexOf('cover:on'));
  });

  it('emits the stage marks in order with the gate-open reason', async () => {
    const r = rig();
    const p = started(r);
    await flush();
    r.emit({ type: 'cover' });
    r.emit({ type: 'stage', stage: 'evert', t: 1 });
    r.routerIdle.resolve();
    await flush();
    r.emit({ type: 'stage', stage: 'gate-open', t: 2 });
    r.emit({ type: 'stage', stage: 'unwrap', t: 3 });
    r.emit({ type: 'uncover' });
    await flush();
    r.emit(DONE);
    await p;
    const marks = r.log.filter((l) => l.startsWith('mark:'));
    expect(marks).toEqual([
      'mark:start',
      'mark:cover',
      'mark:evert',
      'mark:gateOpen',
      'mark:unwrap',
      'mark:reveal',
      'mark:done',
    ]);
  });
});

describe('eversion runner: AFTER', () => {
  it('waits for the router, then the readiness gate, captures with the settle attribute, uploads', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    expect(r.capture.captureViewport).not.toHaveBeenCalled(); // router not idle yet
    expect(r.log).not.toContain('gate');
    r.routerIdle.resolve();
    await flush();
    const order = r.log.filter((l) => /^(router-idle|gate|settle:on|post:texture)/.test(l));
    expect(order.indexOf('gate')).toBeGreaterThan(order.indexOf('router-idle'));
    const iOn = r.log.indexOf('settle:on');
    const iOff = r.log.indexOf('settle:off');
    expect(r.log.indexOf('gate-done:settled')).toBeLessThan(iOn);
    expect(iOff).toBeGreaterThan(iOn);
    const after = r.posted.filter((m) => m.type === 'texture' && m.slot === 'after');
    expect(after).toHaveLength(1);
    expect(r.capture.captureViewport).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'after', scaleCap: 1.25 }),
    );
    expect(r.runner.state().afterReady).toBe(true);
    r.emit(DONE);
    await p;
  });

  it('a destination whose content is late is NOT captured until the gate says it is settled', async () => {
    const r = rig();
    r.settle.hold();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    // Router idle, gate still waiting (skeletons on screen, a query in flight): nothing captured, nothing sent.
    expect(r.log).toContain('gate');
    expect(r.capture.captureViewport).not.toHaveBeenCalled();
    expect(r.posted.some((m) => m.type === 'texture' && m.slot === 'after')).toBe(false);
    expect(r.posted.some((m) => m.type === 'after-failed')).toBe(false);
    // The content lands; only then is the page frozen into a texture.
    r.settle.release();
    await flush();
    expect(r.capture.captureViewport).toHaveBeenCalledTimes(1);
    expect(r.posted.filter((m) => m.type === 'texture' && m.slot === 'after')).toHaveLength(1);
    r.emit(DONE);
    await p;
  });

  it("the gate is bounded by the timeline's own AFTER deadline (need-after-by), worked back from the cap", async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    const req = r.settle.requests[0]!;
    // Until the render side reports its own, the nominal plan's: start (t0 = 0) + 3800 + the 2500 cap.
    expect(req.hard()).toBe(6300 - 320 - 300);
    expect(req.soft()).toBe(req.hard() - 2500);
    // A slower timeline (a loaded GPU) says so, and the bounds follow it.
    r.emit({ type: 'need-after-by', deadline: 9000 });
    expect(req.hard()).toBe(9000 - 320 - 300);
    expect(req.soft()).toBe(9000 - 320 - 300 - 2500);
    r.emit(DONE);
    await p;
  });

  it('a fast-forward or an abort hurries the gate; an ended run or a started UNWRAP cancels it', async () => {
    const r = rig();
    r.settle.hold();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    const req = r.settle.requests[0]!;
    expect(req.hurried()).toBe(false);
    expect(req.cancelled()).toBe(false);
    r.input(); // a press: fast-forward
    expect(req.hurried()).toBe(true);
    r.emit({ type: 'stage', stage: 'unwrap', t: 1 });
    expect(req.cancelled()).toBe(true);
    r.settle.release({ reason: 'cancelled', settled: false });
    await flush();
    // Cancelled: nothing is captured for a run that no longer wants AFTER.
    expect(r.capture.captureViewport).not.toHaveBeenCalled();
    r.emit(DONE);
    await p;
  });

  it('a page that cannot be watched still gets its two frames and a capture (the gate is an improvement, not a dependency)', async () => {
    const r = rig();
    r.deps.page.watchSettle = () => {
      throw new Error('no document');
    };
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    expect(r.log).not.toContain('gate');
    const afterIdle = r.log.slice(r.log.indexOf('router-idle'));
    expect(afterIdle.filter((l) => l === 'raf').length).toBeGreaterThanOrEqual(2);
    expect(r.posted.filter((m) => m.type === 'texture' && m.slot === 'after')).toHaveLength(1);
    r.emit(DONE);
    await p;
  });

  it('stops watching the document when the run ends', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit(DONE);
    await p;
    expect(r.log).toContain('watch:dispose');
  });

  it('the debug seam sees the AFTER bitmap and what the gate found, before it is handed over', async () => {
    const seen: { settle: SettleReport | null }[] = [];
    const r = rig({
      afterCaptured: (_bitmap, settle) => {
        seen.push({ settle });
        throw new Error('observability must never break a run');
      },
    });
    r.settle.answer(async () => ({ ...SETTLED, reason: 'rested', settled: false, waitedMs: 1234 }));
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.settle).toMatchObject({ reason: 'rested', waitedMs: 1234 });
    expect(r.posted.filter((m) => m.type === 'texture' && m.slot === 'after')).toHaveLength(1);
    r.emit(DONE);
    await p;
  });

  it('a throwing capture sends after-failed, and the gate reason says so', async () => {
    const r = rig({}, async () => {
      throw new Error('tainted');
    });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    expect(r.posted.some((m) => m.type === 'after-failed')).toBe(true);
    expect(r.posted.some((m) => m.type === 'texture' && m.slot === 'after')).toBe(false);
    // The attribute is not left behind.
    expect(r.log.lastIndexOf('settle:off')).toBeGreaterThan(r.log.lastIndexOf('settle:on'));
    r.emit(DONE);
    await p;
  });

  it('a capture that never returns times out into after-failed', async () => {
    const r = rig({}, () => new Promise(() => {}));
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    expect(r.posted.some((m) => m.type === 'after-failed')).toBe(false);
    await vi.advanceTimersByTimeAsync(1600);
    expect(r.posted.some((m) => m.type === 'after-failed')).toBe(true);
    r.emit(DONE);
    await p;
  });

  it('a router that never settles is an AFTER failure at AFTER_CAPTURE_TIMEOUT_MS', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    await vi.advanceTimersByTimeAsync(AFTER_CAPTURE_TIMEOUT_MS - 100);
    expect(r.posted.some((m) => m.type === 'after-failed')).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(r.posted.filter((m) => m.type === 'after-failed')).toHaveLength(1);
    expect(r.capture.captureViewport).not.toHaveBeenCalled();
    expect(r.posted.some((m) => m.type === 'texture' && m.slot === 'after')).toBe(false);
    r.emit(DONE);
    await p;
  });

  it('an AFTER that lands after the run ended is closed, not uploaded', async () => {
    const late = bitmap();
    let finishCapture!: (v: unknown) => void;
    const r = rig({}, () => new Promise((res) => (finishCapture = res)));
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    r.emit(DONE);
    await p;
    finishCapture({ bitmap: late, width: 1, height: 1, scale: 1, durationMs: 1 });
    await flush();
    expect(late.close).toHaveBeenCalled();
    expect(r.posted.filter((m) => m.type === 'texture' && m.slot === 'after')).toHaveLength(0);
  });

  it('a run that ends while the runner is still opening its own capture session never sets the settle attribute', async () => {
    let openIt!: (c: CaptureApi) => void;
    const dispose = vi.fn();
    const own = {
      captureViewport: vi.fn(),
      createSession: vi.fn(),
      dispose,
    } as unknown as CaptureApi;
    const r = rig({
      capture: () => null,
      openCapture: () => new Promise<CaptureApi>((res) => (openIt = res)),
    });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    r.emit({ type: 'context-lost' });
    await vi.advanceTimersByTimeAsync(300);
    await p;
    openIt(own);
    await flush();
    expect(r.log).not.toContain('settle:on');
    expect(
      (own as unknown as { captureViewport: ReturnType<typeof vi.fn> }).captureViewport,
    ).not.toHaveBeenCalled();
  });

  it('opens its own capture session when the hub has none, and disposes it', async () => {
    const dispose = vi.fn();
    const own = { captureViewport: r0().captureViewport, createSession: vi.fn(), dispose };
    function r0() {
      return {
        captureViewport: vi.fn(async () => ({
          bitmap: bitmap(),
          width: 1,
          height: 1,
          scale: 1,
          durationMs: 1,
        })),
      };
    }
    const r = rig({ capture: () => null, openCapture: async () => own as unknown as CaptureApi });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    expect(own.captureViewport).toHaveBeenCalled();
    r.emit(DONE);
    await p;
    expect(dispose).toHaveBeenCalled();
  });
});

describe('eversion runner: input, abort and faults after start', () => {
  it('input sends one fast-forward, however many presses follow', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.input();
    r.input();
    r.input();
    expect(r.posted.filter((m) => m.type === 'fast-forward')).toHaveLength(1);
    r.emit(DONE);
    await p;
    r.input(); // listener removed with the run
    expect(r.posted.filter((m) => m.type === 'fast-forward')).toHaveLength(1);
  });

  it('abort posts abort and tags the gate reason', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.runner.abort();
    expect(r.posted.some((m) => m.type === 'abort')).toBe(true);
    r.emit({ type: 'stage', stage: 'gate-open', t: 1 });
    r.emit(DONE);
    await p;
  });

  it('context loss after start: cover off, overlay fades 200 ms, then unmounts; end is context-lost', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit({ type: 'cover' });
    r.emit({ type: 'context-lost' });
    expect(r.log).toContain('overlay:fade');
    expect(r.log).toContain('discardCanvas');
    expect(r.runner.state().coverActive).toBe(false);
    expect(r.log).not.toContain('overlay:unmount');
    // The overlay dissolves onto the live page, so the page is the sharp one (live) before the fade begins.
    expect(r.log.indexOf('live:on')).toBeGreaterThan(-1);
    expect(r.log.indexOf('live:on')).toBeLessThan(r.log.indexOf('overlay:fade'));
    expect(r.log).not.toContain('live:off');
    await vi.advanceTimersByTimeAsync(210);
    const out = await p;
    expect(out).toMatchObject({ fallback: null, end: 'context-lost' });
    expect(r.log).toContain('overlay:unmount');
    await flush();
    expect(r.log.indexOf('live:off')).toBeGreaterThan(r.log.indexOf('overlay:unmount'));
  });

  it('a fatal error after start ends the run the same way; a non-fatal one is ignored', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit({ type: 'error', message: 'soft', fatal: false });
    expect(r.runner.state().phase).toBe('running');
    r.emit({ type: 'error', message: 'hard', fatal: true });
    await vi.advanceTimersByTimeAsync(210);
    expect((await p).end).toBe('context-lost');
  });

  it('a run can follow a finished one', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit(DONE);
    await p;
    const q = r.runner.run(NODE, GLOBE);
    await flush();
    expect(r.runner.state().phase).toBe('running');
    r.emit(DONE);
    expect((await q).end).toBe('done');
  });
});

describe('eversion runner: router and viewport edge cases (spec 9.4)', () => {
  it('back/forward during the run aborts once; the AFTER capture it was waiting for is dropped', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.traverse();
    r.traverse();
    expect(r.posted.filter((m) => m.type === 'abort')).toHaveLength(1);
    // The router settles after the traversal: nothing may be captured or uploaded for the aborted run.
    r.routerIdle.resolve();
    await flush();
    expect(r.capture.captureViewport).not.toHaveBeenCalled();
    expect(
      r.posted.some(
        (m) => m.type === 'after-failed' || (m.type === 'texture' && m.slot === 'after'),
      ),
    ).toBe(false);
    r.emit({ type: 'stage', stage: 'gate-open', t: 1 });
    r.emit(DONE);
    expect(await p).toMatchObject({ fallback: null, end: 'done' });
    r.traverse(); // listener removed with the run
    expect(r.posted.filter((m) => m.type === 'abort')).toHaveLength(1);
  });

  it('a traversal that lands while the AFTER capture is in flight drops its bitmap', async () => {
    const late = bitmap();
    let finishCapture!: (v: unknown) => void;
    const r = rig({}, () => new Promise((res) => (finishCapture = res)));
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    r.traverse();
    finishCapture({ bitmap: late, width: 1, height: 1, scale: 1, durationMs: 1 });
    await flush();
    expect(late.close).toHaveBeenCalled();
    expect(r.posted.some((m) => m.type === 'texture' && m.slot === 'after')).toBe(false);
    r.emit(DONE);
    await p;
  });

  it('forwards a resize to the render side as a resize message, and stops with the run', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.resize({ w: 500, h: 900, dpr: 2 });
    expect(r.posted.filter((m) => m.type === 'resize')).toEqual([
      { type: 'resize', viewport: { w: 500, h: 900, dpr: 2 } },
    ]);
    r.emit(DONE);
    await p;
    r.resize({ w: 1, h: 1, dpr: 1 });
    expect(r.posted.filter((m) => m.type === 'resize')).toHaveLength(1);
  });

  it('input once the unwrap is done (the reveal fade) is ignored', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit({ type: 'cover' });
    r.emit({ type: 'uncover' });
    await flush();
    r.input();
    expect(r.posted.some((m) => m.type === 'fast-forward')).toBe(false);
    r.emit(DONE);
    await p;
  });

  it('context loss BEFORE start (during prime) is a clean fallback, never a hung run', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const r = rig({
      placeholder: async () => {
        await gate;
        return bitmap();
      },
    });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit({ type: 'context-lost' });
    release();
    expect((await p).fallback).toBe('host-error');
    expect(r.log.some((l) => l.startsWith('navigate'))).toBe(false);
    expect(r.log).toContain('discardCanvas');
  });

  it('a host that throws on post after start ends the run as a lost context, without throwing', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    // The next post (the reveal, after uncover) hits a dead host.
    const host = await r.deps.host.ready('mid', 1);
    host.post = () => {
      throw new Error('worker gone');
    };
    r.emit({ type: 'cover' });
    r.emit({ type: 'uncover' });
    await flush();
    await vi.advanceTimersByTimeAsync(300);
    expect(await p).toMatchObject({ fallback: null, end: 'context-lost' });
  });
});

describe('eversion runner: commit point, queued input, teardown (review fixes)', () => {
  function gatedPlaceholder() {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    return {
      release,
      placeholder: async () => {
        await gate;
        return bitmap();
      },
    };
  }

  it('onCommit fires once, at the point of no return, and never on a fallback', async () => {
    const onCommit = vi.fn();
    const r = rig();
    const p = r.runner.run(NODE, GLOBE, 'release', { onCommit });
    await flush();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(r.posted.map((m) => m.type)).toContain('start');
    r.emit(DONE);
    await p;

    const fallback = vi.fn();
    const f = rig({ awaitBefore: async () => null });
    await f.runner.run(NODE, GLOBE, 'release', { onCommit: fallback });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('input while still priming is queued and becomes a fast-forward right after start', async () => {
    const g = gatedPlaceholder();
    const r = rig({ placeholder: g.placeholder });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.input();
    r.input();
    expect(r.posted.some((m) => m.type === 'fast-forward')).toBe(false);
    g.release();
    await flush();
    const types = r.posted.map((m) => m.type);
    expect(types.filter((t) => t === 'fast-forward')).toHaveLength(1);
    expect(types.indexOf('fast-forward')).toBeGreaterThan(types.indexOf('start'));
    r.emit(DONE);
    await p;
  });

  it('input during a run that falls back is forgotten (no listener left behind)', async () => {
    const r = rig({ awaitBefore: async () => null });
    await r.runner.run(NODE, GLOBE);
    r.input();
    expect(r.posted).toEqual([]);
  });

  it('a non-fatal prime failure aborts the half-primed host and keeps the canvas', async () => {
    const r = rig({
      placeholder: async () => {
        throw new Error('2d');
      },
    });
    const out = await r.runner.run(NODE, GLOBE);
    expect(out.fallback).toBe('host-error');
    expect(r.posted.map((m) => m.type)).toContain('abort');
    expect(r.log).not.toContain('discardCanvas');
  });

  it('a fatal prime failure discards the canvas instead', async () => {
    const g = gatedPlaceholder();
    const r = rig({ placeholder: g.placeholder });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit({ type: 'error', fatal: true, message: 'gl' } as FromWorker);
    g.release();
    expect((await p).fallback).toBe('host-error');
    expect(r.log).toContain('discardCanvas');
  });

  it('an AFTER bitmap whose upload throws is closed, and the run ends as a lost context', async () => {
    const after = bitmap();
    const r = rig({}, async () => ({
      bitmap: after,
      width: 1,
      height: 1,
      scale: 1,
      durationMs: 1,
    }));
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    const host = await r.deps.host.ready('mid', 1);
    host.post = (m) => {
      if (m.type === 'texture' && m.slot === 'after') throw new Error('worker gone');
    };
    r.routerIdle.resolve();
    await flush();
    await vi.advanceTimersByTimeAsync(300);
    expect(after.close).toHaveBeenCalled();
    expect(await p).toMatchObject({ fallback: null, end: 'context-lost' });
  });

  it('dispose mid-run aborts and leaves no cover class, settle attribute or overlay', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit({ type: 'cover' });
    r.runner.dispose();
    expect(await p).toMatchObject({ fallback: null, end: 'abort' });
    expect(r.posted.map((m) => m.type)).toContain('abort');
    expect(r.log.lastIndexOf('cover:off')).toBeGreaterThan(r.log.lastIndexOf('cover:on'));
    expect(r.log).toContain('overlay:unmount');
    expect(r.log).toContain('settle:off');
    expect(r.runner.state().coverActive).toBe(false);
  });

  it('dispose while priming falls back and starts nothing', async () => {
    const g = gatedPlaceholder();
    const r = rig({ placeholder: g.placeholder });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.runner.dispose();
    g.release();
    expect((await p).fallback).toBe('host-error');
    expect(r.posted.map((m) => m.type)).not.toContain('start');
    expect(r.log.some((l) => l.startsWith('navigate'))).toBe(false);
  });

  it('a runner that has been disposed falls back at once', async () => {
    const r = rig();
    r.runner.dispose();
    expect((await r.runner.run(NODE, GLOBE)).fallback).toBe('host-error');
  });
});

describe('eversion runner: watchdog, pageshow, traversal while priming (Fix E1)', () => {
  it('a run that never reaches done is force-ended with a fade at MAX_RUN_MS and cleared on teardown', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit({ type: 'cover' });
    await vi.advanceTimersByTimeAsync(MAX_RUN_MS - 1);
    expect(r.runner.state().phase).toBe('running');
    await vi.advanceTimersByTimeAsync(1);
    // Cover off first, the overlay fades, and only then is it removed - no cut.
    expect(r.log.lastIndexOf('cover:off')).toBeGreaterThan(r.log.lastIndexOf('cover:on'));
    expect(r.log).toContain('overlay:fade');
    expect(r.log).not.toContain('overlay:unmount');
    await vi.advanceTimersByTimeAsync(250);
    expect(await p).toMatchObject({ fallback: null, end: 'abort' });
    expect(r.log).toContain('overlay:unmount');
    expect(r.posted.map((m) => m.type)).toContain('abort');
    expect(r.log).toContain('discardCanvas');
  });

  it('stage messages are progress: a slow but advancing run is not cut', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(MAX_RUN_MS - 1000);
      r.emit({ type: 'stage', stage: 'evert', t: 0 } as FromWorker);
    }
    expect(r.runner.state().phase).toBe('running');
    expect(r.log).not.toContain('overlay:fade');
    r.emit(DONE);
    await p;
  });

  it('a finished run leaves no watchdog behind', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit(DONE);
    await p;
    const before = r.log.length;
    await vi.advanceTimersByTimeAsync(MAX_RUN_MS * 2);
    // Nothing happened after the run ended: no fade, no second teardown, no abort.
    expect(r.log.slice(before)).not.toContain('overlay:fade');
    expect(r.log.slice(before)).not.toContain('overlay:unmount');
    expect(r.posted.map((m) => m.type)).not.toContain('abort');
  });

  it('a host whose post() is dead cannot leave the run committed forever', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    const host = await r.deps.host.ready('mid', 1);
    host.post = () => {}; // a disposed host: silently ignores everything, never says done
    await vi.advanceTimersByTimeAsync(MAX_RUN_MS + 300);
    expect(await p).toMatchObject({ end: 'abort' });
    expect(r.runner.state().phase).toBe('done');
  });

  it('restoreFromCache (bfcache pageshow) ends a run in flight with a fade', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.runner.restoreFromCache();
    expect(r.log).toContain('overlay:fade');
    await vi.advanceTimersByTimeAsync(250);
    expect(await p).toMatchObject({ end: 'abort' });
    // And it is a no-op with nothing running.
    r.runner.restoreFromCache();
  });

  it('back/forward while priming cancels cleanly: no start, no navigate, reason traversal', async () => {
    const before = bitmap();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const r = rig({
      awaitBefore: async () => {
        await gate;
        return before;
      },
    });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.traverse();
    release();
    const out = await p;
    expect(out.fallback).toBe('traversal');
    expect(before.close).toHaveBeenCalled();
    expect(r.posted.map((m) => m.type)).not.toContain('start');
    expect(r.log.some((l) => l.startsWith('navigate'))).toBe(false);
    expect(r.runner.state().phase).toBe('idle');
  });

  it('a traversal during the placeholder wait aborts the half-primed host', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const r = rig({
      placeholder: async () => {
        await gate;
        return bitmap();
      },
    });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.traverse();
    release();
    expect((await p).fallback).toBe('traversal');
    expect(r.posted.map((m) => m.type)).toContain('abort');
    expect(r.posted.map((m) => m.type)).not.toContain('start');
    expect(r.log.some((l) => l.startsWith('navigate'))).toBe(false);
  });

  it('ends after the reveal: the overlay stays until done, and nothing follows done', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.emit({ type: 'cover' });
    r.emit({ type: 'uncover' });
    await flush();
    expect(r.posted.filter((m) => m.type === 'reveal')).toHaveLength(1);
    r.emit({ type: 'stage', stage: 'reveal', t: 0 });
    expect(r.log).not.toContain('overlay:unmount');
    expect(r.runner.state().phase).toBe('revealing');
    r.emit(DONE);
    await p;
  });
});
