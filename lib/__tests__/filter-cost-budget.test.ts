import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The SVG-filter cost budget, as an executable gate.
 *
 * ## Why this test exists
 *
 * `filter: url(…)` is the cheapest-looking, most expensive thing in this
 * stylesheet. Two failures shipped here before, and neither is visible in
 * review or in a screenshot diff:
 *
 *  - **A goo filter on a full-viewport layer.** `.radial-backdrop__field` carried
 *    `filter: url(#rmh-liquid-lg)` on a permanently-animating, viewport-sized
 *    layer. The filter was a **no-op** — the goo's alpha ramp
 *    (`a' = ramp·a − (ramp−1)/2`) clamps anything under ~50% alpha to zero, and
 *    the field's blobs are 7% — and it still cost the page ~4× its frame time,
 *    because a filtered subtree whose children animate cannot take the
 *    compositor fast path. Measured headless at 1920×1080: 16.7ms/frame
 *    without, 66.7ms with (83.4ms p95) — every desktop `_site` route at ~15fps.
 *  - **A CSS filter function chained after a `url()` reference.** The pointer
 *    drop shipped as `filter: url(#rmh-pointer-goo) drop-shadow(…)
 *    drop-shadow(…)`, which reads like two cheap shadows over a cheap filter.
 *    Measured headless with vsync off: the `url()` alone runs at ~0.4ms/frame;
 *    with the chain, a 1-second `setInterval` did not fire once in 10 seconds —
 *    the main thread was blocked outright. Extra passes belong INSIDE the
 *    referenced `<filter>` as primitives.
 *
 * The metaball layer those examples come from (the pointer drop, the hub dial's
 * goo, the orb aura, the `#rmh-liquid*` filter bank) has since been **removed**
 * — it was continuous GPU work spent on decoration, and the drop, being the
 * cursor, painted above every overlay on the site, which is the one thing
 * Chromium cannot do cheaply. The hazards below outlive it: `.lg-goo` /
 * `#glass-goo` and the full-screen app tiers still use `url()` filters.
 *
 * A third rule keeps the removal from quietly undoing itself: nothing may take
 * the pointer away from the OS again.
 */

const ROOT = process.cwd();
const RADIAL_CSS = join('components', 'radial', 'radial.css');

const SHEETS = [
  RADIAL_CSS,
  join('app', 'globals.css'),
  join('components', 'feed', 'feed.css'),
  join('components', 'shared', 'app-theme.css'),
];

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * Source with `/* … *\/` comments removed. Every rule here is about what the CSS
 * DOES, and this repo documents its own history heavily — the prose explaining
 * why a filter was deleted must not read as the filter being back.
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
  // The hub's expanding disc, under its current name and its old one. The old
  // name is kept deliberately: the guard should still fire if anyone brings
  // `.radial-hub__blur` back rather than silently going unenforced.
  '.radial-hub__veil',
  '.radial-hub__blur',
  // The liquid globe is the thing that MOVES over the hub's overlay, which is
  // what makes a filter on any of these layers ruinous rather than merely
  // expensive — see the note above `.radial-hub__veil` in radial.css.
  '.radial-globe',
  '.radial-globe__stage',
  '.radial-globe__glass',
];

/** Every `selector { … }` block in a stylesheet, flattened to one string each. */
function ruleBlocks(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bare)) !== null) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

describe('SVG filter cost budget', () => {
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
        `the media query in components/radial/radial.css). If the intent is a ` +
        `soft/fused field, use soft-edged gradients as .radial-backdrop__blob does.\n`,
    ).toEqual([]);
  });

  it('no CSS filter function is chained after a url() reference', () => {
    // Scan every stylesheet: the hazard is a property of the CSS, and `.lg-goo`
    // / the app tiers use `url()` filters. A declaration qualifies when a
    // `url(...)` is followed by anything that looks like `name(`, e.g.
    // `url(#goo) drop-shadow(0 0 2px red)`.
    const offenders: string[] = [];
    for (const sheet of SHEETS) {
      let css: string;
      try {
        css = code(sheet);
      } catch {
        continue; // a sheet that moved is not this test's business
      }
      for (const m of css.matchAll(/(?:^|[\s;{])filter:\s*([^;}]+)/g)) {
        const value = m[1].replace(/\s+/g, ' ').trim();
        if (!/\burl\(/.test(value)) continue;
        // Strip the url(...) token(s), then look for a remaining `fn(` call.
        const rest = value.replace(/\burl\([^)]*\)/g, ' ');
        if (/[a-z-]+\(/i.test(rest)) offenders.push(`${sheet}: filter: ${value}`);
      }
    }
    expect(
      offenders,
      `\nA CSS filter function is chained after a url() filter:\n` +
        offenders.map((s) => `  ${s}`).join('\n') +
        `\n\nThat combination takes Chromium off its fast path hard enough to ` +
        `block the main thread (measured: a 1s setInterval did not fire in 10s, ` +
        `vs ~0.4ms/frame for the url() alone). Move the extra passes INSIDE the ` +
        `referenced <filter> as filter primitives.\n`,
    ).toEqual([]);
  });

  it('nothing hides the visitor’s cursor document-wide', () => {
    // The pointer metaball replaced the OS cursor with a page-painted drop, which
    // meant `cursor: none` on the whole document and a filter re-running on every
    // pointer move — above every overlay, since it WAS the pointer. It is gone.
    // Per-element cursors (`pointer` on a control, `grab` on a drag handle) are
    // fine and unaffected; blanking the platform's is not.
    const offenders: string[] = [];
    for (const sheet of SHEETS) {
      let css: string;
      try {
        css = code(sheet);
      } catch {
        continue;
      }
      for (const { selector, body } of ruleBlocks(css)) {
        if (!/cursor:\s*none/.test(body)) continue;
        // Reaching `body`, `html`, `:root` or `*` = every element on the page.
        if (/(^|[\s,>+~])(\*|html|body|:root)(?![\w-])/.test(selector)) {
          offenders.push(`${sheet}: ${selector.replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(
      offenders,
      `\n\`cursor: none\` applied document-wide:\n` +
        offenders.map((s) => `  ${s}`).join('\n') +
        `\n\nThe OS cursor is the platform's to draw, and the compositor draws it ` +
        `for free. A page-painted replacement has to repaint every pointer move, ` +
        `above every overlay — which is what "the cursor is laggy" was.\n`,
    ).toEqual([]);
  });
});
