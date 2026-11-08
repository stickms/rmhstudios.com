/**
 * The page side of the liquid globe's worker (`globe-worker.ts`): it starts the worker, transfers the coat (and, on
 * demand, the self-eversion skin) canvas to it once, forwards the few small inputs the worker needs, and owns the
 * decision to fall back to the CSS glass globe.
 *
 * The page never touches the globe's GPU work. It sends:
 *
 * - **size/DPR** from the one ResizeObserver (`size`, `skinSize`), never per frame;
 * - **the theme** as computed-style strings, once per theme change (`theme`, `skinTheme`) — colours are resolved in the
 *   worker, never sampled from a canvas here;
 * - **the coat clock** (ambient rate, plasma target, engaged window, visibility/focus, still) only when it changes
 *   (`clock`, de-duplicated by `clockChanged`);
 * - **surface frames** (ripples, the dough's grab point and its field) and **skin frames**, coalesced to one message
 *   per `flush()` — LiquidGlobe flushes once per animation frame, and only while something on the ball moves — and held
 *   back while the worker is behind (`FrameCoalescer`), so stale input is dropped rather than queued;
 * - **the page snapshot**: the scene store's bitmap is cloned (`createImageBitmap`), the clone transferred and closed
 *   here, so no bitmap is ever shared between two contexts.
 *
 * Failure policy (`globe-protocol.ts`): no `OffscreenCanvas`/transfer/`Worker`, `perf-lite`, a worker that cannot
 * make a WebGL 2 context or build the program, or one that never answers → the CSS globe for the rest of the page. A
 * crashed worker or a lost context → a fresh worker with fresh canvases (a transferred canvas can never be taken back),
 * a bounded number of times, then the CSS globe. Never GL on the page's thread. The decision is logged to the console
 * in development only.
 *
 * One host per page load (`acquireGlobeHost`), shared by every mounted globe (the dock, the hub, the rehearsal); the
 * worker is terminated a short while after the last globe unmounts, so reopening the hub reuses its compiled programs.
 */
import type { SharedScene } from '@/lib/liquid/glass/scene-store';
import { RIPPLE } from '@/lib/fluid';
import {
  FrameCoalescer,
  GLOBE_PROTOCOL_VERSION,
  afterFailure,
  clockChanged,
  decideGlobeBackend,
  isGlobeOut,
  type CoatClock,
  type CoatSurface,
  type GlobeEnv,
  type GlobeFallbackReason,
  type GlobeIn,
  type GlobeOut,
  type GlobeThemeCss,
  type SkinFrame,
} from './globe-protocol';

/** A worker that has not answered `ready` by now (a hung module load, a driver that never links) is given up on. */
export const READY_TIMEOUT_MS = 12000;
/** How long the worker outlives the last unmounted globe, so the hub reopening finds its programs built. */
export const HOST_LINGER_MS = 30000;

export type GlobeHostStatus = 'starting' | 'ready' | 'css';

export interface GlobeHostDeps {
  env: GlobeEnv;
  createWorker(): Worker;
  createCanvas(): HTMLCanvasElement;
  cloneBitmap(src: ImageBitmap): Promise<ImageBitmap>;
  /** The page's `performance.timeOrigin`. */
  timeOrigin: number;
  log(message: string): void;
}

export interface GlobeWorkerHost {
  readonly status: GlobeHostStatus;
  /** Why the page shows the CSS globe (set once `status` is `css`). */
  readonly reason: GlobeFallbackReason | undefined;
  /** The coat's placeholder canvas while a worker owns it; null in the fallback. */
  readonly coatCanvas: HTMLCanvasElement | null;
  /** The coat has drawn its first frame since this worker started. */
  readonly drawn: boolean;
  readonly skinReady: boolean;
  readonly skinFailed: boolean;
  /** Status, drawn and skin changes. Returns the unsubscribe. */
  subscribe(fn: () => void): () => void;
  size(cssPx: number, dpr: number): void;
  theme(theme: GlobeThemeCss): void;
  scene(scene: SharedScene | null): void;
  place(cx: number, cy: number, r: number, dx: number, dy: number): void;
  clock(clock: CoatClock): void;
  surface(surface: CoatSurface): void;
  skinFrame(frame: SkinFrame): void;
  /** Post the newest pending frame (call once per animation frame). */
  flush(): void;
  /**
   * The skin's placeholder canvas, created and transferred on first call; null where there is no skin. `projection`
   * is the globe's `PERSP` and `LENS`, so the skin projects exactly as the cage does.
   */
  skinCanvas(projection: { persp: number; lens: number }): HTMLCanvasElement | null;
  skinSize(span: number, radius: number, dpr: number): void;
  skinTheme(ink: string, accent: string, bg: string): void;
  skinClear(): void;
  dispose(): void;
}

type InitMsg = Extract<GlobeIn, { type: 'init' }>;

export function createGlobeHost(deps: GlobeHostDeps): GlobeWorkerHost {
  let status: GlobeHostStatus = 'starting';
  let reason: GlobeFallbackReason | undefined;
  let worker: Worker | null = null;
  let coat: HTMLCanvasElement | null = null;
  let skin: HTMLCanvasElement | null = null;
  let skinWanted = false;
  let skinReady = false;
  let skinFailed = false;
  let drawn = false;
  let disposed = false;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  const failures = { workerErrors: 0, contextLosses: 0 };
  const listeners = new Set<() => void>();
  const frames = new FrameCoalescer();

  // The latest of each piece of state, replayed into a restarted worker.
  let lastSize: Extract<GlobeIn, { type: 'size' }> | null = null;
  let lastTheme: Extract<GlobeIn, { type: 'theme' }> | null = null;
  let lastPlace: Extract<GlobeIn, { type: 'place' }> | null = null;
  let lastClock: CoatClock | null = null;
  let lastSkinSize: Extract<GlobeIn, { type: 'skin-size' }> | null = null;
  let lastSkinTheme: Extract<GlobeIn, { type: 'skin-theme' }> | null = null;
  let skinPersp = { persp: 1, lens: 0 };
  /** The scene the page has; which version this worker holds; a clone in progress (a generation guards it). */
  let sceneWanted: SharedScene | null = null;
  let sceneSent = -1;
  let sceneGen = 0;
  let fieldSent = -1;

  const notify = () => {
    if (disposed) return;
    for (const fn of [...listeners]) fn();
  };

  const post = (m: GlobeIn, transfer: Transferable[] = []): boolean => {
    if (!worker) return false;
    try {
      worker.postMessage(m, transfer);
      return true;
    } catch {
      fail('worker-error');
      return false;
    }
  };

  const clearReadyTimer = () => {
    if (readyTimer !== null) clearTimeout(readyTimer);
    readyTimer = null;
  };

  /** Stop the current worker and release its canvases (they are dead: a transferred canvas cannot come back). */
  const stopWorker = () => {
    clearReadyTimer();
    const w = worker;
    worker = null;
    if (w) {
      w.onmessage = null;
      w.onerror = null;
      w.onmessageerror = null;
      try {
        w.terminate();
      } catch {
        /* already gone */
      }
    }
    coat?.remove();
    skin?.remove();
    coat = null;
    skin = null;
    skinReady = false;
    drawn = false;
    sceneSent = -1;
    fieldSent = -1;
    sceneGen++;
    frames.reset();
  };

  const fallBack = (why: GlobeFallbackReason) => {
    stopWorker();
    status = 'css';
    reason = why;
    deps.log(`[liquid-globe] CSS glass globe: ${why}`);
    notify();
  };

  const fail = (
    kind: 'ready-failed' | 'worker-error' | 'context-lost' | 'worker-start',
    why?: GlobeFallbackReason,
  ) => {
    if (disposed || status === 'css') return;
    if (kind === 'worker-error') failures.workerErrors++;
    if (kind === 'context-lost') failures.contextLosses++;
    if (afterFailure(kind, failures) === 'fallback') {
      fallBack(why ?? (kind === 'ready-failed' ? 'program' : kind));
      return;
    }
    deps.log(`[liquid-globe] restarting the globe worker after ${kind}`);
    stopWorker();
    start();
    notify();
  };

  const onMessage = (data: unknown) => {
    if (!isGlobeOut(data)) return;
    const m = data as GlobeOut;
    switch (m.type) {
      case 'ready':
        clearReadyTimer();
        if (m.version !== GLOBE_PROTOCOL_VERSION) {
          fail('ready-failed', 'version');
          return;
        }
        if (!m.ok) {
          fail('ready-failed', m.reason);
          return;
        }
        status = 'ready';
        deps.log('[liquid-globe] the globe renders in its worker');
        sendScene();
        notify();
        return;
      case 'drawn':
        if (!drawn) {
          drawn = true;
          notify();
        }
        return;
      case 'ack':
        if (frames.ack(m.seq)) flush();
        return;
      case 'lost':
        fail('context-lost');
        return;
      case 'skin':
        if (m.ok) skinReady = true;
        else {
          skinFailed = true;
          skin?.remove();
          skin = null;
        }
        notify();
        return;
    }
  };

  const transfer = (canvas: HTMLCanvasElement): OffscreenCanvas | null => {
    try {
      return canvas.transferControlToOffscreen();
    } catch {
      return null;
    }
  };

  const startSkin = () => {
    if (!worker || skin || skinFailed) return;
    const canvas = deps.createCanvas();
    canvas.className = 'radial-globe__skin';
    canvas.setAttribute('aria-hidden', 'true');
    const off = transfer(canvas);
    if (!off) {
      skinFailed = true;
      return;
    }
    skin = canvas;
    post({ type: 'skin-init', canvas: off, ...skinPersp }, [off]);
    if (lastSkinSize) post(lastSkinSize);
    if (lastSkinTheme) post(lastSkinTheme);
  };

  const start = () => {
    status = 'starting';
    let w: Worker;
    try {
      w = deps.createWorker();
    } catch {
      fallBack('worker-start');
      return;
    }
    const canvas = deps.createCanvas();
    canvas.className = 'radial-globe__jelly';
    canvas.setAttribute('aria-hidden', 'true');
    const off = transfer(canvas);
    worker = w;
    if (!off) {
      fallBack('no-offscreen');
      return;
    }
    coat = canvas;
    w.onmessage = (e: MessageEvent) => onMessage(e.data);
    w.onerror = () => fail('worker-error');
    w.onmessageerror = () => fail('worker-error');
    const init: InitMsg = {
      type: 'init',
      version: GLOBE_PROTOCOL_VERSION,
      canvas: off,
      timeOrigin: deps.timeOrigin,
      ripple: {
        speed: RIPPLE.speed,
        width: RIPPLE.width,
        amplitude: RIPPLE.amplitude,
        life: RIPPLE.life,
      },
    };
    if (!post(init, [off])) return;
    readyTimer = setTimeout(() => {
      readyTimer = null;
      fail('worker-start');
    }, READY_TIMEOUT_MS);
    // Replay what the page has already said, so a restarted worker draws the same globe.
    if (lastSize) post(lastSize);
    if (lastTheme) post(lastTheme);
    if (lastPlace) post(lastPlace);
    if (lastClock) post({ type: 'clock', clock: lastClock });
    if (skinWanted) startSkin();
  };

  const sendScene = () => {
    if (status !== 'ready' || !worker) return;
    const s = sceneWanted;
    if (!s) {
      if (sceneSent !== -1) {
        sceneSent = -1;
        post({ type: 'scene-off' });
      }
      return;
    }
    if (s.version === sceneSent) return;
    sceneSent = s.version;
    const gen = ++sceneGen;
    const { width, height } = s;
    deps.cloneBitmap(s.bitmap).then(
      (clone) => {
        // A newer picture, a restart or a teardown overtook this clone: it is nobody's, so it is closed here.
        if (gen !== sceneGen || disposed || !worker) {
          clone.close();
          return;
        }
        post({ type: 'scene', bitmap: clone, width, height }, [clone]);
        // Transferred, so this is a no-op on the detached handle; it also releases a clone the post could not take.
        clone.close();
      },
      () => {
        if (gen === sceneGen) sceneSent = -1;
      },
    );
  };

  const flush = () => {
    if (status !== 'ready') return;
    const msg = frames.take();
    if (!msg) return;
    const transferList: Transferable[] = [];
    if (msg.surface?.field) transferList.push(msg.surface.field.buffer);
    post(msg, transferList);
  };

  const env = decideGlobeBackend(deps.env);
  if (env.backend === 'css') fallBack(env.reason ?? 'no-worker');
  else start();

  return {
    get status() {
      return status;
    },
    get reason() {
      return reason;
    },
    get coatCanvas() {
      return status === 'css' ? null : coat;
    },
    get drawn() {
      return drawn;
    },
    get skinReady() {
      return skinReady && status === 'ready';
    },
    get skinFailed() {
      return skinFailed || status === 'css';
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    size(cssPx, dpr) {
      if (lastSize && lastSize.cssPx === cssPx && lastSize.dpr === dpr) return;
      lastSize = { type: 'size', cssPx, dpr };
      post(lastSize);
    },
    theme(theme) {
      if (lastTheme && JSON.stringify(lastTheme.theme) === JSON.stringify(theme)) return;
      lastTheme = { type: 'theme', theme };
      post(lastTheme);
    },
    scene(scene) {
      sceneWanted = scene;
      sendScene();
    },
    place(cx, cy, r, dx, dy) {
      const p = lastPlace;
      if (p && p.cx === cx && p.cy === cy && p.r === r && p.dx === dx && p.dy === dy) return;
      lastPlace = { type: 'place', cx, cy, r, dx, dy };
      post(lastPlace);
    },
    clock(c) {
      if (!clockChanged(lastClock, c)) return;
      lastClock = { ...c };
      post({ type: 'clock', clock: lastClock });
    },
    surface(s) {
      if (status !== 'ready') return;
      // The field is reused by the dough every step: copy it (once per version) so it can be transferred.
      let next: CoatSurface = s;
      if (s.field && s.fieldVersion !== fieldSent) {
        fieldSent = s.fieldVersion;
        next = { ...s, field: s.field.slice() };
      } else if (s.field) {
        next = { ...s, field: undefined };
      }
      frames.pushSurface(next);
    },
    skinFrame(f) {
      if (status !== 'ready' || !skin) return;
      frames.pushSkin(f);
    },
    flush,
    skinCanvas(projection) {
      if (status === 'css' || skinFailed) return null;
      skinPersp = { persp: projection.persp, lens: projection.lens };
      skinWanted = true;
      startSkin();
      return skin;
    },
    skinSize(span, radius, dpr) {
      const s = lastSkinSize;
      if (s && s.span === span && s.radius === radius && s.dpr === dpr) return;
      lastSkinSize = { type: 'skin-size', span, radius, dpr };
      if (skin) post(lastSkinSize);
    },
    skinTheme(ink, accent, bg) {
      const s = lastSkinTheme;
      if (s && s.ink === ink && s.accent === accent && s.bg === bg) return;
      lastSkinTheme = { type: 'skin-theme', ink, accent, bg };
      if (skin) post(lastSkinTheme);
    },
    skinClear() {
      if (skin) post({ type: 'skin-clear' });
    },
    dispose() {
      if (disposed) return;
      stopWorker();
      disposed = true;
      listeners.clear();
    },
  };
}

/* ── One host per page ─────────────────────────────────────────────────────────────────────────────────────────── */

let shared: GlobeWorkerHost | null = null;
let refs = 0;
let lingerTimer: ReturnType<typeof setTimeout> | null = null;
/** A fallback is final for the page: later mounts never try the worker again. */
let finalFallback: GlobeWorkerHost | null = null;

function browserDeps(): GlobeHostDeps {
  const win = window as Window & typeof globalThis;
  const dev = import.meta.env.DEV;
  let forced = false;
  if (dev) {
    try {
      forced = new URLSearchParams(win.location.search).get('globe') === 'css';
    } catch {
      forced = false;
    }
  }
  return {
    env: {
      perfLite: win.document.documentElement.classList.contains('perf-lite'),
      hasWorker: typeof win.Worker === 'function',
      hasOffscreenCanvas: typeof win.OffscreenCanvas === 'function',
      canTransfer:
        typeof win.HTMLCanvasElement?.prototype.transferControlToOffscreen === 'function',
      forced,
    },
    createWorker: () =>
      new Worker(new URL('./globe-worker.ts', import.meta.url), {
        type: 'module',
        name: 'liquid-globe',
      }),
    createCanvas: () => win.document.createElement('canvas'),
    cloneBitmap: (src) => win.createImageBitmap(src),
    timeOrigin: win.performance.timeOrigin,
    // Development only: which material this page got, and why.
    log: dev ? (m) => console.warn(m) : () => {},
  };
}

/**
 * The page's globe host, shared by every mounted globe. Call `release` on unmount; the worker is terminated
 * {@link HOST_LINGER_MS} after the last release unless a globe mounts again.
 */
export function acquireGlobeHost(deps?: GlobeHostDeps): { host: GlobeWorkerHost; release(): void } {
  if (lingerTimer !== null) {
    clearTimeout(lingerTimer);
    lingerTimer = null;
  }
  if (!shared) {
    shared = finalFallback ?? createGlobeHost(deps ?? browserDeps());
  }
  const host = shared;
  refs++;
  let released = false;
  return {
    host,
    release() {
      if (released) return;
      released = true;
      refs = Math.max(0, refs - 1);
      if (refs > 0 || host !== shared) return;
      lingerTimer = setTimeout(() => {
        lingerTimer = null;
        if (refs > 0 || host !== shared) return;
        if (host.status === 'css') finalFallback = host;
        host.dispose();
        shared = null;
      }, HOST_LINGER_MS);
    },
  };
}

/** Tests only: forget the page's host. */
export function resetGlobeHostForTests(): void {
  if (lingerTimer !== null) clearTimeout(lingerTimer);
  lingerTimer = null;
  shared?.dispose();
  shared = null;
  finalFallback = null;
  refs = 0;
}
