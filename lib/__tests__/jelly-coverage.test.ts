/**
 * Every surface is jelly, or it is on the list of debts that only shrinks (the coverage ratchet: plan 04 §2.5, and
 * 05's N5 "hand-rolled surface" rule — one gate for both, so the count is kept in one place).
 *
 * ## Why
 *
 * Plasmatic Jelly reaches a surface through its ROLE (`.glass-fill` / `-pane` / `-chrome` / `-overlay` / `-inset`,
 * `.app-glass`), the `components/ui` primitives and `JELLY_SELECTOR` (lib/jelly/tiers.ts). A box built by hand from
 * `bg-site-surface border rounded-site` gets none of it: no haze, no rim, no squash, no arcs. Under Liquid Glass that
 * box was merely less shiny; next to a jelly card it is visibly a different product. `design.md` §3 already said "a
 * tier class is not decoration you can inline" — this makes it a number that can only go down.
 *
 * ## What is counted (identical to `node scripts/codemods/jelly-roles.mjs --report`)
 *
 * 1. **Hand-rolled surfaces** — a `className` (same capture as design-consistency.test.ts) holding a surface
 *    background (`bg-site-surface|surface-opaque|bg|elevated`, or the app tier's `bg-(--app-surface)`), a `rounded*`
 *    and a `border`, with no `glass-` / `app-glass` / `data-liquid`. Every tier is counted (site, apps, games), as the
 *    codemod's report does; the app adapter in `app-theme.css` covers `bg-(--app-surface)` visually, but the count
 *    keeps the role debt honest.
 * 2. **Raw `role="dialog"` / `role="switch"`** outside `components/ui`: a hand-built dialog or switch bypasses the
 *    primitive that carries the jelly (and the focus trap, and the keyboard contract).
 * 3. **`data-jelly="off"` on the site tier** — opting a surface OUT of the material. Games turn their play-fields off
 *    with `data-jelly-zone="playfield"` (R16) and are exempt; media elements are never hosts anyway. Anything else
 *    needs a reviewed entry in {@link JELLY_OFF_ALLOW}.
 *
 * ## The baseline
 *
 * Frozen per file, sharded one JSON per directory in `jelly-coverage.baseline/` (beside this file; see
 * jelly-coverage-shards.ts), so area PRs lower only their own shard. It is a ratchet:
 *
 *  - a file over its frozen count fails; a file not on the list must be at zero;
 *  - a file UNDER its frozen count also fails ("lower it"), so the list never quietly becomes permission.
 *
 * Lowering is mechanical and safe — it can only move numbers down:
 *
 *     JELLY_COVERAGE_BASELINE=lower pnpm exec vitest run lib/__tests__/jelly-coverage.test.ts
 *
 * `JELLY_COVERAGE_BASELINE=freeze` rewrites every shard from the current tree. It exists for the initial
 * freeze only; a raised number shows up in review as a diff to this JSON, and has to be argued for there.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARD_DIR, loadShards, writeShards } from './jelly-coverage-shards';

const ROOT = process.cwd();

function collectTsx(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      collectTsx(rel, out);
    } else if (e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) out.push(rel);
  }
  return out;
}

const FILES = ['components', 'app'].flatMap((d) => collectTsx(d)).sort();

// ── Detection: kept byte-for-byte in step with scripts/codemods/jelly-roles.mjs ──────────────────────────────────
const CLASS_ATTR =
  /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|\{([\s\S]{0,1200}?)\}\s*(?=[\s/>]))/g;
const SURFACE_BG =
  /(?<![\w:/-])bg-(?:site-(?:surface|surface-opaque|bg|elevated)|\(--app-surface\))(?:\/[\w.[\]]+)?(?![\w-])/;
const ROUNDED = /(?<![\w:/-])rounded(?:-[\w[\]().-]+)?(?![\w-])/;
const BORDER = /(?<![\w:/-])border(?:-(?:\d|x|y|t|b|l|r|site-border))?[\w/-]*(?![\w-])/;
const ROLE = /glass-|app-glass|data-liquid/;
const isSurface = (v: string) =>
  SURFACE_BG.test(v) && ROUNDED.test(v) && BORDER.test(v) && !ROLE.test(v);

/** Site tier = not a full-screen game/app dir, parsed from the design gate (the policy lives there). */
const FULLSCREEN_TIER_DIRS = (() => {
  const src = readFileSync(join(ROOT, 'lib/__tests__/design-consistency.test.ts'), 'utf8');
  const start = src.indexOf('const FULLSCREEN_TIER_DIRS = new Set([');
  return new Set(
    [...src.slice(start, src.indexOf(']);', start)).matchAll(/^\s*'([a-z0-9-]+)'/gm)].map(
      (m) => m[1],
    ),
  );
})();
const isGameOrApp = (f: string) =>
  f.startsWith('components/') && FULLSCREEN_TIER_DIRS.has(f.split('/')[1]);

/**
 * Site-tier `data-jelly="off"` that is genuinely right. One-directional; every entry says why the surface must not
 * be jelly (a gesture surface whose motion is the content, a canvas host…).
 */
const JELLY_OFF_ALLOW = new Map<string, string>([
  [
    'app/routes/jelly.tsx',
    'the /jelly material lab DEMONSTRATES the opt-out: one specimen is deliberately rendered with the material off, beside the live ones',
  ],
  [
    'components/ui/select.tsx',
    'a dropdown ROW is text inside one rounded panel, not a surface: it must not be a rim slab or a soft body (it would draw its own bevel and squash inside the panel); only its hover glow (data-evert) wakes',
  ],
  [
    'components/site/LanguageSwitcher.tsx',
    'a dropdown ROW is text inside one rounded panel, not a surface: it must not be a rim slab or a soft body (it would draw its own bevel and squash inside the panel); only its hover glow (data-evert) wakes',
  ],
  [
    'components/calendar/PersonPicker.tsx',
    'a dropdown ROW is text inside one rounded panel, not a surface: it must not be a rim slab or a soft body (it would draw its own bevel and squash inside the panel); only its hover glow (data-evert) wakes',
  ],
  [
    'components/homes/LocationSearch.tsx',
    'a dropdown ROW is text inside one rounded panel, not a surface: it must not be a rim slab or a soft body (it would draw its own bevel and squash inside the panel); only its hover glow (data-evert) wakes',
  ],
  [
    'components/rideshare/LocationSearch.tsx',
    'a dropdown ROW is text inside one rounded panel, not a surface: it must not be a rim slab or a soft body (it would draw its own bevel and squash inside the panel); only its hover glow (data-evert) wakes',
  ],
]);

type Counts = Record<string, number>;
interface Measured {
  surfaces: Counts;
  dialogs: Counts;
  switches: Counts;
}

function measure(): { m: Measured; jellyOff: string[] } {
  const m: Measured = { surfaces: {}, dialogs: {}, switches: {} };
  const jellyOff: string[] = [];
  const bump = (c: Counts, f: string, n: number) => {
    if (n > 0) c[f] = n;
  };
  for (const file of FILES) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    let n = 0;
    CLASS_ATTR.lastIndex = 0;
    for (let x = CLASS_ATTR.exec(src); x; x = CLASS_ATTR.exec(src)) {
      if (isSurface(x[1] ?? x[2] ?? x[3] ?? x[4] ?? '')) n++;
    }
    bump(m.surfaces, file, n);
    if (!file.startsWith('components/ui/')) {
      bump(m.dialogs, file, (src.match(/role="dialog"/g) ?? []).length);
      bump(m.switches, file, (src.match(/role="switch"/g) ?? []).length);
    }
    if (!isGameOrApp(file) && !JELLY_OFF_ALLOW.has(file)) {
      for (const j of src.matchAll(/\bdata-jelly=(?:"off"|'off'|\{\s*['"]off['"]\s*\})/g)) {
        const tag = /<([a-zA-Z][\w.]*)[^<]*$/.exec(
          src.slice(Math.max(0, j.index! - 1500), j.index),
        )?.[1];
        if (tag && /^(img|video|canvas|iframe|audio|picture)$/.test(tag)) continue;
        jellyOff.push(`${file} <${tag ?? '?'} data-jelly="off">`);
      }
    }
  }
  return { m, jellyOff };
}

const { m: NOW, jellyOff: JELLY_OFF } = measure();
const KINDS = ['surfaces', 'dialogs', 'switches'] as const;

const loadBaseline = (): Measured => loadShards();

// Opt-in maintenance modes (see the docblock). Never runs in CI or the commit gate: both leave the variable unset.
const MODE = process.env.JELLY_COVERAGE_BASELINE;
if (MODE === 'freeze' || MODE === 'lower') {
  const old = loadBaseline();
  const next: Measured = { surfaces: {}, dialogs: {}, switches: {} };
  for (const k of KINDS) {
    const src = MODE === 'freeze' ? NOW[k] : old[k];
    for (const [file, n] of Object.entries(src)) {
      const v = MODE === 'freeze' ? n : Math.min(n, NOW[k][file] ?? 0);
      if (v > 0) next[k][file] = v;
    }
  }
  writeShards(next);
}

const BASELINE = loadBaseline();
const total = (c: Counts) => Object.values(c).reduce((a, b) => a + b, 0);

const POINTER: Record<(typeof KINDS)[number], string> = {
  surfaces:
    'A hand-rolled surface (surface bg + border + rounded, no role) gets no jelly at all — no haze, rim, squash or ' +
    'arcs. Use the role: `glass-fill` for repeated content, `glass-pane` for a singular panel, `glass-overlay` for ' +
    'floating UI, `glass-inset` for fields (or the components/ui primitive). `node scripts/codemods/jelly-roles.mjs` ' +
    'rewrites the unambiguous cases.',
  dialogs:
    'A raw role="dialog" outside components/ui bypasses <Dialog>/<Sheet>/<OverlayPanel>, which carry the jelly ' +
    'overlay material, the focus trap and the portal (stacking-consistency R3).',
  switches:
    'A raw role="switch" outside components/ui bypasses <Switch> (jelly control + keyboard contract).',
};

describe('jelly coverage — the hand-rolled debt only goes down (04 §2.5, N5)', () => {
  it('scans the whole UI tree, not a broken subset', () => {
    expect(FILES.length).toBeGreaterThan(1500);
    expect(FILES).toContain('components/feed/PageLayout.tsx');
    expect(FULLSCREEN_TIER_DIRS.has('rmhbox')).toBe(true);
    expect(existsSync(SHARD_DIR), 'the frozen baseline shards must exist').toBe(true);
    expect(
      total(BASELINE.surfaces),
      'a baseline with no surfaces means the walker broke',
    ).toBeGreaterThan(0);
  });

  it.each(KINDS)('no file gains a %s debt', (kind) => {
    const worse = Object.entries(NOW[kind])
      .filter(([file, n]) => n > (BASELINE[kind][file] ?? 0))
      .map(([file, n]) => `${file} — ${n} (frozen: ${BASELINE[kind][file] ?? 0})`);
    expect(worse, POINTER[kind]).toEqual([]);
  });

  it.each(KINDS)('the %s baseline is lowered as files are cleaned', (kind) => {
    const stale = Object.entries(BASELINE[kind])
      .filter(([file, n]) => (NOW[kind][file] ?? 0) < n)
      .map(([file, n]) => `${file} — now ${NOW[kind][file] ?? 0}, frozen ${n}`);
    expect(
      stale,
      'Good — these got better. Lock it in: JELLY_COVERAGE_BASELINE=lower pnpm exec vitest run ' +
        'lib/__tests__/jelly-coverage.test.ts (it can only lower numbers), and commit the JSON.',
    ).toEqual([]);
  });

  it('no site-tier surface opts out of the material with data-jelly="off"', () => {
    expect(
      JELLY_OFF,
      'Opting a site surface out of jelly makes it the one surface that looks like a different product. Games ' +
        'mark play-fields `data-jelly-zone="playfield"` (R16); a gesture control uses `data-jelly-scope="off"` on ' +
        'its subtree in a game/app tier. If a site surface truly cannot be jelly, add a reviewed JELLY_OFF_ALLOW ' +
        'entry saying why.',
    ).toEqual([]);
    for (const [file, why] of JELLY_OFF_ALLOW) {
      expect(why.length, file).toBeGreaterThan(40);
      expect(readFileSync(join(ROOT, file), 'utf8'), `${file} no longer opts out`).toMatch(
        /data-jelly=/,
      );
    }
  });
});

/**
 * The primitives lane's contract (04 §1, W3-B): the surfaces no role class reaches — sonner toasts, Radix switch and
 * slider, tab thumbs, badges, avatars, skeletons, game play-fields — come onto the material through ONE stylesheet,
 * `app/jelly-coverage.css`, keyed on `data-slot` / library attributes. These assertions are what keep that adapter
 * and the primitives it keys on from drifting apart: a renamed `data-slot` silently drops a surface off the material,
 * and an inline `background` on the toaster erases the haze floor without any error.
 */
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const stripCssComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const normSel = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
/** Innermost `selector { body }` rules — enough for flat, @layer- or @media-nested sheets. */
const cssRules = (css: string) =>
  [...stripCssComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sel: normSel(m[1]),
    body: m[2],
  }));
/** Split a selector list on top-level commas (`:is(a, b)` / `:not(\n x\n)` stay whole). */
function splitSelectors(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** The opening JSX tag around the first `needle` in `src` (from its `<` to the next `>` that closes it). */
function tagAround(src: string, needle: string): string {
  const i = src.indexOf(needle);
  if (i < 0) return '';
  const start = src.lastIndexOf('<', i);
  const end = src.indexOf('>', i);
  return src.slice(start, end < 0 ? undefined : end + 1);
}

const COVERAGE_CSS = 'app/jelly-coverage.css';

describe('jelly coverage — the primitives adapter (app/jelly-coverage.css) and the primitives it keys on', () => {
  const rules = cssRules(read(COVERAGE_CSS));
  const declared = (s: string) =>
    rules.some((r) => r.sel.includes(normSel(s)) && /:\s*[^;]+/.test(r.body));

  it('parses the adapter sheet at all', () => {
    expect(
      rules.length,
      `${COVERAGE_CSS} parsed to no rules — the parser or the file broke`,
    ).toBeGreaterThan(20);
  });

  it.each([
    '[data-sonner-toaster] [data-sonner-toast]',
    "[data-slot='switch']",
    '[data-switch-knob]',
    "[data-slot='slider-thumb']",
    '[data-tab-thumb]',
    "[data-slot='badge']",
    "[data-slot='notification-badge']",
    "[data-slot='avatar']",
    "[data-slot='skeleton']",
    "[data-jelly-zone='playfield']",
  ])('has a rule for %s', (sel) => {
    expect(
      declared(sel),
      `${COVERAGE_CSS} lost its rule for ${sel}: that surface silently fell off the material. The adapter is ` +
        'the only place it is brought on (docs/plasmatic-jelly-system.md).',
    ).toBe(true);
  });

  it('runs no animation, transition or backdrop-filter, and never forces box-shadow with !important', () => {
    const offenders: string[] = [];
    for (const r of rules) {
      for (const m of r.body.matchAll(
        /(?:^|[;\s])((?:-webkit-)?(?:animation|transition|backdrop-filter)[\w-]*)\s*:/g,
      ))
        offenders.push(`${r.sel} { ${m[1]} }`);
      if (/(?:^|[;\s])box-shadow\s*:[^;]*!important/.test(r.body))
        offenders.push(`${r.sel} { box-shadow … !important }`);
    }
    expect(
      offenders,
      'The coverage adapter is static: motion comes from the jelly services and .jelly-flow carriers ' +
        '(site-infinite-animation.test.ts), blur never returns (N6), and an !important box-shadow would also eat ' +
        'every ring-* focus ring and the high-contrast outline.',
    ).toEqual([]);
  });

  it('the switch is a jelly control, the slider thumb a drag host, the skeleton lite with no carrier', () => {
    expect(tagAround(read('components/ui/switch.tsx'), 'data-slot="switch"')).toMatch(
      /data-jelly="control"/,
    );
    expect(tagAround(read('components/ui/slider.tsx'), 'data-slot="slider-thumb"')).toMatch(
      /data-jelly="drag"/,
    );
    const skeleton = tagAround(read('components/ui/skeleton.tsx'), 'data-slot="skeleton"');
    expect(skeleton).toMatch(/data-jelly="lite"/);
    expect(skeleton).toMatch(/data-jelly-flow="off"/);
  });

  it.each([
    ['components/ui/notification-badge.tsx', 'notification-badge'],
    ['components/ui/UserAvatar.tsx', 'avatar'],
  ])(
    '%s carries data-slot="%s" but is NOT a data-jelly host (it sits inside controls; it would swallow their press)',
    (file, slot) => {
      const src = read(file);
      expect(src).toContain(`data-slot="${slot}"`);
      expect(
        src.match(/\bdata-jelly(?:-[\w-]+)?\s*=/g) ?? [],
        `${file} became a jelly host`,
      ).toEqual([]);
    },
  );

  it('the toaster style leaves background, backdrop-filter and box-shadow to the adapter', () => {
    const src = read('components/Providers.tsx');
    const at = src.indexOf('toastOptions');
    expect(at, 'Providers.tsx no longer passes toastOptions to <Toaster>').toBeGreaterThan(0);
    const styleAt = src.indexOf('style:', at);
    const body = src
      .slice(styleAt, src.indexOf('}', styleAt))
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).toMatch(/backgroundColor/);
    expect(
      body.match(/\b(?:background|backdropFilter|WebkitBackdropFilter|boxShadow)\s*:/g) ?? [],
      'An inline `background` / `boxShadow` on the toast erases the haze floor and rim from ' +
        `${COVERAGE_CSS}; a backdropFilter is the blur no role may carry. Set longhands (backgroundColor) only.`,
    ).toEqual([]);
  });

  it("globals.css's legacy :active opacity cue stands down while the soft body holds a press", () => {
    const cue = cssRules(read('app/globals.css')).filter(
      (r) => r.sel.includes(':active') && /(?:^|[;\s])opacity\s*:\s*0?\.\d/.test(r.body),
    );
    expect(
      cue.length,
      'the legacy press cue rule was not found — update this probe',
    ).toBeGreaterThan(0);
    const missing = cue.flatMap((r) =>
      splitSelectors(r.sel).filter(
        (s) => s.includes(':active') && !s.includes(':not([data-jelly-active])'),
      ),
    );
    expect(
      missing,
      'An opacity flicker on a press that lib/jelly/physics.ts is squashing is two press cues fighting; every ' +
        'selector of the cue must carry :not([data-jelly-active]).',
    ).toEqual([]);
  });
});
