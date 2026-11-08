// @vitest-environment node
/**
 * The globe cursor's worker-backed GPU surface (lib/globe-cursor/remote-gl.ts): it only starts where a worker can own
 * an OffscreenCanvas, resolves null (so the cursor keeps its existing page-side surface) when the worker cannot make a
 * WebGL 2 context or never answers, posts at most one frame per render and drops stale frames while the worker is
 * behind, goes `ok: false` on a lost context or a crash, and releases everything on dispose.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlFrame } from '../gl';
import {
  CURSOR_READY_TIMEOUT_MS,
  CURSOR_FRAMES_IN_FLIGHT,
  startRemoteGlobeGl,
  type RemoteGlDeps,
} from '../remote-gl';

class FakeWorker {
  sent: Array<{ msg: { type: string; seq?: number; f?: GlFrame }; transfer: unknown[] }> = [];
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(msg: { type: string }, transfer: unknown[] = []) {
    this.sent.push({ msg, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
  frames() {
    return this.sent.filter((s) => s.msg.type === 'frame');
  }
}

class FakeCanvas {
  attrs: Record<string, string> = {};
  removed = false;
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  remove() {
    this.removed = true;
  }
  transferControlToOffscreen() {
    return { offscreen: true };
  }
}

const frame = (px: number): GlFrame =>
  ({
    px,
    detail: 'medium',
    stage: new Float64Array(8),
    model: new Float64Array(9),
    deform: new Float64Array(9),
    deformIT: new Float64Array(9),
    scale: 1,
    wobble: 0,
    time: 0,
    pointPx: 2,
    palette: 'duo',
    style: 'glass',
    outside: [0, 0, 0],
    inside: [0, 0, 0],
    glowRgb: [0, 0, 0],
    hueShift: 0,
    vibrance: 1,
    shine: 1,
    glow: 0,
  }) as GlFrame;

function rig(over: Partial<RemoteGlDeps> = {}) {
  const workers: FakeWorker[] = [];
  const canvases: FakeCanvas[] = [];
  const deps: RemoteGlDeps = {
    supported: true,
    software: false,
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
    ...over,
  };
  return { deps, workers, canvases };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RemoteGlobeGl', () => {
  it('resolves null without starting anything where a worker cannot own a canvas', async () => {
    const r = rig({ supported: false });
    expect(await startRemoteGlobeGl(r.deps)).toBeNull();
    expect(r.workers).toHaveLength(0);
  });

  it('transfers the canvas once and resolves a surface on ready', async () => {
    const { deps, workers, canvases } = rig();
    const pending = startRemoteGlobeGl(deps);
    const w = workers[0]!;
    expect(w.sent[0]!.msg.type).toBe('init');
    expect(w.sent[0]!.transfer).toHaveLength(1);
    w.reply({ type: 'ready', ok: true });
    const g = await pending;
    expect(g?.ok).toBe(true);
    expect(g?.directOnly).toBe(true);
    expect(g?.canvas).toBe(canvases[0]);
  });

  it('resolves null and terminates when the worker has no WebGL 2, crashes or never answers', async () => {
    const a = rig();
    const pa = startRemoteGlobeGl(a.deps);
    a.workers[0]!.reply({ type: 'ready', ok: false });
    expect(await pa).toBeNull();
    expect(a.workers[0]!.terminated).toBe(true);

    const b = rig();
    const pb = startRemoteGlobeGl(b.deps);
    b.workers[0]!.onerror?.({});
    expect(await pb).toBeNull();

    const c = rig();
    const pc = startRemoteGlobeGl(c.deps);
    vi.advanceTimersByTime(CURSOR_READY_TIMEOUT_MS + 1);
    expect(await pc).toBeNull();
    expect(c.workers[0]!.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('posts one frame per render and keeps only the newest while the worker is behind', async () => {
    const { deps, workers } = rig();
    const pending = startRemoteGlobeGl(deps);
    workers[0]!.reply({ type: 'ready', ok: true });
    const g = (await pending)!;
    for (let i = 0; i < CURSOR_FRAMES_IN_FLIGHT + 4; i++) g.render(frame(10 + i));
    const w = workers[0]!;
    expect(w.frames()).toHaveLength(CURSOR_FRAMES_IN_FLIGHT);
    w.reply({ type: 'ack', seq: 1 });
    expect(w.frames()).toHaveLength(CURSOR_FRAMES_IN_FLIGHT + 1);
    expect(w.frames().at(-1)!.msg.f!.px).toBe(10 + CURSOR_FRAMES_IN_FLIGHT + 3);
  });

  it('goes not-ok on a lost context or a crash, so the engine falls back to its CPU path', async () => {
    const { deps, workers } = rig();
    const pending = startRemoteGlobeGl(deps);
    workers[0]!.reply({ type: 'ready', ok: true });
    const g = (await pending)!;
    workers[0]!.reply({ type: 'lost' });
    expect(g.ok).toBe(false);
    expect(workers[0]!.terminated).toBe(true);
    g.render(frame(5));
    expect(workers[0]!.frames()).toHaveLength(0);
  });

  it('dispose terminates the worker, removes its handlers and the canvas', async () => {
    const { deps, workers, canvases } = rig();
    const pending = startRemoteGlobeGl(deps);
    workers[0]!.reply({ type: 'ready', ok: true });
    const g = (await pending)!;
    g.dispose();
    expect(workers[0]!.terminated).toBe(true);
    expect(workers[0]!.onmessage).toBeNull();
    expect(workers[0]!.onerror).toBeNull();
    expect(canvases[0]!.removed).toBe(true);
    expect(g.ok).toBe(false);
  });
});
