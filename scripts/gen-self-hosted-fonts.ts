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
 * is right for Geist, which is the body text and has a metric-matched fallback
 * (`globals.css` §OPT-17). It is wrong for a DISPLAY face: the heading paints in
 * Georgia, the face lands, and the heading changes shape and width in front of
 * the reader. That was every decorative family on the site, loaded from Google
 * Fonts after first paint by design, so the swap was guaranteed rather than
 * merely possible (docs/archive/2026/fouc-audit-2026-10-06.md §10).
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
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
import { FONT_CATALOGUE } from '../lib/appearance/fonts';
import { CHOICE_SOURCES } from './font-choice-sources';

interface Source {
  /** The Fontsource package. */
  pkg: string;
  /** Stylesheets inside it, e.g. `wght.css`, `400.css`, `wght-italic.css`. */
  css: string[];
  /** The `font-family` the site's CSS asks for. */
  family: string;
  /** `font-display`; default `optional` (see the header). The reader's text faces use `swap`. */
  display?: 'optional' | 'swap';
  /** Fontsource weight → the `font-weight` descriptor to write instead (scripts/font-choice-sources.ts). */
  weights?: Record<string, string>;
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
    out: 'app/fonts/dream-rift.css',
    usedBy: 'app/routes/dream-rift.tsx (Cinzel caps + Playfair body: the game’s Touhou-style lettering, also drawn on its canvas HUD)',
    sources: [
      { pkg: '@fontsource-variable/cinzel', css: ['wght.css'], family: 'Cinzel' },
      {
        pkg: '@fontsource-variable/playfair-display',
        css: ['wght.css', 'wght-italic.css'],
        family: 'Playfair Display',
      },
    ],
  },
  {
    out: 'app/fonts/press-start-2p.css',
    usedBy: 'app/routes/kowloon-knockout.tsx',
    sources: [{ pkg: '@fontsource/press-start-2p', css: ['400.css'], family: 'Press Start 2P' }],
  },
  {
    out: 'app/fonts/eb-garamond.css',
    usedBy: 'app/routes/versecraft.tsx (EB Garamond, Cinzel and Playfair Display for its lettering, plus the Patrick Hand handwriting face only versecraft uses)',
    sources: [
      { pkg: '@fontsource-variable/eb-garamond', css: ['wght.css'], family: 'EB Garamond' },
      { pkg: '@fontsource-variable/cinzel', css: ['wght.css'], family: 'Cinzel' },
      {
        pkg: '@fontsource-variable/playfair-display',
        css: ['wght.css'],
        family: 'Playfair Display',
      },
      { pkg: '@fontsource/patrick-hand', css: ['400.css'], family: 'Patrick Hand' },
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
    usedBy: 'app/routes/covid.tsx (Playfair Display, upright and italic, plus Great Vibes)',
    sources: [
      {
        pkg: '@fontsource-variable/playfair-display',
        css: ['wght.css', 'wght-italic.css'],
        family: 'Playfair Display',
      },
      { pkg: '@fontsource/great-vibes', css: ['400.css'], family: 'Great Vibes' },
    ],
  },
  {
    out: 'app/fonts/fraunces.css',
    usedBy: 'app/routes/adaptive-intelligence.tsx and app/routes/rmh-medschool.tsx',
    sources: [
      {
        pkg: '@fontsource-variable/fraunces',
        css: ['opsz.css', 'opsz-italic.css'],
        family: 'Fraunces',
      },
    ],
  },
  {
    out: 'app/fonts/elections.css',
    usedBy: 'app/routes/elections.tsx',
    sources: [
      { pkg: '@fontsource-variable/archivo', css: ['wdth.css'], family: 'Archivo' },
      { pkg: '@fontsource-variable/space-grotesk', css: ['wght.css'], family: 'Space Grotesk' },
      { pkg: '@fontsource/space-mono', css: ['400.css', '700.css'], family: 'Space Mono' },
    ],
  },
];

const FACE = /\/\*[^*]*\*\/\s*@font-face\s*\{[^}]*\}|@font-face\s*\{[^}]*\}/g;

function rewriteFace(block: string, src: Source, outDir: string): string {
  const comment = block.match(/^\/\*[^*]*\*\//)?.[0] ?? '';
  const body = block.slice(block.indexOf('@font-face'));
  const woff2 = body.match(/url\(\.\/files\/([^)]+\.woff2)\)\s*format\('([^']+)'\)/);
  if (!woff2) throw new Error(`${src.pkg}: a face with no woff2 source:\n${block}`);
  const fileUrl = relative(
    outDir,
    join(ROOT, 'node_modules', src.pkg, 'files', woff2[1]),
  ).replaceAll('\\', '/');
  const descriptor = (name: string) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  const lines = [
    `font-family: '${src.family}';`,
    `font-style: ${descriptor('font-style') ?? 'normal'};`,
    `font-display: ${src.display ?? 'optional'};`,
    `font-weight: ${(() => {
      const w = descriptor('font-weight') ?? '400';
      return src.weights?.[w] ?? w;
    })()};`,
  ];
  const stretch = descriptor('font-stretch');
  if (stretch) lines.push(`font-stretch: ${stretch};`);
  lines.push(`src: url('${fileUrl}') format('${woff2[2]}');`);
  const range = descriptor('unicode-range');
  if (range) lines.push(`unicode-range: ${range};`);
  return `${comment ? `${comment}\n` : ''}@font-face {\n${lines.map((l) => `  ${l}`).join('\n')}\n}`;
}

/** The reader's font catalogue (lib/appearance/fonts.ts): one sheet per face, linked only when chosen. */
const FALLBACKS = JSON.parse(readFileSync(join(ROOT, 'app/fonts/choice-fallbacks.json'), 'utf8')) as Record<
  string,
  { local: string[]; sizeAdjust: string; ascent: string; descent: string; lineGap: string }
>;
const CHOICE_GROUPS: Group[] = FONT_CATALOGUE.map((f) => ({
  out: `app/fonts/choice/${f.id}.css`,
  usedBy:
    f.id === 'dm-sans' || f.id === 'dm-mono'
      ? 'app/globals.css (@import): the default face, in the site sheet'
      : 'app/routes/__root.tsx head() through lib/appearance/font-assets.gen.ts, only when a reader has chosen it',
  sources: [
    {
      ...CHOICE_SOURCES[f.id],
      family: f.family,
      display: f.kind === 'mono' ? 'optional' : 'swap',
    },
  ],
}));

const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,' +
  'U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,' +
  'U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

/** The metric-matched local stand-in a text face swaps from (OPT-17; scripts/gen-font-metrics.ts --choice). */
function fallbackFace(id: string, family: string): string {
  const m = FALLBACKS[id];
  if (!m) throw new Error(`app/fonts/choice-fallbacks.json has no ${id}: run gen-font-metrics.ts --choice`);
  return [
    `/* ${id}: metric-matched local fallback */`,
    '@font-face {',
    `  font-family: '${family} Fallback';`,
    `  src: ${m.local.map((l) => `local('${l}')`).join(', ')};`,
    `  size-adjust: ${m.sizeAdjust};`,
    `  ascent-override: ${m.ascent};`,
    `  descent-override: ${m.descent};`,
    `  line-gap-override: ${m.lineGap};`,
    // Latin and Latin Extended only (Fontsource's two Latin subsets): the metrics are the Latin face's, so other
    // scripts (Arabic, Cyrillic, CJK, …) skip the stand-in and take the OS face at its own size.
    `  unicode-range: ${LATIN_RANGE};`,
    '}',
  ].join('\n');
}

/** Latin files per face, repo-relative (for the preload and the asset module). */
const LATIN: Record<string, string> = {};

function render(group: Group): string {
  const outDir = dirname(join(ROOT, group.out));
  const faces: string[] = [];
  for (const src of group.sources) {
    for (const css of src.css) {
      const text = readFileSync(join(ROOT, 'node_modules', src.pkg, css), 'utf8');
      const blocks = text.match(FACE);
      if (!blocks?.length) throw new Error(`${src.pkg}/${css}: no @font-face rules`);
      for (const b of blocks) {
        faces.push(rewriteFace(b, src, outDir));
        const latin = b.match(/url\(\.\/files\/([^)]+-latin-(?:wght|400)-normal\.woff2)\)/)?.[1];
        if (latin && group.out.startsWith('app/fonts/choice/')) {
          LATIN[group.out] ??= `node_modules/${src.pkg}/files/${latin}`;
        }
      }
    }
    const choice = FONT_CATALOGUE.find((f) => group.out === `app/fonts/choice/${f.id}.css`);
    if (choice && choice.kind !== 'mono') faces.push(fallbackFace(choice.id, choice.family));
  }
  const display = group.sources.some((x) => x.display === 'swap') ? 'swap' : 'optional';
  return [
    '/* GENERATED by scripts/gen-self-hosted-fonts.ts — do not edit; re-run it.',
    `   font-display: ${display} — see that script for why these are not Fontsource’s`,
    `   own stylesheets. Loaded by: ${group.usedBy}. */`,
    '',
    faces.join('\n\n'),
    '',
  ].join('\n');
}

/** `html[data-font-<slot>='<id>']` → the slot's variable. Defaults need no rule; no `@font-face` here. */
function renderRules(): string {
  const stack = (f: (typeof FONT_CATALOGUE)[number]) =>
    f.kind === 'mono'
      ? `'${f.family}', ui-monospace, SFMono-Regular, Menlo, monospace`
      : `'${f.family}', '${f.family} Fallback', system-ui, ${f.kind === 'serif' ? 'serif' : 'sans-serif'}`;
  const rules: string[] = [];
  for (const f of FONT_CATALOGUE) {
    if (f.kind === 'mono') {
      if (f.id !== 'dm-mono') rules.push(`html[data-font-mono='${f.id}'] {\n  --site-font-mono: ${stack(f)};\n}`);
      continue;
    }
    if (f.id !== 'dm-sans') rules.push(`html[data-font-main='${f.id}'] {\n  --site-font-body: ${stack(f)};\n}`);
    // Reading names every text face, the default included: main may be another face while reading stays DM Sans.
    rules.push(`html[data-font-reading='${f.id}'] {\n  --site-font-reading: ${stack(f)};\n}`);
  }
  return [
    '/* GENERATED by scripts/gen-self-hosted-fonts.ts — do not edit; re-run it.',
    '   The reader’s chosen faces (lib/appearance/fonts.ts) as variable values, selected by the',
    '   data-font-* attributes the root renders on <html>. Faces live in app/fonts/choice/<id>.css. */',
    '',
    rules.join('\n\n'),
    '',
  ].join('\n');
}

/** Paths for tests and tools, and Vite `?url` imports for the root head (sheet + Latin preload per face). */
function renderAssets(): string {
  const lines = [
    '/* GENERATED by scripts/gen-self-hosted-fonts.ts — do not edit; re-run it. */',
    "import type { FontId } from '@/lib/appearance/fonts';",
  ];
  const paths: string[] = [];
  const urls: string[] = [];
  FONT_CATALOGUE.forEach((f, i) => {
    const sheet = `app/fonts/choice/${f.id}.css`;
    const latin = LATIN[sheet];
    if (!latin) throw new Error(`${f.id}: no Latin woff2 found`);
    lines.push(`import sheet${i} from '@/${sheet}?url';`);
    lines.push(`import latin${i} from '${latin.replace(/^node_modules\//, '')}?url';`);
    paths.push(`  '${f.id}': { sheet: '${sheet}', latin: '${latin}' },`);
    urls.push(`  '${f.id}': { sheet: sheet${i}, latin: latin${i} },`);
  });
  return [
    ...lines,
    '',
    '/** Repo-relative sources, for tests and tools. */',
    'export const FONT_ASSET_PATHS: Record<FontId, { sheet: string; latin: string }> = {',
    ...paths,
    '};',
    '',
    '/** Built URLs: the face’s stylesheet and its Latin file (the one worth preloading). */',
    'export const FONT_ASSETS: Record<FontId, { sheet: string; latin: string }> = {',
    ...urls,
    '};',
    '',
  ].join('\n');
}

const check = process.argv.includes('--check');
let stale = 0;
const OUTPUTS: Array<{ out: string; render: () => string }> = [
  ...[...GROUPS, ...CHOICE_GROUPS].map((g) => ({ out: g.out, render: () => render(g) })),
  { out: 'app/fonts/choice-rules.css', render: renderRules },
  { out: 'lib/appearance/font-assets.gen.ts', render: renderAssets },
];
for (const group of OUTPUTS) {
  const path = join(ROOT, group.out);
  const next = group.render();
  let current = '';
  try {
    current = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
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
