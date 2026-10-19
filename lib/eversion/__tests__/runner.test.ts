// @vitest-environment node
/**
 * The run orchestration's SEQUENCE, against scripted ports (tasks T31; spec §3.2,
 * §6.3, §9.2; the destination-first order amended 2026-10-19). The real ports
 * (host, DOM, router) are exercised by `testing/e2e/eversion-controller.mjs`; this
 * file proves the order of events, which a browser test can only sample.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AFTER_CAPTURE_TIMEOUT_MS,
  BEFORE_WAIT_MS,
  DESTINATION_SETTLE_HARD_MS,
  DESTINATION_SETTLE_SOFT_MS,
  MAX_RUN_MS,
  UPLOAD_SETTLE_FRAMES,
} from '../constants';
import { EversionRunner, HOST_READY_TIMEOUT_MS, OVERLAY_MOUNT_TIMEOUT_MS } from '../runner';
import type { RunnerDeps } from '../runner';
import type { SettleReport, SettleRequest } from '../settle';
import type {
  CaptureApi,
  EversionHost,
  EversionNode,
  EversionOutcome,
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
      log.push(
        message.type === 'texture' ? `post:texture:${message.slot}` : `post:${message.type}`,
      );
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
        (async () => {
          log.push('capture');
          return { bitmap: bitmap(), width: 1, height: 1, scale: 1, durationMs: 1 };
        }),
    ),
  };
  const deps: RunnerDeps = {
    host: {
      ready: async () => host,
      discardCanvas: () => log.push('discardCanvas'),
    },
    overlay: {
      mount: async () => void log.push('overlay:mount'),
      hold: () => void log.push('overlay:hold'),
      raiseHold: () => void log.push('overlay:raise-hold'),
      releaseHold: () => void log.push('overlay:release-hold'),
      fade: () => void log.push('overlay:fade'),
      unmount: () => void log.push('overlay:unmount'),
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
  for (let i = 0; i < 100; i++) await Promise.resolve();
};

/**
 * Run to the point of no return: the destination is idle, settled and captured, and `start` is posted (or the run
 * has ended without it). Resolves with the run's own promise, wrapped so it is not awaited here.
 */
async function toStart(
  r: Rig,
  ...args: Parameters<EversionRunner['run']> | []
): Promise<{ run: Promise<EversionOutcome> }> {
  const run = args.length
    ? r.runner.run(...(args as Parameters<EversionRunner['run']>))
    : r.runner.run(NODE, GLOBE, 'release');
  await flush();
  r.routerIdle.resolve();
  await flush();
  return { run };
}

const DONE: FromWorker = { type: 'done', frames: 10, dropped: 1, p95: 17 };
const hasStart = (r: Rig) => r.posted.some((m) => m.type === 'start');
const navigated = (r: Rig) => r.log.some((l) => l.startsWith('navigate'));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('eversion runner: the fallback paths (today runs; nothing navigated)', () => {
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
    expect(navigated(r)).toBe(false);
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
    expect(navigated(r)).toBe(false);
  });

  it('overlay that never attaches: host-error', async () => {
    const r = rig({
      overlay: {
        mount: () => new Promise(() => {}),
        hold() {},
        raiseHold() {},
        releaseHold() {},
        fade() {},
        unmount() {},
      },
    });
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

  it('a prime that cannot be posted: host-error, the picture taken down, no navigate', async () => {
    const r = rig();
    const host = await r.deps.host.ready('mid', 1);
    const post = host.post.bind(host);
    host.post = (m) => {
      if (m.type === 'prime') throw new Error('worker gone');
      post(m);
    };
    const out = await r.runner.run(NODE, GLOBE);
    expect(out.fallback).toBe('host-error');
    expect(navigated(r)).toBe(false);
    expect(r.log).toContain('overlay:unmount');
    // The host is fine otherwise: told to stop, its canvas and programs kept.
    expect(r.posted.map((m) => m.type)).toContain('abort');
    expect(r.log).not.toContain('discardCanvas');
    expect(r.runner.state().phase).toBe('idle');
  });

  it('a fatal render-side error before the navigation falls back and discards the canvas', async () => {
    const r = rig();
    // The frames that put the picture on screen: the render side reports its loss in the meantime.
    r.deps.page.nextFrame = async () => {
      r.emit({ type: 'error', fatal: true, message: 'gl' } as FromWorker);
    };
    const out = await r.runner.run(NODE, GLOBE);
    expect(out.fallback).toBe('host-error');
    expect(r.log).toContain('discardCanvas');
    expect(navigated(r)).toBe(false);
  });

  it('a second run while one is in flight falls back (the caller navigates as today)', async () => {
    const r = rig();
    void r.runner.run(NODE, GLOBE);
    await flush();
    expect((await r.runner.run(NODE, GLOBE)).fallback).toBe('busy');
  });
});

describe('eversion runner: the destination is rendered before the animation (amended 2026-10-19)', () => {
  it('picture, prime and BEFORE; then cover and navigate; settle and capture AFTER; upload it; then start', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    void p;
    const order = r.log.filter((l) =>
      /^(overlay:hold|post|cover|navigate|router-idle|gate$|settle|capture|mark:start)/.test(l),
    );
    expect(order).toEqual([
      'overlay:hold',
      'post:prime',
      'post:texture:before',
      'cover:on',
      'navigate:/games',
      'router-idle',
      'gate',
      'settle:on',
      'capture',
      'settle:off',
      'post:texture:after',
      'mark:start',
      'post:start',
    ]);
    // Both real pages and nothing else: no placeholder is ever sent.
    expect(r.posted.filter((m) => m.type === 'texture').map((m) => m.slot)).toEqual([
      'before',
      'after',
    ]);
    expect(r.runner.state()).toMatchObject({ beforeReady: true, afterReady: true });
  });

  it('the picture is on screen (two frames) before the page under it may change', async () => {
    const r = rig();
    await toStart(r);
    const held = r.log.indexOf('overlay:hold');
    const nav = r.log.indexOf('navigate:/games');
    expect(r.log.slice(held, nav).filter((l) => l === 'raf').length).toBeGreaterThanOrEqual(2);
    // And the shell is hidden under it first.
    expect(r.log.indexOf('cover:on')).toBeLessThan(nav);
    expect(r.log.indexOf('cover:on')).toBeGreaterThan(held);
  });

  it('lifts the picture over the canvas before start, never before the destination is captured', async () => {
    const r = rig();
    r.settle.hold();
    void r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    // While the destination renders the picture stays under the floating UI.
    expect(r.log).not.toContain('overlay:raise-hold');
    r.settle.release();
    await flush();
    const raised = r.log.indexOf('overlay:raise-hold');
    expect(raised).toBeGreaterThan(r.log.indexOf('post:texture:after'));
    // At least a frame between the raise and the start, so the canvas cannot draw over the picture.
    expect(
      r.log.slice(raised, r.log.indexOf('post:start')).filter((l) => l === 'raf').length,
    ).toBeGreaterThanOrEqual(1);
    expect(r.log.filter((l) => l === 'overlay:raise-hold')).toHaveLength(1);
  });

  it('waits UPLOAD_SETTLE_FRAMES after handing over AFTER, so the first frame uploads nothing', async () => {
    const r = rig();
    await toStart(r);
    const uploaded = r.log.indexOf('post:texture:after');
    const start = r.log.indexOf('post:start');
    expect(r.log.slice(uploaded, start).filter((l) => l === 'raf')).toHaveLength(
      UPLOAD_SETTLE_FRAMES,
    );
  });

  it('nothing is navigated, settled, captured or uploaded once the animation runs', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    const from = r.log.indexOf('post:start');
    r.emit({ type: 'cover' });
    r.emit({ type: 'stage', stage: 'evert', t: 1 });
    r.emit({ type: 'uncover' });
    await flush();
    r.emit(DONE);
    await p;
    const after = r.log.slice(from);
    expect(after.some((l) => /^(navigate|gate|settle:on|capture|post:texture)/.test(l))).toBe(
      false,
    );
    // And the document is no longer watched while it runs.
    expect(r.log.indexOf('watch:dispose')).toBeLessThan(from);
  });

  it('does not start while the destination is still loading', async () => {
    const r = rig();
    r.settle.hold();
    void r.runner.run(NODE, GLOBE);
    await flush();
    expect(navigated(r)).toBe(true);
    expect(hasStart(r)).toBe(false);
    r.routerIdle.resolve();
    await flush();
    // Router idle, gate still waiting (skeletons on screen, a query in flight): nothing captured, nothing started.
    expect(r.log).toContain('gate');
    expect(r.capture.captureViewport).not.toHaveBeenCalled();
    expect(hasStart(r)).toBe(false);
    // The content lands; only then is the page frozen into a texture, and the effect starts.
    r.settle.release();
    await flush();
    expect(r.capture.captureViewport).toHaveBeenCalledTimes(1);
    expect(hasStart(r)).toBe(true);
  });

  it('starts from the globe as it is at start when the caller can say (the hub kept turning)', async () => {
    const now: GlobeStartState = { ...GLOBE, yaw: 42, yawVel: 3 };
    const r = rig();
    await toStart(r, NODE, GLOBE, 'release', { globe: () => now });
    expect(r.posted.find((m) => m.type === 'prime')).toMatchObject({ globe: GLOBE });
    expect(r.posted.find((m) => m.type === 'start')).toMatchObject({ globe: now });

    const plain = rig();
    await toStart(plain);
    expect(plain.posted.find((m) => m.type === 'start')).not.toHaveProperty('globe');
  });

  it('a window resized while the destination rendered is sent before start', async () => {
    let v: Viewport = { w: 800, h: 600, dpr: 1 };
    const r = rig();
    r.deps.page.viewport = () => v;
    r.settle.hold();
    void r.runner.run(NODE, GLOBE);
    await flush();
    v = { w: 600, h: 800, dpr: 1 };
    r.routerIdle.resolve();
    await flush();
    r.settle.release();
    await flush();
    const types = r.posted.map((m) => m.type);
    expect(types.indexOf('resize')).toBeGreaterThan(-1);
    expect(types.indexOf('resize')).toBeLessThan(types.indexOf('start'));
    expect(r.posted.find((m) => m.type === 'resize')).toEqual({ type: 'resize', viewport: v });
  });

  it('cover class: on from the navigation until uncover, once; the cover message does not toggle it', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    expect(r.log.filter((l) => l.startsWith('cover:'))).toEqual(['cover:on']);
    r.emit({ type: 'cover' });
    expect(r.runner.state().coverActive).toBe(true);
    expect(r.log.filter((l) => l.startsWith('cover:'))).toEqual(['cover:on']);

    r.emit({ type: 'uncover' });
    await flush();
    const offAt = r.log.indexOf('cover:off');
    const revealAt = r.log.indexOf('post:reveal');
    expect(offAt).toBeGreaterThan(r.log.indexOf('post:start'));
    // Off BEFORE reveal, with two rAFs between (spec §6.6).
    expect(revealAt).toBeGreaterThan(offAt);
    expect(r.log.slice(offAt, revealAt).filter((l) => l === 'raf').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(r.runner.state().coverActive).toBe(false);

    r.emit(DONE);
    expect(await p).toEqual({
      fallback: null,
      end: 'done',
      stats: { frames: 10, dropped: 1, p95: 17 },
    });
    expect(r.log.filter((l) => l === 'cover:on')).toHaveLength(1);
  });

  it('the frozen picture fades onto the first frame (the cover message), once', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    expect(r.log).not.toContain('overlay:release-hold');
    r.emit({ type: 'cover' });
    r.emit({ type: 'cover' });
    r.emit({ type: 'uncover' });
    await flush();
    expect(r.log.filter((l) => l === 'overlay:release-hold')).toHaveLength(1);
    expect(r.log.indexOf('overlay:release-hold')).toBeGreaterThan(r.log.indexOf('mark:cover'));
    r.emit(DONE);
    await p;
  });

  it('a run whose first frame is never reported still lets go of the picture at uncover', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    r.emit({ type: 'uncover' });
    await flush();
    expect(r.log.indexOf('overlay:release-hold')).toBeLessThan(r.log.indexOf('post:reveal'));
    r.emit(DONE);
    await p;
  });

  it('the live page is sharp from the cover, and released only after the run has ended', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    // Live goes on with (and just before) the cover class, before the navigation: the page is invisible then.
    expect(r.log.indexOf('live:on')).toBeGreaterThan(-1);
    expect(r.log.indexOf('live:on')).toBeLessThan(r.log.indexOf('cover:on'));
    expect(r.log.indexOf('live:on')).toBeLessThan(r.log.indexOf('navigate:/games'));
    r.emit({ type: 'cover' });
    r.emit({ type: 'uncover' });
    await flush();
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
    await toStart(r);
    r.emit({ type: 'cover' });
    r.emit({ type: 'uncover' });
    r.emit({ type: 'uncover' });
    await flush();
    expect(r.posted.filter((m) => m.type === 'reveal')).toHaveLength(1);
  });

  it('done unmounts the overlay, leaves nothing on the document, and resolves', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    r.emit({ type: 'cover' });
    r.emit(DONE);
    await p;
    expect(r.log).toContain('overlay:unmount');
    expect(r.log.filter((l) => l.startsWith('mark:')).at(-1)).toBe('mark:done');
    expect(r.runner.state()).toMatchObject({ phase: 'done', coverActive: false });
    // The cover class does not outlive the run even if uncover never came.
    expect(r.log.lastIndexOf('cover:off')).toBeGreaterThan(r.log.lastIndexOf('cover:on'));
  });

  it('emits the stage marks in order, the gate opening on a ready AFTER', async () => {
    const details: { name: string; detail: unknown }[] = [];
    const r = rig({
      mark: (name, detail) => void details.push({ name, detail }),
    });
    const p = (await toStart(r)).run;
    r.emit({ type: 'cover' });
    r.emit({ type: 'stage', stage: 'evert', t: 1 });
    r.emit({ type: 'stage', stage: 'gate-open', t: 2 });
    r.emit({ type: 'stage', stage: 'unwrap', t: 3 });
    r.emit({ type: 'uncover' });
    await flush();
    r.emit(DONE);
    await p;
    expect(details.map((d) => d.name)).toEqual([
      'start',
      'cover',
      'evert',
      'gateOpen',
      'unwrap',
      'reveal',
      'done',
    ]);
    expect(details.find((d) => d.name === 'gateOpen')?.detail).toEqual({ reason: 'after-ready' });
  });
});

describe('eversion runner: capturing the destination', () => {
  it('waits for the router, then the readiness gate, captures with the settle attribute', async () => {
    const r = rig();
    void r.runner.run(NODE, GLOBE);
    await flush();
    expect(r.capture.captureViewport).not.toHaveBeenCalled(); // router not idle yet
    expect(r.log).not.toContain('gate');
    r.routerIdle.resolve();
    await flush();
    expect(r.log.indexOf('gate')).toBeGreaterThan(r.log.indexOf('router-idle'));
    const iOn = r.log.indexOf('settle:on');
    expect(r.log.indexOf('gate-done:settled')).toBeLessThan(iOn);
    expect(r.log.indexOf('settle:off')).toBeGreaterThan(iOn);
    expect(r.capture.captureViewport).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'after',
        scaleCap: 1.25,
        timeoutMs: AFTER_CAPTURE_TIMEOUT_MS,
      }),
    );
  });

  it('bounds the gate from the navigation: every condition until soft, activity only until hard', async () => {
    let t = 1000;
    const r = rig({ now: () => t });
    r.settle.hold();
    void r.runner.run(NODE, GLOBE);
    await flush();
    t = 1100;
    r.routerIdle.resolve();
    await flush();
    const req = r.settle.requests[0]!;
    expect(req.soft()).toBe(1000 + DESTINATION_SETTLE_SOFT_MS);
    expect(req.hard()).toBe(1000 + DESTINATION_SETTLE_HARD_MS);
    expect(DESTINATION_SETTLE_HARD_MS).toBeGreaterThan(DESTINATION_SETTLE_SOFT_MS);
    // Bounded: the hub sits open while this runs.
    expect(DESTINATION_SETTLE_HARD_MS).toBeLessThanOrEqual(5000);
  });

  it('a press while waiting hurries the gate; back/forward cancels it', async () => {
    const r = rig();
    r.settle.hold();
    void r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    const req = r.settle.requests[0]!;
    expect(req.hurried()).toBe(false);
    expect(req.cancelled()).toBe(false);
    r.input();
    expect(req.hurried()).toBe(true);
    r.traverse();
    expect(req.cancelled()).toBe(true);
  });

  it('a page that cannot be watched still gets its two frames and a capture', async () => {
    const r = rig();
    r.deps.page.watchSettle = () => {
      throw new Error('no document');
    };
    await toStart(r);
    expect(r.log).not.toContain('gate');
    const afterIdle = r.log.slice(r.log.indexOf('router-idle'), r.log.indexOf('capture'));
    expect(afterIdle.filter((l) => l === 'raf').length).toBeGreaterThanOrEqual(2);
    expect(hasStart(r)).toBe(true);
  });

  it('a router that never settles is waited on to the hard bound, then the page is taken as it is', async () => {
    const r = rig();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    await vi.advanceTimersByTimeAsync(DESTINATION_SETTLE_HARD_MS - 100);
    expect(r.capture.captureViewport).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(r.capture.captureViewport).toHaveBeenCalledTimes(1);
    expect(hasStart(r)).toBe(true);
    r.emit(DONE);
    await p;
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
    await toStart(r);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.settle).toMatchObject({ reason: 'rested', waitedMs: 1234 });
    expect(hasStart(r)).toBe(true);
  });

  it('opens its own capture session when the hub has none, and disposes it with the run', async () => {
    const dispose = vi.fn();
    const own = {
      captureViewport: vi.fn(async () => ({
        bitmap: bitmap(),
        width: 1,
        height: 1,
        scale: 1,
        durationMs: 1,
      })),
      createSession: vi.fn(),
      dispose,
    };
    const r = rig({ capture: () => null, openCapture: async () => own as unknown as CaptureApi });
    const p = (await toStart(r)).run;
    expect(own.captureViewport).toHaveBeenCalled();
    r.emit(DONE);
    await p;
    expect(dispose).toHaveBeenCalled();
  });
});

describe('eversion runner: a destination that cannot be captured ends the run unanimated', () => {
  /** The run navigated, so it is never a fallback (the caller must not navigate again). */
  function expectAbandoned(r: Rig, out: { fallback: unknown; end?: unknown }) {
    expect(out).toEqual({ fallback: null, end: 'abort' });
    expect(navigated(r)).toBe(true);
    expect(hasStart(r)).toBe(false);
    expect(r.posted.map((m) => m.type)).toContain('abort');
    expect(r.log.lastIndexOf('cover:off')).toBeGreaterThan(r.log.lastIndexOf('cover:on'));
    expect(r.log.lastIndexOf('live:off')).toBeGreaterThan(r.log.lastIndexOf('live:on'));
    expect(r.log).toContain('overlay:unmount');
    expect(r.runner.state()).toMatchObject({ phase: 'idle', coverActive: false });
  }

  it('a throwing capture', async () => {
    const r = rig({}, async () => {
      throw new Error('tainted');
    });
    const out = await (await toStart(r)).run;
    expectAbandoned(r, out);
    // The attribute is not left behind.
    expect(r.log.lastIndexOf('settle:off')).toBeGreaterThan(r.log.lastIndexOf('settle:on'));
  });

  it('a capture that never returns times out at AFTER_CAPTURE_TIMEOUT_MS', async () => {
    const r = rig({}, () => new Promise(() => {}));
    const p = (await toStart(r)).run;
    await vi.advanceTimersByTimeAsync(AFTER_CAPTURE_TIMEOUT_MS - 100);
    expect(r.log).not.toContain('overlay:unmount');
    await vi.advanceTimersByTimeAsync(200);
    expectAbandoned(r, await p);
  });

  it('an AFTER texture that cannot be posted is closed', async () => {
    const after = bitmap();
    const r = rig({}, async () => ({
      bitmap: after,
      width: 1,
      height: 1,
      scale: 1,
      durationMs: 1,
    }));
    const host = await r.deps.host.ready('mid', 1);
    const post = host.post.bind(host);
    host.post = (m) => {
      if (m.type === 'texture' && m.slot === 'after') throw new Error('worker gone');
      post(m);
    };
    const out = await (await toStart(r)).run;
    expect(after.close).toHaveBeenCalled();
    expectAbandoned(r, out);
  });

  it('a render side lost while the destination renders: ends, and its canvas is discarded', async () => {
    const r = rig();
    r.settle.hold();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    r.emit({ type: 'context-lost' });
    r.settle.release({ reason: 'cancelled', settled: false });
    const out = await p;
    expect(out).toEqual({ fallback: null, end: 'abort' });
    expect(r.log).toContain('discardCanvas');
    expect(hasStart(r)).toBe(false);
    expect(r.capture.captureViewport).not.toHaveBeenCalled();
  });

  it('a run can follow an abandoned one', async () => {
    const r = rig({}, async () => {
      throw new Error('tainted');
    });
    await (
      await toStart(r)
    ).run;
    r.capture.captureViewport.mockImplementation(async () => ({
      bitmap: bitmap(),
      width: 1,
      height: 1,
      scale: 1,
      durationMs: 1,
    }));
    const q = r.runner.run(NODE, GLOBE);
    await flush();
    expect(hasStart(r)).toBe(true);
    r.emit(DONE);
    expect((await q).end).toBe('done');
  });
});

describe('eversion runner: input, abort and faults after start', () => {
  it('input sends one fast-forward, however many presses follow', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
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
    const details: { name: string; detail: unknown }[] = [];
    const r = rig({ mark: (name, detail) => void details.push({ name, detail }) });
    const p = (await toStart(r)).run;
    r.runner.abort();
    expect(r.posted.some((m) => m.type === 'abort')).toBe(true);
    r.emit({ type: 'stage', stage: 'gate-open', t: 1 });
    r.emit(DONE);
    await p;
    expect(details.find((d) => d.name === 'gateOpen')?.detail).toEqual({ reason: 'abort' });
  });

  it('context loss after start: cover off, overlay fades 200 ms, then unmounts; end is context-lost', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    r.emit({ type: 'cover' });
    r.emit({ type: 'context-lost' });
    expect(r.log).toContain('overlay:fade');
    expect(r.log).toContain('discardCanvas');
    expect(r.runner.state().coverActive).toBe(false);
    expect(r.log).not.toContain('overlay:unmount');
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
    const p = (await toStart(r)).run;
    r.emit({ type: 'error', message: 'soft', fatal: false });
    expect(r.runner.state().phase).toBe('running');
    r.emit({ type: 'error', message: 'hard', fatal: true });
    await vi.advanceTimersByTimeAsync(210);
    expect((await p).end).toBe('context-lost');
  });

  it('a run can follow a finished one', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
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
  it('back/forward during the run aborts once', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    r.traverse();
    r.traverse();
    expect(r.posted.filter((m) => m.type === 'abort')).toHaveLength(1);
    r.emit({ type: 'stage', stage: 'gate-open', t: 1 });
    r.emit(DONE);
    expect(await p).toMatchObject({ fallback: null, end: 'done' });
    r.traverse(); // listener removed with the run
    expect(r.posted.filter((m) => m.type === 'abort')).toHaveLength(1);
  });

  it('back/forward while the destination renders: traversal, nothing started, its capture dropped', async () => {
    const late = bitmap();
    let finishCapture!: (v: unknown) => void;
    const r = rig({}, () => new Promise((res) => (finishCapture = res)));
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    r.traverse();
    // Resolved at once, without waiting for the capture in flight.
    expect(await p).toEqual({ fallback: 'traversal' });
    expect(r.log).toContain('overlay:unmount');
    expect(r.log.lastIndexOf('cover:off')).toBeGreaterThan(r.log.lastIndexOf('cover:on'));
    finishCapture({ bitmap: late, width: 1, height: 1, scale: 1, durationMs: 1 });
    await flush();
    expect(late.close).toHaveBeenCalled();
    expect(r.posted.some((m) => m.type === 'texture' && m.slot === 'after')).toBe(false);
    expect(hasStart(r)).toBe(false);
  });

  it('forwards a resize to the render side as a resize message, and stops with the run', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
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
    const p = (await toStart(r)).run;
    r.emit({ type: 'cover' });
    r.emit({ type: 'uncover' });
    await flush();
    r.input();
    expect(r.posted.some((m) => m.type === 'fast-forward')).toBe(false);
    r.emit(DONE);
    await p;
  });

  it('a host that throws on post after start ends the run as a lost context, without throwing', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
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
  it('onCommit fires once, with start, and never on a fallback or an unanimated run', async () => {
    const onCommit = vi.fn();
    const r = rig();
    r.settle.hold();
    const p = r.runner.run(NODE, GLOBE, 'release', { onCommit });
    await flush();
    r.routerIdle.resolve();
    await flush();
    // Navigated, still rendering the destination: the hub is left exactly as it is.
    expect(onCommit).not.toHaveBeenCalled();
    r.settle.release();
    await flush();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(r.posted.map((m) => m.type)).toContain('start');
    r.emit(DONE);
    await p;

    const fallback = vi.fn();
    const f = rig({ awaitBefore: async () => null });
    await f.runner.run(NODE, GLOBE, 'release', { onCommit: fallback });
    expect(fallback).not.toHaveBeenCalled();

    const abandoned = vi.fn();
    const a = rig({}, async () => {
      throw new Error('tainted');
    });
    await (
      await toStart(a, NODE, GLOBE, 'release', { onCommit: abandoned })
    ).run;
    expect(abandoned).not.toHaveBeenCalled();
  });

  it('input while still priming is queued and becomes a fast-forward right after start', async () => {
    const r = rig();
    void r.runner.run(NODE, GLOBE);
    await flush();
    r.input();
    r.input();
    expect(r.posted.some((m) => m.type === 'fast-forward')).toBe(false);
    r.routerIdle.resolve();
    await flush();
    const types = r.posted.map((m) => m.type);
    expect(types.filter((t) => t === 'fast-forward')).toHaveLength(1);
    expect(types.indexOf('fast-forward')).toBeGreaterThan(types.indexOf('start'));
  });

  it('input during a run that falls back is forgotten (no listener left behind)', async () => {
    const r = rig({ awaitBefore: async () => null });
    await r.runner.run(NODE, GLOBE);
    r.input();
    expect(r.posted).toEqual([]);
  });

  it('dispose mid-run aborts and leaves no cover class, settle attribute or overlay', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    r.emit({ type: 'cover' });
    r.runner.dispose();
    expect(await p).toMatchObject({ fallback: null, end: 'abort' });
    expect(r.posted.map((m) => m.type)).toContain('abort');
    expect(r.log.lastIndexOf('cover:off')).toBeGreaterThan(r.log.lastIndexOf('cover:on'));
    expect(r.log).toContain('overlay:unmount');
    expect(r.log.filter((l) => l.startsWith('settle:')).at(-1)).toBe('settle:off');
    expect(r.runner.state().coverActive).toBe(false);
  });

  it('dispose before the navigation falls back and starts nothing', async () => {
    let release!: (b: ImageBitmap) => void;
    const r = rig({ awaitBefore: () => new Promise((res) => (release = res)) });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.runner.dispose();
    release(bitmap());
    expect((await p).fallback).toBe('host-error');
    expect(hasStart(r)).toBe(false);
    expect(navigated(r)).toBe(false);
  });

  it('dispose while the destination renders ends the run at once, leaving nothing behind', async () => {
    const r = rig();
    r.settle.hold();
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    r.runner.dispose();
    expect(await p).toEqual({ fallback: null, end: 'abort' });
    expect(hasStart(r)).toBe(false);
    expect(r.log).toContain('overlay:unmount');
    expect(r.log.lastIndexOf('cover:off')).toBeGreaterThan(r.log.lastIndexOf('cover:on'));
    expect(r.runner.state().coverActive).toBe(false);
  });

  it('a run that is disposed while opening its own capture session never sets the settle attribute', async () => {
    let openIt!: (c: CaptureApi) => void;
    const own = { captureViewport: vi.fn(), createSession: vi.fn(), dispose: vi.fn() };
    const r = rig({
      capture: () => null,
      openCapture: () => new Promise<CaptureApi>((res) => (openIt = res)),
    });
    const p = r.runner.run(NODE, GLOBE);
    await flush();
    r.routerIdle.resolve();
    await flush();
    r.runner.dispose();
    await p;
    openIt(own as unknown as CaptureApi);
    await flush();
    expect(r.log).not.toContain('settle:on');
    expect(own.captureViewport).not.toHaveBeenCalled();
    // Opened after the run had ended: disposed, not orphaned.
    expect(own.dispose).toHaveBeenCalled();
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
    const p = (await toStart(r)).run;
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
    const p = (await toStart(r)).run;
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
    const p = (await toStart(r)).run;
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
    const p = (await toStart(r)).run;
    const host = await r.deps.host.ready('mid', 1);
    host.post = () => {}; // a disposed host: silently ignores everything, never says done
    await vi.advanceTimersByTimeAsync(MAX_RUN_MS + 300);
    expect(await p).toMatchObject({ end: 'abort' });
    expect(r.runner.state().phase).toBe('done');
  });

  it('restoreFromCache (bfcache pageshow) ends a run in flight with a fade', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
    r.runner.restoreFromCache();
    expect(r.log).toContain('overlay:fade');
    await vi.advanceTimersByTimeAsync(250);
    expect(await p).toMatchObject({ end: 'abort' });
    // And it is a no-op with nothing running.
    r.runner.restoreFromCache();
  });

  it('back/forward while waiting for BEFORE cancels cleanly: no start, no navigate, reason traversal', async () => {
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
    expect(hasStart(r)).toBe(false);
    expect(navigated(r)).toBe(false);
    expect(r.runner.state().phase).toBe('idle');
  });

  it('back/forward while the picture goes up aborts the half-primed host, before any navigation', async () => {
    const r = rig();
    let traversed = false;
    r.deps.page.nextFrame = async () => {
      if (!traversed) {
        traversed = true;
        r.traverse();
      }
    };
    const out = await r.runner.run(NODE, GLOBE);
    expect(out.fallback).toBe('traversal');
    expect(r.posted.map((m) => m.type)).toContain('abort');
    expect(hasStart(r)).toBe(false);
    expect(navigated(r)).toBe(false);
  });

  it('ends after the reveal: the overlay stays until done, and nothing follows done', async () => {
    const r = rig();
    const p = (await toStart(r)).run;
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
