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
const radial = read('components/radial/radial.css');
const globals = read('app/globals.css');
const hub = read('components/radial/RadialHub.tsx');
// Selectors compared with their whitespace collapsed: prettier wraps the long ones.
const flatRadial = radial.replace(/\s+/g, ' ');
const flatEversion = eversion.replace(/\s+/g, ' ');

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

  it('is loaded on every page by EversionRoot, not only under the shell (amended 2026-10-21)', () => {
    const root = read('components/radial/eversion/EversionRoot.tsx');
    expect(root).toMatch(/^import '\.\/eversion\.css';$/m);
    expect(radial).not.toMatch(/@import '\.\/eversion\/eversion\.css'/);
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
    expect(flatRadial).toMatch(
      /\.radial-shell:has\(\.radial-hub:is\(\[data-phase='open'\], \[data-phase='everting'\]\)\) \.radial-frame,[^{]*\{[^}]*filter: blur\(/,
    );
  });

  it('drops it from the floating UI too: it is in the AFTER picture sharp', () => {
    expect(flatEversion).toMatch(
      /html\.eversion-live \.radial-shell:has\(\.radial-hub\[data-phase='everting'\]\) > \[data-floating\]:not\(\[data-floating='hub'\]\) \{[^}]*filter: none;[^}]*transition: none;/,
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

  it('the shell layers have no opacity transition of their own for the cover to fight', () => {
    for (const layer of layers) {
      const base = radial.match(new RegExp(`\\n\\.${layer} \\{[^}]*\\}`))?.[0] ?? '';
      expect(base, layer).not.toMatch(/transition[^;]*opacity/);
    }
  });
});

describe("radial.css `data-phase='everting'`: the hub hands over by motion, nothing fades out beside the effect", () => {
  const block = flatRadial.slice(flatRadial.indexOf('EVERTING — the hub hands'));
  const rule = (el: string) =>
    new RegExp(`\\[data-phase='everting'\\] \\.${el} \\{[^}]*\\}`).exec(block)?.[0] ?? '';

  it('the veil contracts into the globe over the focus pull, without fading', () => {
    const veil = rule('radial-hub__veil');
    expect(veil).toMatch(/clip-path: circle\( ?0px at calc\(50% - var\(--eversion-dx, 0px\)\)/);
    expect(veil).toMatch(/opacity: 1;/);
    expect(veil).toMatch(/transition: clip-path var\(--eversion-delay, 250ms\)/);
  });

  it('the glass globe swells and travels with the effect from the start of WRAP, and dissolves into the planet', () => {
    // Keyframes, not transitions: the open globe is held by `globe-in`, and an animated property does not
    // transition when its animation goes (the globe jumped to its end state in one frame).
    const still = rule('radial-globe');
    expect(still).not.toMatch(/transition|animation/);
    // It moves from the sphere's first frame (`data-eversion-swell`), never on a delay from the commit: the
    // sphere starts after the focus pull and its own first frame, and a delayed swell ran ahead of it.
    const swelling =
      /\[data-phase='everting'\]\[data-eversion-swell\] \.radial-globe \{[^}]*\}/.exec(
        block,
      )?.[0] ?? '';
    expect(swelling).not.toMatch(/eversion-delay/);
    expect(swelling).toMatch(
      /globe-swell var\(--eversion-wrap, 700ms\) var\(--eversion-ease-wrap\) both/,
    );
    // The dissolve is the second half of WRAP.
    expect(swelling).toMatch(
      /globe-dissolve calc\(var\(--eversion-wrap, 700ms\) \* 0\.45\) cubic-bezier\([^)]*\) calc\(var\(--eversion-wrap, 700ms\) \* 0\.45\) both/,
    );
    const swell = /@keyframes globe-swell \{.*?\n\}/s.exec(radial)?.[0] ?? '';
    expect(swell).toMatch(/from \{\s*transform: scale\(1\);/);
    expect(swell.replace(/\s+/g, ' ')).toContain(
      'transform: translate(var(--eversion-dx, 0px), var(--eversion-dy, 0px)) scale(var(--eversion-swell, 1));',
    );
    expect(
      /@keyframes globe-in \{.*?to \{\s*opacity: 1;\s*transform: scale\(1\);/s.test(radial),
    ).toBe(true);
    // RadialHub sets the attribute on the sphere's first frame and clears it with the hand-over.
    expect(hub).toMatch(/swelling: \(\) => \{\s*markSwelling\(hubRef\.current\);/);
    expect(hub).toMatch(/setAttribute\('data-eversion-swell', ''\)/);
    expect(hub).toMatch(/removeAttribute\('data-eversion-swell'\)/);
  });

  it('the swell is the timeline’s own WRAP curve: smootherstep, as linear() stops', () => {
    const m = /--eversion-ease-wrap:\s*linear\(([^)]*)\)/.exec(eversion);
    expect(m).not.toBeNull();
    const stops = m![1]!.split(',').map(Number);
    expect(stops).toHaveLength(33);
    stops.forEach((v, i) => {
      const u = i / 32;
      expect(v, `stop ${i}`).toBeCloseTo(u * u * u * (u * (u * 6 - 15) + 10), 4);
    });
  });

  it('the foot drops off the bottom edge, opaque', () => {
    const foot = rule('radial-hub__foot');
    expect(foot).toMatch(/opacity: 1;/);
    expect(foot).toMatch(/transform: translateY\( ?calc\(100% \+/);
    expect(foot).toMatch(/pointer-events: none;/);
  });

  it('the orb is opaque and glides home under the picture and the canvas (no opacity transition)', () => {
    const orb = rule('radial-hub__orb');
    expect(orb).toMatch(/opacity: 1;/);
    expect(orb).toMatch(/pointer-events: none;/);
    expect(orb).toMatch(/transition: transform/);
    expect(orb).not.toMatch(/transition:[^;]*opacity/);
  });

  it('the hand-over geometry the CSS reads is exactly what RadialHub sets', () => {
    for (const name of [
      '--eversion-swell',
      '--eversion-dx',
      '--eversion-dy',
      '--eversion-delay',
      '--eversion-wrap',
    ]) {
      expect(block, name).toContain(name);
      expect(hub, name).toContain(`'${name}'`);
    }
  });
});

describe('the orb after the run (the effect ends with UNWRAP)', () => {
  it('has no crossfade machinery: nothing lands on the orb, so nothing styles a "popped" state', () => {
    expect(radial).not.toContain('data-orb-popped');
  });

  it('is in the AFTER picture, docked, so it unwraps into place with the page', () => {
    const capture = read('lib/eversion/capture.ts');
    expect(capture).toContain("const HUB_ORB_SELECTOR = '.radial-hub__orb';");
    expect(capture).toMatch(/after && el\.matches\(HUB_ORB_SELECTOR\)/);
    // Its docked pose is the base rule's.
    expect(radial).toMatch(/\n\.radial-hub__orb \{[^}]*transform: translateX\(-50%\);/);
    expect(capture).toContain("style.setProperty('transform', 'translateX(-50%)')");
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
    expect(layer).not.toMatch(/opacity/);
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

  it('is sharp on every tier that opts the shell out of that blur (and outranks the blur rule)', () => {
    // html:is(.a) .radial-hub .eversion-hold = (0,3,1) over .radial-hub:is([attr]) .eversion-hold = (0,3,0).
    expect(
      rule('html:is(.perf-lite, .reduce-transparency, .ios-webkit) .radial-hub .eversion-hold'),
    ).toMatch(/filter: none;/);
    for (const tier of ['perf-lite', 'reduce-transparency', 'ios-webkit']) {
      expect(radial).toMatch(new RegExp(`html\\.${tier}\\s+\\.radial-shell:has`));
    }
  });

  it('rises to the overlay (over its canvas) before the canvas draws', () => {
    expect(rule('.eversion-hold-layer--up')).toMatch(
      /z-index: calc\(var\(--z-hub-overlay\) - 1\);/,
    );
    // The same level as the overlay: the layer comes after it in the document, so it paints over the canvas.
    expect(rule('.eversion-overlay')).toMatch(/z-index: calc\(var\(--z-hub-overlay\) - 1\);/);
  });

  it('comes into focus by its blur RADIUS over HOLD_FADE_MS, never by an opacity (no double image)', () => {
    expect(HOLD_FADE_MS).toBe(HUB_FADE_MS);
    const focus = rule('.radial-hub .eversion-hold-layer--focus .eversion-hold');
    expect(focus).toMatch(/filter: blur\(0px\);/);
    expect(focus).toContain(`transition: filter ${HOLD_FADE_MS}ms`);
    expect(eversion).not.toMatch(/eversion-hold[^{]*\{[^}]*opacity: 0/);
  });

  it('the floating UI blurs with the page behind an open hub (the picture carries it), but not on the opt-out tiers', () => {
    expect(flatRadial).toMatch(
      /\.radial-shell:has\(\.radial-hub:is\(\[data-phase='open'\], \[data-phase='everting'\]\)\) > \[data-floating\]:not\(\[data-floating='hub'\]\) \{ filter: blur\(var\(--hub-page-blur, 20px\)\);/,
    );
    expect(flatRadial).toMatch(
      /html:is\(\.perf-lite, \.reduce-transparency, \.ios-webkit\) \.radial-shell:has\(\.radial-hub:is\(\[data-phase='open'\], \[data-phase='everting'\]\)\) > \[data-floating\]:not\(\[data-floating='hub'\]\) \{ filter: none;/,
    );
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

  it('collapsing animations for the capture spares the hub and the pop-up globe, which are on screen then', () => {
    const spared = '*:not(.radial-hub, .radial-hub *, .evert-popup, .evert-popup *)';
    expect(eversion).toContain(`html[${SETTLE_ATTRIBUTE}] ${spared},`);
    expect(eversion.replace(/\s+/g, ' ')).toContain(`html[${SETTLE_ATTRIBUTE}] ${spared}::before,`);
  });
});
