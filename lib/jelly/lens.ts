/**
 * The press dent's lens (#989; CLAUDE.md "Design system: Plasmatic Jelly" → "Press = liquid-glass dent"): the content
 * under the dent refracts through it, split into R/G/B.
 *
 * One per-document inline SVG `<filter>` applied as `filter: url(#…)` to the ONE pressed host while its dent exists —
 * never two hosts, never a full-viewport layer, never chained with another CSS filter function. The physics service
 * (`physics.ts`) is the only caller: it calls {@link JellyLens.update} on the frames the dent changes and
 * {@link JellyLens.release} when the dent has eased out, which restores the host's inline `filter` exactly.
 *
 * ## The filter graph (no feTurbulence, no blur)
 *
 * 1. **Map.** A neutral `feFlood` (0.5 grey = no displacement) under an `feImage` of {@link LENS_MAP_URL} placed on
 *    the bowl's box (±3σ round the dent centre). The map is one resolution-independent SVG data URL built once at
 *    import, stretched to any size by the `feImage` box: R ramps left→right and G top→bottom (the displacement
 *    direction), faded back to neutral by a radial Gaussian `1 − e^(−r²/2σ²)`, so the shift is the gradient-shaped
 *    profile of a Gaussian bowl and exactly zero at the box edge.
 * 2. **Three displacement passes** of `SourceGraphic` through the map, restricted to the bowl box, at scales
 *    `s + d`, `s` and `s − d` (`d` from `DENT.lensDispersionPx`) — the red, green and blue images. Each is reduced to
 *    its own channel at a third of its alpha, summed (`feComposite arithmetic`) and the colour restored ×3.
 * 3. **Recombine.** The host outside the bowl box is `SourceGraphic` untouched (`feComposite out` against a flood of
 *    the box), merged with the lens inside it, so nothing outside the dent is ever resampled.
 *
 * Strength `s = DENT.lensStrength · σ · depth/DENT.depthPx` px, so the lens grows and fades with the dent.
 *
 * ## Support
 *
 * WebKit (Safari, every iOS browser) does not render `feDisplacementMap`/`feImage` filters on HTML reliably; there,
 * and wherever `CSS.supports('filter', 'url(#x)')` is false or the document cannot build SVG, the lens is a no-op —
 * the rim, indent and light dot (drawn by the engine from the same dent) remain. Hit areas never move: a CSS filter
 * changes paint only.
 *
 * The filter nodes are `aria-hidden` decoration in a zero-size, `pointer-events: none` `<svg>` appended to `<body>`
 * on first use and removed by {@link JellyLens.destroy}.
 */

import type { JellyDent } from './lattice-inputs';
import { DENT } from './tiers';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The bowl box spans ±this many σ round the dent centre (e^(−4.5) ≈ 1%: the map is neutral at the edge). */
export const LENS_BOX_SIGMAS = 3;
/** Below this depth (px) the lens is not worth a filter pass: {@link JellyLens.update} releases instead. */
export const LENS_MIN_DEPTH_PX = 0.15;
/** Attribute writes below this change (px / scale units) are skipped. */
const WRITE_EPSILON = 0.1;

/** Radial fade stops of the map: `1 − exp(−(3t)²/2)` at t = 0, 0.2, …, 1. */
const FADE_STOPS = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => ({
  t,
  a: t >= 1 ? 1 : 1 - Math.exp(-((LENS_BOX_SIGMAS * t) ** 2) / 2),
}));

/** The displacement map, built once: R = x ramp, G = y ramp, faded radially to neutral grey. */
export const LENS_MAP_URL = (() => {
  const stops = FADE_STOPS.map(
    ({ t, a }) =>
      `<stop offset="${(t * 100).toFixed(0)}%" stop-color="rgb(128,128,128)" stop-opacity="${a.toFixed(3)}"/>`,
  ).join('');
  const svg =
    `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100" preserveAspectRatio="none">` +
    `<defs>` +
    `<linearGradient id="x"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#f00"/></linearGradient>` +
    `<linearGradient id="y" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#0f0"/></linearGradient>` +
    `<radialGradient id="f">${stops}</radialGradient>` +
    `</defs>` +
    `<rect width="100" height="100" fill="url(#x)"/>` +
    `<rect width="100" height="100" fill="url(#y)" style="mix-blend-mode:screen"/>` +
    `<rect width="100" height="100" fill="url(#f)"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
})();

/** The lens geometry for a dent: bowl box (host-local px) and the three channel scales. Pure. */
export function lensGeometry(dent: JellyDent): {
  x: number;
  y: number;
  size: number;
  scaleR: number;
  scaleG: number;
  scaleB: number;
} {
  const sigma = Math.max(1, dent.radius);
  const half = LENS_BOX_SIGMAS * sigma;
  const k = Math.max(0, Math.min(1, dent.depth / DENT.depthPx));
  const s = DENT.lensStrength * sigma * k;
  // feDisplacementMap shifts by scale·(C − 0.5), i.e. ±scale/2: the split is ±dispersion px at full depth.
  const d = 2 * DENT.lensDispersionPx * k;
  return {
    x: dent.x - half,
    y: dent.y - half,
    size: 2 * half,
    scaleR: s + d,
    scaleG: s,
    scaleB: s - d,
  };
}

/** Can this window render an SVG displacement filter on HTML? WebKit cannot (reliably); SSR cannot at all. */
export function lensSupported(win: (Window & typeof globalThis) | null | undefined): boolean {
  if (!win) return false;
  try {
    if (!win.CSS?.supports?.('filter', 'url(#jelly-lens)')) return false;
    const ua = win.navigator?.userAgent ?? '';
    if (/iP(hone|ad|od)/.test(ua)) return false;
    if (/AppleWebKit/.test(ua) && !/(Chrome|Chromium|Edg|OPR|Android)\//.test(ua)) return false;
    return typeof win.document?.createElementNS === 'function';
  } catch {
    return false;
  }
}

export interface JellyLens {
  /** Whether the lens can refract at all here. `false` → every call is a no-op. */
  readonly supported: boolean;
  /** The host currently refracting, or `null`. At most one. */
  readonly host: Element | null;
  /**
   * Refract `el`'s content through `dent` (host-local px). Takes the lens from any other host first (restoring it).
   * A `null` or too-shallow dent releases `el`.
   */
  update(el: HTMLElement, dent: JellyDent | null): void;
  /** Stop refracting `el` (if it holds the lens) and restore its inline `filter` exactly. */
  release(el: Element): void;
  /**
   * Build the filter now (idempotent) so the first press does not pay for ~25 DOM nodes inside a frame. Physics calls
   * it from an idle callback after install and again from `pointerdown`, outside the frame.
   */
  prepare(): void;
  /** Release the host and remove the `<svg>`. */
  destroy(): void;
}

let lensSeq = 0;

/**
 * A lens for `doc`. `opts.supported` overrides the feature detection (tests).
 */
export function createJellyLens(doc: Document, opts: { supported?: boolean } = {}): JellyLens {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  const supported = opts.supported ?? lensSupported(win);
  const id = `jelly-lens-${++lensSeq}`;

  let svg: SVGSVGElement | null = null;
  let host: HTMLElement | null = null;
  let savedFilter = '';
  const nodes: Record<string, Element> = {};
  const last = { x: NaN, y: NaN, size: NaN, r: NaN, g: NaN, b: NaN };

  const el = (tag: string, attrs: Record<string, string>, parent: Element): Element => {
    const n = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent.appendChild(n);
    return n;
  };

  const build = () => {
    if (svg) return;
    const root = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('focusable', 'false');
    root.setAttribute('width', '0');
    root.setAttribute('height', '0');
    root.setAttribute('data-jelly-lens', '');
    root.setAttribute(
      'style',
      'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none',
    );
    const filter = el(
      'filter',
      {
        id,
        // The default region (−10% / 120% of the border box) keeps a host's shadow and focus ring unclipped.
        'color-interpolation-filters': 'sRGB',
      },
      el('defs', {}, root),
    );
    // 1. Map: neutral flood + the bowl image on the box.
    nodes.flood = el('feFlood', { 'flood-color': 'rgb(128,128,128)', result: 'n' }, filter);
    nodes.image = el(
      'feImage',
      { href: LENS_MAP_URL, preserveAspectRatio: 'none', result: 'i' },
      filter,
    );
    nodes.image.setAttributeNS?.('http://www.w3.org/1999/xlink', 'xlink:href', LENS_MAP_URL);
    const merge = el('feMerge', { result: 'map' }, filter);
    el('feMergeNode', { in: 'n' }, merge);
    el('feMergeNode', { in: 'i' }, merge);
    // 2. Three passes, one channel each at ⅓ alpha, summed, colour ×3.
    const channel = (name: 'r' | 'g' | 'b', row: number) => {
      nodes[name] = el(
        'feDisplacementMap',
        {
          in: 'SourceGraphic',
          in2: 'map',
          xChannelSelector: 'R',
          yChannelSelector: 'G',
          result: `d${name}`,
        },
        filter,
      );
      const m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1 / 3, 0];
      m[row * 5 + row] = 1;
      el(
        'feColorMatrix',
        {
          in: `d${name}`,
          type: 'matrix',
          values: m.map((v) => +v.toFixed(6)).join(' '),
          result: `c${name}`,
        },
        filter,
      );
    };
    channel('r', 0);
    channel('g', 1);
    channel('b', 2);
    const add = (a: string, b: string, result: string) =>
      el(
        'feComposite',
        { in: a, in2: b, operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result },
        filter,
      );
    add('cr', 'cg', 'rg');
    add('rg', 'cb', 'rgb');
    nodes.restore = el(
      'feColorMatrix',
      {
        in: 'rgb',
        type: 'matrix',
        values: '3 0 0 0 0 0 3 0 0 0 0 0 3 0 0 0 0 0 1 0',
        result: 'lens',
      },
      filter,
    );
    // 3. The host outside the box, untouched, merged with the lens inside it.
    nodes.box = el(
      'feFlood',
      { 'flood-color': '#fff', 'flood-opacity': '1', result: 'box' },
      filter,
    );
    el(
      'feComposite',
      { in: 'SourceGraphic', in2: 'box', operator: 'out', result: 'outside' },
      filter,
    );
    const out = el('feMerge', {}, filter);
    el('feMergeNode', { in: 'outside' }, out);
    el('feMergeNode', { in: 'lens' }, out);
    (doc.body ?? doc.documentElement).appendChild(root);
    svg = root;
  };

  /** Restrict every bowl primitive to the box. */
  const BOXED = ['image', 'r', 'g', 'b', 'restore', 'box'] as const;

  const write = (dent: JellyDent) => {
    const g = lensGeometry(dent);
    const moved =
      !(Math.abs(g.x - last.x) < WRITE_EPSILON) ||
      !(Math.abs(g.y - last.y) < WRITE_EPSILON) ||
      !(Math.abs(g.size - last.size) < WRITE_EPSILON);
    if (moved) {
      for (const k of BOXED) {
        const n = nodes[k];
        n.setAttribute('x', g.x.toFixed(1));
        n.setAttribute('y', g.y.toFixed(1));
        n.setAttribute('width', g.size.toFixed(1));
        n.setAttribute('height', g.size.toFixed(1));
      }
      last.x = g.x;
      last.y = g.y;
      last.size = g.size;
    }
    const scales = [
      ['r', g.scaleR],
      ['g', g.scaleG],
      ['b', g.scaleB],
    ] as const;
    for (const [k, v] of scales) {
      if (Math.abs(v - last[k]) < WRITE_EPSILON) continue;
      nodes[k].setAttribute('scale', v.toFixed(2));
      last[k] = v;
    }
  };

  const restore = () => {
    if (!host) return;
    host.style.filter = savedFilter;
    host = null;
    savedFilter = '';
    last.x = last.y = last.size = last.r = last.g = last.b = NaN;
  };

  return {
    supported,
    get host() {
      return host;
    },
    update(target, dent) {
      if (!supported) return;
      if (!dent || !(dent.depth >= LENS_MIN_DEPTH_PX)) {
        if (host === target) restore();
        return;
      }
      if (host !== target) {
        restore();
        build();
        host = target;
        savedFilter = target.style.filter ?? '';
        target.style.filter = `url(#${id})`;
      }
      write(dent);
    },
    prepare() {
      if (supported) build();
    },
    release(target) {
      if (host === target) restore();
    },
    destroy() {
      restore();
      svg?.remove();
      svg = null;
      for (const k of Object.keys(nodes)) delete nodes[k];
    },
  };
}
