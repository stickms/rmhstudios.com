import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COVER_CLASS, HUB_FADE_MS, POP_MS, SETTLE_ATTRIBUTE } from '../constants';

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

describe('the orb crossfade (review R5 M1)', () => {
  it("starts when POP's fade does (60% of POP_MS) and ends with POP", () => {
    // timeline.ts: POP_FADE_FROM = POP_SHRINK_FRACTION = 0.6. The page-visible
    // `popFade` event replaces this offset when the timeline publishes one.
    const rule = radial.match(
      /\[data-phase='everting'\]\[data-orb-popped\] \.radial-hub__orb \{[^}]*\}/,
    )?.[0];
    expect(rule).toBeDefined();
    const m = rule!.match(/transition: opacity (\d+)ms ease-out (\d+)ms;/);
    expect(m).not.toBeNull();
    const [dur, delay] = [Number(m![1]), Number(m![2])];
    expect(delay).toBe(Math.round(POP_MS * 0.6));
    expect(delay + dur).toBeLessThanOrEqual(POP_MS);
    expect(delay + dur).toBeGreaterThanOrEqual(POP_MS - 20);
  });

  it('raises the orb above the effect canvas for the crossfade', () => {
    expect(radial).toMatch(
      /\[data-phase='everting'\]\[data-orb-popped\] \.radial-hub__orb \{[^}]*z-index: var\(--z-hub-orb-open\)/,
    );
  });
});
