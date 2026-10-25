/// <reference lib="webworker" />
/**
 * The haze worker: draws every ambient haze canvas off the main thread.
 *
 * The haze is the one part of the material that moves while nobody touches anything, so it is the part whose cost the
 * page pays all the time. Here it costs the main thread one small `postMessage` per tick: the page transfers each
 * `.jelly-haze-canvas` once (`transferControlToOffscreen`), the engine keeps every scheduling decision (which surfaces,
 * when, the ambient clock, the governor) and posts the tick's draws, and this worker renders them with the same
 * `GlassRenderer` and hands each frame to its canvas without a copy (`renderer.ts` "Handing a frame over").
 *
 * It owns no frame loop: it draws when a tick arrives, and the browser presents the transferred canvases when the task
 * ends. Protocol: `haze-worker.ts`.
 */
import { GlassRenderer, type HazeDraw } from './renderer';
import type { HazeWorkerIn, HazeWorkerOut } from './haze-worker';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: HazeWorkerOut) => scope.postMessage(m);

const canvases = new Map<number, OffscreenCanvas>();
/** Ids not yet drawn since adoption: their first frame is acknowledged so the page can hide the CSS carrier. */
const fresh = new Set<number>();
let renderer: GlassRenderer | null = null;

const start = () => {
  renderer = GlassRenderer.createOffscreen();
  if (!renderer?.hazeReady) {
    renderer = null;
    post({ type: 'ready', ok: false });
    return;
  }
  renderer.onChange = () => post({ type: renderer?.ready ? 'restored' : 'lost' });
  post({ type: 'ready', ok: true });
};

scope.onmessage = (e: MessageEvent<HazeWorkerIn>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      start();
      return;
    case 'adopt':
      canvases.set(m.id, m.canvas);
      fresh.add(m.id);
      return;
    case 'drop':
      canvases.delete(m.id);
      fresh.delete(m.id);
      return;
    case 'draw': {
      const r = renderer;
      if (!r?.hazeReady) return;
      const drawn: number[] = [];
      for (const item of m.items) {
        const canvas = canvases.get(item.id);
        if (!canvas) continue;
        if (r.drawHaze(item.draw as HazeDraw, m.time, canvas) && fresh.delete(item.id)) {
          drawn.push(item.id);
        }
      }
      if (drawn.length) post({ type: 'drawn', ids: drawn });
      return;
    }
  }
};
