/**
 * Draws the painting beside the sign-in form (`public/images/login-painting.svg`).
 *
 * A landscape built from a few hundred solid-colour brush strokes: broad horizontal strokes for the sky, strokes that
 * follow the slope of each ridge, tangential strokes around the sun, short dabs for the flowers. Every stroke is one
 * tapered, slightly ragged shape with a few thin bristle lines in a lighter and a darker shade of its own colour, so it
 * reads as wet paint dragged across a canvas without any gradient, blur or transparency (Steel R1; the picture is
 * content, but the file stays flat anyway). The result is deterministic: the same SEED always writes the same file.
 *
 *   pnpm exec tsx scripts/gen-login-painting.ts            # writes public/images/login-painting.svg
 *   pnpm exec tsx scripts/gen-login-painting.ts out.svg 7  # another file, another seed
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mulberry32 } from '../lib/core/rng';

const SIZE = 1200;
const out = resolve(process.argv[2] ?? 'public/images/login-painting.svg');
const SEED = Number(process.argv[3] ?? 11);

// ── randomness ──────────────────────────────────────────────────────────────────────────────────────────────────
const rand = mulberry32(SEED);
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

type HSL = readonly [number, number, number]; // degrees, 0-1, 0-1

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

const SUN = { x: 790, y: 450, r: 104 };
const HORIZON = 700;

/** Each ridge: a colour pair and a skyline. Painted from the back to the front. */
const ridges = [
  { base: 690, amp: 46, freq: 0.0052, phase: 0.4, near: [214, 0.3, 0.82] as HSL, far: [228, 0.28, 0.75] as HSL },
  { base: 780, amp: 54, freq: 0.0041, phase: 2.1, near: [170, 0.26, 0.8] as HSL, far: [198, 0.26, 0.73] as HSL },
  { base: 862, amp: 38, freq: 0.0063, phase: 4.0, near: [130, 0.32, 0.8] as HSL, far: [156, 0.3, 0.73] as HSL },
];
const skyline = (r: (typeof ridges)[number], x: number) =>
  r.base + Math.sin(x * r.freq + r.phase) * r.amp + Math.sin(x * r.freq * 2.3 + r.phase * 1.7) * r.amp * 0.35;

// Blue at the top, a nearly colourless pearl in the middle (so the blue never has to pass through green on its way to
// the warm light), then cream and a blush at the horizon.
const skyStops: readonly (readonly [number, HSL])[] = [
  [0, [206, 0.38, 0.8]],
  [0.34, [200, 0.3, 0.87]],
  [0.5, [205, 0.12, 0.92]],
  [0.58, [38, 0.12, 0.925]],
  [0.7, [40, 0.6, 0.91]],
  [0.86, [20, 0.64, 0.88]],
  [1, [8, 0.5, 0.86]],
];

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
      color: jitter([28, 0.5, 0.95], 0.35),
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
  around(r, between(70, 120), between(30, 50), jitter(mix([46, 0.8, 0.92], [26, 0.62, 0.9], Math.min(1, t)), 0.4));
}
parts.push(`<circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="${hex(46, 0.9, 0.92)}"/>`);
for (let i = 0; i < 14; i++) {
  around(between(SUN.r * 0.12, SUN.r * 0.78), between(50, 90), between(20, 30), jitter([48, 0.95, 0.93], 0.35));
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

// 5. Meadow: layered, curved strokes sweeping toward the viewer.
const meadow: readonly (readonly [number, HSL])[] = [
  [0, [112, 0.4, 0.8]],
  [0.5, [96, 0.46, 0.82]],
  [1, [78, 0.5, 0.84]],
];
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
    color: jitter(ramp(meadow, t + (noise(x / 300, y / 120) - 0.5) * 0.4), 1.0),
  });
}

// 6. Wildflowers: short dabs in a few colours, clustered by noise so they gather in drifts.
const blooms: readonly HSL[] = [
  [350, 0.62, 0.86],
  [340, 0.55, 0.9],
  [48, 0.85, 0.86],
  [268, 0.38, 0.86],
  [14, 0.7, 0.86],
  [0, 0, 0.97],
];
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
    color: jitter(pick(blooms), 0.5),
    bristles: 1,
    bow: between(-0.1, 0.1),
  });
}

// 7. Foreground grasses: a few tall strokes along the bottom edge to hold the picture down.
for (let i = 0; i < 30; i++) {
  stroke({
    x: between(-40, SIZE + 40),
    y: between(1140, 1230),
    angle: between(-1.75, -1.35),
    length: between(110, 200),
    width: between(14, 26),
    color: jitter([138, 0.26, 0.72], 0.6),
    bristles: 1,
  });
}

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" preserveAspectRatio="xMidYMid slice">` +
  parts.join('') +
  `</svg>\n`;

writeFileSync(out, svg);
process.stdout.write(`wrote ${out} (${(svg.length / 1024).toFixed(0)} KB, ${parts.length} elements)\n`);
