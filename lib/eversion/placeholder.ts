/**
 * The instant 2D placeholder for the destination page (spec §6.5). OWNER: T18.
 *
 * ## Why it exists
 *
 * The destination usually is not rendered when the effect starts (spec §1 Q8):
 * `navigate()` is called at `start`, not at the end, so the route's data fetch
 * and render are never delayed — which means the AFTER page cannot be captured
 * until the router settles. For that window the inside of the globe shows this
 * placeholder, and it crossfades to the real capture over
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
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T18 replaces every body, and this line with them */
import { notImplemented } from './not-implemented';
import type { EversionNode, ThemeColours, Tier, TranslateFn, Viewport } from './types';

/** Options beyond the plan's four parameters. */
export interface PlaceholderOptions {
  /** Sets the bitmap scale: `min(viewport.dpr, CAPTURE_DPR_CAP[tier])`. */
  tier: Tier;
}

/**
 * Build the placeholder bitmap for `node` at `viewport`'s size.
 *
 * The plan writes `buildPlaceholder(leaf, viewport, colours, t) → ImageBitmap`.
 * This resolves a Promise because `createImageBitmap` is asynchronous on the
 * `HTMLCanvasElement` fallback, and takes `options.tier` so the scale follows
 * the capture's. Ownership of the bitmap passes to the caller.
 */
export function buildPlaceholder(
  node: EversionNode,
  viewport: Viewport,
  colours: ThemeColours,
  t: TranslateFn,
  options: PlaceholderOptions,
): Promise<ImageBitmap> {
  return notImplemented('buildPlaceholder', 'T18');
}
