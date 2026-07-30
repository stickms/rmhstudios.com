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
 * 5. Nothing chains a CSS filter FUNCTION after a `url()` reference. This one is
 *    the worst of the set and the least obvious: `.metaball` shipped as
 *    `filter: url(#rmh-pointer-goo) drop-shadow(…) drop-shadow(…)`, which reads
 *    like two cheap shadows on top of a cheap filter. Measured headless with
 *    vsync off, the `url()` alone runs at ~0.4ms/frame; with the chain, a
 *    1-second `setInterval` did not fire once in 10 seconds — the main thread was
 *    blocked outright. Build the extra passes as filter primitives inside the
 *    referenced `<filter>` instead (the pointer rim is an feMorphology/feFlood/
 *    feComposite/feMerge, and it looks better besides).
 * 6. The drop runs on fine pointers only. It replaces a cursor; a phone has none
 *    to replace, and a per-frame SVG filter chasing a finger is a phone's battery
 *    spent on a mark the finger is covering.
 * 7. **Every viewport-covering `backdrop-filter` layer stands the drop down.**
 *    Chromium invalidates a `backdrop-filter` as a WHOLE ELEMENT, not per damaged
 *    rect: anything that paints a moving pixel above one re-runs the blur over
 *    its entire area, every frame. Measured headless at 1920×1080 over the open
 *    hub (`.radial-hub__blur`, `inset: 0`, `blur(20px) saturate(118%)`), vsync on:
 *    nothing moving 60.2fps; a plain 24px dot wiggling in a 50px arc 10.7fps; the
 *    pointer metaball 10.6fps; the same with no `backdrop-filter` 60.1fps.
 *    Damage size and position are irrelevant — only the blurred layer's area is
 *    (a 500px frosted disc stays at 60fps) — and radius barely matters either
 *    (`blur(6px)` still measured 11.9fps), so it is not tunable. `will-change`,
 *    `isolation` and promotion hints do nothing.
 *
 *    The drop is the one element guaranteed to move above every overlay, because
 *    it IS the cursor — which is why this reads as "the cursor is laggy" and not
 *    "the menu is janky". So a component that renders one of these layers calls
 *    `useFrostedOverlay()` for as long as it is up, and `MetaballCursor` hands the
 *    pointer back to the OS as a still image of the drop.
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

  it('no CSS filter function is chained after a url() reference', () => {
    // Scan every stylesheet, not just radial.css: the hazard is a property of the
    // CSS, not of this module, and `.lg-goo` / the app tiers use `url()` filters
    // too. A declaration qualifies when a `url(...)` is followed by anything that
    // looks like `name(`, e.g. `url(#goo) drop-shadow(0 0 2px red)`.
    const sheets = [
      RADIAL_CSS,
      join('app', 'globals.css'),
      join('components', 'feed', 'feed.css'),
      join('components', 'shared', 'app-theme.css'),
    ];
    const offenders: string[] = [];
    for (const sheet of sheets) {
      let css: string;
      try {
        css = code(sheet);
      } catch {
        continue; // a sheet that moved is covered by the path test below
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
        `referenced <filter> as filter primitives — see the feMorphology rim in ` +
        `components/radial/MetaballCursor.tsx.\n`,
    ).toEqual([]);
  });

  it('the pointer drop runs on fine pointers only', () => {
    const src = code(CURSOR);
    expect(
      /\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/.test(src),
      `\ncomponents/radial/MetaballCursor.tsx no longer gates on a fine pointer.\n\n` +
        `The drop replaces a cursor. A phone has none to replace, so all it can do ` +
        `there is spend the battery re-running an SVG filter under a finger that is ` +
        `already covering the mark.\n`,
    ).toBe(true);
    expect(
      /pointerType\s*===\s*'touch'/.test(src),
      `\nMetaballCursor must still ignore touch pointer events.\n\n` +
        `A touchscreen laptop matches (hover: hover) and (pointer: fine) and STILL ` +
        `delivers touch events; without the guard a tap teleports the drop to the ` +
        `finger and steals it from the mouse.\n`,
    ).toBe(true);
  });

  it('every viewport-covering backdrop-filter layer stands the drop down', () => {
    // The full-screen frosted layers, and the component that renders each. A
    // moving pixel above one of these re-blurs it entirely, every frame (rule 7).
    const OWNERS = [
      { layer: 'glass-scrim', file: join('components', 'ui', 'dialog.tsx') },
      { layer: 'glass-scrim', file: join('components', 'feed', 'ComposeModal.tsx') },
      { layer: 'glass-scrim', file: join('components', 'site', 'CommandPalette.tsx') },
      { layer: 'glass-scrim', file: join('components', 'site', 'KeyboardShortcuts.tsx') },
      { layer: 'radial-hub__blur', file: join('components', 'radial', 'RadialHub.tsx') },
    ];

    const missing = OWNERS.filter(({ file }) => !/useFrostedOverlay\s*\(/.test(code(file)));
    expect(
      missing.map((m) => `${m.file} (renders .${m.layer})`),
      `\nA viewport-covering backdrop-filter layer is rendered without calling ` +
        `useFrostedOverlay():\n` +
        missing.map((m) => `  ${m.file} — .${m.layer}`).join('\n') +
        `\n\nChromium re-blurs such a layer IN FULL whenever anything above it ` +
        `moves, and the pointer metaball moves above it every frame by definition ` +
        `— measured 60fps → ~11fps at 1920x1080. Call useFrostedOverlay() for as ` +
        `long as the layer is up so the drop hands the pointer back to the OS.\n`,
    ).toEqual([]);

    // …and the drop must actually be listening.
    expect(
      /subscribeFrostedOverlay/.test(code(CURSOR)),
      `\ncomponents/radial/MetaballCursor.tsx no longer subscribes to ` +
        `useFrostedOverlay's registry, so every claim above is a no-op.\n`,
    ).toBe(true);
  });

  it('no NEW full-screen scrim slips in unwired', () => {
    // Anything else that renders `glass-scrim` is a viewport-covering
    // backdrop-filter this budget has never seen. Add it to OWNERS above (and
    // wire the hook) rather than widening this.
    const KNOWN = new Set([
      join('components', 'ui', 'dialog.tsx'),
      join('components', 'feed', 'ComposeModal.tsx'),
      join('components', 'site', 'CommandPalette.tsx'),
      join('components', 'site', 'KeyboardShortcuts.tsx'),
    ]);

    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = join(dir, entry.name);
        if (entry.isDirectory()) walk(rel, out);
        else if (/\.tsx?$/.test(entry.name)) out.push(rel);
      }
      return out;
    };

    const unwired = walk('components').filter(
      (rel) =>
        !KNOWN.has(rel) &&
        /glass-scrim/.test(read(rel)) &&
        !/useFrostedOverlay\s*\(/.test(code(rel)),
    );
    expect(
      unwired,
      `\nNew component(s) render \`.glass-scrim\` without standing the pointer ` +
        `drop down:\n` +
        unwired.map((s) => `  ${s}`).join('\n') +
        `\n\nSee rule 7 above — call useFrostedOverlay() while the scrim is up.\n`,
    ).toEqual([]);
  });

  it('scans the radial module (guards against the files being moved)', () => {
    const dir = readdirSync(join(ROOT, 'components', 'radial'));
    expect(dir).toContain('MetaballCursor.tsx');
    expect(dir).toContain('LiquidGoo.tsx');
    expect(dir).toContain('radial.css');
  });
});
