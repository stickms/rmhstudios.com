import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, relativeLuminance, toHex } from '@/lib/appearance/contrast';

/**
 * Plasmatic Jelly legibility, as an executable bound
 * (docs/plans/plasmatic-jelly/01-material.md §5.2, 04-coverage-a11y-perf.md §4.6).
 *
 * Jelly is hazy on purpose: every role carries a milky veil (`--site-jelly-haze`
 * at the role's alpha) and faint plasma light at the current crests. Haze sits
 * UNDER the text, so it can only hurt legibility through the ground — and this
 * test bounds exactly that. For every theme block in `app/globals.css` (and the
 * app tier's dark and light ramps in `components/shared/app-theme.css`) and every
 * jelly role it composites the worst cases:
 *
 *   ground (`--site-bg`) → role tint (the liquid-glass.css mixes) → the gel coat at either end of its
 *   vertical gradient (`--gel-body` at the top, `--gel-depth` at the base, #989) → haze at min
 *   (α × 0.5) and max (α × 1.0) density → the grain tile (0 or its 0.06 cap) →
 *   plasma at the role's peak (`k × gain`, colour A or B, or none)
 *
 * and asserts, against every composite:
 *   - `--site-text` ≥ 4.5:1 and `--site-text-muted` ≥ 3:1;
 *   - the composite's relative-luminance spread across the flow is ≤ 0.04
 *     (≤ 0.05 for chrome) — the bound on visible flicker behind glyphs. The spread is
 *     measured per gel end: the body → depth gradient is static, not flicker.
 * and that `--on-ink` holds 4.5:1 on the ink-gel primary action (`--gel-ink`) at both ends of its coat.
 *
 * High contrast must zero the material outright. Retune a token in globals.css
 * and this test tells you whether the new value still reads; do not loosen the
 * bounds here to make a value fit.
 */

const ROOT = process.cwd();
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const GLOBALS = strip(readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8'));
const LIQUID = strip(readFileSync(join(ROOT, 'app', 'liquid-glass.css'), 'utf8'));
const MATERIAL = strip(readFileSync(join(ROOT, 'app', 'jelly-material.css'), 'utf8'));
const APP = strip(readFileSync(join(ROOT, 'components', 'shared', 'app-theme.css'), 'utf8'));

type Tokens = Record<string, string>;

/** Every `<selector> { … }` block whose selector line is exactly `selector`, in source order. */
function blocks(css: string, selector: string): string[] {
  const out: string[] = [];
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{`, 'g');
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.push(css.slice(start, i - 1));
  }
  return out;
}

function decls(body: string): Tokens {
  const t: Tokens = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g))
    t[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  return t;
}

// ── a small CSS colour resolver: hex, rgb()/rgba(), named, var(), color-mix() ──────────────────────────
interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}
const NAMED: Record<string, RGBA> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
};

/** Split on top-level commas. */
function args(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
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

function inner(v: string, fn: string): string | null {
  if (!v.startsWith(`${fn}(`) || !v.endsWith(')')) return null;
  return v.slice(fn.length + 1, -1);
}

function resolve(value: string, t: Tokens, depth = 0): RGBA {
  if (depth > 20) throw new Error(`var() cycle at ${value}`);
  const v = value.trim();
  if (v in NAMED) return NAMED[v];
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const varBody = inner(v, 'var');
  if (varBody !== null) {
    const [name, ...fallback] = args(varBody);
    if (name in t) return resolve(t[name], t, depth + 1);
    if (fallback.length) return resolve(fallback.join(','), t, depth + 1);
    throw new Error(`unresolved ${name}`);
  }
  const rgb = inner(v, 'rgba') ?? inner(v, 'rgb');
  if (rgb !== null) {
    const parts = rgb.includes(',')
      ? args(rgb)
      : rgb.replace('/', ' ').split(/\s+/).filter(Boolean);
    const [r, g, b] = parts.slice(0, 3).map(Number);
    const a =
      parts[3] === undefined
        ? 1
        : parts[3].endsWith('%')
          ? parseFloat(parts[3]) / 100
          : Number(parts[3]);
    return { r, g, b, a };
  }
  const mix = inner(v, 'color-mix');
  if (mix !== null) {
    // `in srgb` exactly; `in oklch` is approximated in sRGB (only arc tokens use it, and they are not composited here).
    const [, a, b] = args(mix);
    const split = (s: string): [string, number | null] => {
      const m = /^(.*?)\s+([\d.]+)%$/.exec(s);
      return m ? [m[1], Number(m[2])] : [s, null];
    };
    const [ca, pa0] = split(a);
    const [cb, pb0] = split(b);
    let pa = pa0 ?? (pb0 === null ? 50 : 100 - pb0);
    let pb = pb0 ?? 100 - pa;
    const sum = pa + pb;
    const alphaMul = sum < 100 ? sum / 100 : 1;
    pa /= sum;
    pb /= sum;
    const A = resolve(ca, t, depth + 1);
    const B = resolve(cb, t, depth + 1);
    const alpha = A.a * pa + B.a * pb;
    if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const ch = (x: number, y: number) => (x * A.a * pa + y * B.a * pb) / alpha;
    return { r: ch(A.r, B.r), g: ch(A.g, B.g), b: ch(A.b, B.b), a: alpha * alphaMul };
  }
  throw new Error(`cannot resolve colour: ${v}`);
}

function num(value: string, t: Tokens): number {
  const v = value.trim();
  const varBody = inner(v, 'var');
  if (varBody !== null) {
    const [name, ...fallback] = args(varBody);
    if (name in t) return num(t[name], t);
    return num(fallback.join(','), t);
  }
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`not a number: ${v}`);
  return n;
}

/** Source-over in sRGB (what browsers do for these layers). Base must be opaque. */
function over(base: RGBA, layer: RGBA, alpha = layer.a): RGBA {
  return {
    r: base.r * (1 - alpha) + layer.r * alpha,
    g: base.g * (1 - alpha) + layer.g * alpha,
    b: base.b * (1 - alpha) + layer.b * alpha,
    a: 1,
  };
}
const hexOf = (c: RGBA) => toHex(c);

// ── the themes ──────────────────────────────────────────────────────────────────────────────────────────
const rootBlock = blocks(GLOBALS, ':root').find((b) => b.includes('--site-jelly-haze:'));
const ROOT_TOKENS: Tokens = decls(rootBlock ?? '');
const THEMES = ['default', 'light', 'graphite', 'sepia', 'nocturne', 'ultra'] as const;
function siteTheme(name: string): Tokens {
  const own: Tokens = Object.assign({}, ...blocks(GLOBALS, `.style-${name}`).map(decls));
  return { ...ROOT_TOKENS, ...own };
}

/** Role → its tint over the ground, exactly as liquid-glass.css writes it (asserted to still be there below). */
const ROLE_TINT: Record<string, string> = {
  fill: 'var(--site-glass-tint)',
  pane: 'var(--site-glass-pane-tint)',
  chrome: 'var(--site-glass-chrome-tint)',
  overlay: 'var(--site-glass-overlay-tint)',
  inset: 'color-mix(in srgb, var(--site-text) 3%, transparent)',
};
/** Role → peak plasma strength (jelly-material.css §1); inset at its focused value, the worst case. */
const ROLE_PLASMA: Record<string, number> = {
  fill: 0.05,
  pane: 0.06,
  chrome: 0.05,
  overlay: 0.07,
  inset: 0.08,
};
const ROLES = Object.keys(ROLE_TINT);
const TILE_MAX = 0.06; // scripts/generate-jelly-haze-tile.mjs MAX_ALPHA

const TOKENS = [
  '--site-jelly-haze',
  '--site-jelly-haze-strong',
  '--site-jelly-haze-fill',
  '--site-jelly-haze-inset',
  '--site-jelly-haze-pane',
  '--site-jelly-haze-chrome',
  '--site-jelly-haze-overlay',
  '--site-jelly-plasma-a',
  '--site-jelly-plasma-b',
  '--site-jelly-plasma',
  '--site-jelly-flow-speed',
  '--site-jelly-quiet',
  '--site-jelly-haze-edge',
  '--site-jelly-on',
  '--site-arc-core',
  '--site-arc-glow',
];

interface Case {
  ground: RGBA;
  tint: RGBA;
  /** The gel coat's two ends (`--gel-body`, `--gel-depth`), each composited over the tint. */
  gel: RGBA[];
  haze: RGBA;
  hazeA: number;
  plasma: RGBA[];
  plasmaA: number;
  text: RGBA;
  muted: RGBA;
}

function composites(c: Case, gelEnd: RGBA): RGBA[] {
  const base = over(over(c.ground, c.tint), gelEnd);
  const out: RGBA[] = [];
  for (const density of [0.5, 1]) {
    for (const tile of [0, TILE_MAX]) {
      for (const p of [null, ...c.plasma]) {
        let x = over(base, c.haze, c.hazeA * c.haze.a * density);
        x = over(x, NAMED.white, tile);
        if (p) x = over(x, p, c.plasmaA * p.a);
        out.push(x);
      }
    }
  }
  return out;
}

function check(label: string, c: Case, spreadMax: number) {
  for (const [i, end] of c.gel.entries())
    checkEnd(`${label} (gel ${i ? 'depth' : 'body'})`, c, end, spreadMax);
}

function checkEnd(label: string, c: Case, gelEnd: RGBA, spreadMax: number) {
  const comps = composites(c, gelEnd);
  const lums = comps.map((x) => relativeLuminance(hexOf(x)));
  const spread = Math.max(...lums) - Math.min(...lums);
  const worstText = Math.min(...comps.map((g) => contrastRatio(hexOf(over(g, c.text)), hexOf(g))));
  const worstMuted = Math.min(
    ...comps.map((g) => contrastRatio(hexOf(over(g, c.muted)), hexOf(g))),
  );
  expect(worstText, `${label}: body text over the worst jelly composite`).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(worstMuted, `${label}: muted text over the worst jelly composite`).toBeGreaterThanOrEqual(
    3,
  );
  expect(
    spread,
    `${label}: luminance spread across the flow (flicker behind glyphs)`,
  ).toBeLessThanOrEqual(spreadMax);
}

describe('Plasmatic Jelly tokens exist in every theme', () => {
  it('finds the :root jelly block', () => {
    expect(rootBlock, ':root must declare --site-jelly-haze').toBeTruthy();
  });

  it.each(THEMES)('.style-%s declares the whole jelly + arc token set', (name) => {
    const own = Object.assign({}, ...blocks(GLOBALS, `.style-${name}`).map(decls));
    const missing = TOKENS.filter((tok) => !(tok in own));
    expect(
      missing,
      `.style-${name} must restate every jelly token (a theme block never inherits a material)`,
    ).toEqual([]);
  });

  it(':root and .style-default agree (the default is restated as a class for scoped previews)', () => {
    const def = decls(blocks(GLOBALS, '.style-default')[0] ?? '');
    for (const tok of TOKENS) expect(def[tok], tok).toBe(ROOT_TOKENS[tok]);
  });

  it('the arc layer has its z tier: menu < arcs < 50 (dialogs) < arcs-modal < tooltip', () => {
    const z = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+);`).exec(GLOBALS)?.[1]);
    expect(z('--z-menu')).toBeLessThan(z('--z-arcs'));
    expect(z('--z-arcs')).toBeLessThan(50);
    expect(z('--z-arcs-modal')).toBeGreaterThan(50);
    expect(z('--z-arcs-modal')).toBeLessThan(z('--z-tooltip'));
  });
});

describe('Plasmatic Jelly legibility — site themes (01 §5.2)', () => {
  it('the role tints this test composites are still the ones liquid-glass.css paints', () => {
    for (const [role, tint] of Object.entries(ROLE_TINT)) {
      expect(LIQUID.replace(/\s+/g, ' '), `${role} tint`).toContain(tint);
    }
  });

  it('the plasma strengths this test composites are still the role knobs', () => {
    const flat = MATERIAL.replace(/\s+/g, ' ');
    for (const [role, k] of Object.entries(ROLE_PLASMA)) {
      expect(flat, `${role} --jelly-plasma-k`).toContain(`--jelly-plasma-k: ${k};`);
    }
  });

  for (const theme of THEMES) {
    for (const role of ROLES) {
      it(`${theme} · ${role}`, () => {
        const t = siteTheme(theme);
        const ground = resolve(t['--site-bg'], t);
        check(
          `.style-${theme} .glass-${role}`,
          {
            ground,
            tint: resolve(ROLE_TINT[role], t),
            gel: [resolve('var(--gel-body)', t), resolve('var(--gel-depth)', t)],
            haze: resolve('var(--site-jelly-haze)', t),
            hazeA: num(`var(--site-jelly-haze-${role})`, t),
            plasma: [
              resolve('var(--site-jelly-plasma-a)', t),
              resolve('var(--site-jelly-plasma-b)', t),
            ],
            plasmaA: ROLE_PLASMA[role] * num('var(--site-jelly-plasma)', t),
            text: resolve(t['--site-text'], t),
            muted: resolve(t['--site-text-muted'], t),
          },
          role === 'chrome' ? 0.05 : 0.04,
        );
      });
    }
  }
});

describe('Ink gel — the signal action holds 4.5:1 at both ends of its coat (#989)', () => {
  it.each(THEMES)('.style-%s', (theme) => {
    const t = siteTheme(theme);
    const ink = over(resolve(t['--site-bg'], t), resolve('var(--gel-ink)', t));
    const onInk = resolve('var(--on-ink)', t);
    const ends = ['var(--gel-body)', 'var(--gel-depth)'];
    for (const end of ends) {
      const g = over(ink, resolve(end, t));
      expect(
        contrastRatio(hexOf(over(g, onInk)), hexOf(g)),
        `.style-${theme}: --on-ink over --gel-ink + ${end}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Plasmatic Jelly legibility — app tier (01 §4.3)', () => {
  // Later blocks win, as in the cascade (the @supports re-derivations come after the static fallbacks).
  const dark: Tokens = Object.assign({}, ...blocks(APP, '.app-theme').map(decls));
  const light: Tokens = {
    ...dark,
    ...Object.assign({}, ...blocks(APP, '.app-theme.app-light').map(decls)),
  };

  it.each([
    ['dark', dark],
    ['light', light],
  ] as const)('.app-glass in the %s ramp', (_label, t) => {
    expect(t['--app-jelly-haze'], 'app tier declares --app-jelly-haze').toBeTruthy();
    check(
      `.app-theme (${_label}) .app-glass`,
      {
        ground: resolve(t['--app-bg'], t),
        tint: resolve(t['--app-glass-bg'], t),
        gel: [resolve('var(--app-gel-body)', t), resolve('var(--app-gel-depth)', t)],
        haze: resolve('var(--app-jelly-haze)', t),
        hazeA: num('var(--app-jelly-haze-pane)', t),
        plasma: [resolve('var(--app-jelly-plasma-a)', t), resolve('var(--app-jelly-plasma-b)', t)],
        plasmaA: 0.06 * num('var(--app-jelly-plasma)', t),
        text: resolve(t['--app-text'], t),
        muted: resolve(t['--app-text-muted'], t),
      },
      0.04,
    );
  });

  it('.app-high-contrast zeroes the app material', () => {
    const hc = Object.assign(
      {},
      ...blocks(APP, '.app-theme.app-high-contrast').map(decls),
    ) as Tokens;
    for (const tok of [
      '--app-jelly-haze',
      '--app-jelly-haze-pane',
      '--app-jelly-plasma-a',
      '--app-jelly-plasma-b',
      '--app-jelly-plasma',
      '--app-jelly-on',
    ]) {
      expect(['0', 'transparent'], tok).toContain(hc[tok]);
    }
  });
});
