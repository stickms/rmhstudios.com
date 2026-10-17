/**
 * The render-side core (T25; spec §3.3, §7.7) against a fake renderer, a
 * scripted timeline and a scheduler the test turns by hand. The real renderer
 * and the real worker are covered in `testing/e2e/eversion-host.mjs`; this
 * file pins the state machine.
 */

import { describe, expect, it } from 'vitest';
import { createEversionCore } from '../gl/core';
import type { CoreDeps } from '../gl/core';
import { ScriptedTimeline } from '../gl/__fixtures__/scripted-timeline';
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
  orb: { cx: 10, cy: 10, radius: 8 },
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

function rig(timelineOptions?: ConstructorParameters<typeof ScriptedTimeline>[0]) {
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
    createTimeline: () => {
      const t = new ScriptedTimeline(timelineOptions);
      timelines.push(t);
      return t;
    },
    bakeLut: () => new Float32Array(2),
    orientation: () => ({ thetaAlign: 0, mAfter: new Float64Array(9) }),
    solidBitmap: () => Promise.resolve({ close() {} } as ImageBitmap),
  };
  const core = createEversionCore(
    {
      mode: 'worker',
      emit: (m) => out.push(m),
      scheduler: {
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
    if (r.stages().includes('unwrap-done') && !r.timelines[0]!.calls.includes('reveal')) {
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
      'unwrap-done',
      'reveal',
      'pop',
      'done',
    ]);
    const done = r.out.at(-1);
    expect(done).toMatchObject({ type: 'done' });
    expect((done as { frames: number }).frames).toBe(r.renderer.draws.length);
    expect(r.out.filter((m) => m.type === 'unwrap-done')).toHaveLength(1);
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
