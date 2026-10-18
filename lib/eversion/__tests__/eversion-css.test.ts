import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COVER_CLASS, HUB_FADE_MS, SETTLE_ATTRIBUTE } from '../constants';

/**
 * T19 — the stylesheet half of the effect hangs on three names and one number
 * that live in `constants.ts` (the CSS cannot import them). A rename or a retune
 * on one side only would leave the controller toggling a class nothing styles,
 * which is invisible until the cover fails to hide the shell. This pins them.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const eversion = read('components/radial/eversion/eversion.css');
const radial = read('components/radial/radial.css');

describe('eversion.css', () => {
  it('styles the cover class and the settle attribute the controller toggles', () => {
    expect(eversion).toContain(`html.${COVER_CLASS} .radial-frame`);
    expect(eversion).toContain(`html.${COVER_CLASS} .radial-backdrop`);
    expect(eversion).toContain(`html[${SETTLE_ATTRIBUTE}] *`);
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
