import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARGE, DENT, JELLY_LAYOUT, PLASMA } from '@/lib/jelly/tiers';

/**
 * #989 token parity (docs/plasmatic-jelly-system.md §1.1; CLAUDE.md "Design system: Plasmatic Jelly").
 *
 * `lib/jelly/tiers.ts` is the source of truth for every physics, plasma, charge and layout number; `app/globals.css`
 * mirrors the ones CSS needs as tokens. A mirror that drifts is a second, silent definition, so this gate parses
 * `:root` and asserts each mirror equals its constant exactly (with its unit). It also holds the gel colour contract:
 * every theme block restates the gel colours (a theme never inherits a material), high contrast turns them opaque
 * or off, and the app tier mirrors them as `--app-gel-*` with `.app-high-contrast` zeroing them.
 *
 * Retune a constant in tiers.ts and update its mirror here in the same change; never loosen this test.
 */

const ROOT = process.cwd();
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const GLOBALS = strip(readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8'));
const MATERIAL = strip(readFileSync(join(ROOT, 'app', 'jelly-material.css'), 'utf8'));
const LIQUID = strip(readFileSync(join(ROOT, 'app', 'liquid-glass.css'), 'utf8'));
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

const ROOT_TOKENS: Tokens = Object.assign({}, ...blocks(GLOBALS, ':root').map(decls));

/** CSS token → the exact value its TS constant demands. */
const MIRRORS: Record<string, string> = {
  '--plasma-wake': `${PLASMA.wake}`,
  '--jelly-dent-depth': `${DENT.depthPx}px`,
  '--jelly-dent-damping': `${DENT.damping}`,
  '--jelly-lens-strength': `${DENT.lensStrength}`,
  '--jelly-lens-dispersion': `${DENT.lensDispersionPx}px`,
  '--jelly-content-strain': `${DENT.contentStrain}`,
  '--jelly-margin': `${JELLY_LAYOUT.marginPx}px`,
  '--jelly-body-budget': `${JELLY_LAYOUT.bodyBudget}`,
  '--sim-hz': `${JELLY_LAYOUT.simHz}`,
  '--space-4': `${JELLY_LAYOUT.minGapPx}px`,
  '--arc-breakdown-gap': `${CHARGE.breakdownGapPx}px`,
  '--arc-formative-lag': `${CHARGE.formativeLagMs}ms`,
  // px/s has no CSS unit: the mirror is the bare number.
  '--pulse-speed': `${CHARGE.pulseSpeedPxS}`,
  '--pulse-tau': `${CHARGE.pulseTauMs}ms`,
};

/** The gel colours every theme block restates. */
const GEL_COLOURS = [
  '--gel-body',
  '--gel-depth',
  '--gel-ink',
  '--on-ink',
  '--gel-fresnel',
  '--gel-specular',
  '--gel-edge-r',
  '--gel-edge-g',
  '--gel-edge-b',
  '--focus-ring',
];
/** Declared once on :root (theme-independent geometry), switched off by high contrast. */
const GEL_GEOMETRY = [
  '--gel-bevel',
  '--gel-disperse-r',
  '--gel-disperse-g',
  '--gel-disperse-b',
  // The molded rim (2026-10-25): shoulder depth, edge feather, bevel widening.
  '--gel-mold',
  '--gel-feather',
  '--gel-shoulder',
  '--gel-field-line',
  '--gel-well-shade',
  // The lens (2026-10-26): wavelength spread, slab thickness and environment reflection.
  '--gel-dispersion',
  '--gel-lens',
  '--gel-reflect',
];

const THEMES = ['default', 'light', 'graphite', 'sepia', 'nocturne', 'ultra', 'high-contrast'];

/** Whitespace-insensitive view of a stylesheet: runs collapsed, none just inside parentheses (prettier wraps them). */
const flatten = (css: string) =>
  css.replace(/\s+/g, ' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')');

const px = (v: string | undefined) => (v === undefined ? NaN : parseFloat(v));

describe('#989 physics mirrors equal lib/jelly/tiers.ts', () => {
  it.each(Object.entries(MIRRORS))('%s', (token, expected) => {
    expect(ROOT_TOKENS[token], `${token} in :root (mirror of the TS constant)`).toBe(expected);
  });

  it('no theme block re-declares a physics mirror (one value, everywhere)', () => {
    for (const theme of THEMES.filter((t) => t !== 'high-contrast')) {
      const own = decls(blocks(GLOBALS, `.style-${theme}`)[0] ?? '');
      for (const token of Object.keys(MIRRORS)) {
        expect(own[token], `.style-${theme} must not restate ${token}`).toBeUndefined();
      }
    }
  });
});

describe('#989 gel tokens', () => {
  it(':root declares every gel colour and the edge geometry', () => {
    for (const token of [...GEL_COLOURS, ...GEL_GEOMETRY]) {
      expect(ROOT_TOKENS[token], `${token} in :root`).toBeTruthy();
    }
  });

  it('the dispersion leads red toward the top-left light and blue away', () => {
    expect(px(ROOT_TOKENS['--gel-disperse-r'])).toBeLessThan(0);
    expect(px(ROOT_TOKENS['--gel-disperse-g'])).toBe(0);
    expect(px(ROOT_TOKENS['--gel-disperse-b'])).toBeGreaterThan(0);
    expect(px(ROOT_TOKENS['--gel-bevel'])).toBeGreaterThan(0);
  });

  it.each(THEMES)('.style-%s restates every gel colour', (theme) => {
    const own = decls(blocks(GLOBALS, `.style-${theme}`)[0] ?? '');
    const missing = GEL_COLOURS.filter((t) => !(t in own));
    expect(missing, `.style-${theme} must restate the gel colours`).toEqual([]);
  });

  it(':root and .style-default agree', () => {
    const def = decls(blocks(GLOBALS, '.style-default')[0] ?? '');
    for (const token of GEL_COLOURS) expect(def[token], token).toBe(ROOT_TOKENS[token]);
  });

  it('high contrast: opaque gel, no dispersion, Fresnel, specular or plasma', () => {
    const hc = decls(blocks(GLOBALS, '.style-high-contrast')[0] ?? '');
    expect(hc['--gel-body']).toBe('var(--site-surface-opaque)');
    expect(hc['--gel-depth']).toBe('var(--site-surface-opaque)');
    for (const token of [
      '--gel-fresnel',
      '--gel-specular',
      '--gel-edge-r',
      '--gel-edge-g',
      '--gel-edge-b',
    ]) {
      expect(hc[token], token).toBe('transparent');
    }
    for (const token of ['--gel-disperse-r', '--gel-disperse-g', '--gel-disperse-b']) {
      expect(px(hc[token]), token).toBe(0);
    }
    expect(hc['--plasma-wake']).toBe('0');
    // High contrast keeps a plain, outlined edge: no molded shoulder.
    expect(hc['--gel-mold']).toBe('0');
    expect(hc['--gel-field-line']).toBe('100%');
    // ...and no lens: nothing is refracted or reflected where the rim is not drawn.
    expect(hc['--gel-reflect']).toBe('0');
  });

  it('the global focus ring is the solid --focus-ring, never a glow', () => {
    const flat = flatten(GLOBALS);
    expect(flat).toContain(
      "[tabindex]:not([tabindex='-1']):focus-visible { outline: 2px solid var(--focus-ring, var(--site-accent));",
    );
    for (const theme of THEMES) {
      const own = decls(blocks(GLOBALS, `.style-${theme}`)[0] ?? '');
      expect(own['--focus-ring'], `.style-${theme} --focus-ring`).not.toMatch(
        /plasma|glow|gradient/,
      );
    }
  });

  it('Tailwind exposes the ink-gel pair and the ring colour', () => {
    const flat = flatten(GLOBALS);
    expect(flat).toContain('--color-gel-ink: var(--gel-ink);');
    expect(flat).toContain('--color-on-ink: var(--on-ink);');
    expect(flat).toContain('--color-focus-ring: var(--focus-ring);');
  });
});

describe('#989 CSS gel layers (the non-shader tier)', () => {
  it('the coat is the vertical gel body → depth gradient', () => {
    const want =
      'linear-gradient(180deg, var(--gel-body, transparent), var(--gel-depth, transparent))';
    expect(flatten(LIQUID)).toContain(`--liquid-coat: ${want};`);
    expect(flatten(MATERIAL)).toContain(`--liquid-coat: ${want};`);
  });

  it('no diagonal gloss band crosses a face', () => {
    for (const [name, css] of [
      ['liquid-glass.css', LIQUID],
      ['jelly-material.css', MATERIAL],
      ['app-theme.css', APP],
    ] as const) {
      expect(css, `${name}: a 1xx° highlight gradient is a gloss band across the face`).not.toMatch(
        /linear-gradient\(\s*1[2-6]\ddeg/,
      );
    }
  });

  it('the RGB-led edge and the Fresnel line are built from the tokens', () => {
    const flat = flatten(MATERIAL);
    for (const ch of ['r', 'g', 'b']) {
      expect(flat).toContain(
        `inset calc(-1 * var(--gel-disperse-${ch}, 0px)) calc(-1 * var(--gel-disperse-${ch}, 0px)) var(--jelly-edge-blur) 0 var(--gel-edge-${ch}, transparent)`,
      );
    }
    expect(flat).toContain(
      '--jelly-edge-blur: calc(var(--gel-bevel, 6px) * var(--gel-shoulder, 1) + var(--gel-feather, 0px))',
    );
    // The Fresnel line: 1px hard where --gel-feather is 0 (high contrast), a soft glow that far in under the mold.
    expect(flat).toContain(
      'inset 0 0 var(--gel-feather, 0px) calc(1px - min(var(--gel-feather, 0px), 1px)) var(--gel-fresnel, transparent)',
    );
    expect(flat).toContain('var(--gel-edge, 0 0 0 0 transparent)');
  });
});

describe('#989 app-tier mirrors', () => {
  const APP_GEL = GEL_COLOURS.map((t) =>
    t === '--on-ink'
      ? '--app-on-ink'
      : t === '--focus-ring'
        ? '--app-focus-ring'
        : `--app-${t.slice(2)}`,
  );
  const dark: Tokens = Object.assign({}, ...blocks(APP, '.app-theme').map(decls));
  const light: Tokens = Object.assign({}, ...blocks(APP, '.app-theme.app-light').map(decls));
  const hc: Tokens = Object.assign({}, ...blocks(APP, '.app-theme.app-high-contrast').map(decls));

  it('.app-theme declares every --app-gel-* colour', () => {
    expect(APP_GEL.filter((t) => !(t in dark))).toEqual([]);
  });

  it('.app-theme points the site gel contract at the app palette', () => {
    GEL_COLOURS.forEach((t, i) => expect(dark[t], t).toBe(`var(${APP_GEL[i]})`));
  });

  it('.app-light restates the ground-dependent gel colours', () => {
    for (const t of ['--app-gel-body', '--app-gel-depth', '--app-gel-fresnel']) {
      expect(light[t], t).toBeTruthy();
    }
  });

  it('.app-high-contrast: opaque gel, edge/Fresnel/specular off', () => {
    expect(hc['--app-gel-body']).toBe('var(--app-surface)');
    expect(hc['--app-gel-depth']).toBe('var(--app-surface)');
    for (const t of [
      '--app-gel-fresnel',
      '--app-gel-specular',
      '--app-gel-edge-r',
      '--app-gel-edge-g',
      '--app-gel-edge-b',
    ]) {
      expect(hc[t], t).toBe('transparent');
    }
    expect(hc['--plasma-wake']).toBe('0');
  });
});
