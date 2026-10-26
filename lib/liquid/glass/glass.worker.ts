/// <reference lib="webworker" />
/**
 * The glass worker: draws every rim and haze canvas off the main thread.
 *
 * A shader frame has to leave the GL context somehow, and on the page that means the main thread waits for the GPU:
 * `drawImage(webglCanvas)` is a synchronous snapshot, and in Gecko — where WebGL runs in a separate GPU process — a
 * round trip to that process per surface (measured in Firefox 136 at 25 ms of main thread per hover frame across eight
 * cards). Here the waiting happens on this thread instead. The page transfers each surface canvas once
 * (`transferControlToOffscreen`), the engine keeps every decision (which surfaces, when, with what light, dent, lattice
 * and plasma) and posts each frame's draws, and this worker renders them with the same `GlassRenderer` and hands each
 * frame to its canvas without a copy (`renderer.ts` "Handing a frame over").
 *
 * It owns no frame loop. Draws are coalesced per canvas: everything that arrives before the worker gets to it is
 * merged, latest wins, so a GPU that falls behind drops stale frames instead of queueing them. The browser presents the
 * transferred canvases when the task ends. Protocol: `glass-worker.ts`.
 */
import { GlassRenderer, type GlassDraw, type HazeDraw } from './renderer';
import type { GlassWorkItem, GlassWorkerIn, GlassWorkerOut } from './glass-worker';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: GlassWorkerOut) => scope.postMessage(m);

const canvases = new Map<string, OffscreenCanvas>();
/** Keys not yet drawn since adoption: their first frame is acknowledged so the page can retire what it replaces. */
const fresh = new Set<string>();
/** The latest draw per canvas, waiting for the next flush. */
const pending = new Map<string, GlassWorkItem>();
let flushQueued = false;
let renderer: GlassRenderer | null = null;

const start = () => {
  renderer = GlassRenderer.createOffscreen();
  if (!renderer) {
    post({ type: 'ready', ok: false });
    return;
  }
  renderer.onChange = () => post({ type: renderer?.ready ? 'restored' : 'lost' });
  post({ type: 'ready', ok: true, haze: renderer.hazeReady });
};

const flush = () => {
  flushQueued = false;
  const r = renderer;
  if (!r?.ready) {
    pending.clear();
    return;
  }
  // Haze first, then rims: the frame switches program at most twice.
  const items = [...pending.values()].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === 'haze' ? -1 : 1,
  );
  pending.clear();
  const drawn: string[] = [];
  for (const item of items) {
    const canvas = canvases.get(item.key);
    if (!canvas) continue;
    const ok =
      item.kind === 'haze'
        ? r.drawHaze(item.draw as HazeDraw, item.time, canvas)
        : r.draw(item.draw as GlassDraw, canvas);
    if (ok && fresh.delete(item.key)) drawn.push(item.key);
  }
  if (drawn.length) post({ type: 'drawn', keys: drawn });
};

scope.onmessage = (e: MessageEvent<GlassWorkerIn>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      start();
      return;
    case 'adopt':
      canvases.set(m.key, m.canvas);
      fresh.add(m.key);
      return;
    case 'drop':
      canvases.delete(m.key);
      fresh.delete(m.key);
      pending.delete(m.key);
      return;
    case 'scene':
      renderer?.setScene(m.bitmap);
      m.bitmap.close();
      return;
    case 'frame':
      for (const item of m.items) pending.set(item.key, item);
      if (!flushQueued) {
        flushQueued = true;
        // A task, not a microtask: frames already queued behind this one are merged in before anything is drawn.
        setTimeout(flush, 0);
      }
      return;
  }
};
