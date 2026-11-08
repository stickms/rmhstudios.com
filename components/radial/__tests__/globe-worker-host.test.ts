// @vitest-environment node
/**
 * The globe's main-thread host (components/radial/globe-worker-host.ts), against a fake Worker and fake canvases:
 * the fallback decision for each failure mode (no OffscreenCanvas, no worker WebGL 2, a program that will not build,
 * a worker crash, repeated context loss, a worker that never answers), the restart with fresh canvases and replayed
 * state, back-pressure, the page snapshot hand-off (cloned, transferred, closed), and teardown (worker terminated,
 * canvases released, handlers removed, bitmaps closed, timers cleared).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GLOBE_PROTOCOL_VERSION,
  MAX_CONTEXT_LOSSES,
  MAX_FRAMES_IN_FLIGHT,
  type CoatClock,
  type GlobeIn,
  type GlobeOut,
  type GlobeThemeCss,
} from '../globe-protocol';
import {
  READY_TIMEOUT_MS,
  HOST_LINGER_MS,
  acquireGlobeHost,
  createGlobeHost,
  resetGlobeHostForTests,
  type GlobeHostDeps,
} from '../globe-worker-host';

class FakeBitmap {
  closed = false;
  constructor(readonly tag: string) {}
  close() {
    this.closed = true;
  }
}

class FakeOffscreen {}

class FakeCanvas {
  className = '';
  attrs: Record<string, string> = {};
  removed = false;
  transferred = 0;
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  remove() {
    this.removed = true;
  }
  transferControlToOffscreen() {
    this.transferred++;
    if (this.transferred > 1) throw new Error('InvalidStateError');
    return new FakeOffscreen();
  }
}

class FakeWorker {
  sent: Array<{ msg: GlobeIn; transfer: unknown[] }> = [];
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  postMessage(msg: GlobeIn, transfer: unknown[] = []) {
    if (this.terminated) throw new Error('terminated');
    this.sent.push({ msg, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  reply(m: GlobeOut) {
    this.onmessage?.({ data: m });
  }
  types() {
    return this.sent.map((s) => s.msg.type);
  }
  last<T extends GlobeIn['type']>(type: T) {
    return [...this.sent].reverse().find((s) => s.msg.type === type)?.msg as
      | Extract<GlobeIn, { type: T }>
      | undefined;
  }
}

const THEME: GlobeThemeCss = {
  ink: 'rgb(0, 0, 0)',
  bg: 'rgb(255, 255, 255)',
  accent: 'rgb(40, 150, 255)',
  haze: 'rgb(230, 230, 240)',
  edgeR: 'rgba(255, 80, 100, 0.16)',
  edgeG: 'rgba(60, 200, 140, 0.08)',
  edgeB: 'rgba(70, 120, 255, 0.16)',
  fresnel: 'rgba(255, 255, 255, 0.55)',
  hazePane: 0.14,
  quiet: 0.35,
  bevelPx: 6,
  disperseRPx: -1.5,
  disperseBPx: 1.5,
  plasmaPeakLight: 0.1,
  plasmaPeakDark: 0.14,
};

const CLOCK: CoatClock = {
  hz: 60,
  idleHz: 30,
  amp: 1,
  active: true,
  held: false,
  engagedUntil: 0,
  plasma: 0,
  plasmaEaseMs: 180,
  frozen: false,
};

function rig(over: Partial<GlobeHostDeps> = {}) {
  const workers: FakeWorker[] = [];
  const canvases: FakeCanvas[] = [];
  const bitmaps: FakeBitmap[] = [];
  const logs: string[] = [];
  let resolveClone: Array<() => void> = [];
  const deps: GlobeHostDeps = {
    env: { perfLite: false, hasWorker: true, hasOffscreenCanvas: true, canTransfer: true },
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w as unknown as Worker;
    },
    createCanvas: () => {
      const c = new FakeCanvas();
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
    cloneBitmap: (src) =>
      new Promise<ImageBitmap>((resolve) => {
        const b = new FakeBitmap(`clone-of-${(src as unknown as FakeBitmap).tag}`);
        bitmaps.push(b);
        resolveClone.push(() => resolve(b as unknown as ImageBitmap));
      }),
    timeOrigin: 0,
    log: (m) => logs.push(m),
    ...over,
  };
  const flushClones = async () => {
    const r = resolveClone;
    resolveClone = [];
    for (const f of r) f();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { deps, workers, canvases, bitmaps, logs, flushClones };
}

const PROJ = { persp: 3.1, lens: 0.42 };
const ready = (w: FakeWorker) => w.reply({ type: 'ready', version: GLOBE_PROTOCOL_VERSION, ok: true });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  resetGlobeHostForTests();
  vi.useRealTimers();
});

describe('start-up and the fallback decision', () => {
  it('transfers one canvas to one worker with a versioned init', () => {
    const { deps, workers, canvases } = rig();
    const host = createGlobeHost(deps);
    expect(host.status).toBe('starting');
    expect(workers).toHaveLength(1);
    expect(canvases).toHaveLength(1);
    const init = workers[0]!.last('init')!;
    expect(init.version).toBe(GLOBE_PROTOCOL_VERSION);
    expect(init.canvas).toBeInstanceOf(FakeOffscreen);
    expect(workers[0]!.sent[0]!.transfer).toEqual([init.canvas]);
    expect(canvases[0]!.className).toBe('radial-globe__jelly');
    expect(canvases[0]!.attrs['aria-hidden']).toBe('true');
    ready(workers[0]!);
    expect(host.status).toBe('ready');
    expect(host.coatCanvas).toBe(canvases[0]);
  });

  it.each([
    [{ perfLite: true }, 'perf-lite'],
    [{ hasOffscreenCanvas: false }, 'no-offscreen'],
    [{ canTransfer: false }, 'no-offscreen'],
    [{ hasWorker: false }, 'no-worker'],
    [{ forced: true }, 'forced'],
  ] as const)('starts no worker and shows the CSS globe for %o', (over, reason) => {
    const r = rig();
    const host = createGlobeHost({ ...r.deps, env: { ...r.deps.env, ...over } });
    expect(host.status).toBe('css');
    expect(host.reason).toBe(reason);
    expect(r.workers).toHaveLength(0);
    expect(host.coatCanvas).toBeNull();
    expect(r.logs.join('\n')).toMatch(reason);
  });

  it('falls back for good when the worker cannot make a WebGL 2 context', () => {
    const { deps, workers } = rig();
    const host = createGlobeHost(deps);
    workers[0]!.reply({ type: 'ready', version: GLOBE_PROTOCOL_VERSION, ok: false, reason: 'no-webgl2' });
    expect(host.status).toBe('css');
    expect(host.reason).toBe('no-webgl2');
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(1);
  });

  it('falls back when the program will not build, or the worker speaks another version', () => {
    const a = rig();
    const h1 = createGlobeHost(a.deps);
    a.workers[0]!.reply({ type: 'ready', version: GLOBE_PROTOCOL_VERSION, ok: false, reason: 'program' });
    expect(h1.status).toBe('css');
    const b = rig();
    const h2 = createGlobeHost(b.deps);
    b.workers[0]!.reply({ type: 'ready', version: GLOBE_PROTOCOL_VERSION + 1, ok: true });
    expect(h2.status).toBe('css');
    expect(h2.reason).toBe('version');
  });

  it('falls back when the worker cannot even be constructed', () => {
    const r = rig({
      createWorker: () => {
        throw new Error('CSP');
      },
    });
    const host = createGlobeHost(r.deps);
    expect(host.status).toBe('css');
    expect(host.reason).toBe('worker-start');
  });

  it('falls back when the canvas cannot be transferred', () => {
    const r = rig({
      createCanvas: () => {
        const c = new FakeCanvas();
        c.transferControlToOffscreen = () => {
          throw new Error('no');
        };
        return c as unknown as HTMLCanvasElement;
      },
    });
    const host = createGlobeHost(r.deps);
    expect(host.status).toBe('css');
    expect(r.workers.every((w) => w.terminated)).toBe(true);
  });

  it('falls back when the worker never answers', () => {
    const { deps, workers } = rig();
    const host = createGlobeHost(deps);
    vi.advanceTimersByTime(READY_TIMEOUT_MS + 1);
    expect(host.status).toBe('css');
    expect(workers[0]!.terminated).toBe(true);
  });

  it('restarts a crashed worker once with a fresh canvas and the last state, then falls back', () => {
    const { deps, workers, canvases } = rig();
    const host = createGlobeHost(deps);
    ready(workers[0]!);
    host.size(320, 2);
    host.theme(THEME);
    host.clock(CLOCK);
    host.place(10, 20, 160, 0, 0);
    workers[0]!.onerror?.({});
    expect(workers[0]!.terminated).toBe(true);
    expect(canvases[0]!.removed).toBe(true);
    expect(workers).toHaveLength(2);
    expect(host.status).toBe('starting');
    const replay = workers[1]!.types();
    expect(replay).toEqual(expect.arrayContaining(['init', 'size', 'theme', 'clock', 'place']));
    ready(workers[1]!);
    expect(host.coatCanvas).toBe(canvases[1]);
    workers[1]!.onerror?.({});
    expect(host.status).toBe('css');
    expect(host.reason).toBe('worker-error');
    expect(workers).toHaveLength(2);
  });

  it('survives MAX_CONTEXT_LOSSES context losses, then falls back for the page', () => {
    const { deps, workers } = rig();
    const host = createGlobeHost(deps);
    for (let i = 0; i < MAX_CONTEXT_LOSSES; i++) {
      ready(workers[i]!);
      workers[i]!.reply({ type: 'lost' });
      expect(host.status).toBe('starting');
    }
    ready(workers[MAX_CONTEXT_LOSSES]!);
    workers[MAX_CONTEXT_LOSSES]!.reply({ type: 'lost' });
    expect(host.status).toBe('css');
    expect(host.reason).toBe('context-lost');
    expect(workers).toHaveLength(MAX_CONTEXT_LOSSES + 1);
    expect(workers.every((w) => w.terminated)).toBe(true);
  });

  it('tells subscribers about every status change and stops after unsubscribe', () => {
    const { deps, workers } = rig();
    const host = createGlobeHost(deps);
    const seen: string[] = [];
    const off = host.subscribe(() => seen.push(host.status + (host.drawn ? '+drawn' : '')));
    ready(workers[0]!);
    workers[0]!.reply({ type: 'drawn' });
    off();
    workers[0]!.reply({ type: 'lost' });
    expect(seen).toEqual(['ready', 'ready+drawn']);
  });
});

describe('messages: small, deduplicated, back-pressured', () => {
  it('holds state until ready, then sends it once', () => {
    const { deps, workers } = rig();
    const host = createGlobeHost(deps);
    host.size(320, 2);
    host.size(320, 2);
    host.theme(THEME);
    host.clock(CLOCK);
    host.clock({ ...CLOCK });
    const w = workers[0]!;
    expect(w.types()).toEqual(['init', 'size', 'theme', 'clock']);
    ready(w);
    host.clock({ ...CLOCK, engagedUntil: 100 });
    expect(w.types().filter((t) => t === 'clock')).toHaveLength(1);
    host.clock({ ...CLOCK, plasma: 0.35 });
    expect(w.types().filter((t) => t === 'clock')).toHaveLength(2);
  });

  it('flushes at most one frame per call and holds back when the worker is behind', () => {
    const { deps, workers } = rig();
    const host = createGlobeHost(deps);
    const w = workers[0]!;
    ready(w);
    const s = { ripples: new Array(12).fill(0), gx: 0, gy: 0, pinch: 0, fieldVersion: 0 };
    for (let i = 0; i < MAX_FRAMES_IN_FLIGHT + 3; i++) {
      host.surface({ ...s, pinch: i });
      host.surface({ ...s, pinch: i + 0.5 });
      host.flush();
    }
    const frames = w.sent.filter((x) => x.msg.type === 'frame');
    expect(frames).toHaveLength(MAX_FRAMES_IN_FLIGHT);
    w.reply({ type: 'ack', seq: 1 });
    const after = w.sent.filter((x) => x.msg.type === 'frame');
    expect(after).toHaveLength(MAX_FRAMES_IN_FLIGHT + 1);
    expect((after.at(-1)!.msg as Extract<GlobeIn, { type: 'frame' }>).surface?.pinch).toBe(
      MAX_FRAMES_IN_FLIGHT + 2.5,
    );
  });

  it('copies and transfers the dough field only when its version changes', () => {
    const { deps, workers } = rig();
    const host = createGlobeHost(deps);
    const w = workers[0]!;
    ready(w);
    const field = new Float32Array(8);
    const s = { ripples: new Array(12).fill(0), gx: 0, gy: 0, pinch: 0 };
    host.surface({ ...s, field, fieldVersion: 3 });
    host.flush();
    const f1 = w.last('frame')!;
    expect(f1.surface?.field).not.toBe(field);
    expect(f1.surface?.field?.length).toBe(8);
    expect(w.sent.at(-1)!.transfer).toEqual([f1.surface!.field!.buffer]);
    w.reply({ type: 'ack', seq: 1 });
    host.surface({ ...s, field, fieldVersion: 3 });
    host.flush();
    expect(w.last('frame')!.surface?.field).toBeUndefined();
  });

  it('drops frames while starting rather than queueing them for the worker', () => {
    const { deps, workers } = rig();
    const host = createGlobeHost(deps);
    host.surface({ ripples: [], gx: 0, gy: 0, pinch: 0, fieldVersion: 0 });
    host.flush();
    expect(workers[0]!.types()).not.toContain('frame');
  });
});

describe('the page snapshot', () => {
  const scene = (v: number) => ({
    bitmap: new FakeBitmap(`s${v}`) as unknown as ImageBitmap,
    width: 1440,
    height: 900,
    scrollX: 0,
    scrollY: 0,
    version: v,
  });

  it('clones, transfers and closes each new picture once', async () => {
    const { deps, workers, bitmaps, flushClones } = rig();
    const host = createGlobeHost(deps);
    const w = workers[0]!;
    ready(w);
    const s = scene(1);
    host.scene(s);
    host.scene(s);
    await flushClones();
    const msg = w.last('scene')!;
    expect(bitmaps).toHaveLength(1);
    expect(msg.bitmap).toBe(bitmaps[0]);
    expect(w.sent.find((x) => x.msg.type === 'scene')!.transfer).toEqual([bitmaps[0]]);
    expect(bitmaps[0]!.closed).toBe(true);
    expect((s.bitmap as unknown as FakeBitmap).closed, 'the store keeps its own picture').toBe(false);
    expect(msg.width).toBe(1440);
  });

  it('closes a clone that lands after the host is gone, and sends scene-off for null', async () => {
    const { deps, workers, bitmaps, flushClones } = rig();
    const host = createGlobeHost(deps);
    ready(workers[0]!);
    host.scene(null);
    expect(workers[0]!.types(), 'nothing to switch off yet').not.toContain('scene-off');
    host.scene(scene(1));
    await flushClones();
    host.scene(null);
    expect(workers[0]!.types()).toContain('scene-off');
    host.scene(scene(2));
    host.dispose();
    await flushClones();
    expect(bitmaps[1]!.closed).toBe(true);
    expect(workers[0]!.types().filter((t) => t === 'scene')).toHaveLength(1);
  });
});

describe('the self-eversion skin', () => {
  it('transfers a second canvas on demand and reports when it is ready', () => {
    const { deps, workers, canvases } = rig();
    const host = createGlobeHost(deps);
    ready(workers[0]!);
    const skin = host.skinCanvas(PROJ);
    expect(skin).toBe(canvases[1]);
    expect(canvases[1]!.className).toBe('radial-globe__skin');
    expect(host.skinCanvas(PROJ)).toBe(skin);
    expect(workers[0]!.last('skin-init')).toBeDefined();
    expect(host.skinReady).toBe(false);
    workers[0]!.reply({ type: 'skin', ok: true });
    expect(host.skinReady).toBe(true);
    host.skinFrame({ e: 0.5, m: [1, 0, 0, 0, 1, 0, 0, 0, 1], fit: 0.9 });
    host.flush();
    expect(workers[0]!.last('frame')!.skin?.e).toBe(0.5);
  });

  it('a skin the worker cannot build is never asked for again', () => {
    const { deps, workers } = rig();
    const host = createGlobeHost(deps);
    ready(workers[0]!);
    host.skinCanvas(PROJ);
    workers[0]!.reply({ type: 'skin', ok: false });
    expect(host.skinFailed).toBe(true);
    expect(host.skinCanvas(PROJ)).toBeNull();
  });

  it('has no skin in the CSS fallback', () => {
    const r = rig();
    const host = createGlobeHost({ ...r.deps, env: { ...r.deps.env, perfLite: true } });
    expect(host.skinCanvas(PROJ)).toBeNull();
  });
});

describe('teardown', () => {
  it('terminates the worker, releases both canvases, removes handlers and clears timers', () => {
    const { deps, workers, canvases } = rig();
    const host = createGlobeHost(deps);
    ready(workers[0]!);
    host.skinCanvas(PROJ);
    const seen: string[] = [];
    host.subscribe(() => seen.push(host.status));
    host.dispose();
    const w = workers[0]!;
    expect(w.terminated).toBe(true);
    expect(w.onmessage).toBeNull();
    expect(w.onerror).toBeNull();
    expect(w.onmessageerror).toBeNull();
    expect(canvases.every((c) => c.removed)).toBe(true);
    expect(host.coatCanvas).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    host.size(1, 1);
    host.flush();
    expect(seen).toEqual([]);
  });

  it('a dispose before ready clears the ready timeout', () => {
    const { deps } = rig();
    const host = createGlobeHost(deps);
    expect(vi.getTimerCount()).toBe(1);
    host.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('one host per page: shared by every mount, terminated after the last release lingers out', () => {
    const { deps, workers } = rig();
    const a = acquireGlobeHost(deps);
    const b = acquireGlobeHost(deps);
    expect(a.host).toBe(b.host);
    expect(workers).toHaveLength(1);
    ready(workers[0]!);
    a.release();
    b.release();
    expect(workers[0]!.terminated, 'kept for a quick reopen').toBe(false);
    const c = acquireGlobeHost(deps);
    expect(c.host).toBe(a.host);
    c.release();
    vi.advanceTimersByTime(HOST_LINGER_MS + 1);
    expect(workers[0]!.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const d = acquireGlobeHost(deps);
    expect(d.host).not.toBe(a.host);
    d.release();
  });

  it('a page that fell back stays fallen back for every later mount', () => {
    const { deps, workers } = rig();
    const a = acquireGlobeHost(deps);
    workers[0]!.reply({ type: 'ready', version: GLOBE_PROTOCOL_VERSION, ok: false, reason: 'no-webgl2' });
    a.release();
    vi.advanceTimersByTime(HOST_LINGER_MS + 1);
    const b = acquireGlobeHost(deps);
    expect(b.host.status).toBe('css');
    expect(workers).toHaveLength(1);
    b.release();
  });

  it('a double release is harmless', () => {
    const { deps } = rig();
    const a = acquireGlobeHost(deps);
    a.release();
    a.release();
    const b = acquireGlobeHost(deps);
    expect(b.host).toBe(a.host);
    b.release();
  });
});
