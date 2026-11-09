/**
 * The shared SVG filters the refracting layers use (`./layer.ts`): one `<filter>` per size class, not per host.
 *
 * ```
 * feImage (the class's rim map, stretched over the layer)  ─┐
 * feDisplacementMap(SourceGraphic) at depth × DISPERSION.r → keep red   ─┐
 * feDisplacementMap(SourceGraphic) at depth × DISPERSION.g → keep green ─┼ screen → the dispersed picture
 * feDisplacementMap(SourceGraphic) at depth × DISPERSION.b → keep blue  ─┘
 * ```
 *
 * The filter region is the layer's own box (`0 0 1 1` of its bounding box) and the map takes the default primitive
 * region, so it is stretched over whatever box the layer really has: the class (`sizeClass`) only fixes the map's shape.
 * One hidden zero-size `<svg>` per document holds them; a filter is created on first acquire, counted, and removed with
 * its last release, so the document holds as many filters as there are size classes in use. The map image is built once
 * per class (a canvas, `toDataURL`) and kept in a small cache so a class that comes back is not rebuilt.
 *
 * This is the plain `filter: url(#id)` form, which renders the same in Chromium, Firefox and WebKit; `backdrop-filter`
 * only works in Chromium and is forbidden in glass roles.
 */
import { DISPERSION, REFRACT, mapSize, rimMap, type SizeClass } from './profile';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_CACHE_MAX = 32;

export interface RefractFilter {
  /** The filter's element id: `filter: url(#id)`. */
  id: string;
  /** Give back this acquirer's share; the filter is removed with the last. Idempotent. */
  release(): void;
}

export interface FilterOptions {
  /** Test seam: build the class's map as an image URL (`null` = cannot). */
  encode?: (c: SizeClass) => string | null;
}

interface Slot {
  svg: Element;
  filters: Map<string, { el: Element; refs: number }>;
}

const slots = new WeakMap<Document, Slot>();
const mapCache = new Map<string, string>();

/** The class's map as a PNG data URL, built on a canvas; `null` where canvas cannot draw (SSR, no 2d context). */
export function encodeRimMap(doc: Document, c: SizeClass): string | null {
  const hit = mapCache.get(c.key);
  if (hit) {
    mapCache.delete(c.key);
    mapCache.set(c.key, hit);
    return hit;
  }
  try {
    const { width, height } = mapSize(c);
    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const data = rimMap(c, REFRACT.bandPx);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    const url = canvas.toDataURL('image/png');
    mapCache.set(c.key, url);
    if (mapCache.size > MAP_CACHE_MAX) mapCache.delete(mapCache.keys().next().value as string);
    return url;
  } catch {
    return null;
  }
}

function slotFor(doc: Document): Slot | null {
  const held = slots.get(doc);
  if (held) return held;
  const root = doc.body ?? doc.documentElement;
  if (!root) return null;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('data-jelly-refract-defs', '');
  svg.setAttribute(
    'style',
    'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;',
  );
  root.appendChild(svg);
  const slot: Slot = { svg, filters: new Map() };
  slots.set(doc, slot);
  return slot;
}

function buildFilter(doc: Document, id: string, href: string): Element {
  const el = (name: string, attrs: Record<string, string>) => {
    const n = doc.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const filter = el('filter', {
    id,
    x: '0',
    y: '0',
    width: '1',
    height: '1',
    'color-interpolation-filters': 'sRGB',
  });
  const depth = 2 * REFRACT.depthPx;
  filter.appendChild(el('feImage', { href, preserveAspectRatio: 'none', result: 'map' }));
  const channels = [
    ['r', DISPERSION.r, '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'],
    ['g', DISPERSION.g, '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0'],
    ['b', DISPERSION.b, '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0'],
  ] as const;
  for (const [ch, k, matrix] of channels) {
    filter.appendChild(
      el('feDisplacementMap', {
        in: 'SourceGraphic',
        in2: 'map',
        scale: (depth * k).toFixed(3),
        xChannelSelector: 'R',
        yChannelSelector: 'G',
        result: `d${ch}`,
      }),
    );
    filter.appendChild(
      el('feColorMatrix', { in: `d${ch}`, type: 'matrix', values: matrix, result: `c${ch}` }),
    );
  }
  filter.appendChild(el('feBlend', { in: 'cr', in2: 'cg', mode: 'screen', result: 'rg' }));
  filter.appendChild(el('feBlend', { in: 'rg', in2: 'cb', mode: 'screen' }));
  return filter;
}

/**
 * Take a share of the filter for a size class (creating it on first use). Returns `null` when the map cannot be built,
 * in which case the host simply keeps its lit rim.
 */
export function acquireRefractFilter(
  doc: Document,
  c: SizeClass,
  options: FilterOptions = {},
): RefractFilter | null {
  const slot = slotFor(doc);
  if (!slot) return null;
  let entry = slot.filters.get(c.key);
  if (!entry) {
    const href = (options.encode ?? ((k: SizeClass) => encodeRimMap(doc, k)))(c);
    if (!href) return null;
    const el = buildFilter(doc, `jelly-rf-${c.key}`, href);
    slot.svg.appendChild(el);
    entry = { el, refs: 0 };
    slot.filters.set(c.key, entry);
  }
  entry.refs++;
  const held = entry;
  const key = c.key;
  let released = false;
  return {
    id: `jelly-rf-${key}`,
    release() {
      if (released) return;
      released = true;
      if (--held.refs > 0) return;
      if (slot.filters.get(key) === held) slot.filters.delete(key);
      held.el.remove();
      if (slot.filters.size === 0 && slots.get(doc) === slot) {
        slot.svg.remove();
        slots.delete(doc);
      }
    },
  };
}

/** How many filters the document holds right now (the contract test pins it to the number of classes in use). */
export function refractFilterCount(doc: Document): number {
  return slots.get(doc)?.filters.size ?? 0;
}
