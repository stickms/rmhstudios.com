/**
 * The test page for `testing/e2e/eversion-controller.mjs` (T31). Bundled by
 * esbuild for that script only.
 *
 * It runs the REAL controller module (`useEversionController.ts`), the REAL
 * runner, the REAL host in worker mode on a transferred canvas, the REAL
 * renderer (stub shaders) and the REAL timeline. Faked, because they belong to
 * other tasks or to the app: the router (a history-backed object that "renders"
 * a route into `#page` after a delay), the BEFORE scheduler and the capture
 * session (T17 may not have landed; the fakes paint a flat colour so the stub
 * shaders have something to sample), and the two core collaborators that other
 * tasks own (orientation T13, the LUT bake T07) via `fixtureDeps`.
 */

import {
  createDomOverlayPort,
  createEversionController,
  type RouterLike,
} from '../../../components/radial/eversion/useEversionController';
import { getEversionHost, resetEversionHost } from '../../../lib/eversion/gl/host';
import type { CaptureApi, EversionOutcome, GlobeStartState } from '../../../lib/eversion/types';
import { fixtureDeps } from '../eversion-host/deps';

/** Page globals, typed here (module scope) so the two fixtures never collide on `Window`. */
const win = window as unknown as {
  __WORKER_SRC__: string;
  __t: unknown;
  __TSR_ROUTER__?: RouterLike;
};

interface Timed {
  at: number;
  what: string;
  path: string;
}
const trace: Timed[] = [];
const stamp = (what: string) =>
  trace.push({ at: performance.now(), what, path: location.pathname });

/* ── A router that behaves like TanStack's where it matters ─────────────── */

let status: 'idle' | 'pending' = 'idle';
const resolvedListeners = new Set<() => void>();
const ROUTE_RENDER_MS = 120;
const fakeRouter: RouterLike = {
  get state() {
    return { status };
  },
  subscribe(_event: 'onResolved', fn: () => void) {
    resolvedListeners.add(fn);
    return () => resolvedListeners.delete(fn);
  },
  navigate({ to }: { to: string }) {
    // Exactly what TanStack does: the URL changes synchronously, the route
    // renders later, and the promise resolves once it has.
    history.pushState(null, '', to);
    stamp('navigate');
    status = 'pending';
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const page = document.getElementById('page')!;
        page.textContent = `route ${to}`;
        page.dataset.route = to;
        status = 'idle';
        stamp('route-rendered');
        for (const l of [...resolvedListeners]) l();
        resolve();
      }, ROUTE_RENDER_MS);
    });
  },
};
win.__TSR_ROUTER__ = fakeRouter;

/* ── Fake capture: a flat colour per phase ─────────────────────────────── */

function flatBitmap(colour: string): Promise<ImageBitmap> {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 40;
  const g = c.getContext('2d')!;
  g.fillStyle = colour;
  g.fillRect(0, 0, 64, 40);
  return createImageBitmap(c);
}

const captureSeen: { settle: boolean; cover: boolean; at: number }[] = [];
const fakeCapture: CaptureApi = {
  async createSession() {},
  async captureViewport() {
    captureSeen.push({
      settle: document.documentElement.hasAttribute('data-eversion-settle'),
      cover: document.documentElement.classList.contains('eversion-cover'),
      at: performance.now(),
    });
    await new Promise((r) => setTimeout(r, 30));
    return { bitmap: await flatBitmap('#2060d0'), width: 64, height: 40, scale: 1, durationMs: 30 };
  },
  dispose() {},
};

let beforeMode: 'ok' | 'missing' = 'ok';
let afterMode: 'ok' | 'throw' = 'ok';
const beforeCapture = {
  isEligible: () => true,
  ineligibleReason: () => null,
  getCapture: (): CaptureApi | null =>
    afterMode === 'throw'
      ? {
          async createSession() {},
          async captureViewport() {
            throw new Error('injected AFTER failure');
          },
          dispose() {},
        }
      : fakeCapture,
  awaitBefore: async () => (beforeMode === 'missing' ? null : flatBitmap('#d04020')),
};

/* ── Observers: the cover class, the overlay element ───────────────────── */

let coverOn = false;
new MutationObserver(() => {
  const on = document.documentElement.classList.contains('eversion-cover');
  if (on !== coverOn) {
    coverOn = on;
    stamp(on ? 'cover-class-on' : 'cover-class-off');
  }
}).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

let overlaySeen = 0;
new MutationObserver(() => {
  if (document.querySelector('.eversion-overlay')) overlaySeen++;
}).observe(document.body, { childList: true, subtree: true });

/* ── Setup and runs ────────────────────────────────────────────────────── */

let controller: ReturnType<typeof createEversionController> | null = null;

const GLOBE = (): GlobeStartState => ({
  yaw: 20,
  pitch: -10,
  yawVel: 30,
  pitchVel: 0,
  centre: [innerWidth / 2, innerHeight / 2],
  radius: Math.min(innerWidth, innerHeight) * 0.3,
});

const api = {
  async setup() {
    resetEversionHost();
    // Create the singleton with fixture deps and a Blob worker BEFORE the controller asks for it.
    getEversionHost({
      coreDeps: fixtureDeps(),
      createWorker: () => {
        const url = URL.createObjectURL(
          new Blob([win.__WORKER_SRC__], { type: 'text/javascript' }),
        );
        return new Worker(url);
      },
    });
    controller = createEversionController(
      {
        router: fakeRouter,
        beforeCapture,
        translate: (key, o) => o?.defaultValue ?? key,
        getOrbRect: () => ({ cx: innerWidth - 40, cy: 40, radius: 20 }),
      },
      { overlay: createDomOverlayPort() },
    );
    // The hub warms the host while it is open; this fixture has no hub. A run
    // released before the host is ready is (correctly) a `host-not-ready` fallback.
    const hostReady = await controller.warmHost();
    return { slots: window.__eversion?.slots() ?? [], hostReady };
  },

  inject(opts: { before?: 'ok' | 'missing'; after?: 'ok' | 'throw' }) {
    if (opts.before) beforeMode = opts.before;
    if (opts.after) afterMode = opts.after;
  },

  /**
   * One run toward `href`. `ffAfterCoverMs` presses a key that long after the
   * cover mark. Resolves with the outcome and the whole trace.
   */
  async run(href: string, opts: { ffAfterCoverMs?: number } = {}) {
    trace.length = 0;
    captureSeen.length = 0;
    performance.clearMarks();
    overlaySeen = 0;
    let ffAt: number | null = null;
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.name === 'eversion:cover' && opts.ffAfterCoverMs != null) {
          setTimeout(() => {
            ffAt = performance.now();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
          }, opts.ffAfterCoverMs);
        }
      }
    });
    po.observe({ type: 'mark', buffered: true });
    const t0 = performance.now();
    const outcome: EversionOutcome = await controller!.start(
      { id: 'x', href, tKey: 'x', label: href, icon: undefined as never },
      GLOBE(),
      'click',
    );
    const end = performance.now();
    po.disconnect();
    const marks = performance
      .getEntriesByType('mark')
      .filter((m) => m.name.startsWith('eversion:'))
      .map((m) => ({
        name: m.name,
        at: m.startTime,
        detail: (m as PerformanceMark).detail as unknown,
      }));
    return {
      outcome,
      marks,
      trace: [...trace],
      captureSeen: [...captureSeen],
      overlayAfter: !!document.querySelector('.eversion-overlay'),
      overlaySeen,
      coverAfter: document.documentElement.classList.contains('eversion-cover'),
      settleAfter: document.documentElement.hasAttribute('data-eversion-settle'),
      pathAfter: location.pathname,
      t0,
      end,
      ffAt,
      state: controller!.state(),
    };
  },

  async debugSlot() {
    const slot = window.__eversion?.controller;
    if (!slot) return null;
    const before = slot.state();
    const outcome = await slot.startTo('/debug-target');
    return { before, outcome, after: slot.state() };
  },
};

win.__t = api;
