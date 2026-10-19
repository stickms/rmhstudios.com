/**
 * The render-side core (T25; spec §3.3, §7.7) against a fake renderer, a
 * scripted timeline and a scheduler the test turns by hand. The real renderer
 * and the real worker are covered in `testing/e2e/eversion-host.mjs`; this
 * file pins the state machine.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEversionCore, HIDDEN_SETTLE_GRACE_MS } from '../gl/core';
import type { CoreDeps } from '../gl/core';
import { ScriptedTimeline } from '../gl/__fixtures__/scripted-timeline';
import { Timeline } from '../timeline';
import type {
  FromWorker,
  GlCounters,
  RendererApi,
  RendererPrime,
  TimelineSnapshot,
  ToWorker,
} from '../types';

const viewport = { w: 320, h: 200, dpr: 1 };
const colour = [0, 0, 0, 1] as const;
const colours = {
  bg: colour,
  veil: colour,
  accent: colour,
  cageMinor: colour,
  cageParallel: colour,
  cageMajor: colour,
  cageRipple: colour,
  cageWidth: 1,
};
const prime: ToWorker = {
  type: 'prime',
  projection: 'mercator',
  viewport,
  globe: { yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0, centre: [160, 100], radius: 80 },
  colours,
  lut: new Float32Array(2),
};

const zeroCounters: GlCounters = {
  buffers: { created: 0, deleted: 0 },
  textures: { created: 0, deleted: 0 },
  programs: { created: 0, deleted: 0 },
  vertexArrays: { created: 0, deleted: 0 },
  live: 0,
};

class FakeRenderer implements RendererApi {
  tier = 'low' as const;
  log: string[] = [];
  draws: TimelineSnapshot[] = [];
  dprScales: number[] = [];
  lostCallback: (() => void) | undefined;
  prime(p: RendererPrime) {
    this.log.push(`prime ${p.projection}`);
  }
  setTexture(slot: string, bitmap: ImageBitmap | null) {
    this.log.push(`texture ${slot} ${bitmap ? 'set' : 'free'}`);
  }
  draw(s: Readonly<TimelineSnapshot>) {
    this.draws.push({ ...s });
    this.log.push('draw');
  }
  resize() {
    this.log.push('resize');
  }
  setDprScale(scale: number) {
    this.dprScales.push(scale);
  }
  release() {
    this.log.push('release');
  }
  dispose() {
    this.log.push('dispose');
  }
  debugEvaluate() {
    return new Float32Array(3);
  }
  counters() {
    return zeroCounters;
  }
}

function rig(
  timelineOptions?: ConstructorParameters<typeof ScriptedTimeline>[0],
  envOptions: { available?: boolean; webgl2?: boolean; realTimeline?: boolean } = {},
) {
  const renderer = new FakeRenderer();
  const timelines: ScriptedTimeline[] = [];
  const out: FromWorker[] = [];
  let nextHandle = 1;
  const queue = new Map<number, (now: number) => void>();
  let requests = 0;
  let clock = 1000;
  const deps: CoreDeps = {
    createRenderer: (_canvas, options) => {
      renderer.lostCallback = options.onContextLost;
      return renderer;
    },
    createTimeline: (config) => {
      if (envOptions.realTimeline) return new Timeline(config);
      const t = new ScriptedTimeline(timelineOptions);
      timelines.push(t);
      return t;
    },
    bakeLut: () => new Float32Array(2),
    orientation: () => ({ thetaAlign: 0, mAfter: new Float64Array(9) }),
    solidBitmap: () => Promise.resolve({ close() {} } as ImageBitmap),
    probeWebgl2: () => envOptions.webgl2 ?? true,
  };
  const core = createEversionCore(
    {
      mode: 'worker',
      emit: (m) => out.push(m),
      scheduler: {
        available: envOptions.available,
        request(cb) {
          requests++;
          queue.set(nextHandle, cb);
          return nextHandle++;
        },
        cancel(h) {
          queue.delete(h);
        },
      },
      now: () => clock,
      timeOrigin: () => 100_000,
    },
    deps,
  );
  return {
    core,
    renderer,
    out,
    timelines,
    get pending() {
      return queue.size;
    },
    get requests() {
      return requests;
    },
    /** Run the one pending frame at `now` ms (also moves the injected clock). */
    frame(now: number) {
      clock = now;
      const [handle, cb] = [...queue][0] ?? [];
      if (handle === undefined || !cb) throw new Error('no frame pending');
      queue.delete(handle);
      cb(now);
    },
    send(m: ToWorker) {
      core.handle(m);
    },
    types: () => out.map((m) => m.type),
    stages: () => out.flatMap((m) => (m.type === 'stage' ? [m.stage] : [])),
  };
}

function boot(r: ReturnType<typeof rig>) {
  r.send({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'low', dprCap: 1 });
  r.send(prime);
}

/** Drive frames at 16 ms until the loop stops or `limit` frames pass. */
function runToEnd(r: ReturnType<typeof rig>, from = 1016, limit = 200) {
  let now = from;
  for (let i = 0; i < limit && r.pending > 0; i++, now += 16) {
    r.frame(now);
    if (r.stages().includes('uncover') && !r.timelines[0]!.calls.includes('reveal')) {
      r.send({ type: 'reveal' });
    }
  }
}

describe('createEversionCore', () => {
  it('replies ready to init, draws nothing and schedules nothing until start', () => {
    const r = rig();
    boot(r);
    expect(r.out).toEqual([{ type: 'ready', tier: 'low', host: 'worker' }]);
    expect(r.renderer.draws).toHaveLength(0);
    expect(r.requests).toBe(0);
    r.send({ type: 'resize', viewport });
    r.send({ type: 'fast-forward' });
    expect(r.requests).toBe(0);
  });

  it('a context lost BETWEEN runs is announced again at start, so the run ends instead of waiting for frames', () => {
    const r = rig();
    boot(r);
    // Lost while no run is listening (e.g. right after init): the first announcement has no run to end.
    r.renderer.lostCallback?.();
    expect(r.types()).toContain('context-lost');
    const before = r.out.length;
    r.send(prime);
    r.send({ type: 'start', t0: 5000 });
    expect(r.out.slice(before).map((m) => m.type)).toContain('context-lost');
    expect(r.requests).toBe(0);
  });

  it('emits every stage in order, then done with stats, and schedules nothing after', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 5000 });
    runToEnd(r);
    expect(r.stages()).toEqual([
      'wrap',
      'evert',
      'gate-open',
      'unwrap',
      'uncover',
      'reveal',
      'done',
    ]);
    const done = r.out.at(-1);
    expect(done).toMatchObject({ type: 'done' });
    expect((done as { frames: number }).frames).toBe(r.renderer.draws.length);
    expect(r.out.filter((m) => m.type === 'uncover')).toHaveLength(1);
    expect(r.pending).toBe(0);
    const requests = r.requests;
    r.send({ type: 'reveal' });
    r.send({ type: 'fast-forward' });
    expect(r.requests).toBe(requests);
    expect(r.renderer.log.at(-1)).toBe('release');
  });

  it('posts cover on the frame AFTER the first draw, before the second draw', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.frame(1016);
    expect(r.renderer.draws).toHaveLength(1);
    expect(r.types()).not.toContain('cover');
    r.frame(1032);
    const cover = r.types().indexOf('cover');
    expect(cover).toBeGreaterThan(-1);
    expect(r.renderer.draws).toHaveLength(2);
    // cover was emitted before the second frame's stage events and exactly once
    r.frame(1048);
    expect(r.types().filter((t) => t === 'cover')).toHaveLength(1);
  });

  it('converts need-after-by to the main clock from the start offset (worker mode)', () => {
    const r = rig();
    boot(r);
    // main thread says 5000 when the worker clock reads 1000: main = worker + 4000
    r.send({ type: 'start', t0: 5000 });
    const need = r.out.find((m) => m.type === 'need-after-by') as { deadline: number };
    expect(need.deadline).toBe(1000 + 2500 + 4000);
  });

  it('feeds the timeline a monotonic clock even if a frame precedes the start instant', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.frame(990); // earlier than env.now() at start (1000)
    expect(r.renderer.draws).toHaveLength(1);
    expect(r.renderer.draws[0]!.t).toBe(0);
  });

  it('forwards fast-forward, after-failed, abort, reveal and resize to the timeline while running', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.send({ type: 'fast-forward' });
    r.send({ type: 'after-failed' });
    r.send({ type: 'resize', viewport: { w: 100, h: 100, dpr: 1 } });
    r.send({ type: 'abort' });
    expect(r.timelines[0]!.calls.slice(1)).toEqual([
      'fast-forward',
      'after-failed',
      'resize',
      'abort',
    ]);
    expect(r.renderer.log).toContain('resize');
  });

  it('abort runs the loop out to done', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.frame(1016);
    r.send({ type: 'abort' });
    runToEnd(r, 1032);
    expect(r.types().at(-1)).toBe('done');
    expect(r.pending).toBe(0);
  });

  it('uploads textures, closes the bitmap, and tells the timeline when AFTER lands', () => {
    const r = rig();
    boot(r);
    let closed = 0;
    const bitmap = (): ImageBitmap => ({ close: () => closed++ }) as unknown as ImageBitmap;
    r.send({ type: 'texture', slot: 'before', bitmap: bitmap() });
    r.send({ type: 'texture', slot: 'after', bitmap: bitmap() }); // before start: remembered
    r.send({ type: 'start', t0: 0 });
    expect(r.timelines[0]!.calls).toContain('after-ready');
    r.send({ type: 'texture', slot: 'after', bitmap: bitmap() });
    expect(closed).toBe(3);
    expect(r.renderer.log.filter((l) => l.startsWith('texture'))).toHaveLength(3);
  });

  it('pauses while hidden and resumes without recording the gap as a frame', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.frame(1016);
    r.frame(1032);
    expect(r.pending).toBe(1);
    r.send({ type: 'visibility', hidden: true });
    expect(r.pending).toBe(0);
    const requests = r.requests;
    r.send({ type: 'visibility', hidden: true });
    expect(r.requests).toBe(requests);
    r.send({ type: 'visibility', hidden: false });
    expect(r.pending).toBe(1);
    r.frame(31000);
    runToEnd(r, 31016);
    const done = r.out.at(-1) as { type: string; dropped: number; p95: number };
    expect(done.type).toBe('done');
    // the 30 s gap was not an interval
    expect(done.p95).toBeLessThan(100);
  });

  it('does not start the loop while hidden, and starts it on show', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'visibility', hidden: true });
    r.send({ type: 'start', t0: 0 });
    expect(r.pending).toBe(0);
    r.send({ type: 'visibility', hidden: false });
    expect(r.pending).toBe(1);
  });

  it('stops on context loss, says so once, and ignores everything until a new init', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.frame(1016);
    r.renderer.lostCallback?.();
    r.renderer.lostCallback?.();
    expect(r.pending).toBe(0);
    expect(r.types().filter((t) => t === 'context-lost')).toHaveLength(1);
    r.send({ type: 'start', t0: 0 });
    expect(r.pending).toBe(0);
    r.send({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'low', dprCap: 1 });
    expect(r.types().at(-1)).toBe('ready');
  });

  it('turns a throwing renderer into a fatal error and stops', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.renderer.draw = () => {
      throw new Error('boom');
    };
    r.frame(1016);
    expect(r.out.at(-1)).toEqual({ type: 'error', message: 'boom', fatal: true });
    expect(r.pending).toBe(0);
  });

  it('bakes the LUT when prime carries none', () => {
    const r = rig();
    r.send({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'low', dprCap: 1 });
    r.send({ ...(prime as Extract<ToWorker, { type: 'prime' }>), lut: null });
    expect(r.renderer.log).toContain('prime mercator');
  });

  it('applies pause-at as an evert override on every drawn frame, and answers debug ops', async () => {
    const r = rig();
    boot(r);
    r.send({ type: 'debug', id: 1, command: { op: 'pause-at', e: 0.5 } });
    r.send({ type: 'start', t0: 0 });
    r.frame(1016);
    r.frame(1032);
    expect(r.renderer.draws.at(-1)!.evert).toBe(0.5);
    r.send({ type: 'debug', id: 2, command: { op: 'loop' } });
    r.send({ type: 'debug', id: 3, command: { op: 'counters' } });
    await Promise.resolve();
    await Promise.resolve();
    const results = r.out.filter((m) => m.type === 'debug-result') as Extract<
      FromWorker,
      { type: 'debug-result' }
    >[];
    expect(results.map((m) => [m.id, m.ok])).toEqual([
      [1, true],
      [2, true],
      [3, true],
    ]);
    expect(results[1]!.value).toMatchObject({ running: true, pending: 1, frames: 2 });
  });

  it('dispose cancels the pending frame and disposes the renderer', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    expect(r.pending).toBe(1);
    r.core.dispose();
    expect(r.pending).toBe(0);
    expect(r.renderer.log.at(-1)).toBe('dispose');
  });
});

describe('createEversionCore: scrub', () => {
  /** A core over the REAL timeline (the scripted one never reaches the reveal). */
  function realRig() {
    const r = rig();
    const renderer = r.renderer;
    const out: FromWorker[] = [];
    const core = createEversionCore(
      {
        mode: 'main',
        emit: (m) => out.push(m),
        scheduler: { request: () => 1, cancel: () => {} },
        now: () => 0,
      },
      {
        createRenderer: () => renderer,
        createTimeline: (config) => new Timeline(config),
        bakeLut: () => new Float32Array(2),
        orientation: () => ({ thetaAlign: 0, mAfter: new Float64Array(9) }),
        solidBitmap: () => Promise.resolve({ close() {} } as ImageBitmap),
      },
    );
    core.handle({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'low', dprCap: 1 });
    core.handle(prime);
    return { core, renderer, out };
  }

  async function scrubTo(t: number, afterAt: number | null) {
    const r = realRig();
    r.core.handle({ type: 'debug', id: 1, command: { op: 'scrub', t, afterAt } });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const result = r.out.find((m) => m.type === 'debug-result') as Extract<
      FromWorker,
      { type: 'debug-result' }
    >;
    return { result, drawn: r.renderer.draws.at(-1)! };
  }

  it('answers uncover with a reveal, so scrubbing past it reaches DONE', async () => {
    const mid = await scrubTo(5200, 600);
    expect(mid.result.ok).toBe(true);
    expect((mid.result.value as { stage: string }).stage).not.toBe('uncover');
    const end = await scrubTo(20_000, 600);
    expect(end.result.ok).toBe(true);
    expect((end.result.value as { stage: string }).stage).toBe('done');
  });

  it('scripts a fast-forward and a failed AFTER into the replay (the smoothness detector)', async () => {
    const run = async (t: number, extra: { ffAt?: number | null; failAt?: number | null }) => {
      const r = realRig();
      r.core.handle({
        type: 'debug',
        id: 1,
        command: { op: 'scrub', t, afterAt: extra.failAt != null ? null : 400, ...extra },
      });
      for (let i = 0; i < 5; i++) await Promise.resolve();
      const result = r.out.find((m) => m.type === 'debug-result') as Extract<
        FromWorker,
        { type: 'debug-result' }
      >;
      expect(result.ok).toBe(true);
      return (result.value as { stage: string }).stage;
    };
    // A plain run is still unwrapping at 3.5 s of a run fast-forwarded at 2 s that is done by 3.5 s.
    expect(await run(3200, {})).not.toBe('done');
    expect(await run(3200, { ffAt: 2000 })).toBe('done');
    // A failed AFTER lets the unwrap proceed without it: the run still ends.
    expect(await run(20_000, { failAt: 704 })).toBe('done');
  });

  it('applies inject-hard-cut to a scrubbed still, and only while it is set', async () => {
    const r = realRig();
    const draw = async (t: number) => {
      r.core.handle({ type: 'debug', id: 1, command: { op: 'scrub', t, afterAt: 400 } });
      for (let i = 0; i < 5; i++) await Promise.resolve();
      return r.renderer.draws.at(-1)!.radius;
    };
    const plain = await draw(2000);
    r.core.handle({ type: 'debug', id: 2, command: { op: 'inject-hard-cut', channel: 'radius' } });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(await draw(2000)).toBeCloseTo(plain * 0.7, 6);
    r.core.handle({ type: 'debug', id: 3, command: { op: 'inject-hard-cut', channel: null } });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(await draw(2000)).toBeCloseTo(plain, 6);
  });
});

/* ── Review fixes (render side) ───────────────────────────────────────────── */

describe('createEversionCore: robustness', () => {
  const bitmap = () => {
    const b = {
      closed: false,
      close() {
        this.closed = true;
      },
    };
    return b as unknown as ImageBitmap & { closed: boolean };
  };

  it('shares the clock through performance.timeOrigin, not the arrival time of start', () => {
    const r = rig();
    boot(r);
    // Main origin is 99 000 ms before the worker's 100 000: main = worker + 1000 whatever t0 says.
    r.send({ type: 'start', t0: 5000, origin: 99_000 });
    const need = r.out.find((m) => m.type === 'need-after-by') as { deadline: number };
    expect(need.deadline).toBe(1000 + 2500 + 1000);
  });

  it('answers a probe with the capabilities, without touching a renderer', () => {
    const ok = rig();
    ok.send({ type: 'probe' });
    expect(ok.out).toEqual([{ type: 'probe-result', ok: true }]);
    const noGl = rig(undefined, { webgl2: false });
    noGl.send({ type: 'probe' });
    expect(noGl.out[0]).toMatchObject({ type: 'probe-result', ok: false });
    const noRaf = rig(undefined, { available: false });
    noRaf.send({ type: 'probe' });
    expect(noRaf.out[0]).toMatchObject({ type: 'probe-result', ok: false });
  });

  it('a worker without a frame scheduler says so at init, before ready', () => {
    const r = rig(undefined, { available: false });
    r.send({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'low', dprCap: 1 });
    expect(r.types()).toEqual(['error']);
    expect(r.out[0]).toMatchObject({ fatal: true });
  });

  it('abort while the tab is hidden finishes synchronously, in order', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'visibility', hidden: true });
    r.send({ type: 'start', t0: 0 });
    expect(r.pending).toBe(0);
    r.send({ type: 'abort' });
    expect(r.stages()).toEqual(['reveal', 'done']);
    expect(r.types().at(-1)).toBe('done');
    expect(r.pending).toBe(0);
  });

  it('fast-forward while the tab is hidden jumps to completion through uncover, reveal, done', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'visibility', hidden: true });
    r.send({ type: 'start', t0: 0 });
    r.send({ type: 'fast-forward' });
    // The scripted timeline's fast-forward is a mark only; the hidden loop still runs it out.
    expect(r.stages()).toEqual([
      'wrap',
      'evert',
      'gate-open',
      'unwrap',
      'uncover',
      'reveal',
      'done',
    ]);
    expect(r.types().filter((t) => t === 'uncover')).toHaveLength(1);
    expect(r.types().at(-1)).toBe('done');
  });

  it('a new init forgets a stale hidden flag (e.g. after a lost context)', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'visibility', hidden: true });
    r.renderer.lostCallback?.();
    r.send({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'low', dprCap: 1 });
    r.send(prime);
    r.send({ type: 'start', t0: 0 });
    expect(r.pending).toBe(1);
  });

  it('closes a texture that arrives after the run is over, instead of keeping it resident', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    runToEnd(r);
    expect(r.types().at(-1)).toBe('done');
    const late = bitmap();
    r.send({ type: 'texture', slot: 'after', bitmap: late });
    expect(late.closed).toBe(true);
    expect(r.renderer.log.filter((l) => l === 'texture after set')).toHaveLength(0);
  });

  it('rebuilds the timeline at start when the viewport changed after prime', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'resize', viewport: { w: 640, h: 400, dpr: 1 } });
    expect(r.timelines).toHaveLength(1);
    r.send({ type: 'start', t0: 0 });
    expect(r.timelines).toHaveLength(2);
    expect(r.timelines[1]!.calls[0]).toMatch(/^start/);
  });

  it('passes the new viewport to Timeline.resize while running', () => {
    const r = rig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    const calls: unknown[][] = [];
    const tl = r.timelines[0]!;
    const original = tl.resize.bind(tl);
    (tl as unknown as { resize: (...a: unknown[]) => void }).resize = (...a: unknown[]) => {
      calls.push(a);
      original(a[0] as number);
    };
    r.send({ type: 'resize', viewport: { w: 640, h: 400, dpr: 1 } });
    expect(calls[0]).toHaveLength(2);
    expect(calls[0]![1]).toEqual({ w: 640, h: 400, dpr: 1 });
  });
});

/* ── The REAL Timeline: hidden settling, failure ──────────────────── */

describe('createEversionCore with the real Timeline', () => {
  const EXPECTED = ['wrap', 'evert', 'gate-open', 'unwrap', 'uncover', 'reveal', 'done'];
  const realRig = () => rig(undefined, { realTimeline: true });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The run's ending, in order: the stage messages from `uncover` on. */
  const endOrder = (r: ReturnType<typeof rig>) =>
    r.out.flatMap((m) =>
      m.type === 'stage' && (m.stage === 'uncover' || m.stage === 'reveal' || m.stage === 'done')
        ? [m.stage]
        : [],
    );

  it("keeps the governor's DPR step for the page's later runs, and a new init starts at full size again", () => {
    const r = realRig();
    r.send({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'low', dprCap: 2 });
    const vp2 = { ...viewport, dpr: 2 };
    const prime2 = { ...prime, viewport: vp2 } as ToWorker;
    const run = (from: number) => {
      r.send(prime2);
      r.send({ type: 'start', t0: from });
      let now = from;
      for (let i = 0; i < 1000 && r.pending > 0; i++) {
        now += 40;
        r.frame(now);
        if (
          r.stages().filter((x) => x === 'uncover').length >
          r.stages().filter((x) => x === 'reveal').length
        ) {
          r.send({ type: 'reveal' });
        }
      }
      return now;
    };
    // 25 fps throughout: the first run steps twice (2 -> 1.5 -> 1.125).
    let end = run(1000);
    expect(r.renderer.dprScales).toEqual([0.75, 0.5625]);
    // The next run starts there (no reset to 1 at prime, so no reallocation at release); still slow, it takes
    // the one step left above the DPR floor (1.125 -> 0.84) and no more: the floor bounds the page, not the run.
    end = run(end + 1000);
    expect(r.renderer.dprScales).toEqual([0.75, 0.5625, 0.421875]);
    end = run(end + 1000);
    expect(r.renderer.dprScales).toHaveLength(3);
    // A new renderer is full size again, and its governor steps from there.
    r.send({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'low', dprCap: 2 });
    run(end + 1000);
    expect(r.renderer.dprScales.slice(3)).toEqual([0.75, 0.5625]);
  });

  it('abort while hidden: uncover, reveal, done, synchronously, nothing drawn', () => {
    const r = realRig();
    boot(r);
    r.send({ type: 'visibility', hidden: true });
    r.send({ type: 'start', t0: 0 });
    r.send({ type: 'abort' });
    expect(r.stages()).toEqual(EXPECTED);
    expect(endOrder(r)).toEqual(['uncover', 'reveal', 'done']);
    expect(r.renderer.draws).toHaveLength(0);
    expect(r.pending).toBe(0);
    expect(r.types().filter((t) => t === 'done')).toHaveLength(1);
    // The late `reveal` from the main thread is a no-op.
    r.send({ type: 'reveal' });
    expect(r.types().filter((t) => t === 'done')).toHaveLength(1);
  });

  it('fast-forward while hidden settles the same way', () => {
    const r = realRig();
    boot(r);
    r.send({ type: 'visibility', hidden: true });
    r.send({ type: 'start', t0: 0 });
    r.send({ type: 'fast-forward' });
    expect(r.stages()).toEqual(EXPECTED);
    expect(endOrder(r)).toEqual(['uncover', 'reveal', 'done']);
    expect(r.renderer.draws).toHaveLength(0);
  });

  it('the tab hiding AFTER an abort or fast-forward is already in flight settles at once', () => {
    for (const hurry of ['abort', 'fast-forward'] as const) {
      const r = realRig();
      boot(r);
      r.send({ type: 'start', t0: 0 });
      r.frame(1016);
      r.frame(1032);
      r.send({ type: hurry });
      expect(r.types()).not.toContain('done');
      r.send({ type: 'visibility', hidden: true });
      expect(r.stages().at(-1)).toBe('done');
      expect(endOrder(r).slice(-3)).toEqual(['uncover', 'reveal', 'done']);
      expect(r.pending).toBe(0);
      expect(r.types().filter((t) => t === 'done')).toHaveLength(1);
    }
  });

  it('a run left hidden settles to completion after the grace, not on return', () => {
    vi.useFakeTimers();
    const r = realRig();
    boot(r);
    r.send({ type: 'visibility', hidden: true });
    r.send({ type: 'start', t0: 0 });
    vi.advanceTimersByTime(HIDDEN_SETTLE_GRACE_MS - 1);
    expect(r.types()).not.toContain('done');
    vi.advanceTimersByTime(1);
    expect(r.stages()).toEqual(EXPECTED);
    expect(endOrder(r)).toEqual(['uncover', 'reveal', 'done']);
    expect(r.renderer.draws).toHaveLength(0);
    // Back on screen: nothing replays.
    r.send({ type: 'visibility', hidden: false });
    expect(r.pending).toBe(0);
  });

  it('a tab that comes back inside the grace keeps its run', () => {
    vi.useFakeTimers();
    const r = realRig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.frame(1016);
    r.send({ type: 'visibility', hidden: true });
    vi.advanceTimersByTime(HIDDEN_SETTLE_GRACE_MS - 100);
    r.send({ type: 'visibility', hidden: false });
    vi.advanceTimersByTime(HIDDEN_SETTLE_GRACE_MS * 3);
    expect(r.types()).not.toContain('done');
    expect(r.pending).toBe(1);
  });

  it('a drawn run ends with UNWRAP: uncover, reveal, done in that order, the dissolve overlapping its tail, nothing after', () => {
    const r = realRig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.send({ type: 'abort' });
    let now = 1016;
    for (let i = 0; i < 1000 && r.pending > 0; i++, now += 16) {
      r.frame(now);
      if (r.stages().includes('uncover') && !r.stages().includes('reveal'))
        r.send({ type: 'reveal' });
    }
    expect(endOrder(r)).toEqual(['uncover', 'reveal', 'done']);
    expect(r.out.some((m) => (m as { type: string }).type === 'pop-fade')).toBe(false);
    const at = r.out.findIndex((m) => m.type === 'uncover');
    expect(at).toBeGreaterThan(0);
    // The dissolve starts while UNWRAP is still finishing (the page is not yet quite flat), and the two end
    // together: the frames that draw the dissolve have `unwrap` non-increasing down to exactly 0 at the last.
    const dissolving = r.renderer.draws.filter((d) => d.pageAlpha < 1);
    expect(dissolving.length).toBeGreaterThan(1);
    expect(dissolving[0]!.unwrap).toBeGreaterThan(0);
    for (let i = 1; i < dissolving.length; i++) {
      expect(dissolving[i]!.unwrap).toBeLessThanOrEqual(dissolving[i - 1]!.unwrap);
      expect(dissolving[i]!.pageAlpha).toBeLessThanOrEqual(dissolving[i - 1]!.pageAlpha);
    }
    const last = r.renderer.draws.at(-1)!;
    expect(last.unwrap).toBe(0);
    expect(last.pageAlpha).toBe(0);
    // The clear colour dissolves with the page, never before it.
    for (const d of dissolving) expect(d.bgAlpha).toBe(d.pageAlpha);
    // No event or frame follows `done`.
    expect(r.out.at(-1)).toMatchObject({ type: 'done' });
    expect(r.pending).toBe(0);
    expect(r.renderer.log.at(-1)).toBe('release');
  });

  it('a failing frame releases the page textures', () => {
    const r = realRig();
    boot(r);
    r.send({ type: 'start', t0: 0 });
    r.renderer.draw = () => {
      throw new Error('boom');
    };
    r.frame(1016);
    expect(r.out.at(-1)).toMatchObject({ type: 'error', fatal: true });
    expect(r.renderer.log).toContain('release');
  });
});
