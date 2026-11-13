/**
 * Steel gates (docs/plans/2026-11-11-steel-design-implementation.md §17): the site tier is flat.
 *
 *  - R1, R2, B2: no `backdrop-filter`, `filter` or gradient in site-tier CSS. Polished chrome is the only material and it
 *    lives in exactly two files, `app/styles/steel-chrome.css` (the chrome gradients, phase 2) and
 *    `components/shell/globe-nav.css` (the globe's static first paint, phase 3). Neither exists yet; they are allowed
 *    by name so those phases need no change here.
 *  - T3 and Appendix A: no stylesheet, class string or style object reads a deleted token (`--site-glass-*`,
 *    `--site-jelly-*`, `--site-arc-*`, `--site-shadow*`, `--site-surface-opaque`, `--site-border-bright`,
 *    `--site-text-dim`, `--site-accent-dim`, or their Tailwind utilities).
 *
 * Existing violations that a later phase removes are frozen in the named baselines below, each with the phase that
 * removes it. Like the CSS debt in design-consistency.test.ts these are ratchets: a number only goes down, an entry
 * leaves the list when its file is clean, and nothing new goes in. The full-screen games and the `--app-*` apps are out
 * of scope (L8: they keep their own look).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FULLSCREEN_TIER_DIRS, STEEL_PALETTE_BASELINE } from '../../eslint-local-rules/design-scope.js';
import { PATTERN as PALETTE_PATTERN } from '../../eslint-local-rules/no-raw-palette-color.js';
import { PATTERN as RADIUS_PATTERN } from '../../eslint-local-rules/no-hardcoded-radius.js';
import { APP_TIER_DIRS, siteAppCssFiles } from './css-tiers';

const ROOT = process.cwd();

/**
 * The only files allowed to hold the chrome material (R2). They do not exist until phases 2 and 3, so the paths are
 * assembled rather than written out: `doc-pointers.test.ts` checks that every path quoted in a gate resolves.
 */
const CHROME_FILES = new Set([
  ['app', 'styles', 'steel-chrome.css'].join('/'),
  ['components', 'shell', 'globe-nav.css'].join('/'),
]);

function isAppTierCss(rel: string): boolean {
  const parts = rel.split('/');
  if (parts[0] === 'app') return parts[1] === 'app-theme-tokens.css' || parts[1] === 'app-tier.css';
  return APP_TIER_DIRS.has(parts[1] ?? '') || FULLSCREEN_TIER_DIRS.has(parts[1] ?? '');
}

/** Site-tier stylesheets: every `app/`, `components/` and `features/` sheet that is not a game or an app. */
const SITE_CSS = siteAppCssFiles(ROOT).filter(
  (f) => /^(app|components|features)\//.test(f) && !isAppTierCss(f) && !f.startsWith('app/fonts/'),
);

interface FlatCount {
  /** `backdrop-filter` with a value other than `none`. */
  bf: number;
  /** `filter` with a value other than `none`. */
  fl: number;
  /** `linear-`, `radial-`, `conic-` (and repeating) gradients. */
  gr: number;
}

function flatCount(src: string): FlatCount {
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return {
    bf: (body.match(/(?:-webkit-)?backdrop-filter:\s*(?!none)/g) ?? []).length,
    fl: (body.match(/(?<![-\w])(?:-webkit-)?filter:\s*(?!none)/g) ?? []).length,
    gr: (body.match(/(?:repeating-)?(?:linear|radial|conic)-gradient\(/g) ?? []).length,
  };
}

/**
 * Frozen violations of R1/B2 in site-tier CSS, 2026-11-11 (Steel phase 1). `bf` backdrop-filter, `fl` filter,
 * `gr` gradient. Every entry names the phase that removes it. Lower a number when you clean a file; delete the
 * entry when it reaches zero; never raise one.
 */
const FLAT_BASELINE: Record<string, FlatCount> = {
  // Phase 5 (remaining recipes): the catalogue and article pages.
  'components/library/album-viewer.css': { bf: 8, fl: 1, gr: 2 },
  'components/library/book-3d.css': { bf: 0, fl: 0, gr: 5 },
  'components/library/library/catalog-reader.css': { bf: 17, fl: 0, gr: 7 },
  'components/library/library/sections-refresh.css': { bf: 10, fl: 0, gr: 5 }, // book cover art and the reader's chips over pictures
  // Phase 7 (long tail): shared global sheets that carry rules for games and standalone pages, and routes with no
  // recipe yet. Each is removed against section 10's X2 when its page is reviewed.
  'app/globals/base-interaction.css': { bf: 0, fl: 0, gr: 1 }, // .rainbow-text (game headings)
  'app/globals/comfort-suite.css': { bf: 0, fl: 2, gr: 0 }, // the RMHHomes map tint, the loader filter
  'app/globals/components-reveal.css': { bf: 0, fl: 1, gr: 6 },
  'app/globals/loader-print-access.css': { bf: 2, fl: 0, gr: 6 }, // `backdrop-filter: none` print resets are not counted
  'app/globals/page-motion.css': { bf: 0, fl: 2, gr: 8 }, // Dream Rift and doctrine skins live in this shared sheet
  'app/globals/tokens-themes.css': { bf: 0, fl: 0, gr: 1 }, // the scroll-fade mask
  'components/creator-studio/storefront.css': { bf: 0, fl: 0, gr: 3 }, // the hero's scrim under its text
  'components/kaikai-debt/kaikai-debt.css': { bf: 0, fl: 0, gr: 5 },
  'components/rmhcalculator/rmhcalculator.css': { bf: 0, fl: 1, gr: 1 },
  'components/rmhtech/rmhtech.css': { bf: 0, fl: 3, gr: 5 },
  'components/security/security.css': { bf: 0, fl: 0, gr: 1 },
};

const measured = SITE_CSS.map((file) => ({
  file,
  ...flatCount(readFileSync(join(ROOT, file), 'utf8')),
}));
const total = (c: FlatCount) => c.bf + c.fl + c.gr;

describe('Steel: the site tier is flat (R1, R2, B2)', () => {
  it('scans the site-tier stylesheets at all', () => {
    expect(measured.length).toBeGreaterThan(30);
    expect(measured.map((m) => m.file)).toContain('app/globals/tokens-themes.css');
    expect(measured.map((m) => m.file)).toContain('components/feed/feed.css');
    expect(measured.map((m) => m.file)).not.toContain('components/temple-of-joy/temple-of-joy.css');
    expect(measured.map((m) => m.file)).not.toContain('components/rmhbox/rmhbox.css');
  });

  it('a clean stylesheet gains no backdrop-filter, filter or gradient', () => {
    const offenders = measured
      .filter((m) => !CHROME_FILES.has(m.file) && !(m.file in FLAT_BASELINE) && total(m) > 0)
      .map((m) => `${m.file}: ${m.bf} backdrop-filter, ${m.fl} filter, ${m.gr} gradient`);
    expect(
      offenders,
      'Steel R1/R2/B2: no backdrop-filter, filter or gradient in site-tier CSS. Surfaces are solid colours from the ' +
        'section-2 tokens; the only material is the chrome, in steel-chrome.css (phase 2) and globe-nav.css (phase 3).',
    ).toEqual([]);
  });

  it('a baselined stylesheet never gets worse', () => {
    const worse: string[] = [];
    for (const [file, frozen] of Object.entries(FLAT_BASELINE)) {
      const now = measured.find((m) => m.file === file);
      if (!now) continue;
      for (const k of ['bf', 'fl', 'gr'] as const) {
        if (now[k] > frozen[k]) worse.push(`${file}: ${k} ${frozen[k]} -> ${now[k]}`);
      }
    }
    expect(worse, 'FLAT_BASELINE is a ratchet: a number may only go down.').toEqual([]);
  });

  it('drains the baseline as files are cleaned', () => {
    const stale: string[] = [];
    for (const [file, frozen] of Object.entries(FLAT_BASELINE)) {
      const now = measured.find((m) => m.file === file);
      if (!now) {
        stale.push(`${file}: no longer scanned, remove it from FLAT_BASELINE`);
      } else if (total(now) === 0) {
        stale.push(`${file}: now clean, remove it from FLAT_BASELINE`);
      } else if (['bf', 'fl', 'gr'].some((k) => now[k as keyof FlatCount] < frozen[k as keyof FlatCount])) {
        stale.push(`${file}: improved to ${JSON.stringify({ bf: now.bf, fl: now.fl, gr: now.gr })}, lower its entry`);
      }
    }
    expect(stale, 'FLAT_BASELINE is out of date.').toEqual([]);
  });
});

/** Strip comments the way the token gate needs: a comment may name a deleted token, a declaration may not. */
function code(file: string, src: string): string {
  if (file.endsWith('.css')) return src.replace(/\/\*[\s\S]*?\*\//g, '');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/(^|[^:'"`])\/\/[^'"`]*$/, '$1'))
    .join('\n');
}

const REMOVED_TOKEN =
  /--site-(?:glass|jelly|arc)-[\w-]*|--site-shadow[\w-]*|--site-(?:surface-opaque|border-bright|text-dim|accent-dim|canvas|aurora-far-[12])\b|\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|placeholder|caret|accent)-site-(?:glass-[\w-]+|surface-opaque|border-bright|text-dim|accent-dim)\b|(?<![\w-])(?:[\w[\]&>*:-]+:)?shadow-site(?:-sm)?(?![\w-])/;

function walkSource(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (!['node_modules', '__tests__', 'generated', 'dist-islands'].includes(e.name)) walkSource(rel, out);
    } else if (/\.(css|tsx?)$/.test(e.name) && !/\.(test|d)\.tsx?$/.test(e.name) && !rel.startsWith('lib/i18n/resources')) {
      out.push(rel);
    }
  }
  return out;
}

describe('Steel: deleted tokens stay deleted (T3, Appendix A)', () => {
  const sources = ['app', 'components', 'features', 'hooks', 'lib', 'stores']
    .flatMap((d) => walkSource(d))
    .filter((f) => f !== 'lib/prepaint/generated.ts' && f !== 'app/routeTree.gen.ts');

  it('scans the tree at all', () => {
    expect(sources.length).toBeGreaterThan(1500);
    expect(sources).toContain('app/globals/tokens-themes.css');
  });

  it('nothing reads a deleted token or a utility built on one', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const hit = REMOVED_TOKEN.exec(code(file, readFileSync(join(ROOT, file), 'utf8')));
      if (hit) offenders.push(`${file}: ${hit[0]}`);
    }
    expect(
      offenders,
      'These tokens were deleted by Steel (T3, Appendix A): use the replacement Appendix A names ' +
        '(--site-surface, --site-text, --site-text-muted, --site-bg-subtle), or nothing for a shadow or glass token.',
    ).toEqual([]);
  });
});

describe('Steel: the palette baseline for the two lint rules', () => {
  it('lists only files that exist', () => {
    const missing = Object.keys(STEEL_PALETTE_BASELINE).filter((f) => !existsSync(join(ROOT, f)));
    expect(missing, 'Remove these from STEEL_PALETTE_BASELINE (design-scope.js).').toEqual([]);
  });

  it('lists only files that still break a rule', () => {
    // Over-approximates a class string with the whole file, so it can only miss a stale entry, never invent one.
    const clean = Object.keys(STEEL_PALETTE_BASELINE).filter((f) => {
      const src = readFileSync(join(ROOT, f), 'utf8');
      return !new RegExp(PALETTE_PATTERN).test(src) && !new RegExp(RADIUS_PATTERN).test(src);
    });
    expect(clean, 'These files are clean: remove them from STEEL_PALETTE_BASELINE (design-scope.js).').toEqual([]);
  });

  it('names a phase for every entry', () => {
    const unnamed = Object.entries(STEEL_PALETTE_BASELINE).filter(([, why]) => !/^phase [1-7]\b/.test(why as string));
    expect(unnamed).toEqual([]);
  });
});
