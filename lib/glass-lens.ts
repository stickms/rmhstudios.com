'use client';

/**
 * Per-size-bucket lens displacement filters (v2 §3.3).
 *
 * `backdrop-filter: url(#filter)` is a Chromium-only capability — every other
 * engine keeps the CSS edge-blur fallback (`.glass-refract::before`), so this
 * whole module is a progressive enhancement gated behind
 * `CSS.supports('backdrop-filter', 'url(#x)')`.
 *
 * The static `#glass-lens` (256×256) in `GlassFilter` is the first-paint
 * default. This generator then refines each `[data-glass-lens]` element to a
 * filter whose displacement map is sized to the element so the bevel band stays
 * a CONSTANT ~26px regardless of pane size (a 900px hero must not get a 200px
 * mush band). Element size is quantised to 64px buckets and the live `<filter>`
 * node count is LRU-capped at 8 (§9 budget) — beyond that, elements reuse the
 * nearest existing bucket rather than mint a new node.
 *
 * SSR-safe: every DOM/`CSS`/observer touch is guarded, and `initGlassLens()`
 * returns a no-op disposer when it cannot run (server, unsupported engine,
 * perf-lite, reduced-transparency). It is driven from the `useGlassLight`
 * effect, which owns its cleanup.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

// The bevel band is a fixed pixel width in the map so refraction reads the same
// on a small capsule and a wide hero; it is NOT a percentage of pane size.
const BEVEL_PX = 26;
// §9 budget: ≤8 live lens <filter> nodes. Past the cap, reuse the nearest bucket.
const MAX_LIVE_FILTERS = 8;

function lensSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('backdrop-filter', 'url(#x)')
  );
}

function perfLite(): boolean {
  return document.documentElement.classList.contains('perf-lite');
}

function reducedTransparency(): boolean {
  return (
    document.documentElement.classList.contains('reduce-transparency') ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-transparency: reduce)').matches)
  );
}

/** Round up to the nearest 64px bucket (floor 64) — bounds live filter count. */
function bucket(n: number): number {
  return Math.max(64, Math.ceil(n / 64) * 64);
}

/**
 * The §3.2 displacement map as a data-URI SVG at `w`×`h`: R encodes horizontal
 * displacement, G vertical, 50% gray = neutral. Two plateau ramps per axis
 * (the outer `BEVEL_PX` bends; the centre stays neutral). Channels combine with
 * `screen` so `screen(rgb(r,0,0), rgb(0,g,0)) = rgb(r,g,0)`.
 */
export function lensMapDataURI(w: number, h: number): string {
  const bx = Math.min(BEVEL_PX, Math.floor(w / 2));
  const by = Math.min(BEVEL_PX, Math.floor(h / 2));
  const ox1 = (bx / w).toFixed(4);
  const ox2 = ((w - bx) / w).toFixed(4);
  const oy1 = (by / h).toFixed(4);
  const oy2 = ((h - by) / h).toFixed(4);
  const svg =
    `<svg xmlns="${SVG_NS}" width="${w}" height="${h}">` +
    `<defs>` +
    `<linearGradient id="gx" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#000000"/><stop offset="${ox1}" stop-color="#800000"/>` +
    `<stop offset="${ox2}" stop-color="#800000"/><stop offset="1" stop-color="#ff0000"/>` +
    `</linearGradient>` +
    `<linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#000000"/><stop offset="${oy1}" stop-color="#008000"/>` +
    `<stop offset="${oy2}" stop-color="#008000"/><stop offset="1" stop-color="#00ff00"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="${w}" height="${h}" fill="black"/>` +
    `<rect width="${w}" height="${h}" fill="url(#gx)" style="mix-blend-mode:screen"/>` +
    `<rect width="${w}" height="${h}" fill="url(#gy)" style="mix-blend-mode:screen"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Build one `<filter id>` node (feImage map → blur → displace) inside `defs`. */
function ensureFilter(defs: Element, id: string, w: number, h: number): void {
  if (defs.querySelector(`#${id}`)) return;
  const uri = lensMapDataURI(w, h);

  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('x', '0%');
  filter.setAttribute('y', '0%');
  filter.setAttribute('width', '100%');
  filter.setAttribute('height', '100%');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const feImage = document.createElementNS(SVG_NS, 'feImage');
  // Set both hrefs: modern Chromium reads `href`, older builds `xlink:href`.
  feImage.setAttributeNS(XLINK_NS, 'xlink:href', uri);
  feImage.setAttribute('href', uri);
  feImage.setAttribute('x', '0');
  feImage.setAttribute('y', '0');
  feImage.setAttribute('width', String(w));
  feImage.setAttribute('height', String(h));
  feImage.setAttribute('preserveAspectRatio', 'none');
  feImage.setAttribute('result', 'map');

  const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
  blur.setAttribute('in', 'map');
  blur.setAttribute('stdDeviation', '2');
  blur.setAttribute('result', 'soft');

  const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
  disp.setAttribute('in', 'SourceGraphic');
  disp.setAttribute('in2', 'soft');
  disp.setAttribute('scale', '56');
  disp.setAttribute('xChannelSelector', 'R');
  disp.setAttribute('yChannelSelector', 'G');

  filter.append(feImage, blur, disp);
  defs.appendChild(filter);
}

/**
 * Start assigning per-size lens filters to `[data-glass-lens]` elements. Returns
 * a disposer that disconnects the observers, removes the generated filter nodes,
 * and clears the `--glass-lens` var it wrote. No-op (and cheap) where the
 * enhancement cannot run.
 */
export function initGlassLens(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (!lensSupported() || perfLite() || reducedTransparency()) return () => {};

  const host = document.getElementById('glass-filters'); // the GlassFilter mount
  if (!host) return () => {};
  const defs: Element = host;

  // id → the map dimensions it was built at, so nearest-bucket reuse can measure.
  const live = new Map<string, { w: number; h: number }>();
  const observed = new Set<HTMLElement>();
  const dirty = new Set<HTMLElement>();
  let raf = 0;

  function nearest(w: number, h: number): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const [id, size] of live) {
      const d = (size.w - w) ** 2 + (size.h - h) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    return best;
  }

  function assign(el: HTMLElement): void {
    const w = bucket(el.offsetWidth);
    const h = bucket(el.offsetHeight);
    if (el.offsetWidth === 0 || el.offsetHeight === 0) return; // not laid out yet
    let id = `glass-lens-${w}x${h}`;
    if (!live.has(id)) {
      if (live.size >= MAX_LIVE_FILTERS) {
        const reuse = nearest(w, h);
        if (reuse) id = reuse;
        else {
          ensureFilter(defs, id, w, h);
          live.set(id, { w, h });
        }
      } else {
        ensureFilter(defs, id, w, h);
        live.set(id, { w, h });
      }
    }
    el.style.setProperty('--glass-lens', `url(#${id})`);
  }

  function flush(): void {
    raf = 0;
    for (const el of dirty) assign(el);
    dirty.clear();
  }

  function schedule(el: HTMLElement): void {
    dirty.add(el);
    if (!raf) raf = requestAnimationFrame(flush);
  }

  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) schedule(entry.target as HTMLElement);
  });

  function track(el: HTMLElement): void {
    if (observed.has(el)) return;
    observed.add(el);
    ro.observe(el);
    schedule(el);
  }

  function untrack(el: HTMLElement): void {
    if (!observed.has(el)) return;
    observed.delete(el);
    ro.unobserve(el);
    dirty.delete(el);
    el.style.removeProperty('--glass-lens');
  }

  document.querySelectorAll<HTMLElement>('[data-glass-lens]').forEach(track);

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') {
        const el = m.target as HTMLElement;
        if (el.hasAttribute('data-glass-lens')) track(el);
        else untrack(el);
        continue;
      }
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.hasAttribute('data-glass-lens')) track(node);
        node.querySelectorAll<HTMLElement>('[data-glass-lens]').forEach(track);
      });
      m.removedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (observed.has(node)) untrack(node);
        node.querySelectorAll<HTMLElement>('[data-glass-lens]').forEach(untrack);
      });
    }
  });
  mo.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-glass-lens'],
  });

  return () => {
    ro.disconnect();
    mo.disconnect();
    if (raf) cancelAnimationFrame(raf);
    observed.forEach((el) => el.style.removeProperty('--glass-lens'));
    observed.clear();
    for (const id of live.keys()) document.getElementById(id)?.remove();
    live.clear();
  };
}
