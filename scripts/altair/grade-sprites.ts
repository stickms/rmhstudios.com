/**
 * Altair — sprite grading pass.
 *
 * Reads the pristine sheets in `scripts/altair/sprite-src/` and writes graded
 * copies into `public/sprites/altair/`, so the cast shares the game card's
 * palette (docs/game-design-schemes/altair.json) and reads at a glance:
 *
 *   allies   -> cyan   (summons; the player characters are drawn, not graded: see sprites/build-characters.ts)
 *   hostiles -> magenta (none left in the source tree: enemies and bosses are drawn, see sprites/)
 *   loot     -> amber   (pickups, projectiles, icons)
 *   floor    -> dark teal duotone (tiles)
 *   props    -> lighter teal duotone, so obstacles read against the floor
 *
 * Luminance carries the pixel-art shading, so outlines, highlights and
 * dithering survive the recolour. Pixels that were already a saturated
 * yellow/orange keep an amber ramp, which leaves emblems, flames and hazards
 * glowing against the cold ground. Running it twice is safe: the source
 * directory is never written.
 *
 *   pnpm exec tsx scripts/altair/grade-sprites.ts
 */
import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { lerp } from '../../lib/core/math';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'sprite-src');
const OUT = join(HERE, '..', '..', 'public', 'sprites', 'altair');

type RGB = readonly [number, number, number];
type Ramp = readonly [RGB, RGB, RGB, RGB];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Four stops at luminance 0, 0.33, 0.66, 1. */
const RAMPS = {
  ally: [hex('#03121C'), hex('#0B5F78'), hex('#19D3DA'), hex('#E6FBFF')],
  hostile: [hex('#16040F'), hex('#7A1A63'), hex('#FF3DB8'), hex('#FFE3F4')],
  amber: [hex('#1A0F02'), hex('#8A4F0C'), hex('#FFB44D'), hex('#FFF1D6')],
  floor: [hex('#050B14'), hex('#0A2433'), hex('#14506B'), hex('#2F8BA3')],
  props: [hex('#06121C'), hex('#12394F'), hex('#2A7C95'), hex('#9FE8F0')],
} satisfies Record<string, Ramp>;

type Kind = keyof typeof RAMPS;

/** Which ramp a sheet's body uses, from its path under the source root. */
function kindFor(rel: string): Kind {
  if (rel.startsWith('tiles/')) return 'floor';
  if (rel.startsWith('props/')) return 'props';
  return 'amber'; // pickups, projectiles, icons
}


function sample(ramp: Ramp, l: number): RGB {
  const x = Math.min(0.9999, Math.max(0, l)) * 3;
  const i = Math.floor(x);
  const t = x - i;
  const a = ramp[i];
  const b = ramp[i + 1];
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How much of a pixel is "amber accent" (saturated yellow-orange), 0..1. */
function amberWeight(h: number, s: number, l: number): number {
  const hueIn = smooth(26, 38, h) * (1 - smooth(58, 70, h));
  return hueIn * smooth(0.35, 0.6, s) * smooth(0.25, 0.4, l);
}

export function gradePixel(kind: Kind, r: number, g: number, b: number): RGB {
  const [h, s, l] = rgbToHsl(r, g, b);
  // Perceptual luma keeps the original shading; a gentle curve lifts the mids
  // so 16x16 faces stay legible on the near-black ground.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const shaped = kind === 'floor' || kind === 'props' ? Math.pow(luma, 0.8) : Math.pow(luma, 0.85);
  const base = sample(RAMPS[kind], shaped);
  if (kind === 'floor' || kind === 'props') {
    // Hazard / loot marks on the ground stay amber but dimmed.
    const w = amberWeight(h, s, l) * 0.7;
    const hot = sample(RAMPS.amber, shaped * 0.9);
    return [lerp(base[0], hot[0], w), lerp(base[1], hot[1], w), lerp(base[2], hot[2], w)];
  }
  if (kind === 'amber') return base;
  const w = amberWeight(h, s, l);
  const hot = sample(RAMPS.amber, shaped);
  return [lerp(base[0], hot[0], w), lerp(base[1], hot[1], w), lerp(base[2], hot[2], w)];
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.png')) yield p;
  }
}

async function main() {
  let n = 0;
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    const kind = kindFor(rel);
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const [r, g, b] = gradePixel(kind, data[i], data[i + 1], data[i + 2]);
      data[i] = Math.round(r);
      data[i + 1] = Math.round(g);
      data[i + 2] = Math.round(b);
    }
    const dest = join(OUT, rel);
    mkdirSync(dirname(dest), { recursive: true });
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(dest);
    n++;
  }
  console.log(`graded ${n} sheets -> ${relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
