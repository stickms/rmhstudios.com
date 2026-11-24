/**
 * Draws the paintings beside the sign-in form (`public/images/login/<scene>-<size>.webp`).
 *
 * Each is a landscape built from a couple of thousand solid-colour brush strokes: broad horizontal strokes for the sky,
 * strokes that follow the slope of each ridge, tangential strokes around the sun or moon, long flat strokes for water,
 * short dabs for flowers and surf. Every stroke is one tapered, slightly ragged shape with a few thin bristle lines in
 * a lighter and a darker shade of its own colour, so it reads as wet paint dragged across a canvas. The SVG it draws has
 * no gradient, blur or transparency (Steel R1; a picture is content, but the source stays flat anyway) and is
 * rasterised to WebP, one large file and one small one per scene so a phone does not download a desktop picture, plus a
 * 48px preview per scene (a few hundred bytes) written into lib/auth/login-art-previews.ts as a data URI: the page shows
 * it at once and fades the real picture in over it, so a slow connection sees a soft blur that sharpens, with no CSS
 * filter (Steel B2). The
 * result is deterministic: the same scene and seed always draw the same picture.
 *
 *   pnpm exec tsx scripts/gen-login-painting.ts                       # every scene, both sizes, into public/images/login
 *   pnpm exec tsx scripts/gen-login-painting.ts --scene twilight      # one scene
 *   pnpm exec tsx scripts/gen-login-painting.ts --seed 7 --out /tmp/x # another seed, another folder
 *   pnpm exec tsx scripts/gen-login-painting.ts --svg                 # also keep each scene's SVG source beside the WebP
 *
 * The previews module is rewritten only by a run that draws every scene into the default folder.
 *
 * The scene names are `LOGIN_ART` in lib/auth/login-art.ts, which the login page picks from at random; the two lists
 * are held equal by lib/auth/__tests__/login-art.test.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { mulberry32 } from '../lib/core/rng';

const SIZE = 1200;

type HSL = readonly [number, number, number]; // degrees, 0-1, 0-1

interface Scene {
  sun: { x: number; y: number; r: number };
  /** Colours of the sun or moon: the glow's inner and outer ring, the flat disc, and the paint swung round its middle. */
  haloNear: HSL;
  haloFar: HSL;
  disc: HSL;
  core: HSL;
  cloud: HSL;
  /** Blue at the top and warm at the horizon, written so the hue never has to cross green on the way. */
  skyStops: readonly (readonly [number, HSL])[];
  /** Each ridge: a colour pair and a skyline. Painted from the back to the front. */
  ridges: readonly { base: number; amp: number; freq: number; phase: number; near: HSL; far: HSL }[];
  ground: 'meadow' | 'water';
  groundStops: readonly (readonly [number, HSL])[];
  /** Meadow: the flowers. */
  blooms: readonly HSL[];
  /** Water: the sun's reflection, white caps and a sandy shore. */
  reflect: HSL | null;
  foam: boolean;
  sand: boolean;
  /** The tall strokes along the bottom edge: across the whole width, only at the sides (reeds), or none. */
  grass: { color: HSL; where: 'across' | 'sides' | 'none' };
}

const SCENES: Record<string, Scene> = {
  // Sunrise over layered hills, a meadow of wildflowers in the foreground.
  meadow: {
    sun: { x: 790, y: 450, r: 104 },
    haloNear: [46, 0.8, 0.92],
    haloFar: [26, 0.62, 0.9],
    disc: [46, 0.9, 0.92],
    core: [48, 0.95, 0.93],
    cloud: [28, 0.5, 0.95],
    // A nearly colourless pearl in the middle (so the blue never has to pass through green), then cream and a blush.
    skyStops: [
      [0, [206, 0.38, 0.8]],
      [0.34, [200, 0.3, 0.87]],
      [0.5, [205, 0.12, 0.92]],
      [0.58, [38, 0.12, 0.925]],
      [0.7, [40, 0.6, 0.91]],
      [0.86, [20, 0.64, 0.88]],
      [1, [8, 0.5, 0.86]],
    ],
    ridges: [
      { base: 690, amp: 46, freq: 0.0052, phase: 0.4, near: [214, 0.3, 0.82], far: [228, 0.28, 0.75] },
      { base: 780, amp: 54, freq: 0.0041, phase: 2.1, near: [170, 0.26, 0.8], far: [198, 0.26, 0.73] },
      { base: 862, amp: 38, freq: 0.0063, phase: 4.0, near: [130, 0.32, 0.8], far: [156, 0.3, 0.73] },
    ],
    ground: 'meadow',
    groundStops: [
      [0, [112, 0.4, 0.8]],
      [0.5, [96, 0.46, 0.82]],
      [1, [78, 0.5, 0.84]],
    ],
    blooms: [
      [350, 0.62, 0.86],
      [340, 0.55, 0.9],
      [48, 0.85, 0.86],
      [268, 0.38, 0.86],
      [14, 0.7, 0.86],
      [0, 0, 0.97],
    ],
    reflect: null,
    foam: false,
    sand: false,
    grass: { color: [138, 0.26, 0.72], where: 'across' },
  },

  // A pale moon over a still lake at dusk: periwinkle to rose, the water holding the sky and the moon's path.
  twilight: {
    sun: { x: 330, y: 400, r: 74 },
    haloNear: [52, 0.32, 0.94],
    haloFar: [280, 0.24, 0.89],
    disc: [52, 0.4, 0.96],
    core: [54, 0.45, 0.97],
    cloud: [325, 0.36, 0.93],
    skyStops: [
      [0, [236, 0.34, 0.76]],
      [0.32, [255, 0.3, 0.82]],
      [0.58, [300, 0.28, 0.87]],
      [0.8, [338, 0.42, 0.89]],
      [1, [14, 0.62, 0.88]],
    ],
    ridges: [
      { base: 700, amp: 40, freq: 0.0048, phase: 1.2, near: [262, 0.26, 0.78], far: [250, 0.26, 0.72] },
      { base: 790, amp: 48, freq: 0.0039, phase: 3.0, near: [240, 0.24, 0.72], far: [226, 0.26, 0.66] },
      { base: 868, amp: 30, freq: 0.0058, phase: 5.1, near: [212, 0.24, 0.68], far: [204, 0.26, 0.62] },
    ],
    ground: 'water',
    groundStops: [
      [0, [350, 0.34, 0.86]],
      [0.45, [280, 0.26, 0.8]],
      [1, [238, 0.3, 0.72]],
    ],
    blooms: [],
    reflect: [48, 0.34, 0.93],
    foam: false,
    sand: false,
    grass: { color: [200, 0.2, 0.6], where: 'sides' },
  },

  // A low gold sun going down behind soft hills, a wheat field with poppies and cornflowers in front.
  harvest: {
    sun: { x: 610, y: 650, r: 122 },
    haloNear: [44, 0.9, 0.91],
    haloFar: [24, 0.72, 0.88],
    disc: [44, 0.96, 0.92],
    core: [46, 1, 0.93],
    cloud: [30, 0.6, 0.94],
    skyStops: [
      [0, [202, 0.34, 0.82]],
      [0.34, [196, 0.26, 0.88]],
      [0.5, [200, 0.1, 0.93]],
      [0.58, [42, 0.12, 0.93]],
      [0.72, [44, 0.7, 0.9]],
      [0.9, [24, 0.72, 0.87]],
      [1, [12, 0.62, 0.85]],
    ],
    ridges: [
      { base: 730, amp: 36, freq: 0.0045, phase: 0.2, near: [96, 0.24, 0.78], far: [112, 0.24, 0.72] },
      { base: 800, amp: 44, freq: 0.0038, phase: 2.6, near: [78, 0.3, 0.76], far: [96, 0.3, 0.7] },
      { base: 870, amp: 32, freq: 0.0061, phase: 4.4, near: [58, 0.36, 0.76], far: [72, 0.36, 0.7] },
    ],
    ground: 'meadow',
    groundStops: [
      [0, [46, 0.56, 0.82]],
      [0.5, [40, 0.6, 0.8]],
      [1, [32, 0.52, 0.77]],
    ],
    blooms: [
      [10, 0.72, 0.85],
      [48, 0.7, 0.89],
      [0, 0, 0.97],
      [205, 0.42, 0.86],
      [350, 0.5, 0.88],
    ],
    reflect: null,
    foam: false,
    sand: false,
    grass: { color: [64, 0.3, 0.68], where: 'across' },
  },

  // A bright morning sea under a high small sun, a headland, pale surf, a strip of sand with shells.
  coast: {
    sun: { x: 300, y: 300, r: 82 },
    haloNear: [50, 0.55, 0.94],
    haloFar: [42, 0.26, 0.94],
    disc: [50, 0.7, 0.95],
    core: [52, 0.8, 0.96],
    cloud: [30, 0.3, 0.96],
    skyStops: [
      [0, [200, 0.42, 0.82]],
      [0.34, [194, 0.34, 0.88]],
      [0.58, [196, 0.14, 0.94]],
      [0.7, [34, 0.2, 0.95]],
      [0.86, [30, 0.5, 0.92]],
      [1, [22, 0.5, 0.9]],
    ],
    ridges: [
      { base: 700, amp: 20, freq: 0.004, phase: 0.8, near: [196, 0.28, 0.82], far: [204, 0.28, 0.76] },
      { base: 740, amp: 44, freq: 0.0034, phase: 3.4, near: [150, 0.22, 0.78], far: [172, 0.24, 0.72] },
    ],
    ground: 'water',
    groundStops: [
      [0, [188, 0.46, 0.84]],
      [0.5, [196, 0.46, 0.78]],
      [1, [206, 0.42, 0.72]],
    ],
    blooms: [
      [350, 0.5, 0.9],
      [20, 0.55, 0.9],
      [0, 0, 0.97],
    ],
    reflect: [50, 0.6, 0.95],
    foam: true,
    sand: true,
    grass: { color: [90, 0.2, 0.66], where: 'none' },
  },
};

export function paint(sceneName: string, seed: number): string {
  // ── randomness ──────────────────────────────────────────────────────────────────────────────────────────────────
  const rand = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

  /** Smooth value noise in [0, 1]: low-frequency drift of hue and angle so neighbouring strokes agree. */
  const lattice = Array.from({ length: 64 * 64 }, () => rand());
  function noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const s = (t: number) => t * t * (3 - 2 * t);
    const v = (i: number, j: number) => lattice[(((j % 64) + 64) % 64) * 64 + (((i % 64) + 64) % 64)] as number;
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * s(fx);
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * s(fx);
    return a + (b - a) * s(fy);
  }

  // ── colour ──────────────────────────────────────────────────────────────────────────────────────────────────────

  function hex(h: number, s: number, l: number): string {
    const sat = Math.min(1, Math.max(0, s));
    const lig = Math.min(1, Math.max(0, l));
    const k = (n: number) => (n + h / 30) % 12;
    const a = sat * Math.min(lig, 1 - lig);
    const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
  }

  function mix(a: HSL, b: HSL, t: number): HSL {
    // Hue takes the short way round.
    let dh = b[0] - a[0];
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    return [(a[0] + dh * t + 360) % 360, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function ramp(stops: readonly (readonly [number, HSL])[], t: number): HSL {
    const first = stops[0] as readonly [number, HSL];
    if (t <= first[0]) return first[1];
    for (let i = 1; i < stops.length; i++) {
      const [t1, c1] = stops[i] as readonly [number, HSL];
      const [t0, c0] = stops[i - 1] as readonly [number, HSL];
      if (t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0));
    }
    return (stops[stops.length - 1] as readonly [number, HSL])[1];
  }

  /** A painter never mixes the same pile twice: nudge each stroke a little so the field has life. */
  function jitter(c: HSL, amount = 1): HSL {
    return [
      (c[0] + between(-5, 5) * amount + 360) % 360,
      c[1] + between(-0.05, 0.05) * amount,
      c[2] + between(-0.035, 0.035) * amount,
    ];
  }

  // ── strokes ─────────────────────────────────────────────────────────────────────────────────────────────────────

  const parts: string[] = [];
  const n = (v: number) => Math.round(v).toString();

  /** Numbers as compactly as SVG allows: a minus sign already separates, so only a positive one needs a space. */
  function nums(values: readonly number[]): string {
    return values.reduce((acc, v, i) => acc + (i === 0 || v < 0 ? '' : ' ') + n(v), '');
  }

  /**
   * A smooth closed outline through the points (quadratic curves between midpoints), written in relative coordinates:
   * the deltas are two or three digits where absolute positions are four, which is a quarter of the file.
   */
  function closedOutline(pts: readonly (readonly [number, number])[]): string {
    const mid = (a: readonly [number, number], b: readonly [number, number]) =>
      [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
    const first = pts[0] as readonly [number, number];
    const second = pts[1] as readonly [number, number];
    const [sx, sy] = mid(first, second);
    let cx = Math.round(sx);
    let cy = Math.round(sy);
    let d = `M${nums([cx, cy])}`;
    const curve = (c: readonly [number, number], e: readonly [number, number]) => {
      const [c0, c1, e0, e1] = [Math.round(c[0]), Math.round(c[1]), Math.round(e[0]), Math.round(e[1])] as const;
      d += `q${nums([c0 - cx, c1 - cy, e0 - cx, e1 - cy])}`;
      cx = e0;
      cy = e1;
    };
    for (let i = 1; i < pts.length; i++) {
      curve(
        pts[i] as readonly [number, number],
        mid(pts[i] as readonly [number, number], pts[(i + 1) % pts.length] as readonly [number, number]),
      );
    }
    curve(first, mid(first, second));
    return d + 'z';
  }

  interface Stroke {
    x: number;
    y: number;
    /** Direction of travel, radians. */
    angle: number;
    length: number;
    width: number;
    color: HSL;
    /** How far the stroke bows to one side, as a fraction of its length. */
    bow?: number;
    /** Fewer bristle lines for a dab. */
    bristles?: number;
  }

  function stroke(s: Stroke): void {
    const SEG = 5;
    const bow = s.bow ?? between(-0.14, 0.14);
    const dx = Math.cos(s.angle);
    const dy = Math.sin(s.angle);
    const nx = -dy;
    const ny = dx;
    const centre: [number, number][] = [];
    const widths: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const along = (t - 0.5) * s.length;
      const side = Math.sin(Math.PI * t) * bow * s.length;
      centre.push([s.x + dx * along + nx * side, s.y + dy * along + ny * side]);
      // Blunt where the brush lands, tapering and fraying where it lifts.
      const lift = t < 0.12 ? 0.62 + t * 3 : 1 - Math.pow((t - 0.12) / 0.88, 2.2) * 0.62;
      widths.push(s.width * lift * between(0.86, 1.12));
    }
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    centre.forEach(([cx, cy], i) => {
      const w = (widths[i] as number) / 2;
      left.push([cx + nx * w * between(0.88, 1.1), cy + ny * w * between(0.88, 1.1)]);
      right.push([cx - nx * w * between(0.88, 1.1), cy - ny * w * between(0.88, 1.1)]);
    });
    // A rounded landing end and a ragged lifting end.
    const startCap: [number, number] = [
      (centre[0] as [number, number])[0] - dx * s.width * 0.28,
      (centre[0] as [number, number])[1] - dy * s.width * 0.28,
    ];
    const endCap: [number, number] = [
      (centre[SEG] as [number, number])[0] + dx * s.width * between(0.05, 0.3),
      (centre[SEG] as [number, number])[1] + dy * s.width * between(0.05, 0.3),
    ];
    const outline = [startCap, ...left, endCap, ...right.reverse()];
    parts.push(`<path fill="${hex(...s.color)}" d="${closedOutline(outline)}"/>`);

    // Bristle lines: thin ridges of lighter and darker paint dragged along the stroke.
    const count = s.bristles ?? (s.width > 44 ? 3 : 2);
    const light: string[] = [];
    const dark: string[] = [];
    for (let k = 0; k < count; k++) {
      const u = between(-0.38, 0.38);
      const t0 = between(0.02, 0.35);
      const t1 = between(0.6, 0.97);
      const line: [number, number][] = [];
      for (let i = 0; i < 4; i++) {
        const t = t0 + ((t1 - t0) * i) / 3;
        const idx = Math.min(SEG, Math.round(t * SEG));
        const [cx, cy] = centre[idx] as [number, number];
        const w = widths[idx] as number;
        line.push([cx + nx * w * u + between(-1.2, 1.2), cy + ny * w * u + between(-1.2, 1.2)]);
      }
      const d = `M${n((line[0] as [number, number])[0])} ${n((line[0] as [number, number])[1])}C${line
        .slice(1)
        .map(([x, y]) => `${n(x)} ${n(y)}`)
        .join(' ')}`;
      (k % 2 === 0 ? light : dark).push(d);
    }
    const [h, sat, l] = s.color;
    const sw = Math.max(1.4, Math.min(3.2, s.width * 0.07));
    if (light.length) {
      parts.push(
        `<path fill="none" stroke="${hex(h, sat * 0.9, l + 0.045)}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" d="${light.join('')}"/>`,
      );
    }
    if (dark.length) {
      parts.push(
        `<path fill="none" stroke="${hex(h + 4, sat * 1.05, l - 0.05)}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" d="${dark.join('')}"/>`,
      );
    }
  }

  // ── the scene ───────────────────────────────────────────────────────────────────────────────────────────────────

  const scene = SCENES[sceneName];
  if (!scene) throw new Error(`unknown scene "${sceneName}"; one of ${Object.keys(SCENES).join(', ')}`);
  const SUN = scene.sun;
  const HORIZON = 700;
  const ridges = scene.ridges;
  const skyStops = scene.skyStops;
  const skyline = (r: (typeof ridges)[number], x: number) =>
    r.base + Math.sin(x * r.freq + r.phase) * r.amp + Math.sin(x * r.freq * 2.3 + r.phase * 1.7) * r.amp * 0.35;

  // Under every layer goes a flat shape in the layer's middle colour, so a gap between strokes shows paint, not paper.
  parts.push(`<rect width="${SIZE}" height="${HORIZON + 80}" fill="${hex(...ramp(skyStops, 0.45))}"/>`);

  // 1. Sky: broad, nearly horizontal strokes.
  for (let i = 0; i < 125; i++) {
    const y = between(-30, HORIZON + 40);
    const x = between(-140, SIZE + 140);
    const t = Math.min(1, Math.max(0, y / HORIZON));
    const drift = (noise(x / 380, y / 260) - 0.5) * 0.2;
    stroke({
      x,
      y,
      angle: -0.07 + (noise(x / 500 + 9, y / 400) - 0.5) * 0.3,
      length: between(280, 520),
      width: between(70, 124),
      color: jitter(ramp(skyStops, t + drift), 0.85),
    });
  }

  // 2. Clouds: low, soft, uneven loaves of pale paint rather than streaks, kept clear of the sun.
  for (let i = 0; i < 9; i++) {
    const x = between(80, SIZE - 80);
    const y = between(110, 400);
    if (Math.hypot(x - SUN.x, y - SUN.y) < 260) continue;
    for (let k = 0; k < 3; k++) {
      stroke({
        x: x + between(-90, 90),
        y: y + between(-22, 22),
        angle: between(-0.06, 0.06),
        length: between(150, 260),
        width: between(30, 52),
        color: jitter(scene.cloud, 0.35),
        bristles: 2,
      });
    }
  }

  // 3. Sun: a flat disc, then strokes swung round it so each follows the circle it sits on.
  const around = (r: number, length: number, width: number, color: HSL): void => {
    const a = between(0, Math.PI * 2);
    stroke({
      x: SUN.x + Math.cos(a) * r,
      y: SUN.y + Math.sin(a) * r,
      angle: a + Math.PI / 2,
      length,
      width,
      color,
      bow: length / (8 * r),
      bristles: 2,
    });
  };
  // Outermost first, so each ring of paint lands partly over the one outside it and the whole reads as a glow.
  const halo = Array.from({ length: 100 }, () => between(SUN.r * 1.1, SUN.r * 2.45)).sort((a, b) => b - a);
  for (const r of halo) {
    const t = (r - SUN.r) / (SUN.r * 1.7);
    around(r, between(70, 120), between(30, 50), jitter(mix(scene.haloNear, scene.haloFar, Math.min(1, t)), 0.4));
  }
  parts.push(`<circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="${hex(...scene.disc)}"/>`);
  for (let i = 0; i < 14; i++) {
    around(between(SUN.r * 0.12, SUN.r * 0.78), between(50, 90), between(20, 30), jitter(scene.core, 0.35));
  }

  // 4. Ridges: strokes follow the slope of each skyline, lighter on top and cooler below. Each starts with its own flat
  // silhouette.
  for (const ridge of ridges) {
    const pts: string[] = [];
    for (let x = -20; x <= SIZE + 20; x += 20) pts.push(`${n(x)} ${n(skyline(ridge, x))}`);
    parts.push(
      `<path fill="${hex(...mix(ridge.near, ridge.far, 0.4))}" d="M${pts.join('L')}L${SIZE + 20} ${SIZE}L-20 ${SIZE}Z"/>`,
    );
    const rows = 6;
    for (let row = 0; row <= rows; row++) {
      for (let i = 0; i < 14; i++) {
        const x = between(-80, SIZE + 80);
        const t = row / rows;
        const y = skyline(ridge, x) + t * 220 + between(-10, 10);
        const slope = Math.atan((skyline(ridge, x + 12) - skyline(ridge, x - 12)) / 24);
        const c = mix(ridge.near, ridge.far, Math.min(1, t * 1.15 + (noise(x / 220, row) - 0.5) * 0.3));
        stroke({
          x,
          y,
          angle: slope * 0.9 + between(-0.08, 0.08),
          length: between(170, 290),
          width: between(46, 80),
          color: jitter(c, 0.8),
        });
      }
    }
  }

  if (scene.ground === 'meadow') {
    // 5. Meadow: layered, curved strokes sweeping toward the viewer.
    for (let i = 0; i < 150; i++) {
      const t = Math.pow(rand(), 0.8);
      const y = 910 + t * 320;
      const x = between(-100, SIZE + 100);
      const flow = (noise(x / 260 + 3, y / 200) - 0.5) * 0.9;
      stroke({
        x,
        y,
        angle: -0.14 + flow + (x - SIZE / 2) * 0.00022,
        length: between(150, 280) * (0.8 + t * 0.6),
        width: between(40, 70) * (0.8 + t * 0.55),
        color: jitter(ramp(scene.groundStops, t + (noise(x / 300, y / 120) - 0.5) * 0.4), 1.0),
      });
    }

    // 6. Wildflowers: short dabs in a few colours, clustered by noise so they gather in drifts.
    let placed = 0;
    for (let attempt = 0; attempt < 3000 && placed < 150; attempt++) {
      const x = between(0, SIZE);
      const y = between(900, 1200);
      if (noise(x / 130 + 20, y / 130 + 20) < 0.56) continue;
      const t = (y - 900) / 300;
      placed++;
      stroke({
        x,
        y,
        angle: between(-2.0, -1.1),
        length: between(22, 42) * (0.7 + t * 0.9),
        width: between(14, 24) * (0.7 + t * 0.9),
        color: jitter(pick(scene.blooms), 0.5),
        bristles: 1,
        bow: between(-0.1, 0.1),
      });
    }
  } else {
    // 5. Water: long, flat strokes that hold the sky's colours, with the sun's path laid down the middle.
    const SHORE = 905;
    parts.push(
      `<rect y="${SHORE}" width="${SIZE}" height="${SIZE - SHORE}" fill="${hex(...ramp(scene.groundStops, 0.4))}"/>`,
    );
    for (let i = 0; i < 130; i++) {
      const t = Math.pow(rand(), 0.9);
      const y = SHORE + t * 300;
      const x = between(-100, SIZE + 100);
      stroke({
        x,
        y,
        angle: between(-0.03, 0.03) + (noise(x / 300, y / 90) - 0.5) * 0.06,
        length: between(220, 420) * (0.8 + t * 0.5),
        width: between(26, 46) * (0.8 + t * 0.6),
        color: jitter(ramp(scene.groundStops, t + (noise(x / 300, y / 90) - 0.5) * 0.3), 0.8),
      });
    }
    if (scene.reflect) {
      for (let k = 0; k < 14; k++) {
        const spread = 30 + k * 9;
        stroke({
          x: SUN.x + between(-spread * 0.35, spread * 0.35),
          y: SHORE + 14 + k * 22,
          angle: between(-0.02, 0.02),
          length: between(70, 140) + k * 6,
          width: between(14, 22),
          color: jitter(scene.reflect, 0.35),
          bristles: 1,
        });
      }
    }
    if (scene.foam) {
      // Pale surf: short strokes on the water.
      for (let i = 0; i < 40; i++) {
        stroke({
          x: between(0, SIZE),
          y: between(930, 1120),
          angle: between(-0.05, 0.05),
          length: between(60, 130),
          width: between(8, 14),
          color: jitter([190, 0.2, 0.97], 0.2),
          bristles: 1,
        });
      }
    }
    if (scene.sand) {
      // A wavering shoreline: a flat silhouette of sand, then the strokes that lie on it.
      const edge: string[] = [];
      for (let x = -20; x <= SIZE + 20; x += 20) edge.push(`${n(x)} ${n(1085 + Math.sin(x * 0.006 + 1) * 26)}`);
      parts.push(`<path fill="${hex(38, 0.5, 0.88)}" d="M${edge.join('L')}L${SIZE + 20} ${SIZE}L-20 ${SIZE}Z"/>`);
      for (let i = 0; i < 46; i++) {
        const y = between(1090, 1230);
        stroke({
          x: between(-80, SIZE + 80),
          y,
          angle: between(-0.08, 0.04),
          length: between(160, 300),
          width: between(30, 52),
          color: jitter(mix([40, 0.46, 0.9], [30, 0.56, 0.84], (y - 1090) / 140), 0.7),
        });
      }
      for (let i = 0; i < 14; i++) {
        stroke({
          x: between(80, SIZE - 80),
          y: between(1130, 1220),
          angle: between(-1, 1),
          length: between(18, 30),
          width: between(11, 18),
          color: jitter(pick(scene.blooms), 0.4),
          bristles: 1,
        });
      }
    }
  }

  // 7. Foreground grasses: a few tall strokes along the bottom edge to hold the picture down.
  if (scene.grass.where !== 'none') {
    const reeds = scene.grass.where === 'sides';
    for (let i = 0; i < (reeds ? 24 : 30); i++) {
      const x = reeds ? (i % 2 === 0 ? between(-40, 250) : between(950, SIZE + 40)) : between(-40, SIZE + 40);
      stroke({
        x,
        y: between(1140, 1230),
        angle: between(-1.75, -1.35),
        length: between(110, 200),
        width: between(14, 26),
        color: jitter(scene.grass.color, 0.6),
        bristles: 1,
      });
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" preserveAspectRatio="xMidYMid slice">` +
    parts.join('') +
    `</svg>\n`;

  return svg;
}

// ── command line ────────────────────────────────────────────────────────────────────────────────────────────────

/** Output widths. The page asks for the small one below 640px and the large one from there up (see login.tsx). */
const SIZES = { 800: 800, 1600: 1600 } as const;

/** The preview is this many px wide, and heavily compressed: it is meant to be soft. */
const PREVIEW_WIDTH = 48;
const PREVIEWS_FILE = 'lib/auth/login-art-previews.ts';

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

async function main(): Promise<void> {
  const only = flag('scene');
  const seed = Number(flag('seed') ?? 11);
  const outDir = resolve(flag('out') ?? 'public/images/login');
  const keepSvg = process.argv.includes('--svg');
  const names = only ? [only] : Object.keys(SCENES);
  mkdirSync(outDir, { recursive: true });
  const previews: Record<string, string> = {};
  for (const name of names) {
    const svg = paint(name, seed);
    if (keepSvg) writeFileSync(resolve(outDir, `${name}.svg`), svg);
    for (const width of Object.values(SIZES)) {
      // The SVG has a viewBox and no size, so it is SIZE px at 72 dpi; the density scales it to the width asked for.
      const file = resolve(outDir, `${name}-${width}.webp`);
      const info = await sharp(Buffer.from(svg), { density: (72 * width) / SIZE })
        .webp({ quality: 80, effort: 6 })
        .toFile(file);
      process.stdout.write(`wrote ${file} (${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB)\n`);
    }
    // Softened in the pixels themselves (not by a CSS filter), so the browser's upscaling shows a smooth wash of the
    // painting's colours instead of the encoder's blocks.
    const preview = await sharp(Buffer.from(svg), { density: (72 * PREVIEW_WIDTH) / SIZE })
      .blur(1.6)
      .webp({ quality: 70, effort: 6 })
      .toBuffer();
    previews[name] = `data:image/webp;base64,${preview.toString('base64')}`;
    process.stdout.write(`preview ${name}: ${preview.length} bytes\n`);
  }
  if (only || flag('out')) return;
  const entries = Object.entries(previews)
    .map(([name, uri]) => `  ${name}: '${uri}',`)
    .join('\n');
  const source = `/**
 * GENERATED by scripts/gen-login-painting.ts: do not edit. A ${PREVIEW_WIDTH}px WebP of each login painting as a data
 * URI. The login page shows it at once, scaled up (the browser's own smoothing makes it a soft blur), and fades the
 * real picture in over it once that has downloaded.
 */
import type { LoginArt } from './login-art';

export const LOGIN_ART_PREVIEWS: Record<LoginArt, string> = {
${entries}
};
`;
  const file = resolve(PREVIEWS_FILE);
  const prettier = await import('prettier');
  const formatted = await prettier.format(source, { ...(await prettier.resolveConfig(file)), filepath: file });
  writeFileSync(file, formatted);
  process.stdout.write(`wrote ${file}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
