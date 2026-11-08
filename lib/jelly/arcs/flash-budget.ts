/**
 * The combined flash caps of a strike (Task 9 fix round 1; WCAG 2.3.1, a hard gate). Two bounds hold for EVERYTHING
 * the arc layer draws, not for one layer at a time, and the renderer takes every alpha it draws from the builders in
 * this file, so the caps cannot drift from the drawing code:
 *
 * ## 1. Per pixel: {@link centreBudget}
 *
 * The impact layers — the flash disc, both specular streaks, the shock ring, the lit rim (coloured and white), the
 * contact glow and the press flare — may overlap, within one impact and between neighbouring impacts. Their summed
 * coverage at ANY pixel is held to the coverage that changes relative luminance by `FLASH_LUMINANCE.maxPeak` (0.6) on
 * the worst ground:
 *
 * - "Coverage" is alpha × the colour's value: on dark themes (`lighter`, additive) the colour's largest channel, so
 *   the summed per-channel addition is at most the coverage; on light themes (`source-over`, which can only cover) one
 *   minus its smallest channel, the most any channel can be pulled toward black.
 * - Both themes use the same, ground-independent figure: the worst ground for a coverage c is the one it can still lift
 *   fully (g = 1 − c; on light themes, white), where it changes luminance by `1 − lin(1 − c)`. A coverage of
 *   `1 − gam(0.4)` ≈ 0.335 changes it by exactly 0.6 on ANY ground, images and light fills in dark themes included.
 *   (An earlier version assumed a dark ground ≤ 0.2 for dark themes; additive light changes MORE on brighter grounds,
 *   so that cap was not a bound — the round 2 re-review.)
 * - Method ({@link centreBound}): every item's layers are radial profiles round its point (the streaks' and the rim's
 *   isotropic envelopes, which over-cover them). Let E be the non-increasing envelope of an item's summed profile.
 *   Take any pixel p and let i be the item whose point is nearest p. Every other item j is then at least d_ij / 2
 *   from p (d_ij ≤ |p − x_i| + |p − x_j| ≤ 2|p − x_j|). So p receives at most `E_i(0) + Σ_{j≠i} E_j(d_ij / 2)`. The
 *   renderer scales each item's layers by {@link centreScales} (budget / the largest bound among the pixels its light
 *   can reach), so the cap holds at every pixel. The flash-budget test checks this against a brute-force raster in the
 *   worst case, with per-item scales.
 * - Layers are shaped so they do not all peak on one pixel. The disc owns the centre. The streaks and the rim light
 *   are hollow there ({@link STREAK_STOPS}, {@link RIM_STOPS}: they rise to their peak just outside the disc's hot
 *   core). The contact glow hands over to the disc while the flash is lit.
 * - Not in this cap: the bolt itself, i.e. its core and white-hot line (≤ 2.2px wide), its mid glow (≤ 7px) and bloom
 *   (≤ 20px, coverage ≤ 0.09, under a flash transition on its own), and the refracted stubs inside the gel. They are
 *   a line a few px wide, not an area. Where they cross an impact they can push a few px to white. Their area is
 *   counted in bound 2.
 *
 * ## 2. Per frame: the area budget
 *
 * `FLASH_LUMINANCE.areaBudgetPx2` (a quarter of WCAG's small-area threshold) bounds the area, summed over EVERY layer
 * of every arc live in the frame, in which a layer raises (or, on light themes, lowers) luminance by ≥ 0.1. A layer
 * counts where its coverage reaches {@link flashThreshold} (the coverage that makes 0.1 on the worst ground):
 *
 * - lines (bolt passes, stubs, halo, ring, rim strokes): width × length, counted whole once their coverage reaches the
 *   threshold (a ring is counted as its full, unclipped circle; a rim as its whole lit stretch);
 * - radial gradients (disc, streaks, contact glows, flares): the ellipse inside which the gradient stays at or above
 *   the threshold.
 *
 * Summing areas over-counts overlaps, which is conservative. {@link fitFrame} finds the one scale for every non-line
 * layer (and, only if the bolt lines alone would overflow, a scale for them) under which the frame fits. With the
 * ledger's ≤ 3 bolts live this almost never dims anything; it bites only for very long bolts or piled-up impacts.
 *
 * Pure.
 */

import { glowPasses } from './glow';
import { IMPACT, IMPACT_STOPS, FLASH_LUMINANCE, type ImpactSample } from './impact';
import { RIM_LIGHT } from './reflection';

const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * The coverage `c` that changes relative luminance by `delta` on the WORST ground, whatever the ground is. Adding
 * coverage `c` (or, on light themes, pulling toward black by `c`) moves a pixel of encoded value g by lin(min(1, g + c))
 * − lin(g) (resp. lin(g) − lin(max(0, g − c))). lin is convex, so the change is largest on the brightest ground the
 * coverage can still lift fully (g = 1 − c) and, for source-over, on white; both give `1 − lin(1 − c)`. Ground-independent
 * on purpose: an arc draws over images, thumbnails and light fills in dark themes too (review, Task 9 round 2).
 */
function coverageFor(delta: number): number {
  return 1 - gam(1 - delta);
}

/** The most summed coverage one pixel may take from the impact layers: luminance changes by ≤ `maxPeak`, on any ground. */
export function centreBudget(_dark?: boolean): number {
  return coverageFor(FLASH_LUMINANCE.maxPeak);
}

/** The coverage at which a layer changes luminance by `flashDelta` (0.1) on the worst ground. */
export function flashThreshold(_dark?: boolean): number {
  return coverageFor(FLASH_LUMINANCE.flashDelta);
}

/** A colour's coverage per unit alpha (sRGB 0..1): dark, its largest channel; light, 1 − its smallest. */
export function colourValue(rgb: readonly number[], dark: boolean): number {
  return dark ? Math.max(rgb[0], rgb[1], rgb[2]) : 1 - Math.min(rgb[0], rgb[1], rgb[2]);
}

// ── Drawing constants (the renderer draws with these; the budget counts them) ──

/** The pre-glow / strike contact glow on a rim end, and its squash across the rim. */
export const CONTACT_GLOW = { alpha: 0.35, squash: 0.6 } as const;
/** The faint halo pass of a high-energy click bolt. */
export const HALO = { width: 12, alpha: 0.06, minEnergy: 0.8 } as const;
/** The bolt's light inside the gel (the refracted stubs), relative to the channel in air. */
export const GEL_LIGHT = { glow: 0.8, core: 0.55, hot: 0.45, width: 0.8 } as const;
/** A branch's passes are thinner than the main channel's. */
export const BRANCH_WIDTH = 0.6;
/** The rim light's white inner line on dark themes: this share of the coloured line's alpha, half its width and reach. */
export const RIM_WHITE_SHARE = 0.3;
/** Light themes: the disc, streaks and ring tint with the core colour at this share (source-over cannot add light). */
export const LIGHT_THEME_FLASH = 0.45;

// ── Profiles (per pixel) ─────────────────────────────────────────────────────

type Stops = readonly (readonly [number, number])[];
const LINEAR: Stops = [
  [0, 1],
  [1, 0],
];
/** A specular streak's gradient along its length: hollow where the disc's hot core is, peaking just outside it. */
export const STREAK_STOPS: Stops = [
  [0, 0],
  [0.3, 1],
  [1, 0],
];
/** The lit rim's gradient along the rim from the contact (over half the lit span): dim on the disc, peaking beside it. */
export const RIM_STOPS: Stops = [
  [0, 0.25],
  [0.3, 1],
  [1, 0],
];

export type Profile =
  /** A radial gradient (or the isotropic envelope of an elongated one): coverage `alpha·value·stops(d/radius)`. */
  | { kind: 'stops'; alpha: number; value: number; radius: number; stops: Stops }
  /** A ring: coverage `alpha·value` within `width/2` of `radius`. */
  | { kind: 'annulus'; alpha: number; value: number; radius: number; width: number };

function stopsAt(stops: Stops, u: number): number {
  if (!(u >= 0) || u >= 1) return u < 0 ? stops[0][1] : 0;
  for (let i = 1; i < stops.length; i++) {
    const [o0, v0] = stops[i - 1];
    const [o1, v1] = stops[i];
    if (u <= o1) return o1 === o0 ? v1 : v0 + ((v1 - v0) * (u - o0)) / (o1 - o0);
  }
  return 0;
}

/** A profile's coverage at distance `d` from its point. */
export function profileAt(p: Profile, d: number): number {
  if (!(p.alpha > 0) || !(p.value > 0)) return 0;
  if (p.kind === 'annulus') return Math.abs(d - p.radius) <= p.width / 2 ? p.alpha * p.value : 0;
  if (!(p.radius > 0) || d >= p.radius) return 0;
  return p.alpha * p.value * stopsAt(p.stops, d / p.radius);
}

const reachOf = (p: Profile) => (p.kind === 'annulus' ? p.radius + p.width / 2 : p.radius);

export interface CentreItem {
  x: number;
  y: number;
  profiles: Profile[];
}

/** Envelope sampling step, px. The envelope is taken at the sample at or nearer than a distance (conservative). */
const ENVELOPE_STEP = 0.5;

/** The non-increasing envelope of an item's summed profile, sampled every {@link ENVELOPE_STEP}, and its reach. */
function envelope(item: CentreItem): { values: Float64Array; reach: number } {
  const reach = Math.max(0, ...item.profiles.map(reachOf));
  const n = Math.ceil(reach / ENVELOPE_STEP) + 2;
  const values = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    // The sup over the sample's cell [k·step, (k+1)·step): profiles are piecewise linear or a band, so the cell's two
    // ends and the band edges bound it.
    const d0 = k * ENVELOPE_STEP;
    const d1 = d0 + ENVELOPE_STEP;
    let v = 0;
    for (const p of item.profiles) {
      let pv = Math.max(profileAt(p, d0), profileAt(p, Math.min(d1, reachOf(p) - 1e-9)));
      if (p.kind === 'annulus') {
        if (p.radius + p.width / 2 >= d0 && p.radius - p.width / 2 <= d1) pv = p.alpha * p.value;
      } else {
        // A stop inside the cell (a hollow gradient's peak) is a local maximum the cell's ends would miss.
        for (const [o] of p.stops) {
          const d = o * p.radius;
          if (d > d0 && d < d1) pv = Math.max(pv, profileAt(p, d));
        }
      }
      v += pv;
    }
    values[k] = v;
  }
  for (let k = n - 2; k >= 0; k--) values[k] = Math.max(values[k], values[k + 1]);
  return { values, reach };
}

const envAt = (e: { values: Float64Array }, d: number) => {
  const k = Math.floor(Math.max(0, d) / ENVELOPE_STEP);
  return k < e.values.length ? e.values[k] : 0;
};

/** Per item: the bound on any pixel whose nearest item it is, and the items whose light can reach such a pixel. */
function bounds(items: readonly CentreItem[]): { bound: number[]; reaches: number[][] } {
  const envs = items.map(envelope);
  const bound = items.map((_, i) => envs[i].values[0]);
  const reaches: number[][] = items.map(() => []);
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      const d = Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y);
      const e = envAt(envs[j], d / 2);
      if (e > 0) {
        bound[i] += e;
        reaches[j].push(i);
      }
    }
  }
  return { bound, reaches };
}

/** An upper bound on the summed coverage at any pixel (see the file comment). */
export function centreBound(items: readonly CentreItem[]): number {
  return Math.max(0, ...bounds(items).bound);
}

/**
 * Each item's scale, so that no pixel exceeds {@link centreBudget}: item j is drawn at the smallest `budget / bound_i`
 * over itself and every item i whose nearest pixels its light can reach. (At a pixel whose nearest item is i, every
 * contribution comes from i or from an item that reaches i's pixels, each scaled by at most budget / bound_i, and
 * the unscaled sum is at most bound_i.) Far-apart groups do not dim each other.
 */
export function centreScales(items: readonly CentreItem[], dark: boolean): number[] {
  const { bound, reaches } = bounds(items);
  const budget = centreBudget(dark);
  const own = bound.map((b) => (b > 0 ? Math.min(1, budget / b) : 1));
  return own.map((c, j) => Math.min(c, ...reaches[j].map((i) => own[i])));
}

/** One scale for every item (the smallest of {@link centreScales}). */
export function centreScale(items: readonly CentreItem[], dark: boolean): number {
  return items.length ? Math.min(...centreScales(items, dark)) : 1;
}

// ── Areas (per frame) ────────────────────────────────────────────────────────

export type AreaLayer =
  | { tag: string; kind: 'line'; coverage: number; width: number; length: number }
  | { tag: string; kind: 'radial'; coverage: number; area: number; stops: Stops };

/**
 * The outer share (0..1) of a gradient's radius at which coverage `c` × stops still reaches `thr`: the largest `u`
 * with `c·stops(u) ≥ thr`, 0 if none. Stops may rise then fall (a hollow centre); the whole disc inside is counted.
 */
export function outerAbove(stops: Stops, c: number, thr: number): number {
  if (!(thr > 0)) return 1;
  for (let i = stops.length - 1; i >= 1; i--) {
    const [o0, v0] = stops[i - 1];
    const [o1, v1] = stops[i];
    if (c * v1 >= thr) return o1;
    if (c * v0 >= thr) return v0 === v1 ? o1 : o0 + ((o1 - o0) * (c * v0 - thr)) / (c * (v0 - v1));
  }
  return c * stops[0][1] >= thr ? stops[0][0] : 0;
}

/** Px² in which `layer`, drawn at `scale`, changes luminance by ≥ 0.1 (coverage ≥ `thr`). */
export function layerArea(layer: AreaLayer, scale: number, thr: number): number {
  const c = layer.coverage * scale;
  if (layer.kind === 'line') return c >= thr ? layer.width * layer.length : 0;
  const r = outerAbove(layer.stops, c, thr);
  return layer.area * r * r;
}

export function frameArea(layers: readonly AreaLayer[], scale: number, thr: number): number {
  let sum = 0;
  for (const l of layers) sum += layerArea(l, scale, thr);
  return sum;
}

/** The largest scale ≤ 1 at which `layers` fit `budget` px². */
function fitScale(layers: readonly AreaLayer[], thr: number, budget: number): number {
  if (frameArea(layers, 1, thr) <= budget) return 1;
  if (budget <= 0 && frameArea(layers, 0, thr) > 0) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (frameArea(layers, mid, thr) <= budget) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The frame's scales: `scale` for every non-line layer (impacts, glow passes, stubs' glow, rims, contacts, flares),
 * `lineScale` for the bolt's core and white-hot lines (1 unless they alone would overflow the budget).
 */
export function fitFrame(
  scaled: readonly AreaLayer[],
  lines: readonly AreaLayer[],
  dark: boolean,
): { scale: number; lineScale: number } {
  const thr = flashThreshold(dark);
  const budget = FLASH_LUMINANCE.areaBudgetPx2;
  const lineScale = fitScale(lines, thr, budget);
  const left = budget - frameArea(lines, lineScale, thr);
  return { scale: fitScale(scaled, thr, left), lineScale };
}

// ── Builders (the renderer draws exactly these alphas, × its scale) ────────────

export interface BoltFlashInput {
  energy: number;
  /** Channel intensity × fade × motion scale. */
  k: number;
  dark: boolean;
  /** The glow token's own alpha. */
  glowAlpha: number;
  /** Coverage value of the core colour (and of the split copies on dark themes, which add back to it). */
  coreValue: number;
  /** Light themes: the largest coverage value among the three fringe colours. */
  fringeValue: number;
  halo: boolean;
  /** The afterglow: no glow passes. */
  after?: boolean;
  mainLength: number;
  branches: readonly { length: number; intensity: number }[];
  stubLengths: readonly number[];
}

/**
 * Coverage of a split glow pass drawn at alpha `a`: dark, the three copies add back to the core colour; light, three
 * covering copies of the fringe colours (counted as if they all overlapped).
 */
export function splitCoverage(
  a: number,
  dark: boolean,
  coreValue: number,
  fringeValue: number,
): number {
  return dark ? a * coreValue : Math.min(1, 3 * a) * fringeValue;
}

/** A bolt's area layers: `scaled` (glow passes, stub glow, halo) and `lines` (core and white-hot, in air and in gel). */
export function boltLayers(b: BoltFlashInput): { scaled: AreaLayer[]; lines: AreaLayer[] } {
  const scaled: AreaLayer[] = [];
  const lines: AreaLayer[] = [];
  for (const p of glowPasses(b.dark, b.energy, b.k)) {
    if (p.colour === 'glow') {
      if (b.after) continue;
      const cov = splitCoverage(p.alpha * b.glowAlpha, b.dark, b.coreValue, b.fringeValue);
      scaled.push({ tag: p.id, kind: 'line', coverage: cov, width: p.width, length: b.mainLength });
      for (const br of b.branches) {
        scaled.push({
          tag: p.id,
          kind: 'line',
          coverage: cov * br.intensity,
          width: p.width * BRANCH_WIDTH,
          length: br.length,
        });
      }
      if (p.id === 'mid') {
        for (const len of b.stubLengths) {
          scaled.push({
            tag: 'stub-glow',
            kind: 'line',
            coverage: cov * GEL_LIGHT.glow,
            width: p.width * GEL_LIGHT.width,
            length: len,
          });
        }
      }
    } else {
      const white = p.colour === 'white';
      const cov = p.alpha * (white ? 1 : b.coreValue);
      const tag = white ? 'hot' : 'core';
      lines.push({ tag, kind: 'line', coverage: cov, width: p.width, length: b.mainLength });
      if (!b.after) {
        for (const br of b.branches) {
          lines.push({
            tag,
            kind: 'line',
            coverage: cov * br.intensity,
            width: p.width * BRANCH_WIDTH,
            length: br.length,
          });
        }
      }
      for (const len of b.stubLengths) {
        lines.push({
          tag: white ? 'stub-hot' : 'stub-core',
          kind: 'line',
          coverage: cov * (white ? GEL_LIGHT.hot : GEL_LIGHT.core),
          width: p.width * GEL_LIGHT.width,
          length: len,
        });
      }
    }
  }
  if (b.halo && !b.after) {
    scaled.push({
      tag: 'halo',
      kind: 'line',
      coverage: HALO.alpha * b.k * b.glowAlpha * b.coreValue,
      width: HALO.width,
      length: b.mainLength,
    });
  }
  return { scaled, lines };
}

/** The alphas one impact point draws with (before the frame's scale). */
export interface ImpactAlphas {
  disc: number;
  streak: number;
  cross: number;
  ring: number;
  rim: number;
  rimWhite: number;
  contact: number;
}

export interface ImpactItemInput {
  x: number;
  y: number;
  /** The impact's sample now, or null (no impact live at this point: a contact glow or rim only). */
  sample: ImpactSample | null;
  /** The point has a host rect, so the ring is drawn (clipped to it). */
  ring: boolean;
  /** The contact glow's intensity (sample glow × fade × motion scale); 0 for the press point. */
  contactAlpha: number;
  /** The rim light's intensity (the channel's k); 0 where there is no lit rim. */
  rimK: number;
  dark: boolean;
  glowAlpha: number;
  /** Coverage values of the glow colour and of the disc/streak colour (white on dark, core on light). */
  values: { glow: number; hot: number };
  /** Contact glow radius (click 14, ambient 10, flare 14). */
  contactRadius?: number;
  /** Area tag for the contact glow ('contact' or 'flare'). */
  contactTag?: string;
}

/** One impact point's alphas, its per-pixel profiles and its area layers. */
export function impactItem(i: ImpactItemInput): {
  alphas: ImpactAlphas;
  centre: CentreItem;
  area: AreaLayer[];
} {
  const s = i.sample;
  const tint = i.dark ? 1 : LIGHT_THEME_FLASH;
  const disc = s ? s.flash * IMPACT.peak * tint : 0;
  const alphas: ImpactAlphas = {
    disc,
    streak: disc * IMPACT.streakAlpha,
    cross: disc * IMPACT.streakAlpha,
    ring: s && i.ring ? s.ringAlpha * i.glowAlpha * tint : 0,
    rim: RIM_LIGHT.alpha * i.rimK,
    rimWhite: i.dark ? RIM_LIGHT.alpha * i.rimK * RIM_WHITE_SHARE : 0,
    // While the flash is lit the disc takes over from the contact glow.
    contact: CONTACT_GLOW.alpha * i.contactAlpha * i.glowAlpha * (s ? 1 - Math.min(1, s.flash) : 1),
  };
  const cr = i.contactRadius ?? 14;
  const profiles: Profile[] = [];
  const area: AreaLayer[] = [];
  const add = (p: Profile, a: AreaLayer) => {
    if (!(p.alpha > 0)) return;
    profiles.push(p);
    area.push(a);
  };
  add(
    { kind: 'stops', alpha: alphas.contact, value: i.values.glow, radius: cr, stops: LINEAR },
    {
      tag: i.contactTag ?? 'contact',
      kind: 'radial',
      coverage: alphas.contact * i.values.glow,
      area: Math.PI * cr * cr * CONTACT_GLOW.squash,
      stops: LINEAR,
    },
  );
  const span = RIM_LIGHT.spanPx;
  add(
    { kind: 'stops', alpha: alphas.rim, value: i.values.glow, radius: span / 2, stops: RIM_STOPS },
    {
      tag: 'rim',
      kind: 'line',
      coverage: alphas.rim * i.values.glow,
      width: RIM_LIGHT.widthPx,
      length: span,
    },
  );
  add(
    { kind: 'stops', alpha: alphas.rimWhite, value: 1, radius: span / 4, stops: RIM_STOPS },
    {
      tag: 'rim-white',
      kind: 'line',
      coverage: alphas.rimWhite,
      width: RIM_LIGHT.widthPx / 2,
      length: span / 2,
    },
  );
  if (s) {
    add(
      {
        kind: 'stops',
        alpha: alphas.disc,
        value: i.values.hot,
        radius: s.flashRadius,
        stops: IMPACT_STOPS,
      },
      {
        tag: 'disc',
        kind: 'radial',
        coverage: alphas.disc * i.values.hot,
        area: Math.PI * s.flashRadius * s.flashRadius,
        stops: IMPACT_STOPS,
      },
    );
    const half = s.streakLength / 2;
    const crossHalf = half * IMPACT.crossStreakShare;
    add(
      {
        kind: 'stops',
        alpha: alphas.streak,
        value: i.values.hot,
        radius: half,
        stops: STREAK_STOPS,
      },
      {
        tag: 'streak',
        kind: 'radial',
        coverage: alphas.streak * i.values.hot,
        area: Math.PI * half * IMPACT.streakWidthPx,
        stops: STREAK_STOPS,
      },
    );
    add(
      {
        kind: 'stops',
        alpha: alphas.cross,
        value: i.values.hot,
        radius: crossHalf,
        stops: STREAK_STOPS,
      },
      {
        tag: 'cross-streak',
        kind: 'radial',
        coverage: alphas.cross * i.values.hot,
        area: Math.PI * crossHalf * IMPACT.streakWidthPx,
        stops: STREAK_STOPS,
      },
    );
    add(
      {
        kind: 'annulus',
        alpha: alphas.ring,
        value: i.values.glow,
        radius: s.ringRadius,
        width: s.ringWidth,
      },
      {
        tag: 'ring',
        kind: 'line',
        coverage: alphas.ring * i.values.glow,
        width: s.ringWidth,
        length: 2 * Math.PI * s.ringRadius,
      },
    );
  }
  return { alphas, centre: { x: i.x, y: i.y, profiles }, area };
}

/** The click flare at the press point: a contact glow of the flare's radius (never ledgered, still capped). */
export function flareItem(f: {
  x: number;
  y: number;
  glow: number;
  glowAlpha: number;
  value: number;
  radius?: number;
}) {
  return impactItem({
    x: f.x,
    y: f.y,
    sample: null,
    ring: false,
    contactAlpha: f.glow,
    rimK: 0,
    dark: true,
    glowAlpha: f.glowAlpha,
    values: { glow: f.value, hot: f.value },
    contactRadius: f.radius ?? 14,
    contactTag: 'flare',
  });
}
