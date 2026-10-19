import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COVER_CLASS, HOLD_FADE_MS, HUB_FADE_MS, SETTLE_ATTRIBUTE } from '../constants';

/**
 * T19 — the stylesheet half of the effect hangs on three names and one number
 * that live in `constants.ts` (the CSS cannot import them). A rename or a retune
 * on one side only would leave the controller toggling a class nothing styles,
 * which is invisible until the cover fails to hide the shell. This pins them.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const eversion = read('components/radial/eversion/eversion.css');
const globals = read('app/globals.css');
const radial = read('components/radial/radial.css');

describe('eversion.css', () => {
  it('styles the cover class and the settle attribute the controller toggles', () => {
    expect(eversion).toContain(`html.${COVER_CLASS} .radial-frame`);
    expect(eversion).toContain(`html.${COVER_CLASS} .radial-backdrop`);
    expect(eversion).toContain(`html[${SETTLE_ATTRIBUTE}] *`);
  });

  it('the AFTER capture un-hides exactly the shell parts the cover hides (or the picture loses one)', () => {
    // The cover rule's selectors, `html.eversion-cover .x`, in order of appearance.
    const covered = [
      ...eversion.matchAll(
        /html\.eversion-cover (\.radial-[\w-]+)[,\s]*(?=[^{]*\{\s*opacity: 0;)/g,
      ),
    ].map((m) => m[1]);
    const capture = read('lib/eversion/capture.ts');
    const restored =
      /const COVER_HIDDEN_SELECTOR = '([^']+)'/.exec(capture)?.[1].split(/,\s*/) ?? [];
    expect(covered.length).toBeGreaterThanOrEqual(3);
    expect([...restored].sort()).toEqual([...covered].sort());
  });

  it('is reached through radial.css, which SiteShell imports', () => {
    expect(radial).toMatch(/^@import '\.\/eversion\/eversion\.css';$/m);
  });

  it('never uses transition-all or a backdrop-filter', () => {
    expect(eversion).not.toMatch(/transition:\s*all|transition-property:\s*all/);
    expect(eversion).not.toMatch(/(?:^|[^-])backdrop-filter\s*:/m);
  });
});

describe('handing the live page back (the final dissolve is a crossfade onto the real page)', () => {
  const layers = ['radial-frame', 'radial-backdrop', 'radial-topbar'];
  const live = (sel: string) =>
    eversion.match(new RegExp(`html\\.eversion-live[^{]*${sel}[^{]*\\{[^}]*\\}`))?.[0] ?? '';

  it('the hub still blurs the shell for as long as it is `everting` - which is why the live page needs its own rule', () => {
    expect(radial).toMatch(
      /\.radial-shell:has\(\.radial-hub:is\(\[data-phase='open'\], \[data-phase='everting'\]\)\) \.radial-frame \{[^}]*filter: blur\(/,
    );
  });

  it('drops that blur on every shell layer while the run owns the page, and pins no transition on them', () => {
    for (const layer of layers) {
      const rule = live(`\\.${layer}`);
      expect(rule, layer).toContain(`.radial-hub[data-phase='everting']`);
      expect(rule, layer).toMatch(/filter: none;/);
      expect(rule, layer).toMatch(/transition: none;/);
    }
  });

  it('outranks the blur rule (specificity), so it wins without !important', () => {
    expect(eversion).not.toMatch(/eversion-live[^{]*\{[^}]*!important/);
    // html + .eversion-live + .radial-shell + :has(.radial-hub[attr]) + .radial-frame
    //   = (0,5,1)  vs  .radial-shell:has(.radial-hub:is([attr], [attr])) .radial-frame = (0,4,0).
    expect(eversion).toContain(
      "html.eversion-live .radial-shell:has(.radial-hub[data-phase='everting']) .radial-frame",
    );
  });

  it('never sets the live class on the cover rule: the cover only hides, the live class only sharpens', () => {
    const cover = eversion.match(/html\.eversion-cover \.radial-frame,[^{]*\{[^}]*\}/)?.[0] ?? '';
    expect(cover).toMatch(/opacity: 0;/);
    expect(cover).not.toMatch(/filter|transition/);
  });

  it('shows the compose button with the page instead of popping it in a frame after the dissolve', () => {
    expect(live('radial-feed__compose')).toMatch(/visibility: visible;/);
  });

  it("starts the orb's ordinary eased fade-in once the cover is off (it overlaps the dissolve), by opacity alone", () => {
    const rule = eversion.match(
      /html\.eversion-live:not\(\.eversion-cover\) \.radial-hub\[data-phase='everting'\] \.radial-hub__orb \{[^}]*\}/,
    )?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/opacity: 1;/);
    expect(rule).not.toMatch(/transform|scale|transition|width|height|inset/);
  });

  it('the shell layers have no opacity transition of their own for the cover to fight', () => {
    for (const layer of layers) {
      const base = radial.match(new RegExp(`\\n\\.${layer} \\{[^}]*\\}`))?.[0] ?? '';
      expect(base, layer).not.toMatch(/transition[^;]*opacity/);
    }
  });
});

describe("radial.css `data-phase='everting'`", () => {
  const block = radial.slice(radial.indexOf('EVERTING — the hub hands'));

  it('fades the veil, globe and foot over HUB_FADE_MS and hides the orb', () => {
    expect(block).toContain(`transition: opacity ${HUB_FADE_MS}ms ease;`);
    for (const el of ['radial-hub__veil', 'radial-globe', 'radial-hub__foot']) {
      expect(block).toMatch(new RegExp(`\\[data-phase='everting'\\] \\.${el} \\{[^}]*opacity: 0;`));
    }
    expect(block).toMatch(/__orb \{[^}]*opacity: 0;[^}]*pointer-events: none;/);
  });
});

describe('the orb after the run (the effect ends with UNWRAP)', () => {
  it('has no crossfade machinery: nothing lands on the orb, so nothing styles a "popped" state', () => {
    expect(radial).not.toContain('data-orb-popped');
  });

  it('is hidden by opacity + pointer-events only (it must not slide while hidden)', () => {
    const rule = radial.match(/\[data-phase='everting'\] \.radial-hub__orb \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).not.toMatch(/transform|scale|z-index|width|height|inset|bottom|left/);
  });

  it('returns through the ordinary eased fade of the base orb rule, which `closed` leaves in force', () => {
    const base = radial.match(/\n\.radial-hub__orb \{[^}]*\}/)?.[0];
    expect(base).toBeDefined();
    expect(base).toMatch(/\n\s+opacity: 1;/);
    expect(base).toMatch(/opacity 0\.34s ease/);
    // No `closed` rule resets that opacity or its transition.
    expect(radial).not.toMatch(
      /\[data-phase='closed'\] \.radial-hub__orb \{[^}]*(?:opacity|transition)/,
    );
  });
});

describe('the frozen picture (the destination is rendered before the animation, amended 2026-10-19)', () => {
  const rule = (selector: string) => {
    const at = eversion.indexOf(`${selector} {`);
    return at < 0 ? '' : eversion.slice(at, eversion.indexOf('}', at) + 1);
  };

  it('while waiting, lives in a layer of its own over the page content and under every floating element', () => {
    const layer = rule('.eversion-hold-layer');
    expect(layer).toMatch(/position: fixed;/);
    expect(layer).toMatch(/inset: 0;/);
    expect(layer).toMatch(/z-index: calc\(var\(--z-content\) \+ 1\);/);
    expect(layer).toMatch(/pointer-events: none;/);
    expect(layer).toMatch(/opacity: 1;/);
    const base = rule('.eversion-hold');
    expect(base).toMatch(/position: absolute;/);
    expect(base).toMatch(/inset: 0;/);
    // Under the menus (and the cookie bar's z-40) and the floating layer; over the frame (a stacking context at
    // `--z-content`, the rail inside it) and the backdrop.
    const z = (name: string) => Number(new RegExp(`--z-${name}: (\\d+);`).exec(globals)?.[1]);
    expect(z('content') + 1).toBeLessThan(Math.min(z('menu'), z('floating'), 40));
    expect(z('content') + 1).toBeGreaterThan(Math.max(z('content'), z('backdrop')));
  });

  it("is blurred exactly as radial.css blurs the shell behind an open hub, with the shell's own radius", () => {
    expect(
      rule(".radial-hub:is([data-phase='open'], [data-phase='everting']) .eversion-hold"),
    ).toMatch(/filter: blur\(var\(--hub-page-blur, 20px\)\);/);
    expect(radial).toMatch(/filter: blur\(var\(--hub-page-blur, 20px\)\);/);
  });

  it('is sharp on every tier that opts the shell out of that blur', () => {
    expect(rule('html:is(.perf-lite, .reduce-transparency, .ios-webkit) .eversion-hold')).toMatch(
      /filter: none;/,
    );
    for (const tier of ['perf-lite', 'reduce-transparency', 'ios-webkit']) {
      expect(radial).toMatch(new RegExp(`html\\.${tier}\\s+\\.radial-shell:has`));
    }
  });

  it('rises to the overlay (over its canvas) before the canvas draws, and fades out over HOLD_FADE_MS by opacity alone', () => {
    expect(rule('.eversion-hold-layer--up')).toMatch(
      /z-index: calc\(var\(--z-hub-overlay\) - 1\);/,
    );
    // The same level as the overlay: the layer comes after it in the document, so it paints over the canvas.
    expect(rule('.eversion-overlay')).toMatch(/z-index: calc\(var\(--z-hub-overlay\) - 1\);/);
    expect(HOLD_FADE_MS).toBe(HUB_FADE_MS);
    const out = rule('.eversion-hold-layer--out');
    expect(out).toMatch(/opacity: 0;/);
    expect(out).toContain(`transition: opacity ${HOLD_FADE_MS}ms ease;`);
    expect(out).not.toMatch(/z-index/);
  });

  it('the shell under the picture is laid out unblurred while the hub is still open (what AFTER captures)', () => {
    // Selectors compared with their whitespace collapsed: prettier wraps the long ones.
    const flat = eversion.replace(/\s+/g, ' ');
    const sel = (layer: string) =>
      `html.eversion-live.eversion-cover .radial-shell:has(.radial-hub[data-phase='open']) .${layer}`;
    for (const layer of ['radial-frame', 'radial-backdrop', 'radial-topbar']) {
      expect(flat, layer).toContain(sel(layer));
    }
    const block = flat.slice(flat.indexOf(sel('radial-backdrop')));
    expect(block.slice(0, block.indexOf('}'))).toMatch(/filter: none;[^}]*transition: none;/);
  });

  it('collapsing animations for the capture spares the hub, which is open and on screen then', () => {
    expect(eversion).toContain(`html[${SETTLE_ATTRIBUTE}] *:not(.radial-hub, .radial-hub *),`);
    expect(eversion).toContain(
      `html[${SETTLE_ATTRIBUTE}] *:not(.radial-hub, .radial-hub *)::before,`,
    );
  });
});
