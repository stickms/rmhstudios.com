/**
 * The test page's script for `testing/e2e/eversion-host.mjs` (T25). Bundled by
 * esbuild for that script only. It drives the REAL `getEversionHost` the way the
 * controller (T31) will: init with a DOM canvas, prime, textures, start, answer
 * `unwrap-done` with `reveal`, wait for `done`.
 *
 * `window.__WORKER_SRC__` carries the bundled worker entry (`worker.ts`);
 * the page turns it into a Blob URL, which stands in for the URL Vite rewrites
 * `new URL('./worker.ts', import.meta.url)` to in the app.
 */

import { getEversionHost, resetEversionHost, detectHostMode } from '../../../lib/eversion/gl/host';
import type { EversionHost } from '../../../lib/eversion/types';
import type {
  FromWorker,
  HostMode,
  Rgba,
  ThemeColours,
  ToWorker,
} from '../../../lib/eversion/types';
import { fixtureDeps, identityLut } from './deps';

declare global {
  interface Window {
    __WORKER_SRC__: string;
    __t: typeof api;
  }
}

const VIEW = { w: 320, h: 200, dpr: 1 } as const;
const BEFORE: Rgba = [0.9, 0.2, 0.1, 1];
const AFTER: Rgba = [0.1, 0.4, 0.9, 1];
const CLEAR: Rgba = [0, 0, 0, 0];
const colours: ThemeColours = {
  bg: [1, 1, 1, 1],
  veil: [0.05, 0.05, 0.05, 1],
  accent: [0.5, 0.5, 0.5, 1],
  cageMinor: CLEAR,
  cageParallel: CLEAR,
  cageMajor: CLEAR,
  cageRipple: CLEAR,
  cageWidth: 1,
};

let host: EversionHost | null = null;
let worker: Worker | null = null;
let log: { at: number; m: FromWorker }[] = [];
let hiddenFlag = false;
let rafCalls = 0;
const mainFrameTimes: number[] = [];
let nextId = 1_000_000;
const waiting = new Map<number, (m: Extract<FromWorker, { type: 'debug-result' }>) => void>();

Object.defineProperty(document, 'hidden', { configurable: true, get: () => hiddenFlag });
const realRaf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb) => {
  rafCalls++;
  return realRaf((now) => {
    mainFrameTimes.push(performance.timeOrigin + performance.now());
    cb(now);
  });
};

function post(message: ToWorker, transfer?: Transferable[]) {
  host!.post(message, transfer);
}

function debug(command: Extract<ToWorker, { type: 'debug' }>['command']) {
  const id = nextId++;
  return new Promise<unknown>((resolve, reject) => {
    waiting.set(id, (m) => (m.ok ? resolve(m.value) : reject(new Error(String(m.value)))));
    post({ type: 'debug', id, command });
  });
}

async function bitmap(colour: string): Promise<ImageBitmap> {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = colour;
  g.fillRect(0, 0, 4, 4);
  return createImageBitmap(c);
}

const api = {
  /** Fresh host in `mode` (or the detected one) on a fresh canvas; init + prime + textures. */
  async setup(mode: HostMode | null) {
    resetEversionHost();
    worker?.terminate();
    worker = null;
    log = [];
    hiddenFlag = false;
    document.querySelectorAll('canvas').forEach((c) => c.remove());
    if (mode) detectHostMode(mode);
    host = getEversionHost({
      coreDeps: fixtureDeps(),
      createWorker: () => {
        const url = URL.createObjectURL(
          new Blob([window.__WORKER_SRC__], { type: 'text/javascript' }),
        );
        worker = new Worker(url);
        return worker;
      },
    });
    host.subscribe((m) => {
      if (m.type === 'debug-result') waiting.get(m.id)?.(m);
      log.push({ at: performance.now(), m });
    });
    const canvas = document.createElement('canvas');
    canvas.width = VIEW.w;
    canvas.height = VIEW.h;
    document.body.appendChild(canvas);
    post({ type: 'init', canvas, tier: 'low', dprCap: 1 });
    post({
      type: 'prime',
      projection: 'equirect',
      viewport: { ...VIEW },
      globe: {
        yaw: 0,
        pitch: 0,
        yawVel: 0,
        pitchVel: 0,
        centre: [VIEW.w / 2, VIEW.h / 2],
        radius: 70,
      },
      orb: { cx: 20, cy: 20, radius: 10 },
      colours,
      lut: identityLut(),
    });
    // A real bitmap for each slot: the AFTER one is what opens the timeline's gate.
    post({ type: 'texture', slot: 'before', bitmap: await bitmap('#e63319') });
    post({ type: 'texture', slot: 'after', bitmap: await bitmap('#1966e6') });
    await new Promise((r) => setTimeout(r, 100));
    return {
      mode: host.mode,
      ready: log.some((e) => e.m.type === 'ready'),
      slots: window.__eversion?.slots() ?? [],
    };
  },

  /**
   * Start a run and resolve at `done`. As the controller does, answer
   * `unwrap-done` with `reveal`. `fastForward` shortens the run; `busyAt` blocks
   * the main thread for `busyMs` that many ms after start.
   */
  run(options: { fastForward?: boolean; busyAt?: number; busyMs?: number } = {}) {
    return new Promise<{
      stages: string[];
      types: string[];
      stats: { frames: number; dropped: number; p95: number } | null;
      error: string | null;
      mainBlockedMs: number;
      busyWindow: [number, number] | null;
    }>((resolve) => {
      let blocked = 0;
      let busyWindow: [number, number] | null = null;
      const unsubscribe = host!.subscribe((m) => {
        if (m.type === 'unwrap-done') post({ type: 'reveal' });
        if (m.type === 'done' || (m.type === 'error' && m.fatal) || m.type === 'context-lost') {
          unsubscribe();
          const mine = log.map((e) => e.m);
          resolve({
            stages: mine.flatMap((x) => (x.type === 'stage' ? [x.stage] : [])),
            types: mine.map((x) => x.type),
            stats: m.type === 'done' ? { frames: m.frames, dropped: m.dropped, p95: m.p95 } : null,
            error: m.type === 'error' ? m.message : null,
            mainBlockedMs: blocked,
            busyWindow,
          });
        }
      });
      post({ type: 'start', t0: performance.now() });
      if (options.fastForward) post({ type: 'fast-forward' });
      if (options.busyAt !== undefined) {
        setTimeout(() => {
          const t = performance.now();
          while (performance.now() - t < (options.busyMs ?? 300));
          blocked = performance.now() - t;
          busyWindow = [performance.timeOrigin + t, performance.timeOrigin + t + blocked];
        }, options.busyAt);
      }
    });
  },

  loop: () =>
    debug({ op: 'loop' }) as Promise<{
      running: boolean;
      hidden: boolean;
      pending: number;
      requests: number;
      frames: number;
    }>,

  /** rAF requests made by the worker, counted from outside the core. */
  workerSpy(): Promise<{ count: number; times: number[] }> {
    return new Promise((resolve) => {
      const onMessage = (e: MessageEvent) => {
        const d = e.data as { __spy?: number; times?: number[] };
        if (d.__spy === undefined) return;
        worker!.removeEventListener('message', onMessage);
        resolve({ count: d.__spy, times: d.times ?? [] });
      };
      worker!.addEventListener('message', onMessage);
      worker!.postMessage({ __spy: true });
    });
  },
  /** Main-thread frame callback times (absolute), the in-thread control for the busy window. */
  mainFrameTimes: () => mainFrameTimes.splice(0),
  mainRaf: () => rafCalls,

  setHidden(hidden: boolean) {
    hiddenFlag = hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  },
  stagesSoFar: () => log.flatMap((e) => (e.m.type === 'stage' ? [e.m.stage] : [])),
  hostDebug() {
    const h = window.__eversion?.host;
    return h ? { mode: h.mode(), pending: h.pendingFrames(), stats: h.lastStats() } : null;
  },
  centre() {
    const c = document.querySelector('canvas')!;
    return { w: c.width, h: c.height };
  },
  BEFORE,
  AFTER,
};

window.__t = api;
