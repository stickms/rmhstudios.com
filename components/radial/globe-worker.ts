/// <reference lib="webworker" />
/**
 * The liquid globe's worker: it owns everything GPU the globe draws — the coat (`jelly-glass.ts`) and the
 * self-eversion skin (`self-evert-skin.ts`), each a WebGL 2 context on an `OffscreenCanvas` the page transferred — and
 * the coat's own frame loop (the haze on the jelly ambient clock, the plasma easing). The page posts small messages
 * (`globe-protocol.ts`) and never waits on this thread; a slow GPU or a software rasteriser slows the globe only.
 *
 * - **Frames.** Everything that arrives between two frames is merged, newest wins, and drawn once in the next animation
 *   frame of this worker (`requestAnimationFrame` where workers have it, else a 16 ms timer), so a GPU that falls
 *   behind drops stale frames instead of queueing them. Each frame acknowledges the newest input it took, which is
 *   what lets the page hold back (rather than queue) while this worker is behind.
 * - **The clock.** The haze advances on the same ambient tick grid as the page (`lib/jelly/ambient-tick.ts`, expressed
 *   in the page's `performance.now()` through the two time origins): the engaged rate while someone is there, the idle
 *   floor after, nothing when the page says the clock is inactive (Still, a degraded tier, hidden, unfocused, off
 *   screen). With nothing moving and no tick coming, nothing is scheduled at all.
 * - **Colours** arrive as computed-style strings and are parsed here (`lib/liquid/glass/color.ts`); a format the parser
 *   does not know is resolved through a 1×1 2D `OffscreenCanvas` on THIS thread, never on the page's.
 *
 * No DOM access: this file runs in a dedicated worker.
 */
import { parseColor, type RGBA } from '@/lib/liquid/glass/color';
import { ambientTickDue, msToAmbientTick } from '@/lib/jelly/ambient-tick';
import { JellyGlass, type JellyFrame, type JellyRGBA } from './jelly-glass';
import { SelfEvertSkin } from './self-evert-skin';
import {
  GLOBE_PROTOCOL_VERSION,
  type CoatClock,
  type CoatSurface,
  type GlobeIn,
  type GlobeOut,
  type GlobeRippleShape,
  type GlobeThemeCss,
  type SkinFrame,
} from './globe-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: GlobeOut) => scope.postMessage(m);

/* ── Colours ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

let probe: OffscreenCanvasRenderingContext2D | null | undefined;
/** Any CSS colour to 0..1 RGBA: parsed when the engine returned rgb()/color(srgb)/hex, else drawn on this thread. */
function colour(css: string, fallback: RGBA): RGBA {
  const parsed = parseColor(css);
  if (parsed) return parsed;
  try {
    if (probe === undefined) {
      probe =
        typeof OffscreenCanvas === 'function'
          ? new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })
          : null;
    }
    if (!probe) return fallback;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = 'rgba(0,0,0,0)';
    probe.fillStyle = css;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    const a = d[3]! / 255;
    return a <= 0 ? [0, 0, 0, 0] : [d[0]! / 255, d[1]! / 255, d[2]! / 255, a];
  } catch {
    return fallback;
  }
}
const rgb = (c: RGBA): [number, number, number] => [c[0], c[1], c[2]];
const lum = (c: RGBA) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/* ── State ────────────────────────────────────────────────────────────────────────────────────────────────────────── */

let coat: JellyGlass | null = null;
let coatReady = false;
let skin: SelfEvertSkin | null = null;
let skinReported = false;
let ripple: GlobeRippleShape = { speed: 3.4, width: 0.34, amplitude: 0.055, life: 1.15 };
/** Page `timeOrigin` − this worker's: add to a worker timestamp to get the page's `performance.now()`. */
let toPage = 0;
let theme: GlobeThemeCss | null = null;
let size: { cssPx: number; dpr: number } | null = null;
let place: { cx: number; cy: number; r: number; dx: number; dy: number } | null = null;
let scene: { bitmap: ImageBitmap; width: number; height: number; version: number } | null = null;
let sceneVersion = 0;
let clock: CoatClock | null = null;
let surface: CoatSurface | null = null;
let skinFrame: SkinFrame | null = null;
let skinClear = false;
let ackSeq = 0;
let ackSent = 0;
let firstDrawn = false;

/** What the next coat frame must re-send to the program. */
const dirty = { size: false, theme: false, scene: false, place: false, surface: false };
const frame: JellyFrame = {
  ripples: new Float32Array(12),
  gx: 0,
  gy: 0,
  pinch: 0,
  time: 0,
  amp: 0,
  plasma: 0,
};
for (let i = 3; i < 12; i += 4) frame.ripples[i] = -1;
/** The last drawn surface was moving (a ripple, the dough), so the frame it comes to rest on is drawn too. */
let lastTick = 0;
let lastFrameAt = 0;

/* ── The loop ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

const hasRaf = typeof scope.requestAnimationFrame === 'function';
let timerId: ReturnType<typeof setTimeout> | 0 = 0;
let scheduled = false;

const requestFrame = () => {
  if (scheduled) return;
  scheduled = true;
  if (timerId) {
    clearTimeout(timerId);
    timerId = 0;
  }
  if (hasRaf) scope.requestAnimationFrame(onFrame);
  else timerId = setTimeout(() => onFrame(performance.now()), 16);
};

const sleepUntil = (ms: number) => {
  if (timerId) clearTimeout(timerId);
  timerId = setTimeout(
    () => {
      timerId = 0;
      requestFrame();
    },
    Math.max(0, ms),
  );
};

/** The ambient tick rate right now, in the page's time. */
function tickHz(pageNow: number): number {
  const c = clock;
  if (!c || !c.active || c.frozen || c.hz <= 0) return 0;
  return c.held || pageNow < c.engagedUntil ? c.hz : c.idleHz;
}

function applyCoatState(g: JellyGlass): void {
  if (dirty.size) {
    if (size) g.resize(size.cssPx, size.dpr);
    dirty.size = false;
  }
  if (dirty.theme && theme) {
    const t = theme;
    const ink = colour(t.ink, [0, 0, 0, 1]);
    const bg = colour(t.bg, [1, 1, 1, 1]);
    const haze = colour(t.haze, [0.9, 0.9, 0.95, 1]);
    const light = lum(bg) > 0.5;
    const rgba = (css: string, fb: JellyRGBA): JellyRGBA => colour(css, fb);
    g.palette(
      {
        ink: rgb(ink),
        light: light ? 1 : 0,
        bg: rgb(bg),
        accent: rgb(colour(t.accent, [0.16, 0.6, 1, 1])),
        haze: [haze[0], haze[1], haze[2], t.hazePane],
        quiet: t.quiet,
        edgeR: rgba(t.edgeR, [1, 0.33, 0.41, 0.16]),
        edgeG: rgba(t.edgeG, [0.25, 0.78, 0.55, 0.08]),
        edgeB: rgba(t.edgeB, [0.28, 0.47, 1, 0.16]),
        fresnel: rgba(t.fresnel, [1, 1, 1, 0.55]),
        bevelPx: t.bevelPx,
        disperseRPx: t.disperseRPx,
        disperseBPx: t.disperseBPx,
        plasmaPeak: light ? t.plasmaPeakLight : t.plasmaPeakDark,
      },
      ripple,
    );
  }
  dirty.theme = false;
  if (dirty.scene) {
    g.setScene(scene);
    dirty.scene = false;
  }
  if (dirty.place) {
    if (place) g.place(place.cx, place.cy, place.r, place.dx, place.dy);
    dirty.place = false;
  }
  if (dirty.surface && surface) {
    const s = surface;
    for (let i = 0; i < 12; i++) frame.ripples[i] = s.ripples[i] ?? (i % 4 === 3 ? -1 : 0);
    frame.gx = s.gx;
    frame.gy = s.gy;
    frame.pinch = s.pinch;
    if (s.field) g.setField(s.field, s.fieldVersion);
  }
  dirty.surface = false;
}

function onFrame(now: number): void {
  scheduled = false;
  const dt = lastFrameAt ? Math.min(0.05, (now - lastFrameAt) / 1000) : 1 / 60;
  lastFrameAt = now;
  const pageNow = now + toPage;

  // The skin draws whatever the page last asked of it; it is the run's only GPU work.
  if (skin?.ready) {
    if (skinFrame) {
      skin.render(skinFrame.e, skinFrame.m, skinFrame.fit);
      skinFrame = null;
    } else if (skinClear) {
      skin.clear();
    }
    skinClear = false;
  }

  let draw = false;
  let moving = false;
  const g = coat;
  if (g && coatReady && !g.isLost && !clock?.frozen) {
    if (dirty.size || dirty.theme || dirty.scene || dirty.place || dirty.surface) draw = true;
    applyCoatState(g);
    // The haze clock only runs while it is being drawn, so a pause (Still, a hidden tab) resumes in place.
    const hz = tickHz(pageNow);
    if (hz <= 0) lastTick = 0;
    else if (ambientTickDue(pageNow, lastTick, hz)) {
      frame.time += lastTick > 0 ? Math.min(0.25, (pageNow - lastTick) / 1000) : 1 / hz;
      lastTick = pageNow;
      draw = true;
    }
    frame.amp = clock ? clock.amp : 0;
    const target = clock ? clock.plasma : 0;
    if (frame.plasma !== target) {
      const k = 1 - Math.exp((-dt * 1000) / (clock?.plasmaEaseMs ?? 180));
      const next = frame.plasma + (target - frame.plasma) * k;
      frame.plasma = Math.abs(target - next) < 0.004 ? target : next;
      draw = true;
      moving = frame.plasma !== target;
    }
    if (draw) {
      g.render(frame);
      if (!firstDrawn) {
        firstDrawn = true;
        post({ type: 'drawn' });
      }
    }
  }

  if (ackSeq !== ackSent) {
    ackSent = ackSeq;
    post({ type: 'ack', seq: ackSeq });
  }

  if (moving) {
    requestFrame();
    return;
  }
  const wait = msToAmbientTick(pageNow, tickHz(pageNow));
  if (clock && clock.active && !clock.held && pageNow < clock.engagedUntil) {
    // The engaged window ends between ticks: wake for the idle rate's grid after it.
    sleepUntil(Math.min(wait, clock.engagedUntil - pageNow + 1));
  } else if (wait !== Infinity) sleepUntil(wait);
}

/* ── Messages ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

function start(m: Extract<GlobeIn, { type: 'init' }>): void {
  if (m.version !== GLOBE_PROTOCOL_VERSION) {
    post({ type: 'ready', version: GLOBE_PROTOCOL_VERSION, ok: false, reason: 'version' });
    return;
  }
  ripple = m.ripple;
  toPage = performance.timeOrigin - m.timeOrigin;
  const g = JellyGlass.create(m.canvas);
  if (!g) {
    post({ type: 'ready', version: GLOBE_PROTOCOL_VERSION, ok: false, reason: 'no-webgl2' });
    return;
  }
  coat = g;
  g.onChange = () => {
    if (g.isLost) {
      coatReady = false;
      post({ type: 'lost' });
      return;
    }
    if (g.failed) {
      post({ type: 'ready', version: GLOBE_PROTOCOL_VERSION, ok: false, reason: 'program' });
      return;
    }
    if (g.ready && !coatReady) {
      coatReady = true;
      dirty.size = dirty.theme = dirty.scene = dirty.place = dirty.surface = true;
      post({ type: 'ready', version: GLOBE_PROTOCOL_VERSION, ok: true });
      requestFrame();
    }
  };
}

function startSkin(m: Extract<GlobeIn, { type: 'skin-init' }>): void {
  if (skin) return;
  const s = SelfEvertSkin.create(m.canvas);
  if (!s) {
    post({ type: 'skin', ok: false });
    return;
  }
  skin = s;
  const report = () => {
    if (skinReported) return;
    if (s.ready || s.failed) {
      skinReported = true;
      post({ type: 'skin', ok: s.ready });
      if (s.ready) applySkin();
    }
  };
  s.onSettled = report;
  pendingSkin.persp = m.persp;
  pendingSkin.lens = m.lens;
}

/** The skin's latest size and theme, applied once its program has linked. */
const pendingSkin: {
  size: Extract<GlobeIn, { type: 'skin-size' }> | null;
  theme: Extract<GlobeIn, { type: 'skin-theme' }> | null;
  persp: number;
  lens: number;
} = { size: null, theme: null, persp: 3.1, lens: 0.42 };

function applySkin(): void {
  const s = skin;
  if (!s?.ready) return;
  const z = pendingSkin.size;
  if (z) s.resize(z.span, z.radius, z.dpr);
  const t = pendingSkin.theme;
  if (t) {
    const ink = colour(t.ink, [0, 0, 0, 1]);
    const accent = colour(t.accent, [0.4, 0.5, 1, 1]);
    const bg = colour(t.bg, [1, 1, 1, 1]);
    s.palette(
      { ink: rgb(ink), accent: rgb(accent), light: lum(bg) > 0.5 ? 1 : 0 },
      pendingSkin.persp,
      pendingSkin.lens,
    );
  }
}

scope.onmessage = (e: MessageEvent<GlobeIn>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      if (!coat) start(m);
      return;
    case 'size':
      size = { cssPx: m.cssPx, dpr: m.dpr };
      dirty.size = true;
      break;
    case 'theme':
      theme = m.theme;
      dirty.theme = true;
      break;
    case 'scene':
      // The previous picture is this worker's own (it was transferred here); the GPU copy is what draws.
      scene?.bitmap.close();
      scene = { bitmap: m.bitmap, width: m.width, height: m.height, version: ++sceneVersion };
      dirty.scene = true;
      break;
    case 'scene-off':
      scene?.bitmap.close();
      scene = null;
      dirty.scene = true;
      break;
    case 'place':
      place = { cx: m.cx, cy: m.cy, r: m.r, dx: m.dx, dy: m.dy };
      dirty.place = true;
      break;
    case 'clock':
      clock = m.clock;
      break;
    case 'frame':
      if (m.surface) {
        const prev = surface;
        surface = m.surface;
        // A field a skipped frame carried is still the newest the GPU has not seen.
        if (!surface.field && prev?.field && dirty.surface) {
          surface = { ...surface, field: prev.field, fieldVersion: prev.fieldVersion };
        }
        dirty.surface = true;
      }
      if (m.skin) skinFrame = m.skin;
      if (m.seq > ackSeq) ackSeq = m.seq;
      break;
    case 'skin-init':
      startSkin(m);
      return;
    case 'skin-size':
      pendingSkin.size = m;
      applySkin();
      break;
    case 'skin-theme':
      pendingSkin.theme = m;
      applySkin();
      break;
    case 'skin-clear':
      skinClear = true;
      skinFrame = null;
      break;
  }
  requestFrame();
};
