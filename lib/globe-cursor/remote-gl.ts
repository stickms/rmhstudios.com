/**
 * The globe cursor's GPU surface, drawn in a worker (`./cursor.worker.ts`) on an `OffscreenCanvas` the page transfers
 * once. In the default direct mode the cursor's canvas IS what is on screen, moved with a transform; with the context on
 * the page, every frame it rendered was handed to the compositor through the page's own thread (a GPU readback and a
 * wait for the GPU in a trace — and, beside the globe's worker, a wait on the same GPU process). Here the page posts
 * the frame's parameters (a few dozen numbers) and returns at once; the browser presents the worker's frame.
 *
 * It implements the engine's `GlobeSurface` (`./gl.ts`) with `directOnly`: its pixels are the worker's, so it can be
 * shown but never drawn onto another canvas, and the trail/sparkle modes (which composite the sprite onto a 2D canvas)
 * keep the page-side surface. Where a worker cannot own a WebGL 2 context, `startRemoteGlobeGl` resolves null and the
 * cursor keeps its existing page-side surface, exactly as before.
 *
 * Back-pressure: at most {@link CURSOR_FRAMES_IN_FLIGHT} frames unacknowledged; newer frames replace a held one, so a
 * slow GPU drops stale cursor frames instead of queueing them.
 */
import type { GlFrame, GlobeSurface } from './gl';

export const CURSOR_READY_TIMEOUT_MS = 8000;
export const CURSOR_FRAMES_IN_FLIGHT = 2;

export type CursorWorkerIn =
  | { type: 'init'; canvas: OffscreenCanvas; software: boolean }
  | { type: 'frame'; seq: number; f: GlFrame };

export type CursorWorkerOut =
  { type: 'ready'; ok: boolean } | { type: 'ack'; seq: number } | { type: 'lost' };

export interface RemoteGlDeps {
  /** Worker + OffscreenCanvas + transferControlToOffscreen are all available. */
  supported: boolean;
  /** A software rasteriser: the worker caps the mesh, as the page-side surface does. */
  software: boolean;
  createWorker(): Worker;
  createCanvas(): HTMLCanvasElement;
}

export interface RemoteGlobeGl extends GlobeSurface {
  dispose(): void;
}

export function startRemoteGlobeGl(deps: RemoteGlDeps): Promise<RemoteGlobeGl | null> {
  if (!deps.supported) return Promise.resolve(null);
  let worker: Worker;
  try {
    worker = deps.createWorker();
  } catch {
    return Promise.resolve(null);
  }
  const canvas = deps.createCanvas();
  canvas.setAttribute('aria-hidden', 'true');
  let off: OffscreenCanvas;
  try {
    off = canvas.transferControlToOffscreen();
  } catch {
    worker.terminate();
    return Promise.resolve(null);
  }

  let alive = true;
  let seq = 0;
  let acked = 0;
  let held: GlFrame | null = null;

  const stop = () => {
    alive = false;
    held = null;
    worker.onmessage = null;
    worker.onerror = null;
    try {
      worker.terminate();
    } catch {
      /* gone */
    }
  };
  const post = (f: GlFrame) => {
    try {
      worker.postMessage({ type: 'frame', seq: ++seq, f } satisfies CursorWorkerIn);
    } catch {
      stop();
    }
  };

  const surface: RemoteGlobeGl = {
    get ok() {
      return alive;
    },
    canvas,
    directOnly: true,
    render(f) {
      if (!alive) return canvas;
      if (seq - acked >= CURSOR_FRAMES_IN_FLIGHT) held = f;
      else post(f);
      return canvas;
    },
    dispose() {
      stop();
      canvas.remove();
    },
  };

  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!ok) stop();
      resolve(ok ? surface : null);
    };
    const timer = setTimeout(() => settle(false), CURSOR_READY_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as CursorWorkerOut;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'ready') settle(m.ok);
      else if (m.type === 'ack') {
        if (m.seq > acked && m.seq <= seq) acked = m.seq;
        if (held && seq - acked < CURSOR_FRAMES_IN_FLIGHT) {
          const f = held;
          held = null;
          post(f);
        }
      } else if (m.type === 'lost') {
        stop();
        settle(false);
      }
    };
    worker.onerror = () => {
      stop();
      settle(false);
    };
    try {
      worker.postMessage(
        { type: 'init', canvas: off, software: deps.software } satisfies CursorWorkerIn,
        [off],
      );
    } catch {
      settle(false);
    }
  });
}

/** Whether this page can hand the cursor's canvas to a worker. */
export function canUseCursorWorker(win: Window & typeof globalThis): boolean {
  return (
    typeof win.Worker === 'function' &&
    typeof win.OffscreenCanvas === 'function' &&
    typeof win.HTMLCanvasElement?.prototype.transferControlToOffscreen === 'function'
  );
}

let shared: Promise<RemoteGlobeGl | null> | null = null;
/**
 * The page's one worker-backed cursor surface, started on first use and shared by later mounts; a lost one is
 * replaced on the next acquire. `software` caps the mesh on a software rasteriser.
 */
export function acquireRemoteGlobeGl(software: boolean): Promise<RemoteGlobeGl | null> {
  const win = window as Window & typeof globalThis;
  const start = () =>
    startRemoteGlobeGl({
      supported: canUseCursorWorker(win),
      software,
      createWorker: () =>
        new Worker(new URL('./cursor.worker.ts', import.meta.url), {
          type: 'module',
          name: 'globe-cursor',
        }),
      createCanvas: () => win.document.createElement('canvas'),
    });
  if (shared) {
    const prev = shared;
    shared = prev.then((g) => (g && !g.ok ? start() : g));
    return shared;
  }
  shared = start();
  return shared;
}
