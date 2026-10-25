/**
 * The page side of the haze worker (`haze.worker.ts`): starts it, hands it haze canvases, posts each ambient tick's
 * draws, and says when it can no longer draw.
 *
 * Everything degrades to the main-thread path. The worker is used only once it has answered `ready` with a working
 * WebGL 2 context on an `OffscreenCanvas`; until then (and in engines without `transferControlToOffscreen`, without
 * module workers, or under a CSP that forbids them) the engine draws haze itself, exactly as before. A canvas, once
 * transferred, can never be drawn by the page again, so when the worker loses its context the engine drops those
 * canvases and builds fresh ones on the main thread (`onLost`).
 */
import type { HazeDraw } from './renderer';

/** One surface's draw in a tick. The id is the engine's surface id. */
export interface HazeWorkItem {
  id: number;
  draw: HazeDraw;
}

export type HazeWorkerIn =
  | { type: 'init' }
  | { type: 'adopt'; id: number; canvas: OffscreenCanvas }
  | { type: 'drop'; id: number }
  | { type: 'draw'; time: number; items: HazeWorkItem[] };

export type HazeWorkerOut =
  | { type: 'ready'; ok: boolean }
  | { type: 'drawn'; ids: number[] }
  | { type: 'lost' }
  | { type: 'restored' };

export interface HazeWorkerHost {
  /** True once the worker has a context and until it loses it. */
  readonly ready: boolean;
  /** Transfer `canvas` to the worker. False (and the canvas untouched) when it cannot be transferred. */
  adopt(id: number, canvas: HTMLCanvasElement): boolean;
  drop(id: number): void;
  /** Queue a draw for this tick; {@link flush} posts the tick. */
  queue(id: number, draw: HazeDraw): void;
  flush(time: number): void;
  dispose(): void;
}

export interface HazeWorkerCallbacks {
  /** The worker answered `ready` with a working context. */
  onReady(): void;
  /** These ids have their first frame on screen. */
  onDrawn(ids: readonly number[]): void;
  /** The worker cannot draw (context lost, crashed). Its canvases are dead. */
  onLost(): void;
}

/** Whether this engine can hand a page canvas to a worker at all. */
export function canUseHazeWorker(win: Window & typeof globalThis): boolean {
  return (
    typeof win.Worker === 'function' &&
    typeof win.OffscreenCanvas === 'function' &&
    typeof win.HTMLCanvasElement?.prototype.transferControlToOffscreen === 'function'
  );
}

/** Start the haze worker, or null where it cannot run. The host is not {@link HazeWorkerHost.ready} until `onReady`. */
export function startHazeWorker(
  win: Window & typeof globalThis,
  cb: HazeWorkerCallbacks,
): HazeWorkerHost | null {
  if (!canUseHazeWorker(win)) return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./haze.worker.ts', import.meta.url), {
      type: 'module',
      name: 'jelly-haze',
    });
  } catch {
    // A CSP that forbids workers, a blocked module URL, a worker quota.
    return null;
  }
  let ready = false;
  let dead = false;
  let items: HazeWorkItem[] = [];
  const send = (m: HazeWorkerIn, transfer?: Transferable[]) => {
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
  };
  worker.onmessage = (e: MessageEvent<HazeWorkerOut>) => {
    const m = e.data;
    if (m.type === 'ready') {
      if (!m.ok) {
        die();
        return;
      }
      ready = true;
      cb.onReady();
    } else if (m.type === 'drawn') {
      cb.onDrawn(m.ids);
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
    adopt(id, canvas) {
      if (!ready || dead) return false;
      let off: OffscreenCanvas;
      try {
        off = canvas.transferControlToOffscreen();
      } catch {
        return false;
      }
      send({ type: 'adopt', id, canvas: off }, [off]);
      return !dead;
    },
    drop(id) {
      send({ type: 'drop', id });
    },
    queue(id, draw) {
      items.push({ id, draw });
    },
    flush(time) {
      if (items.length === 0) return;
      const batch = items;
      items = [];
      send({ type: 'draw', time, items: batch });
    },
    dispose() {
      dead = true;
      ready = false;
      worker.terminate();
    },
  };
}
