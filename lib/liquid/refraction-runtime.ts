/**
 * Optical refraction tier for glass surfaces: bends the live page behind a
 * surface's bezel via an SVG displacement map referenced from `backdrop-filter`.
 *
 * Only engines that actually render `backdrop-filter: url()` get it (Chromium).
 * Everywhere else, and under any reduced-effects preference, nothing is applied
 * and the surface keeps the plain frost + clear-coat from `app/liquid-glass.css`.
 *
 * Cost is bounded: at most MAX_SURFACES visible surfaces, each under MAX_AREA;
 * maps are rasterised once per quantised size (LRU) and there is no frame loop —
 * work happens in observer callbacks, coalesced into one microtask.
 */
import {
  buildDisplacementMap,
  filterMarkup,
  mapScaleFor,
  peakDisplacement,
  quantizeSurface,
} from './refraction';

export const REFRACTION_BUDGET = {
  maxSurfaces: 6,
  /** CSS px². A larger surface re-filters too many backdrop pixels. */
  maxArea: 360_000,
  minSide: 24,
} as const;

const CANDIDATES = '.glass-pane,.glass-chrome,.glass-overlay,[data-liquid-refract]';
const EXCLUDE =
  '[data-liquid-material="off"],[data-liquid-refract="off"],.glass-chrome--aside,.eversion-overlay,.evert-ghost,.radial-globe__stage';
const MAP_CACHE_LIMIT = 24;

interface NavigatorHints extends Navigator {
  userAgentData?: { brands?: { brand: string }[] };
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/** Chromium renders `url()` references inside `backdrop-filter`; WebKit and Gecko parse but ignore them. */
export function supportsBackdropRefraction(win: Window): boolean {
  const nav = win.navigator as NavigatorHints;
  const ua = nav.userAgent ?? '';
  const chromium =
    !!nav.userAgentData?.brands?.some((b) => b.brand === 'Chromium') ||
    (/\bChrome\/\d/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua));
  if (!chromium) return false;
  try {
    return !!(win as Window & { CSS?: typeof CSS }).CSS?.supports?.(
      'backdrop-filter',
      'blur(1px) url(#a)',
    );
  } catch {
    return false;
  }
}

/** Hardware that should not pay for a per-surface filter graph. */
export function isLowEndDevice(nav: NavigatorHints): boolean {
  return (
    (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) ||
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    nav.connection?.saveData === true
  );
}

interface Entry {
  el: HTMLElement;
  order: number;
  visible: boolean;
  width: number;
  height: number;
  filter?: SVGElement;
  id?: string;
  signature?: string;
  /** Last pixel size written to the filter region. */
  region?: string;
}

export function installLiquidRefraction(doc: Document = document): () => void {
  const win = doc.defaultView;
  if (!win || !supportsBackdropRefraction(win)) return () => {};
  const root = doc.documentElement;
  const lowEnd = isLowEndDevice(win.navigator as NavigatorHints);
  const queries = [
    win.matchMedia('(prefers-reduced-transparency: reduce)'),
    win.matchMedia('(forced-colors: active)'),
  ];
  const entries = new Map<HTMLElement, Entry>();
  const maps = new Map<string, string>();
  let counter = 0;
  let order = 0;
  let queued = false;
  let host: SVGSVGElement | null = null;
  let disposed = false;

  const disabled = () =>
    lowEnd ||
    queries.some((q) => q.matches) ||
    root.matches('.reduce-transparency,.style-high-contrast,.perf-lite') ||
    !!doc.querySelector('.app-high-contrast');

  const ensureHost = (): SVGSVGElement => {
    if (host?.isConnected) return host;
    host = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.setAttribute('width', '0');
    host.setAttribute('height', '0');
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('data-liquid-refraction-defs', '');
    host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    doc.body.appendChild(host);
    return host;
  };

  const mapUrl = (key: string, spec: ReturnType<typeof quantizeSurface>): string | null => {
    const hit = maps.get(key);
    if (hit) {
      maps.delete(key);
      maps.set(key, hit);
      return hit;
    }
    try {
      const raster = buildDisplacementMap(spec, mapScaleFor(spec.width, spec.height));
      const canvas = doc.createElement('canvas');
      canvas.width = raster.width;
      canvas.height = raster.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.putImageData(new win.ImageData(raster.data, raster.width, raster.height), 0, 0);
      const url = canvas.toDataURL('image/png');
      maps.set(key, url);
      if (maps.size > MAP_CACHE_LIMIT) maps.delete(maps.keys().next().value as string);
      return url;
    } catch {
      return null;
    }
  };

  const radiusOf = (el: HTMLElement, w: number, h: number): number => {
    const raw = win.getComputedStyle(el).borderTopLeftRadius;
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) return 0;
    return raw.includes('%') ? (value / 100) * Math.min(w, h) : value;
  };

  const release = (entry: Entry) => {
    entry.filter?.remove();
    entry.filter = entry.id = entry.signature = entry.region = undefined;
    entry.el.style.removeProperty('--liquid-refract-filter');
    entry.el.removeAttribute('data-liquid-refracted');
  };

  const apply = (entry: Entry) => {
    const { el, width, height } = entry;
    const dispersive = el.getAttribute('data-liquid-refract') === 'dispersive';
    const q = quantizeSurface(width, height, radiusOf(el, width, height));
    const signature = `${q.key}${dispersive ? 'd' : ''}`;
    const region = `${Math.round(width * 100) / 100}x${Math.round(height * 100) / 100}`;
    if (entry.filter?.isConnected && entry.signature === signature) {
      if (entry.region !== region) {
        // Same map, new exact box: the filter region must cover the real surface.
        entry.filter.setAttribute('width', String(width));
        entry.filter.setAttribute('height', String(height));
        entry.filter.querySelector('feImage')?.setAttribute('width', String(width));
        entry.filter.querySelector('feImage')?.setAttribute('height', String(height));
        entry.region = region;
      }
      return;
    }
    const href = mapUrl(q.key, q);
    if (!href) {
      release(entry);
      return;
    }
    entry.filter?.remove();
    const id = entry.id ?? `lr-${++counter}`;
    const svg = ensureHost();
    svg.insertAdjacentHTML(
      'beforeend',
      filterMarkup({
        id,
        width,
        height,
        scale: peakDisplacement(q.bezel),
        href,
        dispersive,
      }),
    );
    entry.filter = svg.lastElementChild as SVGElement;
    entry.id = id;
    entry.signature = signature;
    entry.region = region;
    el.style.setProperty('--liquid-refract-filter', `url(#${id})`);
    el.setAttribute('data-liquid-refracted', dispersive ? 'dispersive' : '');
  };

  const reconcile = () => {
    queued = false;
    if (disposed) return;
    const off = disabled();
    const eligible: Entry[] = [];
    if (!off) {
      for (const entry of entries.values()) {
        const { width, height } = entry;
        if (
          entry.visible &&
          entry.el.isConnected &&
          width >= REFRACTION_BUDGET.minSide &&
          height >= REFRACTION_BUDGET.minSide &&
          width * height <= REFRACTION_BUDGET.maxArea
        ) {
          eligible.push(entry);
        }
      }
      eligible.sort((a, b) => a.order - b.order);
      eligible.length = Math.min(eligible.length, REFRACTION_BUDGET.maxSurfaces);
    }
    const chosen = new Set(eligible);
    for (const entry of entries.values()) if (!chosen.has(entry)) release(entry);
    for (const entry of eligible) apply(entry);
    if (chosen.size) root.setAttribute('data-liquid-refraction', 'active');
    else root.removeAttribute('data-liquid-refraction');
  };

  const schedule = () => {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(reconcile);
  };

  const visibility = new win.IntersectionObserver((records) => {
    for (const r of records) {
      const entry = entries.get(r.target as HTMLElement);
      if (entry) entry.visible = r.isIntersecting;
    }
    schedule();
  });
  const sizes = new win.ResizeObserver((records) => {
    for (const r of records) {
      const entry = entries.get(r.target as HTMLElement);
      if (!entry) continue;
      const box = r.borderBoxSize?.[0];
      entry.width = box ? box.inlineSize : r.contentRect.width;
      entry.height = box ? box.blockSize : r.contentRect.height;
    }
    schedule();
  });

  const untrack = (el: HTMLElement) => {
    const entry = entries.get(el);
    if (!entry) return;
    release(entry);
    visibility.unobserve(el);
    sizes.unobserve(el);
    entries.delete(el);
  };
  const track = (el: HTMLElement) => {
    if (!el.matches(CANDIDATES) || el.matches(EXCLUDE)) {
      untrack(el);
      return;
    }
    if (entries.has(el)) return;
    entries.set(el, { el, order: order++, visible: false, width: 0, height: 0 });
    visibility.observe(el);
    sizes.observe(el);
  };
  const trackTree = (node: Node) => {
    if (!(node instanceof win.HTMLElement)) return;
    track(node);
    node.querySelectorAll<HTMLElement>(CANDIDATES).forEach(track);
  };
  const untrackTree = (node: Node) => {
    if (!(node instanceof win.HTMLElement)) return;
    for (const el of [...entries.keys()]) if (node === el || node.contains(el)) untrack(el);
  };

  const tree = new win.MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        trackTree(r.target);
        schedule();
        continue;
      }
      r.removedNodes.forEach((n) => {
        if (!(n instanceof win.HTMLElement) || !n.isConnected) untrackTree(n);
      });
      r.addedNodes.forEach(trackTree);
    }
    schedule();
  });
  const prefs = new win.MutationObserver(schedule);

  trackTree(doc.body);
  tree.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-liquid-refract', 'data-liquid-material'],
  });
  prefs.observe(root, { attributes: true, attributeFilter: ['class'] });
  queries.forEach((q) => q.addEventListener('change', schedule));

  return () => {
    disposed = true;
    tree.disconnect();
    prefs.disconnect();
    visibility.disconnect();
    sizes.disconnect();
    queries.forEach((q) => q.removeEventListener('change', schedule));
    for (const entry of entries.values()) release(entry);
    entries.clear();
    maps.clear();
    host?.remove();
    root.removeAttribute('data-liquid-refraction');
  };
}
