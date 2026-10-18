/**
 * The test page's script for `testing/e2e/eversion-gl.mjs` (T23). Bundled by
 * esbuild for that script only — it is not imported by the app.
 *
 * Unlike `renderer-page.ts` (T24, a local mesh),
 * this page runs the REAL shaders on the REAL mesh and the REAL baked LUTs of all
 * five projections. The oracle is the real `thurston.ts` (T08).
 *
 * It exposes `window.__g`, scenario functions the Playwright script calls.
 */

import { GLSL_HEADER, EVERSION_GLSL, getShaderSet } from '../shaders';
import { PLAN_MS } from '../../constants';
import { createSnapshot } from '../../snapshot';
import { getBakedLut } from '../../projection-lut';
import { meshForTier } from '../../mesh';
import { PROJECTION_IDS } from '../../types';
import type { ProjectionId, Rgba, ThemeColours, Tier, TimelineSnapshot } from '../../types';
import { createRenderer } from '../renderer';
import { bakeLut } from '../../projection-lut';
import { getProjection } from '../../projections';
import { afterDomainTransform, alignAngle, fitEndIsometry } from '../../orientation';
import { SPIN_AXIS } from '../../domain';
import { evert, normal, stageParams } from '../../thurston';
import { Timeline } from '../../timeline';

const o3 = new Float64Array(3);
function evertOracle(theta: number, phi: number, e: number): [number, number, number] {
  evert(theta, phi, e, o3, 0);
  return [o3[0]!, o3[1]!, o3[2]!];
}
function normalOracle(theta: number, phi: number, e: number): [number, number, number] {
  normal(theta, phi, e, o3, 0);
  return [o3[0]!, o3[1]!, o3[2]!];
}

/** The CSS viewport of the current scenario; `setView` changes it (T27 renders at several sizes). */
let VIEW = { w: 640, h: 400, dpr: 1 };

/** Theme colours that look like the dark theme: used for the screenshots. */
const THEMED: ThemeColours = {
  bg: [0.04, 0.05, 0.08, 1],
  veil: [0.07, 0.08, 0.12, 1],
  accent: [0.38, 0.55, 1, 1],
  cageMinor: [0.7, 0.8, 1, 0.2],
  cageParallel: [0.7, 0.8, 1, 0.13],
  cageMajor: [0.8, 0.9, 1, 0.34],
  cageRipple: [0.6, 0.85, 1, 0.8],
  cageWidth: 1.2,
};

/** Test colours: no cage, no rim, no accent, so a red page can only ever be red. */
const CLEAR: Rgba = [0, 0, 0, 0];
const PLAIN: ThemeColours = {
  bg: [1, 1, 1, 1],
  veil: [0.2, 0.2, 0.2, 1],
  accent: [0.2, 0.2, 0.2, 1],
  cageMinor: CLEAR,
  cageParallel: CLEAR,
  cageMajor: CLEAR,
  cageRipple: CLEAR,
  cageWidth: 1,
};

/** `M_after` for the T23 checks that do not care about orientation: `−I`, column-major. */
const M_AFTER = new Float64Array([-1, 0, 0, 0, -1, 0, 0, 0, -1]);

/** The REAL end orientation (what `core.ts#defaultDeps().orientation()` hands the renderer). */
function realOrientation() {
  const { R } = fitEndIsometry();
  const thetaAlign = alignAngle(R);
  return { thetaAlign, mAfter: afterDomainTransform(R, SPIN_AXIS, thetaAlign) };
}

let canvas: HTMLCanvasElement | null = null;
let renderer: ReturnType<typeof createRenderer> | null = null;
let lastTier: Tier = 'mid';

function gl(): WebGL2RenderingContext {
  return canvas!.getContext('webgl2') as WebGL2RenderingContext;
}

function snapshot(patch: Partial<TimelineSnapshot> = {}): TimelineSnapshot {
  return {
    ...createSnapshot(),
    radius: 0.44 * Math.min(VIEW.w, VIEW.h),
    centreX: VIEW.w / 2,
    centreY: VIEW.h / 2,
    ...patch,
  };
}

/** A recognisable page: gradient, 40 px grid, big label, corner marks, a centre cross. */
async function testCard(label: string, hue: number): Promise<ImageBitmap> {
  const c = document.createElement('canvas');
  c.width = VIEW.w;
  c.height = VIEW.h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, VIEW.w, VIEW.h);
  grad.addColorStop(0, `hsl(${hue}, 70%, 55%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 30%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, VIEW.w, VIEW.h);
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1;
  for (let x = 0; x <= VIEW.w; x += 40) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, VIEW.h);
    g.stroke();
  }
  for (let y = 0; y <= VIEW.h; y += 40) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(VIEW.w, y + 0.5);
    g.stroke();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 120px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, VIEW.w / 2, VIEW.h / 2);
  const marks: [number, number, string][] = [
    [0, 0, '#f00'],
    [VIEW.w - 40, 0, '#0f0'],
    [0, VIEW.h - 40, '#00f'],
    [VIEW.w - 40, VIEW.h - 40, '#ff0'],
  ];
  for (const [x, y, col] of marks) {
    g.fillStyle = col;
    g.fillRect(x, y, 40, 40);
  }
  return createImageBitmap(c);
}

/** Classify the drawing buffer: red / blue / veil-grey / anything else. */
function classify() {
  const ctx = gl();
  const w = canvas!.width;
  const h = canvas!.height;
  const px = new Uint8Array(w * h * 4);
  ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
  let red = 0;
  let blue = 0;
  let grey = 0;
  let other = 0;
  const blueAt: number[] = [];
  const redAt: number[] = [];
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!;
    const g = px[i + 1]!;
    const b = px[i + 2]!;
    // A SOLID pixel: MSAA edge pixels (a sample of the other sheet, or of the veil) are partial mixes and
    // land in `other`; "no blue at e = 0" is about pixels that are blue, not about antialiased rims.
    if (r > 120 && g < 40 && b < 40) {
      red++;
      if (redAt.length < 20) redAt.push((i / 4) % w, h - 1 - Math.floor(i / 4 / w));
    } else if (b > 120 && r < 40 && g < 40) {
      if (blueAt.length < 20) blueAt.push((i / 4) % w, h - 1 - Math.floor(i / 4 / w));
      blue++;
      if (blueAt.length < 20) blueAt.push((i / 4) % w, h - 1 - Math.floor(i / 4 / w));
    } else if (Math.abs(r - g) < 14 && Math.abs(g - b) < 14) grey++;
    else other++;
  }
  const n = w * h;
  return {
    red: red / n,
    blue: blue / n,
    grey: grey / n,
    other: other / n,
    pixels: n,
    blueAt,
    redAt,
  };
}

const cardCanvas: { before: HTMLCanvasElement | null; after: HTMLCanvasElement | null } = {
  before: null,
  after: null,
};

/**
 * An orientation card for `projection`: a neutral grey page (so a colour can only be a marker) with a cyan disc
 * at the page centre, a magenta up-arrow above it, a red marker left of centre, green right, blue below, coloured
 * corner squares and a lop-sided label.
 *
 * Marker positions are the page positions of sphere points (red/green at `θ = ∓45°`, blue at `φ = −45°`, the arrow
 * from `φ = 20°` to `65°`), found through the projection's own `forward` at the fit the LUT was baked with, so they
 * land on the visible hemisphere whatever the projection's scale (stereographic puts the front hemisphere in a
 * small patch of the page; mercator on a phone stretches it).
 */
function asymCard(label: string, grey: number, projection: ProjectionId): HTMLCanvasElement {
  const { w, h } = VIEW;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, `rgb(${grey + 25},${grey + 25},${grey + 25})`);
  bg.addColorStop(1, `rgb(${grey - 25},${grey - 25},${grey - 25})`);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  const proj = getProjection(projection);
  const fit = getBakedLut(projection, VIEW).fit;
  const out = new Float64Array(2);
  // The page position of a sphere point, or null when the projection puts it off the page.
  const at = (thetaDeg: number, phiDeg: number): [number, number] | null => {
    if (!proj.forward((thetaDeg * Math.PI) / 180, (phiDeg * Math.PI) / 180, fit, out, 0))
      return null;
    if (out[0]! < 0.02 || out[0]! > 0.98 || out[1]! < 0.02 || out[1]! > 0.98) return null;
    return [out[0]! * w, out[1]! * h];
  };
  // Shrink the angular layout until every marker is on the page (a narrow page or a small patch has less room).
  let pts: ([number, number] | null)[] = [];
  for (const f of [1, 0.8, 0.6, 0.45, 0.3, 0.2]) {
    pts = [at(0, 0), at(-45 * f, 0), at(45 * f, 0), at(0, -45 * f), at(0, 20 * f), at(0, 65 * f)];
    if (pts.every((q) => q)) break;
  }
  if (!pts.every((q) => q))
    throw new Error(`asymCard: no layout fits the ${projection} page at ${w}x${h}`);
  const [[cx, cy], [rx], [gx], [, by], [, ay0], [, ay1]] = pts as [number, number][];
  const unit = Math.abs(gx - rx) / 2; // the page distance of 45 degrees of longitude
  const r = 0.3 * unit;

  g.fillStyle = '#00ffff';
  g.beginPath();
  g.arc(cx, cy, 0.25 * unit, 0, Math.PI * 2);
  g.fill();
  // Up-arrow: head (wide) on top, shaft below; ay1 < ay0 because v grows downward.
  const top = ay1;
  const bottom = ay0;
  const neck = top + 0.4 * (bottom - top);
  g.fillStyle = '#ff00ff';
  g.beginPath();
  g.moveTo(cx, top);
  g.lineTo(cx + 0.3 * unit, neck);
  g.lineTo(cx - 0.3 * unit, neck);
  g.closePath();
  g.fill();
  g.fillRect(cx - 0.1 * unit, neck, 0.2 * unit, bottom - neck);
  const box = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  box(rx, cy, '#ff0000');
  box(gx, cy, '#00ff00');
  box(cx, by, '#0000ff');

  const m = Math.min(w, h);
  const k = 0.1 * m;
  for (const [x, y, col] of [
    [0, 0, '#ff0000'],
    [w - k, 0, '#00ff00'],
    [0, h - k, '#0000ff'],
    [w - k, h - k, '#ffff00'],
  ] as const) {
    g.fillStyle = col;
    g.fillRect(x, y, k, k);
  }
  g.fillStyle = '#000';
  g.font = `bold ${Math.round(0.14 * m)}px sans-serif`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(label, 0.06 * w, h / 2 + 0.2 * m);
  // A 1-px grid so the SSIM has structure everywhere.
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x <= w; x += 20) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, h);
    g.stroke();
  }
  for (let y = 0; y <= h; y += 20) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(w, y + 0.5);
    g.stroke();
  }
  return c;
}

/** The drawing buffer as top-down RGBA. */
function readFrame() {
  const ctx = gl();
  const w = canvas!.width;
  const h = canvas!.height;
  const raw = new Uint8Array(w * h * 4);
  ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, raw);
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) px.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return { px, w, h };
}

/** A saturated marker colour, or null for neutral page/glass/veil. Hue-based so the lighting cannot hide it. */
function markerClass(
  r: number,
  g: number,
  b: number,
): 'red' | 'green' | 'blue' | 'yellow' | 'cyan' | 'magenta' | null {
  const T = 60;
  if (r - Math.max(g, b) > T) return 'red';
  if (g - Math.max(r, b) > T) return 'green';
  if (b - Math.max(r, g) > T) return 'blue';
  if (Math.min(r, g) - b > T) return 'yellow';
  if (Math.min(g, b) - r > T) return 'cyan';
  if (Math.min(r, b) - g > T) return 'magenta';
  return null;
}

const api = {
  projections: [...PROJECTION_IDS] as ProjectionId[],

  /** (Re)create the renderer on a fresh canvas. Throws with the GLSL log if the real shaders fail. */
  init(tier: Tier = 'mid', opts: { maskView?: boolean } = {}) {
    canvas?.remove();
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    lastTier = tier;
    renderer = createRenderer(canvas, { tier, dprCap: 1, maskView: opts.maskView === true });
    return { live: renderer.counters().live };
  },

  /**
   * `lut`: `'bucket'` is what the controller posts (the memoised LUT baked at the aspect BUCKET);
   * `'exact'` bakes at the viewport's own fit. `orientation: 'real'` feeds the true `M_after`.
   */
  prime(
    projection: ProjectionId,
    themed: boolean,
    opts: { lut?: 'bucket' | 'exact'; orientation?: 'real' | 'neg-i' | 'identity' } = {},
  ) {
    const lut =
      opts.lut === 'exact'
        ? bakeLut(getProjection(projection), getProjection(projection).fit(VIEW.w, VIEW.h))
        : getBakedLut(projection, VIEW).data;
    renderer!.prime({
      projection,
      viewport: { ...VIEW },
      globe: {
        yaw: 0,
        pitch: 0,
        yawVel: 0,
        pitchVel: 0,
        centre: [VIEW.w / 2, VIEW.h / 2],
        radius: 60,
      },
      colours: themed ? THEMED : PLAIN,
      lut,
      mAfter:
        opts.orientation === 'real'
          ? realOrientation().mAfter
          : opts.orientation === 'identity'
            ? new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
            : M_AFTER,
    });
    return { w: canvas!.width, h: canvas!.height };
  },

  /** Change the CSS viewport (and the cards' size) for the following scenario. */
  setView(w: number, h: number) {
    VIEW = { w, h, dpr: 1 };
  },

  orientation: () => realOrientation(),

  /**
   * The asymmetric orientation cards (T27), drawn at the current viewport and uploaded as
   * before/after/placeholder. Returns each card as a PNG for the SSIM comparison.
   */
  async asymCards(projection: ProjectionId) {
    cardCanvas.before = asymCard('BEFORE', 150, projection);
    cardCanvas.after = asymCard('AFTER', 215, projection);
    const before = await createImageBitmap(cardCanvas.before);
    const after = await createImageBitmap(cardCanvas.after);
    renderer!.setTexture('before', before);
    renderer!.setTexture('after', after);
    renderer!.setTexture('placeholder', after);
    before.close();
    after.close();
    return {
      before: cardCanvas.before.toDataURL('image/png'),
      after: cardCanvas.after.toDataURL('image/png'),
    };
  },

  /**
   * Draw one frame and report where the asymmetric card's markers landed (T27 orientation check):
   * centroid + pixel count per marker colour, and the arrow's row profile.
   */
  markers(patch: Partial<TimelineSnapshot>) {
    renderer!.draw(snapshot(patch));
    const err = gl().getError();
    const { px, w, h } = readFrame();
    const classes = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta'] as const;
    const acc = Object.fromEntries(
      classes.map((c) => [
        c,
        { n: 0, sx: 0, sy: 0, minY: 1e9, maxY: -1, rows: {} as Record<number, number> },
      ]),
    );
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const c = markerClass(px[i]!, px[i + 1]!, px[i + 2]!);
        if (!c) continue;
        const a = acc[c]!;
        a.n++;
        a.sx += x;
        a.sy += y;
        a.minY = Math.min(a.minY, y);
        a.maxY = Math.max(a.maxY, y);
        a.rows[y] = (a.rows[y] ?? 0) + 1;
      }
    }
    const out: Record<
      string,
      {
        n: number;
        x: number;
        y: number;
        minY: number;
        maxY: number;
        widthTip: number;
        widthNeck: number;
        widthTail: number;
      }
    > = {};
    for (const c of classes) {
      const a = acc[c]!;
      // Arrow shape: mean row width near the tip, at the neck (where the head is widest) and at the tail.
      let widthTip = 0;
      let widthNeck = 0;
      let widthTail = 0;
      if (a.n) {
        const span = a.maxY - a.minY + 1;
        const mean = (f0: number, f1: number) => {
          const from = a.minY + Math.floor(span * f0);
          const to = Math.max(from + 1, a.minY + Math.floor(span * f1));
          let t = 0;
          for (let y = from; y < to; y++) t += a.rows[y] ?? 0;
          return t / (to - from);
        };
        widthTip = mean(0, 0.1);
        widthNeck = mean(0.3, 0.45);
        widthTail = mean(0.8, 1);
      }
      out[c] = {
        n: a.n,
        x: a.n ? a.sx / a.n : NaN,
        y: a.n ? a.sy / a.n : NaN,
        minY: a.minY,
        maxY: a.maxY,
        widthTip,
        widthNeck,
        widthTail,
      };
    }
    return { err, w, h, markers: out, png: canvas!.toDataURL('image/png') };
  },

  /**
   * Draw one frame and compare it with a card, pixel for pixel (S#15 on the GPU): mean/max absolute
   * difference over RGB in 0..255, and the share of pixels off by more than 8. Returns the frame PNG.
   */
  compare(patch: Partial<TimelineSnapshot>, slot: 'before' | 'after') {
    renderer!.draw(snapshot(patch));
    const err = gl().getError();
    const { px, w, h } = readFrame();
    const want = cardCanvas[slot]!.getContext('2d')!.getImageData(0, 0, w, h).data;
    let sum = 0;
    let max = 0;
    let off = 0;
    let worstAt = [0, 0];
    for (let i = 0; i < w * h; i++) {
      let d = 0;
      for (let c = 0; c < 3; c++) d += Math.abs(px[i * 4 + c]! - want[i * 4 + c]!);
      d /= 3;
      sum += d;
      if (d > 8) off++;
      if (d > max) {
        max = d;
        worstAt = [i % w, Math.floor(i / w)];
      }
    }
    return {
      err,
      w,
      h,
      mean: sum / (w * h),
      max,
      offShare: off / (w * h),
      worstAt,
      png: canvas!.toDataURL('image/png'),
    };
  },

  /**
   * How far the controller's cached (bucket) LUT puts the page from where the viewport's own fit would,
   * in CSS px at this viewport: max and 99th percentile of |Δuv|·size over texels that are on the page
   * in both bakes.
   */
  lutFitDelta(projection: ProjectionId) {
    const proj = getProjection(projection);
    const baked = getBakedLut(projection, VIEW);
    const exact = bakeLut(proj, proj.fit(VIEW.w, VIEW.h));
    const n = exact.length / 2;
    const ds: number[] = [];
    for (let i = 0; i < n; i++) {
      const u0 = baked.data[i * 2]!;
      const v0 = baked.data[i * 2 + 1]!;
      const u1 = exact[i * 2]!;
      const v1 = exact[i * 2 + 1]!;
      if (u0 < 0 || u0 > 1 || v0 < 0 || v0 > 1 || u1 < 0 || u1 > 1 || v1 < 0 || v1 > 1) continue;
      ds.push(Math.hypot((u0 - u1) * VIEW.w, (v0 - v1) * VIEW.h));
    }
    ds.sort((a, b) => a - b);
    return {
      bucket: baked.aspectBucket,
      bucketAspect: baked.aspectBucket / 64,
      viewportAspect: VIEW.h / VIEW.w,
      samples: ds.length,
      max: ds.length ? ds[ds.length - 1]! : 0,
      p99: ds.length ? ds[Math.floor(ds.length * 0.99)]! : 0,
      mean: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0,
    };
  },

  async cards() {
    const before = await testCard('BEFORE', 20);
    const after = await testCard('AFTER', 200);
    renderer!.setTexture('before', before);
    renderer!.setTexture('after', after);
    renderer!.setTexture('placeholder', after);
    before.close();
    after.close();
  },

  solid(before: Rgba, after: Rgba) {
    window.__eversion!.renderer!.solidTextures(before, after);
  },

  /** Draw one frame; returns the GL error code (0 = none) and, if asked, a PNG data URL. */
  frame(patch: Partial<TimelineSnapshot>, png = false) {
    renderer!.draw(snapshot(patch));
    const ctx = gl();
    const err = ctx.getError();
    return { err, png: png ? canvas!.toDataURL('image/png') : null };
  },

  /**
   * Draw the real timeline's frame `offsetMs` after the end of UNWRAP (`PLAN_MS.unwrap[1]`, negative: before it), for a hub-sized globe in
   * the middle. The run is replayed from the start each call, so a frame is exactly what the live loop would
   * have drawn at that time (the reveal is answered at once, as the controller does).
   */
  endFrame(offsetMs: number) {
    const tl = new Timeline({
      viewport: { ...VIEW },
      globe: {
        yaw: 0,
        pitch: 0,
        yawVel: 0,
        pitchVel: 0,
        centre: [VIEW.w / 2, VIEW.h / 2],
        radius: 60,
      },
      thetaAlign: realOrientation().thetaAlign,
    });
    let now = 0;
    tl.start(now);
    tl.afterReady(now);
    const target = PLAN_MS.unwrap[1] + offsetMs;
    let snap: Readonly<TimelineSnapshot> = tl.tick(now);
    for (let i = 0; i < 4000; i++) {
      now += 4;
      snap = tl.tick(now);
      for (const e of tl.events()) {
        if (e.stage === 'unwrap-done') tl.reveal(now);
      }
      if (snap.t >= target) break;
    }
    renderer!.draw(snap);
    return {
      err: gl().getError(),
      stage: snap.stage,
      unwrap: snap.unwrap,
      pageAlpha: snap.pageAlpha,
      radius: snap.radius,
      centreX: snap.centreX,
      centreY: snap.centreY,
    };
  },

  /**
   * With `init(tier, { maskView: true })`: draw `patch` and measure the wedge mask the surface shader wrote (red
   * channel, over the pixels marked as surface by green). A jagged mask (triangle-edge teeth, 2x2 derivative
   * blocks) is a field with many one-pixel jumps; an analytic one only jumps where two sheets overlap.
   * Returns the covered count, the pixels whose mask is neither 0 nor 1, and the number of neighbour pairs
   * (both covered) whose mask differs by more than `jump`, and, of the neighbour pairs that are BOTH on the ramp
   * (neither 0 nor 1: the outline of a sheet, where the glass behind it shows, is not one), how many step by
   * more than a quarter (`rampJumps` of `rampPairs`): a jump through the middle of a falloff that should be smooth.
   */
  maskStats(patch: Partial<TimelineSnapshot>, jump = 0.5) {
    renderer!.draw(snapshot(patch));
    const ctx = gl();
    const w = canvas!.width;
    const h = canvas!.height;
    const px = new Uint8Array(w * h * 4);
    ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    const covered = (i: number) => px[i * 4 + 1] === 255 && px[i * 4 + 2] === 0;
    let cov = 0;
    let partial = 0;
    let full = 0;
    let jumps = 0;
    let pairs = 0;
    let worst = 0;
    let rampJumps = 0;
    let rampPairs = 0;
    // The outermost band is where the mask ramp is squeezed into a pixel or two by the page's own edge: steep, not rough.
    const B = 10;
    for (let y = B; y < h - B; y++) {
      for (let x = B; x < w - B; x++) {
        const i = y * w + x;
        if (!covered(i)) continue;
        cov++;
        const m = px[i * 4] / 255;
        if (m > 0.02 && m < 0.98) partial++;
        if (m >= 0.98) full++;
        for (const j of [x + 1 < w ? i + 1 : -1, y + 1 < h ? i + w : -1]) {
          if (j < 0 || !covered(j)) continue;
          pairs++;
          const d = Math.abs(px[j * 4] / 255 - m);
          if (d > worst) worst = d;
          if (d > jump) {
            jumps++;
          }
          const m2 = px[j * 4] / 255;
          if (m > 0.02 && m < 0.98 && m2 > 0.02 && m2 < 0.98) {
            rampPairs++;
            if (d > 0.6) rampJumps++;
          }
        }
      }
    }
    return {
      err: ctx.getError(),
      covered: cov,
      partial,
      full,
      pairs,
      jumps,
      rampJumps,
      rampPairs,
      worst,
    };
  },

  /** Draw then classify the pixels (the S#28 histogram). */
  histogram(patch: Partial<TimelineSnapshot>) {
    renderer!.draw(snapshot(patch));
    const err = gl().getError();
    return { err, ...classify(), png: canvas!.toDataURL('image/png') };
  },

  /** S#27: `F` from transform feedback against the TS port at 64 values of `e`. */
  parity() {
    const es = new Float32Array(64);
    for (let k = 0; k < 64; k++) es[k] = k / 63;
    const t0 = performance.now();
    const out = renderer!.debugEvaluate(es);
    const ms = performance.now() - t0;
    const mesh = meshForTier(lastTier);
    const vc = mesh.vertexCount;
    let worst = 0;
    let worstAt = { e: 0, theta: 0, phi: 0, vertex: 0 };
    let over1e4 = 0;
    let over1e3 = 0;
    let nan = 0;
    let sumSq = 0;
    let count = 0;
    const perE = new Float64Array(64);
    for (let k = 0; k < 64; k++) {
      for (let v = 0; v < vc; v++) {
        const theta = mesh.domain[v * 2]!;
        const phi = mesh.domain[v * 2 + 1]!;
        const want = evertOracle(theta, phi, es[k]!);
        let d = 0;
        for (let c = 0; c < 3; c++) {
          const got = out[(k * vc + v) * 3 + c]!;
          if (!Number.isFinite(got)) nan++;
          d = Math.max(d, Math.abs(got - want[c]!));
          sumSq += (got - want[c]!) ** 2;
          count++;
        }
        if (d > 1e-4) over1e4++;
        if (d > 1e-3) over1e3++;
        perE[k] = Math.max(perE[k]!, d);
        if (d > worst) {
          worst = d;
          worstAt = { e: es[k]!, theta, phi, vertex: v };
        }
      }
    }
    return {
      vertices: vc,
      es: es.length,
      worst,
      worstAt,
      rms: Math.sqrt(sumSq / count),
      over1e4,
      over1e3,
      nan,
      ms,
      perE: Array.from(perE),
    };
  },

  /**
   * The normal, against the oracle's. Uses its own transform-feedback program
   * built from the shipped GLSL chunk (the renderer only exposes `F`), on a
   * separate context, over a sample of the mesh and 9 values of `e`.
   */
  normals() {
    const c2 = document.createElement('canvas');
    const g = c2.getContext('webgl2')!;
    const vs = `${GLSL_HEADER}
layout(location = 0) in vec2 a_domain;
${EVERSION_GLSL}
out vec3 v_N;
void main() {
  v_N = evertNormal(a_domain.x, a_domain.y, evertFrame(latToU(a_domain.y)));
  gl_Position = vec4(0.0);
}`;
    const fs = `${GLSL_HEADER}
out vec4 o;
void main() { o = vec4(0.0); }`;
    const prog = g.createProgram()!;
    for (const [type, src] of [
      [g.VERTEX_SHADER, vs],
      [g.FRAGMENT_SHADER, fs],
    ] as const) {
      const s = g.createShader(type)!;
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS))
        throw new Error(g.getShaderInfoLog(s) ?? 'compile');
      g.attachShader(prog, s);
    }
    g.bindAttribLocation(prog, 0, 'a_domain');
    g.transformFeedbackVaryings(prog, ['v_N'], g.INTERLEAVED_ATTRIBS);
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS))
      throw new Error(g.getProgramInfoLog(prog) ?? 'link');

    const mesh = meshForTier('mid');
    const vc = mesh.vertexCount;
    const vao = g.createVertexArray();
    g.bindVertexArray(vao);
    const vbo = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, vbo);
    g.bufferData(g.ARRAY_BUFFER, mesh.domain, g.STATIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    const tfb = g.createBuffer();
    g.bindBuffer(g.TRANSFORM_FEEDBACK_BUFFER, tfb);
    g.bufferData(g.TRANSFORM_FEEDBACK_BUFFER, vc * 12, g.DYNAMIC_READ);
    const tf = g.createTransformFeedback();
    g.bindTransformFeedback(g.TRANSFORM_FEEDBACK, tf);
    g.useProgram(prog);
    g.enable(g.RASTERIZER_DISCARD);
    const loc = g.getUniformLocation(prog, 'u_stageParams');
    const sp = new Float64Array(8);
    const sp32 = new Float32Array(8);
    const row = new Float32Array(vc * 3);

    let worstDeg = 0;
    let worstAt = { e: 0, theta: 0, phi: 0 };
    let over1 = 0;
    let n = 0;
    let worstAwayFromSeam = 0;
    const perE: { e: number; worstDeg: number; flipped: number }[] = [];
    for (const e of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
      stageParams(e, sp);
      sp32.set(sp);
      g.uniform1fv(loc, sp32);
      g.bindBufferBase(g.TRANSFORM_FEEDBACK_BUFFER, 0, tfb);
      g.beginTransformFeedback(g.POINTS);
      g.drawArrays(g.POINTS, 0, vc);
      g.endTransformFeedback();
      g.bindBufferBase(g.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      g.bindBuffer(g.COPY_READ_BUFFER, tfb);
      g.getBufferSubData(g.COPY_READ_BUFFER, 0, row);
      g.bindBuffer(g.COPY_READ_BUFFER, null);
      let eWorst = 0;
      let eFlipped = 0;
      let eSamples = 0;
      for (let v = 0; v < vc; v += 5) {
        const theta = mesh.domain[v * 2]!;
        const phi = mesh.domain[v * 2 + 1]!;
        const want = normalOracle(theta, phi, e);
        const a = [row[v * 3]!, row[v * 3 + 1]!, row[v * 3 + 2]!];
        const dot = Math.min(1, Math.max(-1, a[0]! * want[0] + a[1]! * want[1] + a[2]! * want[2]));
        const deg = (Math.acos(dot) * 180) / Math.PI;
        n++;
        eSamples++;
        if (dot < 0) eFlipped++;
        eWorst = Math.max(eWorst, deg);
        if (deg > 1) over1++;
        if (deg > worstDeg) {
          worstDeg = deg;
          worstAt = { e, theta, phi };
        }
        if (Math.abs(phi) < Math.PI / 2 - 0.2) worstAwayFromSeam = Math.max(worstAwayFromSeam, deg);
      }
      perE.push({ e, worstDeg: eWorst, flipped: eFlipped / eSamples });
    }
    return {
      samples: n,
      worstDeg,
      worstAt,
      over1deg: over1,
      worstMidLatDeg: worstAwayFromSeam,
      perE,
    };
  },

  /** Worst absolute error of the GL stack's sin/cos over [-2pi, 2pi] (explains the S#27 floor). */
  trigError() {
    const c4 = document.createElement('canvas');
    const g4 = c4.getContext('webgl2')!;
    const vs = `#version 300 es
precision highp float;
in float a_x;
out vec2 v_sc;
void main() { v_sc = vec2(sin(a_x), cos(a_x)); gl_Position = vec4(0.0); }`;
    const fs = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(0.0); }`;
    const prog = g4.createProgram()!;
    for (const [type, src] of [
      [g4.VERTEX_SHADER, vs],
      [g4.FRAGMENT_SHADER, fs],
    ] as const) {
      const sh = g4.createShader(type)!;
      g4.shaderSource(sh, src);
      g4.compileShader(sh);
      g4.attachShader(prog, sh);
    }
    g4.bindAttribLocation(prog, 0, 'a_x');
    g4.transformFeedbackVaryings(prog, ['v_sc'], g4.INTERLEAVED_ATTRIBS);
    g4.linkProgram(prog);
    const n = 20000;
    const xs = new Float32Array(n);
    for (let i = 0; i < n; i++) xs[i] = (i / (n - 1)) * 4 * Math.PI - 2 * Math.PI;
    const vao = g4.createVertexArray();
    g4.bindVertexArray(vao);
    const vb = g4.createBuffer();
    g4.bindBuffer(g4.ARRAY_BUFFER, vb);
    g4.bufferData(g4.ARRAY_BUFFER, xs, g4.STATIC_DRAW);
    g4.enableVertexAttribArray(0);
    g4.vertexAttribPointer(0, 1, g4.FLOAT, false, 0, 0);
    const tb = g4.createBuffer();
    g4.bindBuffer(g4.TRANSFORM_FEEDBACK_BUFFER, tb);
    g4.bufferData(g4.TRANSFORM_FEEDBACK_BUFFER, n * 8, g4.DYNAMIC_READ);
    g4.useProgram(prog);
    g4.enable(g4.RASTERIZER_DISCARD);
    g4.bindBufferBase(g4.TRANSFORM_FEEDBACK_BUFFER, 0, tb);
    g4.beginTransformFeedback(g4.POINTS);
    g4.drawArrays(g4.POINTS, 0, n);
    g4.endTransformFeedback();
    g4.bindBufferBase(g4.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    g4.bindBuffer(g4.COPY_READ_BUFFER, tb);
    const out = new Float32Array(n * 2);
    g4.getBufferSubData(g4.COPY_READ_BUFFER, 0, out);
    let worst = 0;
    for (let i = 0; i < n; i++) {
      worst = Math.max(
        worst,
        Math.abs(out[i * 2]! - Math.sin(xs[i]!)),
        Math.abs(out[i * 2 + 1]! - Math.cos(xs[i]!)),
      );
    }
    return worst;
  },

  /** Compile and link every program of the real shader set on this browser; returns the info logs (empty = clean). */
  compileLog() {
    const c3 = document.createElement('canvas');
    const g = c3.getContext('webgl2');
    if (!g) return { webgl2: false, logs: [] as string[] };
    const set = getShaderSet();
    const logs: string[] = [];
    const progs: [string, { vertex: string; fragment: string }][] = [
      ['surface', set.surface],
      ['cage', set.cage],
      ['feedback', set.feedback],
    ];
    for (const [name, src] of progs) {
      const p = g.createProgram()!;
      for (const [type, text, label] of [
        [g.VERTEX_SHADER, src.vertex, 'vertex'],
        [g.FRAGMENT_SHADER, src.fragment, 'fragment'],
      ] as const) {
        const s = g.createShader(type)!;
        g.shaderSource(s, text);
        g.compileShader(s);
        const log = g.getShaderInfoLog(s) ?? '';
        if (!g.getShaderParameter(s, g.COMPILE_STATUS)) logs.push(`${name} ${label}: ${log}`);
        else if (log.trim()) logs.push(`${name} ${label} (warning): ${log}`);
        g.attachShader(p, s);
      }
      if (name === 'feedback')
        g.transformFeedbackVaryings(p, [...set.feedback.varyings], g.INTERLEAVED_ATTRIBS);
      g.linkProgram(p);
      if (!g.getProgramParameter(p, g.LINK_STATUS))
        logs.push(`${name} link: ${g.getProgramInfoLog(p)}`);
    }
    return { webgl2: true, logs, renderer: String(g.getParameter(g.RENDERER)) };
  },

  dispose: () => renderer?.dispose(),
};

(window as unknown as { __g: typeof api }).__g = api;
