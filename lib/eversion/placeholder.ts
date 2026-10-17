/**
 * The instant 2D placeholder for the destination page (spec §6.5). OWNER: T18.
 *
 * ## Why it exists
 *
 * The destination usually is not rendered when the effect starts (spec §1 Q8):
 * `navigate()` is called at `start`, not at the end — which means the AFTER page
 * cannot be captured until the router settles. For that window the inside of the
 * globe shows this placeholder, and it crossfades to the real capture over
 * `PLACEHOLDER_XFADE_MS` the moment that arrives.
 *
 * It is the resolved `--site-bg`, the destination's lucide icon stroked at
 * `PLACEHOLDER_ICON_PX`, and its translated label in the site font, centred, at
 * the capture size. Cost < 3 ms; built at release and transferred with `start`.
 * Drawn on a main-thread `OffscreenCanvas` 2D (an `HTMLCanvasElement` where that
 * is missing); the icon's SVG node data goes to a `Path2D`; the label uses the
 * site font if `document.fonts.check` says it is loaded, else the system stack.
 *
 * Also the page the unwrap lands on at the stretch cap or after `after-failed`
 * (spec §7.5) — which then crossfades to whatever is live at `reveal`.
 *
 * Registers the `placeholder` debug slot.
 *
 * ## The icon
 *
 * lucide-react does not export an icon's node data; it lives in a closure inside
 * the forwardRef component. Calling the component's own `render` with no props
 * returns the `<Icon icon={data}>` element it would have rendered, and
 * `data.node` is the `[tag, attrs]` list — so the data is read with no DOM, no
 * `react-dom/server` and no second copy of the icon set. If a future lucide stops
 * exposing it, the placeholder is drawn without the glyph (label only) rather
 * than failing: it is a stand-in for a fraction of a second, never a gate.
 *
 * ## Colours
 *
 * `ThemeColours` carries `bg` but no ink, so the ink is the page's own computed
 * `color` and the face its computed `font-family` — one `getComputedStyle` on
 * `<body>`, taken at the moment the controller resolves the other colours (spec
 * §10.2) and therefore on a clean style tree. The helpers marked pure touch no
 * DOM, so the geometry and the SVG-to-path conversion are unit-tested in node
 * (`__tests__/placeholder.test.ts`).
 */

import { CAPTURE_DPR_CAP, CAPTURE_MAX_DIMENSION, PLACEHOLDER_ICON_PX } from './constants';
import { registerDebug } from './debug';
import type { EversionNode, Rgba, ThemeColours, Tier, TranslateFn, Viewport } from './types';

/** Options beyond the plan's four parameters. */
export interface PlaceholderOptions {
  /** Sets the bitmap scale: `min(viewport.dpr, CAPTURE_DPR_CAP[tier])`. */
  tier: Tier;
}

/* ── Layout (CSS px) ──────────────────────────────────────────────────────── */

/** Lucide draws on a 24-unit grid with a stroke of 2; lightened, because it is scaled 4x. */
const ICON_STROKE = 1.5;
/** Space between the glyph and its label. */
const LABEL_GAP = 20;
/** Label size and weight — the page-title scale the destination will open with. */
const LABEL_PX = 28;
const LABEL_WEIGHT = 600;
/** The label may use at most this fraction of the viewport width before it is squeezed. */
const LABEL_MAX_FRACTION = 0.8;
/** Used when the site font has not loaded: the platform UI face, never a webfont. */
const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface PlaceholderGeometry {
  /** Bitmap size in device px — the capture size (spec §6.2). */
  width: number;
  height: number;
  /** Device px per CSS px. */
  scale: number;
  /** CSS px: the glyph's top-left and the label's top-centre. */
  iconX: number;
  iconY: number;
  labelX: number;
  labelY: number;
}

/**
 * Where everything goes. Pure. The bitmap is the viewport at
 * `min(dpr, CAPTURE_DPR_CAP[tier])`, with both dimensions held to
 * `CAPTURE_MAX_DIMENSION` exactly as a capture is (spec §6.2), so the
 * placeholder and the real AFTER are the same size and the crossfade between
 * them needs no resampling. Glyph and label are centred as one group.
 */
export function placeholderGeometry(viewport: Viewport, tier: Tier): PlaceholderGeometry {
  let scale = Math.max(0.5, Math.min(viewport.dpr || 1, CAPTURE_DPR_CAP[tier]));
  const longest = Math.max(viewport.w, viewport.h) * scale;
  if (longest > CAPTURE_MAX_DIMENSION) scale *= CAPTURE_MAX_DIMENSION / longest;
  const groupH = PLACEHOLDER_ICON_PX + LABEL_GAP + LABEL_PX;
  const top = (viewport.h - groupH) / 2;
  return {
    width: Math.max(1, Math.round(viewport.w * scale)),
    height: Math.max(1, Math.round(viewport.h * scale)),
    scale,
    iconX: (viewport.w - PLACEHOLDER_ICON_PX) / 2,
    iconY: top,
    labelX: viewport.w / 2,
    labelY: top + PLACEHOLDER_ICON_PX + LABEL_GAP,
  };
}

/* ── Lucide icon data → SVG path strings ──────────────────────────────────── */

/** One `[tag, attributes]` entry of a lucide icon's node list. */
export type IconNodeEntry = readonly [string, Readonly<Record<string, string | number>>];

/** An icon's node list and the grid it is drawn on. */
export interface IconData {
  node: readonly IconNodeEntry[];
  size: number;
}

/**
 * Read a lucide component's node data without rendering it (see the file
 * docblock). `null` when the shape is not recognised, which the caller treats
 * as "no glyph".
 */
export function readIconData(icon: unknown): IconData | null {
  try {
    const render = (icon as { render?: (props: object, ref: unknown) => unknown } | null)?.render;
    if (typeof render !== 'function') return null;
    const element = render({}, null) as {
      props?: { icon?: { node?: unknown; size?: number }; iconNode?: unknown };
    } | null;
    const data = element?.props?.icon;
    const node = data?.node ?? element?.props?.iconNode;
    if (!Array.isArray(node)) return null;
    return { node: node as IconNodeEntry[], size: data?.size ?? 24 };
  } catch {
    return null;
  }
}

const num = (v: string | number | undefined, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
};

/**
 * One node-list entry as an SVG path `d` string, or `null` for a tag lucide does
 * not use. Every shape lucide emits has an exact path equivalent, which is what
 * lets one `Path2D` per element stand in for the DOM. Pure.
 */
export function nodeToPath(entry: IconNodeEntry): string | null {
  const [tag, a] = entry;
  switch (tag) {
    case 'path':
      return typeof a.d === 'string' ? a.d : null;
    case 'circle': {
      const cx = num(a.cx);
      const cy = num(a.cy);
      const r = num(a.r);
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    }
    case 'ellipse': {
      const cx = num(a.cx);
      const cy = num(a.cy);
      const rx = num(a.rx);
      const ry = num(a.ry);
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
    }
    case 'line':
      return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const pts = String(a.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (pts.length < 4 || pts.some((n) => !Number.isFinite(n))) return null;
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
      return tag === 'polygon' ? `${d}Z` : d;
    }
    case 'rect': {
      const x = num(a.x);
      const y = num(a.y);
      const w = num(a.width);
      const h = num(a.height);
      let rx = a.rx !== undefined ? num(a.rx) : a.ry !== undefined ? num(a.ry) : 0;
      let ry = a.ry !== undefined ? num(a.ry) : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return (
        `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
        `V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
        `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
      );
    }
    default:
      return null;
  }
}

/** Every drawable entry of an icon as a path string. Pure. */
export function iconPathData(data: IconData): string[] {
  const out: string[] = [];
  for (const entry of data.node) {
    const d = nodeToPath(entry);
    if (d) out.push(d);
  }
  return out;
}

/* ── Colour ───────────────────────────────────────────────────────────────── */

const channel = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);

/** `rgb()` string for a straight sRGB colour. Pure. */
export function rgbaToCss([r, g, b, a]: Rgba): string {
  return `rgb(${channel(r)} ${channel(g)} ${channel(b)} / ${Math.min(1, Math.max(0, a))})`;
}

/** Ink for a ground when the page's own `color` cannot be read: dark on light, light on dark. Pure. */
export function inkFor([r, g, b]: Rgba): string {
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? 'rgb(20 20 20)' : 'rgb(235 235 235)';
}

/* ── Drawing ──────────────────────────────────────────────────────────────── */

type Canvas2D = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** The page's ink and face, from one computed style on <body>. */
function pageText(bg: Rgba): { ink: string; family: string } {
  let ink = '';
  let family = '';
  try {
    const cs = getComputedStyle(document.body);
    ink = cs.color;
    family = cs.fontFamily;
  } catch {
    /* no DOM style — fall through to the derived ink and the system stack */
  }
  return { ink: ink || inkFor(bg), family: family || SYSTEM_FONT };
}

/**
 * The font to draw the label in: the site's if `document.fonts.check` says it is
 * loaded (drawing with a face that is still downloading would silently use a
 * fallback AND start a load mid-navigation), else the system stack.
 */
function labelFont(family: string): string {
  const spec = (f: string) => `${LABEL_WEIGHT} ${LABEL_PX}px ${f}`;
  try {
    if (document.fonts && !document.fonts.check(spec(family))) return spec(SYSTEM_FONT);
  } catch {
    return spec(SYSTEM_FONT);
  }
  return spec(family);
}

/**
 * Build the placeholder bitmap for `node` at `viewport`'s size.
 *
 * The plan writes `buildPlaceholder(leaf, viewport, colours, t) → ImageBitmap`.
 * This resolves a Promise because `createImageBitmap` is asynchronous on the
 * `HTMLCanvasElement` fallback, and takes `options.tier` so the scale follows
 * the capture's. Ownership of the bitmap passes to the caller.
 */
export async function buildPlaceholder(
  node: EversionNode,
  viewport: Viewport,
  colours: ThemeColours,
  t: TranslateFn,
  options: PlaceholderOptions,
): Promise<ImageBitmap> {
  const g = placeholderGeometry(viewport, options.tier);
  const canvas = createCanvas(g.width, g.height);
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('eversion: placeholder needs a 2D canvas');

  // The ground: opaque, so the corners are exactly `--site-bg` (spec §6.5).
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = rgbaToCss([colours.bg[0], colours.bg[1], colours.bg[2], 1]);
  ctx.fillRect(0, 0, g.width, g.height);

  // Everything after this is in CSS px.
  ctx.setTransform(g.scale, 0, 0, g.scale, 0, 0);
  const { ink, family } = pageText(colours.bg);

  const data = readIconData(node.icon);
  if (data) {
    const k = PLACEHOLDER_ICON_PX / data.size;
    ctx.save();
    ctx.translate(g.iconX, g.iconY);
    ctx.scale(k, k);
    ctx.strokeStyle = ink;
    ctx.lineWidth = ICON_STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const d of iconPathData(data)) ctx.stroke(new Path2D(d));
    ctx.restore();
  }

  ctx.fillStyle = ink;
  ctx.font = labelFont(family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(
    t(node.tKey, { defaultValue: node.label }),
    g.labelX,
    g.labelY,
    viewport.w * LABEL_MAX_FRACTION,
  );

  // An OffscreenCanvas hands its pixels over without a copy; an element has to
  // be read back asynchronously.
  if ('transferToImageBitmap' in canvas) return canvas.transferToImageBitmap();
  return createImageBitmap(canvas);
}

/* ── Debug slot (spec §11.2; T15 owns the registry) ───────────────────────── */

function sample(data: Uint8ClampedArray, width: number, x: number, y: number): Rgba {
  const i = (y * width + x) * 4;
  return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, data[i + 3] / 255];
}

registerDebug('placeholder', {
  /**
   * Build the placeholder for the current route's nav leaf at the current
   * viewport and report what is in it. Everything heavy (the nav catalogue, the
   * i18n instance, the scratch canvases) is imported or created inside the call,
   * so none of it is in any static closure (spec §11.3 test 39).
   */
  async build() {
    const [{ SIDEBAR_NAV, isNavGroup, isNavLeafActive }, { clientI18n }] = await Promise.all([
      import('@/lib/sidebar-nav'),
      import('@/lib/i18n/instances'),
    ]);
    const leaves = SIDEBAR_NAV.flatMap((item) => (isNavGroup(item) ? item.children : [item]));
    const leaf =
      leaves.find((l) => isNavLeafActive(location.pathname, l)) ??
      leaves.find((l) => l.href === '/') ??
      leaves[0];

    // The ground is whatever the theme says `--site-bg` is right now; a 1x1
    // canvas normalises any CSS colour syntax (color-mix, oklch, …) to sRGB.
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const pctx = probe.getContext('2d', { willReadFrequently: true })!;
    pctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--site-bg')
      .trim();
    pctx.fillRect(0, 0, 1, 1);
    const px = pctx.getImageData(0, 0, 1, 1).data;
    const bg: Rgba = [px[0] / 255, px[1] / 255, px[2] / 255, 1];
    const colours: ThemeColours = {
      bg,
      veil: bg,
      accent: bg,
      cageMinor: bg,
      cageParallel: bg,
      cageMajor: bg,
      cageRipple: bg,
      cageWidth: 1,
    };

    const viewport: Viewport = {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    };
    const t = clientI18n.getFixedT(null, 'feed') as TranslateFn;

    const start = performance.now();
    const bitmap = await buildPlaceholder(leaf, viewport, colours, t, { tier: 'high' });
    const buildMs = performance.now() - start;

    const { width, height } = bitmap;
    const read = document.createElement('canvas');
    read.width = width;
    read.height = height;
    const rctx = read.getContext('2d', { willReadFrequently: true })!;
    rctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const all = rctx.getImageData(0, 0, width, height).data;
    const corners = [
      sample(all, width, 0, 0),
      sample(all, width, width - 1, 0),
      sample(all, width, 0, height - 1),
      sample(all, width, width - 1, height - 1),
    ];
    // The middle third of the frame is where the glyph and the label are.
    let centreInked = false;
    for (let y = Math.floor(height / 3); y < (2 * height) / 3 && !centreInked; y++) {
      for (let x = Math.floor(width / 3); x < (2 * width) / 3; x++) {
        const c = sample(all, width, x, y);
        if (Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) > 0.15) {
          centreInked = true;
          break;
        }
      }
    }
    return { width, height, corners, centreInked, buildMs };
  },
});
