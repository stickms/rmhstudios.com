/**
 * The page side of the glass worker (`glass.worker.ts`): starts it, hands it rim and haze canvases and the page
 * snapshot, posts each frame's draws, and says when it can no longer draw.
 *
 * Everything degrades to the main-thread path. Where a worker can run at all, the engine waits for it (bounded) and
 * builds no page renderer, so no shader is compiled on the main thread; the worker is used once it has answered
 * `ready` with a working WebGL 2 context on an `OffscreenCanvas`. In engines without `transferControlToOffscreen`,
 * without module workers, or under a CSP that forbids them — or if the worker fails or is slow to answer — the
 * engine draws on the main thread. A canvas, once transferred, can never be drawn by the page again, so when the
 * worker loses its context the engine drops those canvases and builds fresh ones on the main thread (`onLost`).
 */
import type { GlassDraw, HazeDraw } from './renderer';

/** One canvas's draw in a frame. `key` names the canvas: `rimKey(id)` or `hazeKey(id)` of the engine's surface id. */
export type GlassWorkItem =
  | { key: string; kind: 'haze'; time: number; draw: HazeDraw }
  | { key: string; kind: 'rim'; time: number; draw: GlassDraw };

export type GlassWorkerIn =
  | { type: 'init' }
  | { type: 'adopt'; key: string; canvas: OffscreenCanvas }
  | { type: 'drop'; key: string }
  | { type: 'scene'; bitmap: ImageBitmap }
  | { type: 'frame'; items: GlassWorkItem[] };

export type GlassWorkerOut =
  | { type: 'ready'; ok: false }
  | { type: 'ready'; ok: true; haze: boolean }
  | { type: 'drawn'; keys: string[] }
  | { type: 'lost' }
  | { type: 'restored' };

export const rimKey = (id: number) => `r${id}`;
export const hazeKey = (id: number) => `h${id}`;

export interface GlassWorkerHost {
  /** True once the worker has a context and until it loses it. */
  readonly ready: boolean;
  /** The worker's haze program compiled (rims can be remote while haze is not). */
  readonly hazeReady: boolean;
  /** Transfer `canvas` to the worker under `key`. False (and the canvas untouched) when it cannot be transferred. */
  adopt(key: string, canvas: HTMLCanvasElement): boolean;
  drop(key: string): void;
  /** Hand the worker a page snapshot for the rims to refract. The bitmap is transferred (the caller must not use it). */
  scene(bitmap: ImageBitmap): void;
  /** Queue a draw for this frame; {@link flush} posts the frame. */
  queue(item: GlassWorkItem): void;
  flush(): void;
  dispose(): void;
}

export interface GlassWorkerCallbacks {
  /** The worker answered `ready` with a working context. */
  onReady(): void;
  /** These canvases have their first frame on screen. */
  onDrawn(keys: readonly string[]): void;
  /** The worker cannot draw (context lost, crashed). Its canvases are dead. */
  onLost(): void;
  /** The worker died before it was ever ready (no WebGL 2 there, a failed module load): draw on the page instead. */
  onFailed?(): void;
}

/** Whether this engine can hand a page canvas to a worker at all. */
export function canUseGlassWorker(win: Window & typeof globalThis): boolean {
  return (
    typeof win.Worker === 'function' &&
    typeof win.OffscreenCanvas === 'function' &&
    typeof win.HTMLCanvasElement?.prototype.transferControlToOffscreen === 'function'
  );
}

/** Start the glass worker, or null where it cannot run. The host is not {@link GlassWorkerHost.ready} until `onReady`. */
export function startGlassWorker(
  win: Window & typeof globalThis,
  cb: GlassWorkerCallbacks,
): GlassWorkerHost | null {
  if (!canUseGlassWorker(win)) return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./glass.worker.ts', import.meta.url), {
      type: 'module',
      name: 'jelly-glass',
    });
  } catch {
    // A CSP that forbids workers, a blocked module URL, a worker quota.
    return null;
  }
  let ready = false;
  let hazeReady = false;
  let dead = false;
  let items: GlassWorkItem[] = [];
  const send = (m: GlassWorkerIn, transfer?: Transferable[]) => {
    if (dead) return;
    try {
      worker.postMessage(m, transfer ?? []);
    } catch {
      die();
    }
  };
  const die = () => {
    if (dead) return;
    const was = ready;
    dead = true;
    ready = false;
    worker.terminate();
    if (was) cb.onLost();
    else cb.onFailed?.();
  };
  worker.onmessage = (e: MessageEvent<GlassWorkerOut>) => {
    const m = e.data;
    if (m.type === 'ready') {
      if (!m.ok) {
        die();
        return;
      }
      ready = true;
      hazeReady = m.haze;
      cb.onReady();
    } else if (m.type === 'drawn') {
      cb.onDrawn(m.keys);
    } else if (m.type === 'lost') {
      // A restore would come back with an empty context and the page's canvases already blank; it is simpler and as
      // fast to let the engine rebuild them on the main thread for the rest of this page.
      die();
    }
  };
  worker.onerror = () => die();
  send({ type: 'init' });
  return {
    get ready() {
      return ready && !dead;
    },
    get hazeReady() {
      return hazeReady && ready && !dead;
    },
    adopt(key, canvas) {
      if (!ready || dead) return false;
      let off: OffscreenCanvas;
      try {
        off = canvas.transferControlToOffscreen();
      } catch {
        return false;
      }
      send({ type: 'adopt', key, canvas: off }, [off]);
      return !dead;
    },
    drop(key) {
      send({ type: 'drop', key });
    },
    scene(bitmap) {
      if (!ready || dead) {
        bitmap.close();
        return;
      }
      send({ type: 'scene', bitmap }, [bitmap]);
    },
    queue(item) {
      items.push(item);
    },
    flush() {
      if (items.length === 0) return;
      const batch = items;
      items = [];
      send({ type: 'frame', items: batch });
    },
    dispose() {
      dead = true;
      ready = false;
      worker.terminate();
    },
  };
}
