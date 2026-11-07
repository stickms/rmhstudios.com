// =============================================================================
// KOWLOON MENU -- Street scene (pure pixel renderer)
// =============================================================================
// The main-menu backdrop: a rain-soaked Hong Kong street in 1997, drawn per pixel
// into a small RGBA buffer the page scales up, so it is pixel art all the way down
// (same contract as lib/altair/menu/corridor-scene.ts: no DOM, no canvas, nothing
// allocated per frame; the caller owns the buffer and puts it on screen).
//
// What is in it (docs/game-design-schemes/kowloon-knockout.json, and the card art):
//   - a sky that goes from near-black plum to a pink haze at the roofline
//   - two layers of tenements, halftoned in a two-ink print look, their windows
//     lit warm yellow / pink / cyan, a few of them flickering or switching on and off
//   - hanging neon signs (龙 酒 武 面 港 夜) that breathe and, rarely, stutter
//   - two stick fighters sparring on a 16 s loop (choreography.ts) while a yellow
//     bystander watches, each a neon tube with a glow
//   - rain, splash rings on the wet street, a steaming vent, a slow camera dolly
//     and pointer parallax, and the street reflecting all of it
//
// Colour is quantised to a small ramp per ink with a 4x4 Bayer dither. The only
// flashes are the hit sparks (choreography.ts proves them <= 1 per second).
// =============================================================================

import { GLYPHS, GLYPH_H, GLYPH_W } from './menu-glyphs';
import {
  BEATS, IMPACT_DELAY, J, LOOP_SECONDS, POSES, createFighterSample, sampleFighter, sparkSpot, standingX,
  type FighterSample,
} from './choreography';

const pack = (r: number, g: number, b: number): number => ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
const hex = (h: string): number => pack(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));

/** Near-black plum, void to a lit wall. The top steps are kept low so UI text stays readable over them. */
const PLUM: readonly number[] = ['#05020d', '#0a0518', '#120a28', '#1a0d38', '#25114d', '#34185f'].map(hex);
const PINK: readonly number[] = ['#3a0a2e', '#7a1459', '#c41f86', '#ff2e88', '#ff8cc4', '#ffe0f0'].map(hex);
const YEL: readonly number[] = ['#2a1b02', '#7a5200', '#c28a00', '#ffc400', '#fff0a0'].map(hex);
const CYA: readonly number[] = ['#05303a', '#0b6477', '#1fb5cf', '#46e6ff', '#c8f8ff'].map(hex);
const VIO: readonly number[] = ['#2a1252', '#5a2aa0', '#8f5cff', '#b48cff', '#e6d8ff'].map(hex);
const RAIN_FAR = hex('#6e5cc0');
const RAIN_NEAR = hex('#b9a8ff');
const WHITE = hex('#fff6fb');

const TONES: readonly (readonly number[])[] = [PINK, CYA, YEL, VIO, CYA, PINK];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number): number => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/** World period of the tenement layers, in px (the camera dollies round it, seamlessly). */
export const SCENE_PERIOD = 512;
/** A time inside a quiet moment of the loop (no spark), for a still frame. */
export const STILL_TIME = 2.0;

const FRAME_SHORT_SIDE = 180;
const LONG_SIDE_MAX = 400;

/** Buffer size for a container: short side fixed, long side follows its aspect. */
export function bufferSizeFor(cssWidth: number, cssHeight: number): { w: number; h: number } {
  const aspect = cssWidth > 0 && cssHeight > 0 ? cssWidth / cssHeight : 16 / 9;
  if (aspect >= 1) return { w: Math.min(LONG_SIDE_MAX, Math.round(FRAME_SHORT_SIDE * aspect)), h: FRAME_SHORT_SIDE };
  return { w: FRAME_SHORT_SIDE, h: Math.min(LONG_SIDE_MAX, Math.round(FRAME_SHORT_SIDE / aspect)) };
}

function hash01(n: number): number {
  let x = Math.imul(n | 0, 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
const hash2 = (a: number, b: number): number => hash01(Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b));

const frac = (v: number): number => v - Math.floor(v);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function mix(a: number, b: number, t: number): number {
  const r = (a & 255) + ((b & 255) - (a & 255)) * t;
  const g = ((a >>> 8) & 255) + (((b >>> 8) & 255) - ((a >>> 8) & 255)) * t;
  const bl = ((a >>> 16) & 255) + (((b >>> 16) & 255) - ((a >>> 16) & 255)) * t;
  return pack(r | 0, g | 0, bl | 0);
}

function dim(c: number, f: number): number {
  return pack(((c & 255) * f) | 0, (((c >>> 8) & 255) * f) | 0, (((c >>> 16) & 255) * f) | 0);
}

// ---- Tenement layers ------------------------------------------------------------

interface Layer {
  /** Tower height above the street at each world column (px). */
  height: Int16Array;
  /** Column's x within its tower. */
  lx: Uint16Array;
  /** Tower id (seeds its windows). */
  id: Uint16Array;
}

function buildLayer(seed: number, minW: number, maxW: number, minH: number, maxH: number): Layer {
  const P = SCENE_PERIOD;
  const layer: Layer = { height: new Int16Array(P), lx: new Uint16Array(P), id: new Uint16Array(P) };
  let x = 0;
  let n = 0;
  while (x < P) {
    const w = Math.round(minW + hash01(seed + n * 7) * (maxW - minW));
    const h = Math.round(minH + hash01(seed + n * 13 + 1) * (maxH - minH));
    for (let i = 0; i < w; i++) {
      const col = (x + i) % P;
      layer.height[col] = h;
      layer.lx[col] = i;
      layer.id[col] = n + (seed & 0xff) * 64;
    }
    x += w + (hash01(seed + n * 3 + 5) > 0.7 ? 2 : 0);
    n++;
  }
  return layer;
}

interface Sign { wx: number; yOff: number; tone: number; glyph: number; seed: number }

export interface StreetScene {
  readonly width: number;
  readonly height: number;
  /** Packed RGBA, row-major. Wrap `buf.buffer` in an ImageData to show it. */
  readonly buf: Uint32Array<ArrayBuffer>;
  /** y of the kerb line the fighters stand on. */
  readonly streetY: number;
  readonly far: Layer;
  readonly near: Layer;
  readonly signs: readonly Sign[];
  /** Per-frame column lookups (length `width`), reused every frame. */
  readonly col: { farTop: Int16Array; farLx: Uint16Array; farId: Uint16Array; nearTop: Int16Array; nearLx: Uint16Array; nearId: Uint16Array };
  readonly fighters: [FighterSample, FighterSample, FighterSample];
  /** Draw the pixel stick-figure cast and their hit sparks. Off when real 3D fighters stand on the street instead. */
  readonly cast: boolean;
}

export function createStreetScene(width: number, height: number, opts: { cast?: boolean } = {}): StreetScene {
  const portrait = height > width;
  const streetY = Math.round(height * (portrait ? 0.8 : 0.76));
  const signs: Sign[] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    signs.push({
      wx: Math.round((i + 0.3 + hash01(i * 17 + 3) * 0.4) * (SCENE_PERIOD / count)),
      yOff: 56 + Math.round(hash01(i * 29 + 11) * 14) + (portrait ? Math.round((height - 180) * 0.3) : 0),
      tone: i % TONES.length,
      glyph: (i * 5 + 1) % GLYPHS.length,
      seed: i * 31 + 7,
    });
  }
  return {
    width,
    height,
    buf: new Uint32Array(new ArrayBuffer(width * height * 4)),
    streetY,
    far: buildLayer(1997, 22, 44, 46 + (portrait ? Math.round((height - 180) * 0.6) : 0), 96 + (portrait ? Math.round((height - 180) * 0.95) : 0)),
    near: buildLayer(631, 26, 52, 34, 64),
    signs,
    col: {
      farTop: new Int16Array(width), farLx: new Uint16Array(width), farId: new Uint16Array(width),
      nearTop: new Int16Array(width), nearLx: new Uint16Array(width), nearId: new Uint16Array(width),
    },
    fighters: [createFighterSample(), createFighterSample(), createFighterSample()],
    cast: opts.cast ?? true,
  };
}

const modP = (v: number): number => ((v % SCENE_PERIOD) + SCENE_PERIOD) % SCENE_PERIOD;

/** Halftone dot: is (x, y) inside a dot of coverage `i` on a 45-degree grid? */
function halftone(x: number, y: number, i: number): boolean {
  const u = frac((x + y) / 4) - 0.5;
  const v = frac((x - y) / 4) - 0.5;
  return Math.sqrt(u * u + v * v) < i * 0.62;
}

/** A lit window's colour for tower window cell (id, cx, cy), or 0 for dark. */
function windowColour(id: number, cx: number, cy: number, t: number, strong: boolean): number {
  const h = hash2(id * 131 + cx, cy * 17 + 3);
  if (h > (strong ? 0.24 : 0.17)) return 0;
  const h2 = hash2(id * 29 + cx * 3, cy + 91);
  // A few flicker, a few switch on and off over seconds; the rest burn steadily.
  if (h2 < 0.08 && Math.sin(t * 2.3 + h * 40) < -0.35) return 0;
  if (h2 > 0.9 && (Math.floor(t / 7 + h * 10) & 1) === 1) return 0;
  const pick = hash2(id + cx * 7, cy * 5 + 1);
  const ramp = pick < 0.62 ? YEL : pick < 0.82 ? PINK : CYA;
  return ramp[strong ? 2 : 1];
}

/**
 * Render one frame.
 * @param t     seconds since the scene began
 * @param px,py pointer offset in -1..1 (parallax); pass 0,0 for none
 */
export function renderStreet(scene: StreetScene, t: number, px = 0, py = 0): void {
  const { width: W, height: H, buf, streetY, col } = scene;
  const lt = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;

  // Screen shake: one pixel for ~0.12 s after a hit lands.
  let shake = 0;
  for (let b = 0; b < BEATS.length; b++) {
    const dt = lt - (BEATS[b].t + IMPACT_DELAY);
    if (dt >= 0 && dt < 0.12 && BEATS[b].result !== 'slip') shake = (Math.floor(t * 60) & 1) === 0 ? 1 : -1;
  }

  const cam = t * 1.4;
  const offFar = Math.floor(cam * 0.3 + px * 5) + shake;
  const offNear = Math.floor(cam * 0.7 + px * 11) + shake;
  const boostMax = Math.min(60, H * 0.28);
  const shiftY = Math.round(py * 2);

  for (let x = 0; x < W; x++) {
    const wf = modP(x + offFar);
    const wn = modP(x + offNear);
    col.farTop[x] = streetY - scene.far.height[wf] - shiftY;
    col.farLx[x] = scene.far.lx[wf];
    col.farId[x] = scene.far.id[wf];
    col.nearLx[x] = scene.near.lx[wn];
    col.nearId[x] = scene.near.id[wn];
    // The near row frames the street: it climbs toward both screen edges. Quantised per tower
    // (its first column decides), so roofs stay flat and windows stay square.
    const edge = Math.abs(x - col.nearLx[x] - W * 0.5) / (W * 0.5);
    const boost = Math.round((Math.max(0, edge - 0.5) * 2 * boostMax) / 4) * 4;
    col.nearTop[x] = Math.round(streetY - scene.near.height[wn] - boost - shiftY * 2);
  }

  for (let y = 0; y < H; y++) {
    const g = y / streetY;
    for (let x = 0; x < W; x++) {
      const d = bayer(x, y);
      let c: number;
      if (y >= streetY) {
        // Street: wet asphalt with a pink bloom under the kerb.
        const s = (y - streetY) / (H - streetY);
        if (y === streetY) c = PINK[2];
        else if (y === streetY + 1) c = PINK[0];
        else {
          const bloom = Math.max(0, 0.5 - s) * 1.1 + 0.08 * Math.sin(x * 0.11 + t * 0.35);
          c = bloom > d * 0.7 + 0.12 ? PLUM[3] : PLUM[s < 0.35 ? 2 : 1];
        }
        buf[y * W + x] = c;
        continue;
      }

      // Sky: plum to a pink haze on the roofline, drifting slowly.
      const haze = clamp01((g - 0.5) * 1.8) * 0.8 + 0.08 * Math.sin(x * 0.03 + y * 0.18 + t * 0.1);
      c = haze > d * 0.9 + 0.06 ? PINK[0] : PLUM[Math.min(3, Math.floor(g * 3.4 + d * 0.7))];

      // Far tenements: dusky, two-ink halftone, small windows.
      const ft = col.farTop[x];
      if (y >= ft) {
        const depth = (y - ft) / Math.max(1, streetY - ft);
        c = halftone(x, y, 0.28 + depth * 0.5) ? PINK[0] : PLUM[2];
        const lx = col.farLx[x];
        const ly = y - ft;
        if ((lx % 3) === 1 && (ly % 4) >= 1 && (ly % 4) <= 2 && ly > 2) {
          const wc = windowColour(col.farId[x], (lx / 3) | 0, (ly / 4) | 0, t, false);
          if (wc !== 0) c = wc;
        }
        if (y === ft) c = VIO[0];
      }

      // Near tenements: darker, bigger windows, a rim of pink light on the roof edge.
      const nt = col.nearTop[x];
      if (y >= nt) {
        const depth = (y - nt) / Math.max(1, streetY - nt);
        c = halftone(x, y, 0.1 + depth * 0.42) ? PINK[0] : PLUM[1];
        const lx = col.nearLx[x];
        const ly = y - nt;
        const cellX = (lx / 6) | 0;
        const cellY = ((ly - 4) / 7) | 0;
        if (ly > 3 && (lx % 6) >= 1 && (lx % 6) <= 3 && ((ly - 4) % 7) >= 1 && ((ly - 4) % 7) <= 4 && streetY - y > 6) {
          const wc = windowColour(col.nearId[x], cellX, cellY, t, true);
          c = wc !== 0 ? wc : PLUM[3];
        } else if (ly > 3 && ((ly - 4) % 7) === 6) {
          c = PLUM[2];
        }
        if (lx === 0) c = VIO[0];
        if (y === nt) c = PINK[1];
      }
      buf[y * W + x] = c;
    }
  }

  drawSigns(scene, t, offNear, shiftY);
  if (scene.cast) drawCast(scene, t, lt, px, shake);
  drawReflection(scene, t);
  drawRain(scene, t);
  drawSplashes(scene, t);
  drawSteam(scene, t, px);
  if (scene.cast) drawSparks(scene, lt, px, shake);
  drawVignette(scene);
}

// ---- Neon signs ----------------------------------------------------------------

/** Fighters are drawn this much larger than their pose data. */
export const FIGHTER_SCALE = 1.4;
const FS = FIGHTER_SCALE;

const SIGN_W = 16;
const SIGN_H = 20;

function plotMix(scene: StreetScene, x: number, y: number, c: number, a: number): void {
  if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) return;
  const i = y * scene.width + x;
  scene.buf[i] = mix(scene.buf[i], c, a);
}

function plotDither(scene: StreetScene, x: number, y: number, c: number, a: number): void {
  if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) return;
  if (a > bayer(x, y)) scene.buf[y * scene.width + x] = c;
}

function drawLine(scene: StreetScene, x0: number, y0: number, x1: number, y1: number, c: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) continue;
    scene.buf[y * scene.width + x] = c;
  }
}

/** Tube brightness of a sign over time: a slow breath, and every so often a stutter. */
function signLevel(seed: number, t: number): number {
  const block = Math.floor(t * 4 + seed * 0.37);
  const stutter = hash2(block, seed) > 0.955 ? 0.3 : 1;
  return (0.88 + 0.12 * Math.sin(t * 1.7 + seed)) * stutter;
}

function drawSigns(scene: StreetScene, t: number, offNear: number, shiftY: number): void {
  const { width: W, streetY } = scene;
  for (let i = 0; i < scene.signs.length; i++) {
    const s = scene.signs[i];
    let sx = modP(s.wx - offNear);
    if (sx > W + 24) sx -= SCENE_PERIOD;
    if (sx < -SIGN_W - 24) continue;
    const top = streetY - s.yOff - shiftY * 2;
    const ramp = TONES[s.tone];
    const level = signLevel(s.seed, t);
    const x0 = sx - SIGN_W / 2;

    // Halo: a dithered wash of the tube colour on the wall and air round the sign.
    const R = 9;
    for (let y = top - R; y <= top + SIGN_H + R; y++) {
      for (let x = Math.floor(x0) - R; x <= x0 + SIGN_W + R; x++) {
        const dx = x < x0 ? x0 - x : x > x0 + SIGN_W ? x - x0 - SIGN_W : 0;
        const dy = y < top ? top - y : y > top + SIGN_H ? y - top - SIGN_H : 0;
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd > R || dd === 0) continue;
        const a = (1 - dd / R) * 0.42 * level;
        if (a > bayer(x, y) * 0.8) plotMix(scene, x, y, ramp[1], 0.55);
      }
    }

    // Wires up to the roofline, then the box: dark glass, a bright tube frame.
    const fx = Math.round(x0);
    drawLine(scene, fx + 3, top - 6, fx + 3, top, PLUM[4]);
    drawLine(scene, fx + SIGN_W - 4, top - 6, fx + SIGN_W - 4, top, PLUM[4]);
    for (let y = 0; y < SIGN_H; y++) {
      for (let x = 0; x < SIGN_W; x++) {
        const edge = x === 0 || y === 0 || x === SIGN_W - 1 || y === SIGN_H - 1;
        const corner = (x === 0 || x === SIGN_W - 1) && (y === 0 || y === SIGN_H - 1);
        if (corner) continue;
        const px = fx + x;
        const py = top + y;
        if (px < 0 || py < 0 || px >= W || py >= scene.height) continue;
        if (edge) scene.buf[py * W + px] = level > 0.6 ? ramp[3] : ramp[1];
        else scene.buf[py * W + px] = mix(PLUM[1], ramp[0], 0.7);
      }
    }
    // Glyph: a thin tube, hot in the middle.
    const glyph = GLYPHS[s.glyph];
    const gx = fx + ((SIGN_W - GLYPH_W) >> 1);
    const gy = top + ((SIGN_H - GLYPH_H) >> 1);
    const core = level > 0.6 ? ramp[4] : ramp[1];
    for (let k = 0; k < glyph.length; k++) {
      const [a, b, c, d] = glyph[k];
      drawLine(scene, gx + a, gy + b, gx + c, gy + d, core);
    }
  }
}

// ---- Fighters ------------------------------------------------------------------

function pointOf(out: Float32Array, joint: number): [number, number] {
  return [out[joint * 2], out[joint * 2 + 1]];
}

function drawFighter(
  scene: StreetScene,
  joints: Float32Array,
  ox: number,
  oy: number,
  dir: 1 | -1,
  ramp: readonly number[],
  level: number,
): void {
  const P = (joint: number): [number, number] => {
    const [jx, jy] = pointOf(joints, joint);
    return [ox + dir * jx * FS, oy + jy * FS];
  };
  const head = P(J.head);
  const neck = P(J.neck);
  const hip = P(J.hip);
  const segs: [[number, number], [number, number]][] = [
    [neck, hip],
    [neck, [head[0], head[1] + 4]],
    [neck, P(J.lElbow)], [P(J.lElbow), P(J.lHand)],
    [neck, P(J.rElbow)], [P(J.rElbow), P(J.rHand)],
    [hip, P(J.lKnee)], [P(J.lKnee), P(J.lFoot)],
    [hip, P(J.rKnee)], [P(J.rKnee), P(J.rFoot)],
  ];

  // Glow first (every segment), then the tubes, so a core is never painted over by a neighbour's halo.
  const R = 3;
  for (const [a, b] of segs) {
    const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let i = 0; i <= steps; i++) {
      const cx = a[0] + ((b[0] - a[0]) * i) / steps;
      const cy = a[1] + ((b[1] - a[1]) * i) / steps;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > R) continue;
          plotDither(scene, Math.round(cx) + dx, Math.round(cy) + dy, ramp[1], (1 - dd / R) * 0.55 * level);
        }
      }
    }
  }
  const hr = 5;
  for (let dy = -hr - 3; dy <= hr + 3; dy++) {
    for (let dx = -hr - 3; dx <= hr + 3; dx++) {
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > hr + 3) continue;
      if (dd > hr + 0.5) plotDither(scene, Math.round(head[0]) + dx, Math.round(head[1]) + dy, ramp[1], (1 - (dd - hr) / 3) * 0.5 * level);
    }
  }
  for (const [a, b] of segs) {
    drawLine(scene, Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), ramp[3]);
  }
  // Head ring, dark inside, and a bright core line along the torso and limbs' centres.
  for (let dy = -hr; dy <= hr; dy++) {
    for (let dx = -hr; dx <= hr; dx++) {
      const dd = Math.sqrt(dx * dx + dy * dy);
      const x = Math.round(head[0]) + dx;
      const y = Math.round(head[1]) + dy;
      if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) continue;
      if (dd <= hr - 0.9) scene.buf[y * scene.width + x] = PLUM[0];
      else if (dd <= hr + 0.2) scene.buf[y * scene.width + x] = ramp[4];
    }
  }
  for (const [a, b] of segs) {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    plotDither(scene, Math.round(mx), Math.round(my), ramp[4], 1);
  }
}

function drawCast(scene: StreetScene, t: number, lt: number, px: number, shake: number): void {
  const { width: W, streetY, fighters } = scene;
  const cx = W * 0.5 + px * 3 + shake;
  const feetY = streetY;
  void lt;
  for (const who of [0, 1] as const) {
    const f = fighters[who];
    sampleFighter(who, t, f);
    const dir: 1 | -1 = who === 0 ? 1 : -1;
    const x = cx + (standingX(who) + dir * f.x) * FS;
    drawFighter(scene, f.joints, x, feetY, dir, who === 0 ? PINK : CYA, 0.9 + 0.1 * Math.sin(t * 5 + who));
  }
  // The bystander: a yellow stick figure at the edge of the crowd, watching and bobbing.
  const by = fighters[2];
  by.joints.set(POSES.watch);
  const sway = Math.sin(t * 2.1) * 0.8;
  for (let k = 1; k < 14; k += 2) by.joints[k] += sway;
  const bx = cx + Math.min(W * 0.36, 92);
  drawFighter(scene, by.joints, bx, feetY, -1, YEL, 0.85 + 0.1 * Math.sin(t * 2.1));
}

// ---- Sparks --------------------------------------------------------------------

function drawSparks(scene: StreetScene, lt: number, px: number, shake: number): void {
  const { width: W, streetY } = scene;
  const cx = W * 0.5 + px * 3 + shake;
  for (let b = 0; b < BEATS.length; b++) {
    const beat = BEATS[b];
    if (beat.result === 'slip') continue;
    const dt = lt - (beat.t + IMPACT_DELAY);
    if (dt < 0 || dt > 0.18) continue;
    const spot = sparkSpot(beat);
    const sx = Math.round(cx + spot.x * FS);
    const sy = Math.round(streetY + spot.y * FS);
    const big = beat.result === 'block' ? 0.55 : beat.result === 'knockdown' ? 1.4 : 1;
    const len = Math.round((3 + dt * 60) * big);
    const fade = 1 - dt / 0.18;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + 0.2;
      const rl = k & 1 ? len * 0.6 : len;
      for (let i = 1; i <= rl; i++) {
        plotDither(scene, Math.round(sx + Math.cos(ang) * i), Math.round(sy + Math.sin(ang) * i), i < rl * 0.5 ? WHITE : YEL[3], fade + 0.2);
      }
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) plotDither(scene, sx + dx, sy + dy, WHITE, 1);
  }
}

// ---- The wet street ------------------------------------------------------------

function drawReflection(scene: StreetScene, t: number): void {
  const { width: W, height: H, buf, streetY } = scene;
  const span = H - streetY;
  for (let y = streetY + 2; y < H; y++) {
    const d = y - streetY;
    const srcY = streetY - Math.round(d * 1.15);
    if (srcY < 0) break;
    const fade = 1 - d / span;
    const shift = Math.round(Math.sin(d * 0.9 + t * 1.6) * 1.4);
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x + shift));
      const c = buf[srcY * W + sx];
      buf[y * W + x] = mix(buf[y * W + x], c, 0.12 + fade * fade * 0.42);
    }
  }
}

// ---- Weather -------------------------------------------------------------------

function drawRain(scene: StreetScene, t: number): void {
  const { width: W, height: H } = scene;
  const n = Math.round((W * H) / 760);
  for (let i = 0; i < n; i++) {
    const near = hash01(i * 5 + 4) > 0.7;
    const speed = near ? 150 + hash01(i * 3 + 1) * 70 : 90 + hash01(i * 3 + 2) * 40;
    const span = H + 24;
    const y = frac((t * speed) / span + hash01(i * 7 + 3)) * span - 12;
    const x = hash01(i * 11 + 9) * (W + 30) - 10 - y * 0.18;
    const len = near ? 6 : 4;
    const c = near ? RAIN_NEAR : RAIN_FAR;
    const a = near ? 0.7 : 0.4;
    for (let k = 0; k < len; k++) {
      plotMix(scene, Math.round(x - k * 0.18), Math.round(y - k), c, a * (1 - k / (len + 1)));
    }
  }
}

function drawSplashes(scene: StreetScene, t: number): void {
  const { width: W, height: H, streetY } = scene;
  const n = Math.round((W * (H - streetY)) / 520);
  for (let i = 0; i < n; i++) {
    const phase = frac(t * 1.3 + hash01(i * 13 + 2));
    const x = hash01(i * 19 + 5) * W;
    const y = streetY + 4 + hash01(i * 23 + 7) * (H - streetY - 6);
    const r = 0.8 + phase * 3.6;
    const a = (1 - phase) * 0.9;
    const ry = r * 0.38;
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2;
      plotMix(scene, Math.round(x + Math.cos(ang) * r), Math.round(y + Math.sin(ang) * ry), RAIN_NEAR, a * 0.7);
    }
  }
}

function drawSteam(scene: StreetScene, t: number, px: number): void {
  const { width: W, streetY } = scene;
  const vx = W * 0.76 + px * 9;
  for (let i = 0; i < 6; i++) {
    const u = frac(t / 6 + i / 6);
    const x = vx + Math.sin(u * 5 + i * 1.9) * 3 * (0.4 + u);
    const y = streetY + 5 - u * 38;
    const r = 2 + u * 8;
    const alpha = (1 - u) * 0.5 * clamp01(u / 0.12);
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
        const dd = Math.hypot(xx - x, yy - y);
        if (dd > r) continue;
        if (alpha * (1 - dd / r) > bayer(xx, yy) * 0.6) plotMix(scene, xx, yy, PLUM[5], 0.75);
      }
    }
  }
}

function drawVignette(scene: StreetScene): void {
  const { width: W, height: H, buf } = scene;
  const hw = W / 2;
  const hh = H / 2;
  for (let y = 0; y < H; y++) {
    const dy = (y + 0.5 - hh) / hh;
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - hw) / hw;
      const v = dx * dx * 0.7 + dy * dy * 0.7;
      if (v < 0.55) continue;
      const f = (v - 0.55) / 0.9;
      if (f > bayer(x, y) * 1.1) buf[y * W + x] = dim(buf[y * W + x], 0.55);
    }
  }
}
