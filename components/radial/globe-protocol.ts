/**
 * The liquid globe's worker protocol: every message between the page (`globe-worker-host.ts`) and the worker that owns
 * the globe's GPU work (`globe-worker.ts`), plus the two decisions both sides depend on — how input is coalesced on the
 * way in, and when the page gives up on the worker and shows the CSS glass globe instead.
 *
 * Why a worker at all: the coat and the self-eversion skin are WebGL 2. On the main thread every frame they drew had to
 * leave the GL context through the page's own thread (`GLES2::ReadPixels` and `CommandBufferHelper::Finish` on
 * `CrRendererMain` in a Chromium trace: the page waiting for the GPU), so a slow GPU or a software rasteriser slowed the
 * whole site. Here the page transfers each canvas once (`transferControlToOffscreen`) and from then on only posts small
 * messages; the worker renders, and the browser presents its frames without the page.
 *
 * Pure: no DOM, no worker globals. Unit-tested (`__tests__/globe-protocol.test.ts`).
 */

/**
 * Bumped whenever a message changes shape. The worker refuses an `init` from a different version. 2 (2026-11-08): the
 * clock's `held` became `engaged` (engaged WITH THE GLOBE, `globe-engagement.ts`) and `engagedUntil` the end of its
 * short settle; an `ack` may hand a dough-field buffer back.
 */
export const GLOBE_PROTOCOL_VERSION = 2;

/** The ripple's shape, as `lib/fluid` §RIPPLE gives it. */
export interface GlobeRippleShape {
  speed: number;
  width: number;
  amplitude: number;
  life: number;
}

/**
 * The theme, as the page's `getComputedStyle` returns it: colour STRINGS (resolved to numbers in the worker, so the
 * page never reads a canvas back to learn a colour) and the few numeric tokens. Read once per theme change.
 */
export interface GlobeThemeCss {
  /** The stage's `color` (the ink the cage and coat are shaded in). */
  ink: string;
  bg: string;
  accent: string;
  haze: string;
  edgeR: string;
  edgeG: string;
  edgeB: string;
  fresnel: string;
  hazePane: number;
  quiet: number;
  bevelPx: number;
  disperseRPx: number;
  disperseBPx: number;
  /** Plasma alpha at level 1, `PLASMA_LOOK.peakLight` / `peakDark` (the worker picks by the ground's luminance). */
  plasmaPeakLight: number;
  plasmaPeakDark: number;
}

/** The surface state the coat redraws for: what changes only while someone is touching the ball. */
export interface CoatSurface {
  /** Up to three ripples (x, y, z, age s) in the coat's screen space; a negative age is an empty slot. */
  ripples: number[];
  gx: number;
  gy: number;
  pinch: number;
  /** The dough field, only when it changed since the last one sent (`fieldVersion`). */
  field?: Float32Array;
  fieldVersion: number;
}

/** One frame of the self-eversion skin: the eversion parameter, the drawn rotation (row-major 3×3) and the bulge fit. */
export interface SkinFrame {
  e: number;
  m: number[];
  fit: number;
}

/**
 * What the coat's own clock may do (the jelly ambient clock, `lib/jelly/tiers.ts`), sent only when it changes. The
 * worker runs the haze and eases the plasma itself, so a globe at rest posts nothing at all. The rate follows
 * `engagedRate` (`globe-engagement.ts`), the same rule the page's frame loop uses: the page posts the engaged EDGES
 * (pointer arriving at or leaving the globe, a press, keyboard focus), never window-wide input timestamps.
 */
export interface CoatClock {
  /** Engaged and idle-floor tick rates; 0 = no ambient motion (Still, degraded, rehearsal). */
  hz: number;
  idleHz: number;
  /** Haze amplitude: 1 lively, `CALM.amplitude` calm, 0 still. */
  amp: number;
  /** On screen, tab visible and focused: the clock may tick. */
  active: boolean;
  /** Engaged with the globe right now (a pointer over or near it, a press/drag/hold, keyboard focus in the dock or hub). */
  engaged: boolean;
  /**
   * Page `performance.now()` until which the clock keeps the engaged rate after `engaged` went false (the settle,
   * `GLOBE_SETTLE_MS`); 0 while engaged. It changes only on an edge.
   */
  engagedUntil: number;
  /** The plasma level the worker eases toward (`PLASMA.rest` / `wake` / `press`). */
  plasma: number;
  /** Plasma easing time constant, ms. */
  plasmaEaseMs: number;
  /** The hub's eversion hand-off owns the GPU: hold the coat still. */
  frozen: boolean;
}

export type GlobeIn =
  | {
      type: 'init';
      version: number;
      canvas: OffscreenCanvas;
      /** The page's `performance.timeOrigin`, so the worker's clock can land on the page's ambient tick grid. */
      timeOrigin: number;
      ripple: GlobeRippleShape;
    }
  | { type: 'size'; cssPx: number; dpr: number }
  | { type: 'theme'; theme: GlobeThemeCss }
  | { type: 'scene'; bitmap: ImageBitmap; width: number; height: number }
  | { type: 'scene-off' }
  | { type: 'place'; cx: number; cy: number; r: number; dx: number; dy: number }
  | { type: 'clock'; clock: CoatClock }
  | { type: 'frame'; seq: number; surface?: CoatSurface; skin?: SkinFrame }
  | { type: 'skin-init'; canvas: OffscreenCanvas; persp: number; lens: number }
  | { type: 'skin-size'; span: number; radius: number; dpr: number }
  | { type: 'skin-theme'; ink: string; accent: string; bg: string }
  | { type: 'skin-clear' };

export type GlobeFailReason = 'no-webgl2' | 'program' | 'version';

export type GlobeOut =
  | { type: 'ready'; version: number; ok: true }
  | { type: 'ready'; version: number; ok: false; reason: GlobeFailReason }
  /** The coat's first frame is on its canvas: the page may fade it in over the CSS glass. */
  | { type: 'drawn' }
  /**
   * Frame `seq` (and everything before it) has been taken. `field` is the last dough-field buffer the worker uploaded,
   * transferred back so the page reuses it for the next version instead of allocating a copy.
   */
  | { type: 'ack'; seq: number; field?: Float32Array }
  /** The coat's context is gone. The canvases are dead; the page restarts the worker or falls back. */
  | { type: 'lost' }
  | { type: 'skin'; ok: boolean };

/** Narrow an unknown worker message to {@link GlobeOut}; anything else is ignored. */
export function isGlobeOut(m: unknown): m is GlobeOut {
  if (!m || typeof m !== 'object') return false;
  const t = (m as { type?: unknown }).type;
  return t === 'ready' || t === 'drawn' || t === 'ack' || t === 'lost' || t === 'skin';
}

const GLOBE_IN_TYPES = new Set<string>([
  'init',
  'size',
  'theme',
  'scene',
  'scene-off',
  'place',
  'clock',
  'frame',
  'skin-init',
  'skin-size',
  'skin-theme',
  'skin-clear',
]);

/** Narrow an unknown page message to {@link GlobeIn}: the worker ignores null, non-objects and unknown types. */
export function isGlobeIn(m: unknown): m is GlobeIn {
  if (!m || typeof m !== 'object') return false;
  const t = (m as { type?: unknown }).type;
  return typeof t === 'string' && GLOBE_IN_TYPES.has(t);
}

/* ── Back-pressure ──────────────────────────────────────────────────────────────────────────────────────────────────
   The page pushes at most one frame per animation frame (LiquidGlobe's loop flushes once per frame), and only while
   something on the ball is moving. If the worker falls behind — a slow GPU, software GL — the page must not queue
   frames for it: it keeps ONLY the newest state, and posts it once the worker has taken one of the frames in flight.
   So a slow globe drops its own stale frames and never builds a backlog the page pays to serialise. */

/** Frames the page lets the worker be behind before it holds the newest one back. */
export const MAX_FRAMES_IN_FLIGHT = 2;

export class FrameCoalescer {
  private surface: CoatSurface | undefined;
  private skin: SkinFrame | undefined;
  private seq = 0;
  private acked = 0;
  /** Frames replaced before they were posted (diagnostics, tests). */
  dropped = 0;

  /** The newest coat surface. A field that has not been posted yet survives a newer surface without one. */
  pushSurface(s: CoatSurface): void {
    const prev = this.surface;
    if (prev) {
      this.dropped++;
      if (!s.field && prev.field) {
        s = { ...s, field: prev.field, fieldVersion: prev.fieldVersion };
      }
    }
    this.surface = s;
  }

  pushSkin(f: SkinFrame): void {
    if (this.skin) this.dropped++;
    this.skin = f;
  }

  get pending(): boolean {
    return this.surface !== undefined || this.skin !== undefined;
  }

  get inFlight(): number {
    return this.seq - this.acked;
  }

  /** The frame message to post now, or null (nothing pending, or the worker is too far behind). */
  take(): Extract<GlobeIn, { type: 'frame' }> | null {
    if (!this.pending || this.inFlight >= MAX_FRAMES_IN_FLIGHT) return null;
    const msg: Extract<GlobeIn, { type: 'frame' }> = { type: 'frame', seq: ++this.seq };
    if (this.surface) msg.surface = this.surface;
    if (this.skin) msg.skin = this.skin;
    this.surface = undefined;
    this.skin = undefined;
    return msg;
  }

  /** The worker took frame `seq`. Returns whether a held-back frame may now be posted. */
  ack(seq: number): boolean {
    if (seq > this.acked && seq <= this.seq) this.acked = seq;
    return this.pending && this.inFlight < MAX_FRAMES_IN_FLIGHT;
  }

  /** A new worker: nothing is in flight, nothing pending is meaningful to it. */
  reset(): void {
    this.surface = undefined;
    this.skin = undefined;
    this.seq = 0;
    this.acked = 0;
  }
}

/** Two clock states differ enough to post. `engagedUntil` only counts when it moves by more than `slackMs`. */
export function clockChanged(a: CoatClock | null, b: CoatClock, slackMs = 500): boolean {
  if (!a) return true;
  return (
    a.hz !== b.hz ||
    a.idleHz !== b.idleHz ||
    a.amp !== b.amp ||
    a.active !== b.active ||
    a.engaged !== b.engaged ||
    a.plasma !== b.plasma ||
    a.plasmaEaseMs !== b.plasmaEaseMs ||
    a.frozen !== b.frozen ||
    Math.abs(a.engagedUntil - b.engagedUntil) > slackMs
  );
}

/* ── The fallback decision ──────────────────────────────────────────────────────────────────────────────────────────
   Made once per page load, re-made only when the worker fails. Where a worker cannot own a WebGL 2 context the globe
   is the CSS glass globe a software-rendering browser keeps — never GL on the page's thread. */

export type GlobeBackend = 'worker' | 'css';

export type GlobeFallbackReason =
  | 'software-render'
  | 'no-worker'
  | 'no-offscreen'
  | 'forced'
  | 'worker-start'
  | GlobeFailReason
  | 'worker-error'
  | 'context-lost';

export interface GlobeEnv {
  /** The browser rasterises in software (`softRenderDetected()`, `lib/low-end.ts`): a second GL context is not worth it. */
  softRender: boolean;
  hasWorker: boolean;
  hasOffscreenCanvas: boolean;
  canTransfer: boolean;
  /** A development switch (`?globe=css`) forcing the fallback. */
  forced?: boolean;
}

/** Restarts after a crashed worker (a failed module load, an uncaught error) before the page gives up. */
export const MAX_WORKER_ERRORS = 1;
/** Context losses survived (each one restarts the worker with fresh canvases) before the page gives up. */
export const MAX_CONTEXT_LOSSES = 2;

/** Whether this page can try the worker at all. */
export function decideGlobeBackend(env: GlobeEnv): {
  backend: GlobeBackend;
  reason?: GlobeFallbackReason;
} {
  if (env.forced) return { backend: 'css', reason: 'forced' };
  if (env.softRender) return { backend: 'css', reason: 'software-render' };
  if (!env.hasWorker) return { backend: 'css', reason: 'no-worker' };
  if (!env.hasOffscreenCanvas || !env.canTransfer)
    return { backend: 'css', reason: 'no-offscreen' };
  return { backend: 'worker' };
}

export interface GlobeFailures {
  workerErrors: number;
  contextLosses: number;
}

/**
 * After a failure, whether to start a fresh worker or fall back for the rest of the page. A worker that answered
 * `ready` with `ok: false` (no WebGL 2 in workers here, a program the driver will not build, a version mismatch) is
 * final: the next worker would meet the same driver.
 */
export function afterFailure(
  kind: 'ready-failed' | 'worker-error' | 'context-lost' | 'worker-start',
  failures: GlobeFailures,
): 'restart' | 'fallback' {
  if (kind === 'ready-failed' || kind === 'worker-start') return 'fallback';
  if (kind === 'worker-error')
    return failures.workerErrors <= MAX_WORKER_ERRORS ? 'restart' : 'fallback';
  return failures.contextLosses <= MAX_CONTEXT_LOSSES ? 'restart' : 'fallback';
}
