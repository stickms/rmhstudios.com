/**
 * The z-index scale, made executable.
 *
 * `design-consistency.test.ts` gates colour, radius, motion and elevation, and
 * contains **zero** rules about stacking. That gap is why one audit found four
 * separate controls that were rendered, styled, and completely unreachable: a
 * crop dialog nobody could see, a 3D viewer nobody could close on touch, a Save
 * Post button no admin could click, and an address suggestion that opened the
 * navigation menu instead of selecting the address.
 *
 * ## The one fact every rule here is about
 *
 * Page content renders inside `.radial-frame`, which is
 * `position: relative; z-index: var(--z-content)` — **a stacking context pinned
 * at 1** (globals.css §5.6). Every z-index written inside a page is therefore
 * measured INSIDE that 1. It does not matter how large the number is: `z-50`,
 * `z-88`, `z-[100]` and `z-[300]` all lose to the shell's own chrome — the top
 * bar at 60, the hub orb and compose FAB at 80 — because those are siblings of
 * the frame, not descendants of it. The only way out is `createPortal` to
 * `<body>` (or a primitive that does it for you).
 *
 * A big z-index inside the frame is not a strong claim. It is a claim that
 * cannot be heard, and it reads in review as deliberate.
 *
 * ## What this cannot catch, stated honestly
 *
 * These are source scans, not a renderer. They do not know:
 *
 *  - **Whether an element is actually inside `.radial-frame` at runtime.** A
 *    component mounted from `Providers` or `__root` is a body-level sibling of
 *    the shell and its numbers are real. That is what the allowlists are for,
 *    and it is why every entry has to say WHERE the thing mounts.
 *  - **Geometry.** Nothing here knows that a panel overlaps the orb, only that
 *    it could never paint above it. Overlap in space is still eyes-only.
 *  - **Ancestor-created stacking contexts across files.** R3 catches the
 *    single-file case (a component whose own root is blurred glass). A parent
 *    in another file that adds `hover:-translate-y-0.5` and traps a child's
 *    popup — the `RankedColumn` / `HandleInput` bug — is invisible to a scan.
 *  - **`content-visibility`, `will-change`, `contain`, `mix-blend-mode`,** or
 *    any of the other properties that open a stacking context without a
 *    z-index.
 *
 * A green run means no NEW instance of the shapes below. It does not mean the
 * layering is right.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** Same walk `design-consistency.test.ts` uses, generalised over extensions. */
function collect(dir: string, exts: readonly string[], out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      collect(rel, exts, out);
    } else if (
      exts.some((e) => entry.name.endsWith(e)) &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.test.ts') &&
      entry.name !== 'routeTree.gen.ts'
    ) {
      out.push(rel);
    }
  }
  return out;
}

function listSourceFiles(dirs: readonly string[], exts: readonly string[]): string[] {
  return dirs.flatMap((d) => collect(d, exts));
}

/**
 * Directories that are NOT the site tier: full-screen games and the parallel
 * `--app-*` app tier. Both own their whole viewport, neither renders inside
 * `.radial-frame`, and the design language says so (design.md §8).
 */
const NON_SITE_DIRS = new Set([
  // games
  'altair', 'void-breaker', 'slice-it', 'velum2099', 'synapse-storm', 'kowloon-knockout',
  'temple-of-joy', 'neon-driftway', 'lights-out', 'cursed-logic', 'house-always-wins',
  'laundry-sort', 'cookgame', 'dream-rift', 'forest-explorer', 'signal-forge', 'vega',
  'versecraft', 'daily-puzzles', 'rmh-farming-sim', 'rmhbox', 'bums-rush', 'blm', 'covid',
  'isleworks', 'kaikai-debt', 'lockdown', 'massive-march', 'nightrail', 'rmh-capital',
  'rmh-pmc', 'sohumbum', 'sohumtracker', 'gabriels-horn', 'arcade', 'games',
  // --app-* tier and full-screen apps
  'shared', 'rmhtube', 'rmhmusic', 'rmhtype', 'rmhstudy', 'rmhcode', 'rmhvibe', 'doctrine',
  'render', 'replays', 'call',
  // Top-level routes (app/routes/<name>.tsx), so no shell and no frame: their
  // numbers are already body-level.
  'pf2ecal',
]);

function isSiteTier(file: string): boolean {
  if (file.startsWith('app/routes/_site/')) return true;
  if (!file.startsWith('components/')) return false;
  return !NON_SITE_DIRS.has(file.split('/')[1]);
}

/**
 * Strip comments before scanning.
 *
 * Not a nicety — without it this test fails on its own subject matter. Files
 * fixed by the audit carry comments EXPLAINING the bug ("`fixed inset-0 z-50`
 * here is measured inside…"), and a scanner that reads those flags the very
 * files that document why they are correct. Block comments first, then line
 * comments; string literals are left alone because a z-class only ever appears
 * in one.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every way a file can legitimately leave the frame. */
function escapesTheFrame(src: string): boolean {
  return (
    // Its own portal.
    /createPortal\s*\(/.test(src) ||
    // A Radix primitive's portal, however the namespace was imported —
    // `<DialogPrimitive.Portal>`, `<HoverCard.Portal>`, `<Portal>`. All of
    // these portal to <body> by default.
    /<[A-Za-z][A-Za-z0-9_]*\.Portal\b/.test(src) ||
    /<Portal\b/.test(src) ||
    // A primitive of ours that portals on the caller's behalf.
    /\b(Dialog|Sheet|AnchoredMenu|OverlayPanel|LibraryDialogShell|ConfirmDialog)\b/.test(src)
  );
}

const TSX = listSourceFiles(['components', 'app/routes/_site'], ['.tsx']).filter(isSiteTier);

/**
 * Mounted OUTSIDE `.radial-frame`, so their numbers are body-level and real.
 *
 * One-directional, like every allowlist in this repo: entries come out as files
 * change, they do not go in. A new entry needs a reason naming where the
 * component mounts — not "the gate is inconvenient".
 */
const BODY_LEVEL_MOUNTS: ReadonlyArray<{ file: string; reason: string }> = [
  {
    file: 'components/ui/NavigationProgress.tsx',
    reason:
      'Mounted from __root.tsx, above the shell entirely, and portals nothing because it IS body-level. A router progress bar must outrank every surface, which is what its 300 says.',
  },
];

const allowedFiles = new Set(BODY_LEVEL_MOUNTS.map((e) => e.file));

describe('§5.6 — a full-viewport overlay has to leave the frame (R1)', () => {
  it('scans a non-trivial set of site-tier sources', () => {
    expect(TSX.length).toBeGreaterThan(200);
  });

  it('every `fixed inset-0` overlay portals to <body>', () => {
    const offenders: string[] = [];
    for (const file of TSX) {
      if (allowedFiles.has(file)) continue;
      const src = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      const overlay =
        /className=[^\n]*\bfixed\b[^\n]*\binset-0\b/.test(src) ||
        /className=[^\n]*\binset-0\b[^\n]*\bfixed\b/.test(src);
      if (overlay && !escapesTheFrame(src)) offenders.push(file);
    }
    expect(
      offenders,
      'A full-viewport overlay rendered from a page sits inside `.radial-frame` (z-index 1) and can never clear the top bar (60) or the hub orb (80). Portal it to <body>, or use Dialog/Sheet/OverlayPanel/AnchoredMenu.',
    ).toEqual([]);
  });

  it('site-tier stylesheets declare no un-portalled full-viewport overlay', () => {
    // The .tsx scan cannot see a class like `.b3d` or `.lib-upload__overlay`
    // whose geometry lives entirely in CSS.
    const sheets = listSourceFiles(['components', 'app'], ['.css']).filter(
      (f) => isSiteTier(f) || f === 'app/globals.css',
    );
    const offenders: string[] = [];
    for (const file of sheets) {
      const css = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/\.([a-z0-9_-]+)\s*\{([^}]*)\}/gi)) {
        const body = m[2];
        if (!/position:\s*fixed/.test(body)) continue;
        // The whole shorthand, not a prefix of it: `inset: 0 0 auto` is a
        // pinned TOP BAR (`.sec-nav`), not a full-viewport overlay.
        if (!/inset:\s*0\s*(?:;|$)/m.test(body)) continue;
        // ABOVE the band, not at it. 50 is the sanctioned dialog layer and is
        // exactly what a correctly-portalled overlay should carry; the numbers
        // worth failing on are the ones reaching past the shell — the 120s and
        // 130s that were only ever large because they were losing.
        const z = /z-index:\s*(\d+)/.exec(body);
        if (z && Number(z[1]) > 50) offenders.push(`${file} .${m[1]} (z-index ${z[1]})`);
      }
    }
    expect(
      offenders,
      'A CSS class that is `position: fixed; inset: 0` with z-index above 50 is reaching past the shell — which only works at body level. Confirm every consumer portals, then drop it to the 50 dialog band.',
    ).toEqual([]);
  });
});

describe('§5.6 — a big z-index inside the frame is a claim nobody can hear (R2)', () => {
  it('no site-tier file that stays in the frame writes z >= 50', () => {
    const offenders: string[] = [];
    for (const file of TSX) {
      if (allowedFiles.has(file)) continue;
      const src = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      if (escapesTheFrame(src)) continue;
      const values = [...src.matchAll(/\bz-\[?(\d+)\]?\b/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n >= 50);
      if (values.length) offenders.push(`${file} (z-${[...new Set(values)].sort((a, b) => a - b).join(', z-')})`);
    }
    expect(
      offenders,
      'z >= 50 is meaningful only at body level; inside `.radial-frame` it resolves against a context pinned at 1. Either portal the element or pick a number that competes with its real siblings.',
    ).toEqual([]);
  });
});

describe('§4 — nothing `fixed` inside a blurred glass root (R3)', () => {
  it('a component whose own root is blurred glass portals its fixed descendants', () => {
    // `backdrop-filter` is BOTH a stacking context and a containing block for
    // `position: fixed` descendants — so `inset: 0` inside one resolves to that
    // element's border box, not the viewport. This is file-scoped and crude on
    // purpose: it is exactly the ComposeBox shape (a `.glass-pane` root wrapping
    // six "full-screen" modals) and has near-zero prevalence otherwise.
    //
    // `.glass-fill` is deliberately absent: L1 has no blur, which is what makes
    // it safe to build repeated content from — asserted just below.
    const BLURRED_ROOTS = /className="[^"]*\b(glass-pane|glass-chrome|glass-overlay|glass-scrim)\b/;
    const offenders: string[] = [];
    for (const file of TSX) {
      if (allowedFiles.has(file)) continue;
      const src = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      if (!BLURRED_ROOTS.test(src)) continue;
      // `fixed` AND `inset-0`: a full-viewport overlay declared inside a glass
      // component. Without the `inset-0` this also catches a component that IS
      // fixed glass chrome (CookieConsent, ThemePreviewBar) — those are
      // `fixed inset-x-*`, they contain nothing, and there is nothing to trap.
      if (!/className=[^\n]*\bfixed\b[^\n]*\binset-0\b/.test(src)) continue;
      if (!escapesTheFrame(src)) offenders.push(file);
    }
    expect(
      offenders,
      "A `position: fixed` element inside an ancestor carrying `backdrop-filter` is fixed to THAT ANCESTOR. Portal it. Note this renders correctly under reduce-transparency / high-contrast / perf-lite, which force `backdrop-filter: none` — so check the DEFAULT theme.",
    ).toEqual([]);
  });

  it('L1 still has no blur, which is what R3 above depends on', () => {
    const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    const block = /\.glass-fill\s*\{([^}]*)\}/.exec(css);
    expect(block, '.glass-fill is missing from globals.css').not.toBeNull();
    expect(
      /backdrop-filter/.test(block![1]),
      '.glass-fill gained a backdrop-filter. That breaks the blur budget (zero blurred surfaces on repeated list items) AND makes every feed card a containing block for fixed descendants.',
    ).toBe(false);
  });
});

describe('§5.6 — the shell stacking scale stays one scale (R4)', () => {
  const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
  const tokens = [...css.matchAll(/^\s*(--z-[a-z-]+):\s*(\d+);/gm)].map(
    (m) => [m[1], Number(m[2])] as const,
  );

  it('finds the scale at all', () => {
    expect(tokens.length).toBeGreaterThan(4);
  });

  it('every --z-* token has a consumer', () => {
    const corpus = listSourceFiles(['components', 'app', 'lib', 'hooks'], ['.css', '.tsx', '.ts'])
      .map((f) => readFileSync(join(ROOT, f), 'utf8'))
      .join('\n');
    const dead = tokens.filter(([name]) => !corpus.includes(`var(${name}`)).map(([n]) => n);
    expect(dead, 'A declared layer nobody reads is a layer that does not exist.').toEqual([]);
  });

  it('no two --z-* tokens share a value', () => {
    // A documented tie, not an oversight: --z-quickpanel and --z-menu are both
    // 40 because they are the same layer for two kinds of surface, and neither
    // is ever open while the other is. Breaking the tie would reorder them by
    // fiat with nothing to verify against. If a third joins, break it.
    const KNOWN_TIE = ['--z-menu', '--z-quickpanel'];
    const byValue = new Map<number, string[]>();
    for (const [name, value] of tokens) {
      byValue.set(value, [...(byValue.get(value) ?? []), name]);
    }
    const collisions = [...byValue.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([value, names]) => `${value}: ${names.sort().join(', ')}`)
      .filter((line) => line !== `40: ${KNOWN_TIE.join(', ')}`);
    expect(
      collisions,
      'Two layers at the same value are ordered by DOM order, which is not a decision anyone made.',
    ).toEqual([]);
  });

  it('the scale is declared only in globals.css', () => {
    const elsewhere = listSourceFiles(['components', 'app'], ['.css'])
      .filter((f) => f !== 'app/globals.css')
      .filter((f) => /^\s*--z-[a-z-]+:\s*\d+;/m.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(elsewhere, 'The stacking scale lives in one file so it can be read in one place.').toEqual(
      [],
    );
  });
});

describe('the allowlist stays honest', () => {
  it('every entry still trips the rule it excuses', () => {
    const stale: string[] = [];
    for (const { file } of BODY_LEVEL_MOUNTS) {
      const src = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      const trips =
        (/className=[^\n]*\bfixed\b[^\n]*\binset-0\b/.test(src) && !escapesTheFrame(src)) ||
        (!escapesTheFrame(src) &&
          [...src.matchAll(/\bz-\[?(\d+)\]?\b/g)].some((m) => Number(m[1]) >= 50));
      if (!trips) stale.push(file);
    }
    expect(
      stale,
      'This entry no longer needs excusing — remove it. Allowlists in this repo are one-directional.',
    ).toEqual([]);
  });

  it('every entry names where the component mounts', () => {
    for (const { file, reason } of BODY_LEVEL_MOUNTS) {
      expect(reason.length, `${file} needs a real reason`).toBeGreaterThan(40);
    }
  });
});
