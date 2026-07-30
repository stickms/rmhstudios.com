import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The metaball / goo-filter cost budget, as an executable gate.
 *
 * ## Why this test exists
 *
 * `.radial-backdrop__field` shipped with `filter: url(#rmh-liquid-lg)` on a
 * full-viewport, permanently-animating layer. Two things were true at once:
 *
 *  - the filter was a **no-op** — the goo's alpha ramp (`a' = ramp·a − (ramp−1)/2`)
 *    clamps anything under ~50% alpha to zero, and the field's blobs are 7%, so
 *    the ramp produced nothing and `feBlend` composited the untouched
 *    SourceGraphic back on top. Output was pixel-identical to no filter;
 *  - and it cost the entire page ~4× its frame time, because a filtered subtree
 *    whose children animate cannot take the compositor fast path, so Chromium
 *    re-ran a σ=16 Gaussian + colour matrix + blend over the whole viewport every
 *    frame. Measured headless at 1920×1080: 16.7ms/frame without, 66.7ms with
 *    (83.4ms p95) — every desktop `_site` route pinned at ~15fps.
 *
 * Both failure modes are invisible in review (the CSS reads as a deliberate
 * effect, and the effect it names is one you cannot see either way), and neither
 * shows up in a screenshot diff. Hence a static gate.
 *
 * ## The rules
 *
 * 1. No `filter: url(…)` on a full-viewport / fixed-backdrop layer. The named
 *    layers below are the ones that cover the viewport; a goo filter belongs on a
 *    small bounded cluster (the hub dial, the orb aura, the loading mark), never
 *    on the backdrop.
 * 2. The goo filter bank may not grow a wide radius back. `rmh-liquid-lg` existed
 *    only for the backdrop field; keeping it in the bank is an invitation to
 *    reintroduce rule 1's bug.
 * 3. The pointer drop's filter region stays bounded. `BOX` is squared in the
 *    per-frame cost, and the `<filter>` region must not re-pad past the box the
 *    JS already clamps every blob inside.
 * 4. Every goo layer keeps its `(min-width) and (prefers-reduced-motion:
 *    no-preference)` gate — the cost budget `components/radial/README.md`
 *    §Metaballs rule 3 promises.
 */

const ROOT = process.cwd();
const RADIAL_CSS = join('components', 'radial', 'radial.css');
const CURSOR = join('components', 'radial', 'MetaballCursor.tsx');
const GOO = join('components', 'radial', 'LiquidGoo.tsx');

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * Source with `/* … *\/` comments removed. Every rule here is about what the code
 * DOES, and this module documents its own history heavily — the prose explaining
 * why `rmh-liquid-lg` was deleted must not read as the id being back.
 */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Selectors for layers that cover the whole viewport. A `filter: url(…)` on any
 * of these is the shape of the bug above, whatever the filter claims to do.
 */
const VIEWPORT_LAYERS = [
  '.radial-backdrop',
  '.radial-backdrop__field',
  '.radial-backdrop__rings',
  '.radial-hub__overlay',
  '.radial-hub__blur',
];

/** Every `selector { … }` block in a stylesheet, flattened to one string each. */
function ruleBlocks(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  // Strip comments first so a `filter: url()` inside prose (this repo documents
  // heavily) never registers as a declaration.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bare)) !== null) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

describe('metaball / goo-filter cost budget', () => {
  const radialCss = read(RADIAL_CSS);
  const blocks = ruleBlocks(radialCss);

  it('parses radial.css into a non-trivial set of rules', () => {
    expect(blocks.length).toBeGreaterThan(200);
  });

  it('no `filter: url()` on a full-viewport backdrop layer', () => {
    const offenders = blocks
      .filter(({ selector, body }) => {
        if (!/filter:\s*url\(/.test(body)) return false;
        // Match the layer as a whole class token, so `.radial-backdrop__blob`
        // does not read as `.radial-backdrop`.
        return VIEWPORT_LAYERS.some((layer) =>
          new RegExp(`${layer.replace(/[.]/g, '\\.')}(?![\\w-])`).test(selector),
        );
      })
      .map(({ selector }) => selector);

    expect(
      offenders,
      `\n\`filter: url(…)\` found on a full-viewport layer:\n` +
        offenders.map((s) => `  ${s}`).join('\n') +
        `\n\nA filtered subtree with animating children re-runs the whole filter ` +
        `graph every frame over the whole filter region — on a viewport-sized ` +
        `layer that costs ~4x the page's frame time (measured; see the note above ` +
        `the media query in components/radial/radial.css). Goo filters belong on ` +
        `small bounded clusters. If the intent is a soft/fused field, use ` +
        `soft-edged gradients as .radial-backdrop__blob does.\n`,
    ).toEqual([]);
  });

  it('the goo bank keeps no wide radius (the backdrop-field filter)', () => {
    const bank = code(GOO);
    expect(
      /rmh-liquid-lg/.test(bank),
      `\n\`rmh-liquid-lg\` is back in components/radial/LiquidGoo.tsx.\n\n` +
        `That radius existed only for the full-viewport backdrop field, which is ` +
        `exactly the layer a goo filter must not go on (see the test above). It ` +
        `was also a no-op there: the ramp clamps sub-50%-alpha shapes away.\n`,
    ).toBe(false);
    // Nothing may reference it either.
    expect(/rmh-liquid-lg/.test(code(RADIAL_CSS))).toBe(false);
  });

  it('the pointer drop keeps a bounded box and filter region', () => {
    const src = read(CURSOR);

    const box = Number(/^const BOX = (\d+);$/m.exec(src)?.[1]);
    expect(box, 'components/radial/MetaballCursor.tsx must declare `const BOX`').toBeGreaterThan(0);
    expect(
      box,
      `\nMetaballCursor's BOX is ${box}px. Per-frame filter cost is quadratic in ` +
        `this number (goo blur + alpha ramp + two halo passes over BOX², every ` +
        `frame the pointer moves), so it stays small. Re-measure before raising ` +
        `it.\n`,
    ).toBeLessThanOrEqual(180);

    // The <filter> region must not re-pad past the box: the loop clamps every
    // blob to HALF - size/2 - BLUR_PAD, so the fused shape provably fits inside
    // the border box and extra region is pure blurred emptiness.
    const region = /<filter\b[\s\S]*?>/.exec(src)?.[0] ?? '';
    const width = /width="(-?[\d.]+)%"/.exec(region)?.[1];
    const height = /height="(-?[\d.]+)%"/.exec(region)?.[1];
    expect(width, 'the pointer goo <filter> must declare an explicit width').toBeDefined();
    expect(Number(width), `filter region width is ${width}% of the box`).toBeLessThanOrEqual(110);
    expect(Number(height), `filter region height is ${height}% of the box`).toBeLessThanOrEqual(
      110,
    );
  });

  it('every goo filter in the bank is gated to desktop + no-reduced-motion in CSS', () => {
    // Each `filter: url(#rmh-…)` must sit inside a media query carrying both
    // gates — the cost budget the README's rule 3 promises.
    const bare = radialCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const uses = [...bare.matchAll(/filter:\s*url\(#(rmh-[\w-]+)\)/g)];
    expect(uses.length, 'expected radial.css to still use the goo bank').toBeGreaterThan(0);

    const ungated: string[] = [];
    for (const use of uses) {
      const id = use[1];
      if (id === 'rmh-pointer-goo') continue; // gated in JS (see MetaballCursor)
      // Walk back to the nearest enclosing at-rule preamble.
      const before = bare.slice(0, use.index);
      const lastMedia = before.lastIndexOf('@media');
      const preamble =
        lastMedia === -1 ? '' : before.slice(lastMedia, before.indexOf('{', lastMedia));
      if (
        !/min-width/.test(preamble) ||
        !/prefers-reduced-motion:\s*no-preference/.test(preamble)
      ) {
        ungated.push(id);
      }
    }
    expect(
      ungated,
      `\nGoo filter(s) used outside a \`(min-width: …) and ` +
        `(prefers-reduced-motion: no-preference)\` media query:\n` +
        ungated.map((s) => `  #${s}`).join('\n') +
        `\n\nSee components/radial/README.md §Metaballs rule 3 — an always-on SVG ` +
        `filter is continuous GPU work, so every decorative goo layer is gated.\n`,
    ).toEqual([]);
  });

  it('scans the radial module (guards against the files being moved)', () => {
    const dir = readdirSync(join(ROOT, 'components', 'radial'));
    expect(dir).toContain('MetaballCursor.tsx');
    expect(dir).toContain('LiquidGoo.tsx');
    expect(dir).toContain('radial.css');
  });
});
