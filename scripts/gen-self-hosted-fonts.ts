/**
 * Generate `app/fonts/*.css` — the self-hosted `@font-face` rules for every
 * display family the site uses, with `font-display: optional`.
 *
 *   pnpm fonts:generate   # write
 *   pnpm fonts:check      # fail if stale (the commit gate runs this)
 *
 * ## Why these are not Fontsource's own stylesheets
 *
 * Fontsource ships `@font-face` rules pinned to `font-display: swap`, and
 * `font-display` is a DESCRIPTOR — nothing outside the rule can change it. `swap`
 * is right for Inter, which is the body text and has a metric-matched fallback
 * (`globals.css` §OPT-17). It is wrong for a DISPLAY face: the heading paints in
 * Georgia, the face lands, and the heading changes shape and width in front of
 * the reader. That was every decorative family on the site, loaded from Google
 * Fonts after first paint by design, so the swap was guaranteed rather than
 * merely possible (docs/fouc-audit-2026-10-06.md §10).
 *
 * `optional` is the one value that cannot swap: the browser gives the face a
 * ~100ms window, and if it misses, the fallback stays for the rest of that page
 * view while the file finishes into the cache for the next one. Paired with a
 * `<link rel=preload>` on the routes whose first screen is set in the face, it
 * lands inside that window on any ordinary connection.
 *
 * So this reads Fontsource's CSS, keeps its subsetting (`unicode-range`, so a
 * Latin-script visitor never downloads Cyrillic), and rewrites three things:
 * `font-display`, the family name (Fontsource calls variable faces
 * "X Variable"; the site's stylesheets ask for "X"), and the file URLs, which
 * become relative paths into `node_modules` so Vite fingerprints and serves
 * them same-origin. Only `woff2` is kept — every browser the site supports reads
 * it, and the `woff` fallback is dead weight in every rule.
 */
/* eslint-disable no-console -- CLI generator: stdout reports what it wrote */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');

interface Source {
  /** The Fontsource package. */
  pkg: string;
  /** Stylesheets inside it, e.g. `wght.css`, `400.css`, `wght-italic.css`. */
  css: string[];
  /** The `font-family` the site's CSS asks for. */
  family: string;
}

interface Group {
  /** Output file, relative to the repo root. */
  out: string;
  /** Who loads it — written into the header so the file explains itself. */
  usedBy: string;
  sources: Source[];
}

const GROUPS: Group[] = [
  {
    out: 'app/fonts/site-display.css',
    usedBy:
      'app/globals.css (@import) — the --font-* tokens and the themes whose display/mono stacks name these families',
    sources: [
      { pkg: '@fontsource-variable/jetbrains-mono', css: ['wght.css'], family: 'JetBrains Mono' },
      {
        pkg: '@fontsource-variable/playfair-display',
        css: ['wght.css'],
        family: 'Playfair Display',
      },
      { pkg: '@fontsource/bangers', css: ['400.css'], family: 'Bangers' },
      { pkg: '@fontsource/bebas-neue', css: ['400.css'], family: 'Bebas Neue' },
      { pkg: '@fontsource-variable/cinzel', css: ['wght.css'], family: 'Cinzel' },
      { pkg: '@fontsource/patrick-hand', css: ['400.css'], family: 'Patrick Hand' },
    ],
  },
  {
    out: 'app/fonts/outfit.css',
    usedBy: 'app/routes/slice-it.tsx',
    sources: [{ pkg: '@fontsource-variable/outfit', css: ['wght.css'], family: 'Outfit' }],
  },
  {
    out: 'app/fonts/medievalsharp.css',
    usedBy: 'app/routes/altair.tsx',
    sources: [{ pkg: '@fontsource/medievalsharp', css: ['400.css'], family: 'MedievalSharp' }],
  },
  {
    out: 'app/fonts/press-start-2p.css',
    usedBy: 'app/routes/rmh-farming-sim.tsx, app/routes/kowloon-knockout.tsx',
    sources: [{ pkg: '@fontsource/press-start-2p', css: ['400.css'], family: 'Press Start 2P' }],
  },
  {
    out: 'app/fonts/eb-garamond.css',
    usedBy: 'app/routes/versecraft.tsx',
    sources: [
      { pkg: '@fontsource-variable/eb-garamond', css: ['wght.css'], family: 'EB Garamond' },
    ],
  },
  {
    out: 'app/fonts/spectral.css',
    usedBy: 'app/routes/rmh-capital.tsx',
    sources: [
      {
        pkg: '@fontsource/spectral',
        css: ['300.css', '400.css', '500.css', '600.css', '400-italic.css', '500-italic.css'],
        family: 'Spectral',
      },
    ],
  },
  {
    out: 'app/fonts/covid.css',
    usedBy: 'app/routes/covid.tsx (Playfair italics on top of the site-wide uprights)',
    sources: [
      {
        pkg: '@fontsource-variable/playfair-display',
        css: ['wght-italic.css'],
        family: 'Playfair Display',
      },
      { pkg: '@fontsource/great-vibes', css: ['400.css'], family: 'Great Vibes' },
    ],
  },
  {
    out: 'app/fonts/fraunces.css',
    usedBy: 'app/routes/adaptive-intelligence.tsx',
    sources: [
      {
        pkg: '@fontsource-variable/fraunces',
        css: ['opsz.css', 'opsz-italic.css'],
        family: 'Fraunces',
      },
    ],
  },
  {
    out: 'app/fonts/rmh-pmc.css',
    usedBy: 'app/routes/rmh-pmc.tsx',
    sources: [
      { pkg: '@fontsource-variable/archivo', css: ['wdth.css'], family: 'Archivo' },
      {
        pkg: '@fontsource/ibm-plex-mono',
        css: ['400.css', '500.css', '600.css', '700.css'],
        family: 'IBM Plex Mono',
      },
    ],
  },
];

const FACE = /\/\*[^*]*\*\/\s*@font-face\s*\{[^}]*\}|@font-face\s*\{[^}]*\}/g;

function rewriteFace(block: string, src: Source, outDir: string): string {
  const comment = block.match(/^\/\*[^*]*\*\//)?.[0] ?? '';
  const body = block.slice(block.indexOf('@font-face'));
  const woff2 = body.match(/url\(\.\/files\/([^)]+\.woff2)\)\s*format\('([^']+)'\)/);
  if (!woff2) throw new Error(`${src.pkg}: a face with no woff2 source:\n${block}`);
  const fileUrl = relative(outDir, join(ROOT, 'node_modules', src.pkg, 'files', woff2[1]));
  const descriptor = (name: string) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  const lines = [
    `font-family: '${src.family}';`,
    `font-style: ${descriptor('font-style') ?? 'normal'};`,
    `font-display: optional;`,
    `font-weight: ${descriptor('font-weight') ?? '400'};`,
  ];
  const stretch = descriptor('font-stretch');
  if (stretch) lines.push(`font-stretch: ${stretch};`);
  lines.push(`src: url('${fileUrl}') format('${woff2[2]}');`);
  const range = descriptor('unicode-range');
  if (range) lines.push(`unicode-range: ${range};`);
  return `${comment ? `${comment}\n` : ''}@font-face {\n${lines.map((l) => `  ${l}`).join('\n')}\n}`;
}

function render(group: Group): string {
  const outDir = dirname(join(ROOT, group.out));
  const faces: string[] = [];
  for (const src of group.sources) {
    for (const css of src.css) {
      const text = readFileSync(join(ROOT, 'node_modules', src.pkg, css), 'utf8');
      const blocks = text.match(FACE);
      if (!blocks?.length) throw new Error(`${src.pkg}/${css}: no @font-face rules`);
      for (const b of blocks) faces.push(rewriteFace(b, src, outDir));
    }
  }
  return [
    '/* GENERATED by scripts/gen-self-hosted-fonts.ts — do not edit; re-run it.',
    '   font-display: optional — see that script for why these are not Fontsource’s',
    `   own stylesheets. Loaded by: ${group.usedBy}. */`,
    '',
    faces.join('\n\n'),
    '',
  ].join('\n');
}

const check = process.argv.includes('--check');
let stale = 0;
for (const group of GROUPS) {
  const path = join(ROOT, group.out);
  const next = render(group);
  let current = '';
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    // Missing counts as stale.
  }
  if (current === next) continue;
  if (check) {
    stale++;
    console.error(`stale: ${group.out}`);
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  console.log(`wrote ${group.out}`);
}
if (check && stale) {
  console.error('\nRun `pnpm fonts:generate` and commit the result.');
  process.exit(1);
}
