/**
 * The faces every satori-rendered image uses: Geist and Geist Mono, the same two
 * families as the site and app tier (redesign E8).
 *
 * satori reads TTF / OTF / WOFF only; `@fontsource-variable` ships WOFF2 variable
 * files. `scripts/gen-og-fonts.py` pins static instances of the installed
 * package's latin subset into `public/fonts/og/`, and they are read from disk here,
 * so rendering a card never touches the network (it used to fetch Inter from
 * fonts.gstatic.com and had a cooldown for when that failed).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

export const OG_FONT_SANS = 'Geist';
export const OG_FONT_MONO = 'Geist Mono';

type Weight = 400 | 700 | 800;
const SANS_FILES: Record<Weight, string> = {
  400: 'Geist-400.ttf',
  700: 'Geist-700.ttf',
  800: 'Geist-800.ttf',
};
const MONO_FILES: Partial<Record<Weight, string>> = {
  400: 'GeistMono-400.ttf',
  700: 'GeistMono-700.ttf',
};

// Dev and tests run from the app root; the production image runs from /app with the
// built public tree under .output/public (same lookup as lib/rmhvibe/vibe-bundle).
const ROOTS = [
  path.join(process.cwd(), 'public', 'fonts', 'og'),
  path.join(process.cwd(), '.output', 'public', 'fonts', 'og'),
  path.join(process.cwd(), 'dist', 'public', 'fonts', 'og'),
];

const cache = new Map<string, Buffer>();

function readFont(file: string): Buffer {
  const hit = cache.get(file);
  if (hit) return hit;
  let lastErr: unknown;
  for (const root of ROOTS) {
    try {
      const buf = readFileSync(path.join(root, file));
      cache.set(file, buf);
      return buf;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`OG font ${file} not found (${String(lastErr)})`);
}

export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: Weight;
  style: 'normal';
}

/** Geist at the given weights, and Geist Mono (400/700) when `mono` is set. */
export function satoriFontFaces(opts: { weights: readonly Weight[]; mono?: boolean }): SatoriFont[] {
  const faces: SatoriFont[] = opts.weights.map((weight) => ({
    name: OG_FONT_SANS,
    data: readFont(SANS_FILES[weight]),
    weight,
    style: 'normal' as const,
  }));
  if (opts.mono) {
    for (const [w, file] of Object.entries(MONO_FILES)) {
      faces.push({
        name: OG_FONT_MONO,
        data: readFont(file as string),
        weight: Number(w) as Weight,
        style: 'normal' as const,
      });
    }
  }
  return faces;
}
