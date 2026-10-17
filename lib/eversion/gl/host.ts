/**
 * The main-thread facade over the render side (spec §3.2). OWNER: T25.
 * Client-only.
 *
 * The rest of the page talks to the effect through ONE object, an
 * {@link EversionHost}, and never learns whether the frames are being drawn in a
 * dedicated worker or on this thread.
 *
 * - **Detection** (once, cached for the session): `OffscreenCanvas`, a way to
 *   hand a DOM canvas over (`transferControlToOffscreen`), a `Worker`, and a
 *   browser not known to lack a frame scheduler in workers. Where any is missing
 *   — Safari's worker-scheduler status is spec §14 item 1, resolved below — the
 *   host runs the SAME {@link createEversionCore} on the main thread with the
 *   page's own frame scheduler. Behaviour is identical; the only difference is
 *   that it shares a thread with the route render (mitigated by §8.4).
 * - **Detection cannot see everything.** Whether WebGL2 exists on an
 *   `OffscreenCanvas` in a worker (and whether the worker has a frame
 *   scheduler) is only knowable by trying. The host asks a new worker with a
 *   cheap `probe` BEFORE the page canvas is transferred (it cannot be taken
 *   back), holding messages until the answer; a "no" turns this very host into
 *   an in-thread one on the untouched canvas, so a worker-only failure costs
 *   nothing. A worker that still fails to start — a script error, or a fatal `error` before `ready` — is
 *   reported to subscribers as usual AND demotes the session's cached mode to
 *   `main`: the controller's fallback path (spec §9.4) runs this navigation
 *   without the effect, and the next host is built in-thread on a fresh canvas.
 * - **One worker per page**, constructed at prefetch (spec §8.1), terminated on
 *   `pagehide`. Terminating a worker destroys the contexts it owns, which is how
 *   the "lose the context" half of §3.2 is met for a transferred canvas; the
 *   in-thread path loses its context explicitly.
 * - **The canvas.** A canvas element's control can be transferred to an
 *   `OffscreenCanvas` exactly once, and a context belongs to its canvas — so
 *   "programs stay compiled for the next navigation" (spec §3.2) holds only if
 *   the overlay's canvas element outlives a single navigation. The host
 *   contract therefore allows `init` to be sent again with a NEW canvas (the core
 *   disposes the old context and recompiles), and T31 decides whether to keep one
 *   canvas element mounted-but-hidden between runs or to pay the recompile.
 *   Callers may pass the DOM canvas either way: in worker mode `post` performs
 *   the transfer itself.
 * - **Time.** `start.t0` is the main thread's `performance.now()`. A worker's
 *   clock has a different origin; the core measures the offset (see `core.ts`),
 *   so callers keep passing their own `performance.now()`.
 *
 * ## Safari (spec §14 item 1)
 *
 * WebKit has shipped `OffscreenCanvas` with WebGL2 in workers since 16.4, but
 * `requestAnimationFrame` in a dedicated worker is not something this task could
 * verify on a device, and the failure mode is a worker that draws nothing. So
 * the conservative reading is encoded: every WebKit engine (macOS Safari and
 * every iOS browser, which are all WebKit) gets the in-thread host, and iOS then
 * leans on the `low`/`mid` tier and the DPR governor. Flip
 * {@link WEBKIT_USES_WORKER} once the device lab (T38) shows the worker path
 * presenting on iOS.
 *
 * This file is on the frame-loop allowlist as "bounded by the navigation: the
 * loop starts at `start` and stops at `done`/`abort`/`context-lost`; no loop
 * runs at rest" — for the in-thread scheduler only.
 *
 * ## Bundling the worker
 *
 * The worker is created with `new Worker(new URL('./worker.ts', import.meta.url),
 * { type: 'module' })`, the pattern Vite supports natively (it is already how
 * `lib/slice-it/editor/lint-runner.ts` loads its worker): the build emits the
 * worker as its own chunk and rewrites the URL, in dev and in the production
 * bundle, and no `worker` option is needed in `vite.config.ts`. Nothing else in
 * the app names `worker.ts`, so the chunk is fetched only when this code runs,
 * i.e. after the prefetch `import()`.
 */

import { registerDebug } from '../debug';
import type { HostDebug, RendererDebug } from '../debug';
import type {
  DebugCommand,
  EversionCore,
  EversionHost,
  FrameStats,
  FromWorker,
  GlCounters,
  HostMode,
  ToWorker,
} from '../types';
import { createEversionCore } from './core';
import type { CoreDeps } from './core';

/** Flip to `true` when the device lab shows worker rAF presenting on WebKit (spec §14 item 1). */
export const WEBKIT_USES_WORKER = false;

/** `sessionStorage` key remembering that the worker path failed in this session. */
const DEMOTED_KEY = 'rmh-eversion-host-demoted';

/** What the host needs of a worker (a test can fake it). */
export type WorkerLike = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener'>;

export interface HostOptions {
  /** Build the worker. Defaults to the Vite-bundled `worker.ts`; the e2e fixture supplies its own. */
  createWorker?: () => WorkerLike;
  /** The core's collaborators, for the e2e fixture (orientation and LUT bake land in other tasks). */
  coreDeps?: CoreDeps;
}

let forced: HostMode | undefined;
let cached: HostMode | undefined;

function isWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iOS browsers (CriOS, FxiOS, …) are WebKit whatever they say; iPadOS reports as a Mac.
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return true;
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android|Edg\/|OPR\//.test(ua);
}

function readDemoted(): boolean {
  try {
    return sessionStorage.getItem(DEMOTED_KEY) === '1';
  } catch {
    return false;
  }
}

function detect(): HostMode {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return 'main';
  if (typeof OffscreenCanvas === 'undefined') return 'main';
  if (
    typeof HTMLCanvasElement === 'undefined' ||
    !('transferControlToOffscreen' in HTMLCanvasElement.prototype)
  ) {
    return 'main';
  }
  if (isWebKit() && !WEBKIT_USES_WORKER) return 'main';
  if (readDemoted()) return 'main';
  return 'worker';
}

/**
 * Which mode this browser gets. Cached after the first call. `force` is for
 * the e2e fallback-parity test (spec §11.2 test 36) and applies to the next
 * host created; `detectHostMode(undefined)` after it keeps the force, and
 * {@link resetEversionHost} clears it.
 */
export function detectHostMode(force?: HostMode): HostMode {
  if (force) forced = force;
  return forced ?? (cached ??= detect());
}

/** Remember that the worker path failed so the next host is in-thread. */
function demote(): void {
  cached = 'main';
  if (forced === 'worker') forced = undefined;
  try {
    sessionStorage.setItem(DEMOTED_KEY, '1');
  } catch {
    /* private mode: the module-level cache still holds for this page */
  }
}

interface HostInternals extends EversionHost {
  /** Frames the loop has pending: exact in-thread; inferred (start → done) for a worker. */
  pending(): number;
}

let current: HostInternals | null = null;

/**
 * The page's single host, created on first call. Does NOT start a loop; the
 * first frame is requested at the `start` message. If a different mode has
 * since been forced (the e2e parity test), the old host is disposed and a new
 * one built.
 */
export function getEversionHost(options: HostOptions = {}): EversionHost {
  const want = detectHostMode();
  if (current && current.mode !== want) {
    current.dispose();
  }
  current ??= createHost(want, options);
  return current;
}

/** Dispose the current host and clear the mode cache and any force (tests, harness). */
export function resetEversionHost(): void {
  current?.dispose();
  current = null;
  cached = undefined;
  forced = undefined;
}

function defaultWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

/** A worker that never answers the capability probe is assumed capable after this long (an old or faked worker). */
const PROBE_TIMEOUT_MS = 2500;

function createHost(initialMode: HostMode, options: HostOptions): HostInternals {
  let mode: HostMode = initialMode;
  const listeners = new Set<(message: FromWorker) => void>();
  let disposed = false;
  let ready = false;
  let lastStats: FrameStats | null = null;
  let workerRunning = false;
  let canvasRef: HTMLCanvasElement | null = null;
  /** The page's own canvas has been handed to the render side (see `post`). */
  let pageCanvasInited = false;

  const deliver = (message: FromWorker) => {
    if (message.type === 'ready') ready = true;
    if (message.type === 'done') {
      lastStats = { frames: message.frames, dropped: message.dropped, p95: message.p95 };
      workerRunning = false;
    }
    if (message.type === 'context-lost') workerRunning = false;
    if (message.type === 'error' && message.fatal) {
      workerRunning = false;
      if (mode === 'worker' && !ready) demote();
    }
    for (const listener of [...listeners]) {
      try {
        listener(message);
      } catch (error) {
        console.error('eversion: host listener threw', error);
      }
    }
  };

  /* ── The transport ────────────────────────────────────────────────────── */

  let sendToCore: (message: ToWorker, transfer?: Transferable[]) => void = () => {};
  let teardown: () => void = () => {};
  let pendingFrames: () => number = () => 0;

  /**
   * The worker transport. A fresh worker is first ASKED whether it can render at all (`probe`: WebGL2 on an
   * `OffscreenCanvas`, a frame scheduler): the page canvas's control can be transferred once and never back,
   * so a worker that cannot draw must be found out BEFORE the canvas goes to it. Messages posted meanwhile are
   * held, in order. If the answer is no (or the worker dies first) the host quietly becomes an in-thread one,
   * on the same still-untouched canvas, for this navigation and the rest of the session.
   */
  function attachWorker() {
    const worker = (options.createWorker ?? defaultWorker)();
    let probing = true;
    let probeTimer: ReturnType<typeof setTimeout> | null = null;
    const held: Array<[ToWorker, Transferable[] | undefined]> = [];

    const settleProbe = (ok: boolean) => {
      if (!probing) return;
      probing = false;
      if (probeTimer !== null) clearTimeout(probeTimer);
      probeTimer = null;
      if (disposed) return;
      if (!ok) {
        demote();
        worker.terminate();
        attachMainThread();
      }
      for (let m = held.shift(); m; m = held.shift()) sendToCore(m[0], m[1]);
    };

    worker.addEventListener('message', ((e: MessageEvent<FromWorker>) => {
      if (e.data.type === 'probe-result') {
        settleProbe(e.data.ok);
        return;
      }
      deliver(e.data);
    }) as never);
    const crashed = (e: ErrorEvent | MessageEvent) => {
      if (probing) {
        // Died before it could answer: nothing was lost, so take the main-thread route.
        settleProbe(false);
        return;
      }
      deliver({
        type: 'error',
        message: `eversion: worker failed${'message' in e && typeof e.message === 'string' ? `: ${e.message}` : ''}`,
        fatal: true,
      });
    };
    worker.addEventListener('error', crashed as never);
    worker.addEventListener('messageerror', crashed as never);

    const post = (message: ToWorker, transfer?: Transferable[]) => {
      const list = transfer ? [...transfer] : [];
      let outgoing = message;
      if (message.type === 'init' && message.canvas instanceof HTMLCanvasElement) {
        // The page keeps handing us the DOM canvas; the transfer is ours to make.
        const offscreen = message.canvas.transferControlToOffscreen();
        outgoing = { ...message, canvas: offscreen };
        list.push(offscreen);
      } else if (message.type === 'init') {
        list.push(message.canvas as OffscreenCanvas);
      } else if (message.type === 'texture' && !list.includes(message.bitmap)) {
        list.push(message.bitmap);
      }
      if (message.type === 'start') workerRunning = true;
      worker.postMessage(outgoing, list);
    };
    sendToCore = (message, transfer) => {
      if (probing) held.push([message, transfer]);
      else post(message, transfer);
    };
    teardown = () => {
      if (probeTimer !== null) clearTimeout(probeTimer);
      worker.terminate();
    };
    pendingFrames = () => (workerRunning ? 1 : 0);

    probeTimer = setTimeout(() => settleProbe(true), PROBE_TIMEOUT_MS);
    worker.postMessage({ type: 'probe' } satisfies ToWorker);
  }

  /** The in-thread transport: the same core, the page's own frame scheduler. */
  function attachMainThread() {
    mode = 'main';
    const pending = new Set<number>();
    const core: EversionCore = createEversionCore(
      {
        mode: 'main',
        emit: (message) => deliver(message),
        scheduler: {
          request(callback) {
            const id = requestAnimationFrame((now) => {
              pending.delete(id);
              callback(now);
            });
            pending.add(id);
            return id;
          },
          cancel(id) {
            pending.delete(id);
            cancelAnimationFrame(id);
          },
        },
        now: () => performance.now(),
      },
      options.coreDeps,
    );
    // Same asynchrony as a worker: a message never runs inside the call that posted it.
    const queue: ToWorker[] = [];
    let draining = false;
    sendToCore = (message) => {
      if (message.type === 'init' && message.canvas instanceof HTMLCanvasElement) {
        canvasRef = message.canvas;
      }
      queue.push(message);
      if (draining) return;
      draining = true;
      queueMicrotask(() => {
        draining = false;
        for (let m = queue.shift(); m; m = queue.shift()) core.handle(m);
      });
    };
    teardown = () => {
      core.dispose();
      // Dropping every object is not enough to free the GPU memory promptly.
      try {
        const gl = canvasRef?.getContext('webgl2');
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        /* the context may already be gone */
      }
    };
    pendingFrames = () => pending.size;
  }

  if (mode === 'worker') attachWorker();
  else attachMainThread();

  /* ── Page-level wiring ────────────────────────────────────────────────── */

  const onVisibility = () => sendToCore({ type: 'visibility', hidden: document.hidden });
  document.addEventListener('visibilitychange', onVisibility);
  const onPageHide = () => host.dispose();
  window.addEventListener('pagehide', onPageHide);

  /* ── Debug slots (no-ops unless ?eversion-debug=1) ────────────────────── */

  let nextDebugId = 1;
  const waiting = new Map<number, (r: { ok: boolean; value?: unknown }) => void>();
  const routeDebugResult = (message: FromWorker) => {
    if (message.type !== 'debug-result') return;
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  };
  listeners.add(routeDebugResult);

  function ask(command: DebugCommand): Promise<unknown> {
    const id = nextDebugId++;
    return new Promise((resolve, reject) => {
      waiting.set(id, (r) => (r.ok ? resolve(r.value) : reject(new Error(String(r.value)))));
      sendToCore({ type: 'debug', id, command });
    });
  }

  const rendererSlot: RendererDebug = {
    pauseAt(e) {
      void ask({ op: 'pause-at', e });
    },
    solidTextures(before, after) {
      void ask({ op: 'solid-textures', before, after });
    },
    counters: () => ask({ op: 'counters' }) as Promise<GlCounters>,
    evaluate: (es) => ask({ op: 'evaluate', es }) as Promise<Float32Array>,
    injectHardCut(channel) {
      void ask({ op: 'inject-hard-cut', channel: channel as never });
    },
  };

  const registerSlots = () => {
    // The in-thread renderer registers a slot of its own on `init`; ours replaces
    // it so a harness sees one behaviour in both modes.
    const a = registerDebug('renderer', rendererSlot);
    const b = registerDebug('host', {
      mode: () => mode,
      forceMainThread(force) {
        forced = force ? 'main' : undefined;
      },
      lastStats: () => lastStats,
      pendingFrames: () => pendingFrames(),
      loop: () => ask({ op: 'loop' }) as ReturnType<HostDebug['loop']>,
    });
    return () => {
      a();
      b();
    };
  };
  let unregister = registerSlots();
  listeners.add((message) => {
    if (message.type !== 'ready') return;
    unregister();
    unregister = registerSlots();
  });

  /* ── The host ─────────────────────────────────────────────────────────── */

  const host: HostInternals = {
    get mode() {
      return mode;
    },
    post(message, transfer) {
      if (disposed) return;
      if (message.type === 'init') {
        if (message.canvas instanceof HTMLCanvasElement) {
          pageCanvasInited = true;
        } else if (pageCanvasInited) {
          // The prefetch warm-up's WebGL2 probe (a throwaway `OffscreenCanvas`)
          // arriving AFTER the controller's own init: the core would re-init on
          // the probe and the page's renderer would be disposed, leaving the
          // overlay's canvas blank. The page canvas already has a context, which
          // answers the probe's question; say so instead.
          const { tier } = message;
          queueMicrotask(() => deliver({ type: 'ready', tier, host: mode }));
          return;
        }
      }
      if (message.type === 'init' || message.type === 'start') {
        // The core cannot see the page's visibility, and a new init resets what it believed: tell it the
        // truth (shown OR hidden) before every init and start, so a stale 'hidden' never outlives a context.
        sendToCore({ type: 'visibility', hidden: document.hidden });
      }
      if (message.type === 'start') {
        sendToCore({ ...message, origin: message.origin ?? performance.timeOrigin }, transfer);
        return;
      }
      sendToCore(message, transfer);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      unregister();
      teardown();
      listeners.clear();
      if (current === host) current = null;
    },
    pending: () => pendingFrames(),
  };
  return host;
}
