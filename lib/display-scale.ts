/**
 * Display scale — how many device pixels one CSS pixel of a canvas actually covers.
 *
 * A browser magnifies a page in two quite different ways, and a WebGL surface has to
 * answer for both or it is the only blurry thing on the screen:
 *
 *  - **Page zoom** — Ctrl +/−, the trackpad pinch desktop browsers map onto it, and
 *    the OS display-scaling slider. The page reflows: the layout viewport shrinks in
 *    CSS pixels and `devicePixelRatio` rises by the same factor. A stage sized in
 *    percentages therefore keeps the same *physical* size, so matching the new ratio
 *    costs no extra pixels at all — but a canvas left on its old ratio is now drawing
 *    fewer pixels than the screen is showing, and goes soft exactly when the reader
 *    zoomed in to look closer.
 *  - **Pinch zoom** — phones, tablets, touchscreen laptops. Nothing reflows: layout,
 *    CSS sizes and `devicePixelRatio` all stay put while the compositor magnifies the
 *    already-rasterised page. `visualViewport.scale` is the only signal there is, and
 *    a canvas that ignores it is a bitmap being blown up.
 *
 * `devicePixelRatio × visualViewport.scale` covers both cases with one number, which is
 * what {@link readDisplayScale} returns.
 */

/**
 * How far a pinch is followed before the sharpening stops paying for itself.
 *
 * Page zoom is free — the stage sheds exactly the CSS pixels the ratio gains — but a
 * pinch holds the stage the same size while multiplying its resolution, so the drawing
 * buffer grows with the square of the gesture. It buys less and less as it goes, too:
 * magnifying a view means seeing less of it, so most of those pixels are off-screen.
 * Two is generous — the difference between a page rendered at 2× its own resolution and
 * one rendered at 3× is not visible through a compositor's scaler.
 */
export const MAX_PINCH_SCALE = 2;

/**
 * Absolute device-pixel ceiling for a surface — the backstop for a stage that is large,
 * magnified and zoomed all at once. Set at roughly what the reader's stage could already
 * ask for at its biggest (a 5K display, the in-app zoom control at its 1.5 maximum, a
 * two-times ratio), so it bounds the pathological case without touching any real one.
 */
export const MAX_SURFACE_PIXELS = 36_000_000;

/**
 * Hard ceiling on either edge of the drawing buffer. Past a GPU's maximum
 * renderbuffer/texture size a canvas doesn't degrade, it fails — and a tall phone
 * pinched hard is exactly the shape whose long edge runs ahead of its pixel count.
 * Comfortably under the limit of any WebGL2 device.
 */
export const MAX_SURFACE_EDGE = 8192;

/** Scale steps per unit: the granularity zoom is tracked at (0.25 of a ratio). */
export const DISPLAY_SCALE_STEPS = 4;

/** Enough slack to absorb float error in `scale * STEPS` before rounding up. */
const EPSILON = 1e-6;

/**
 * Ceiling for a full-screen **game** surface, as opposed to a document one.
 *
 * The reader's zoom is worth following on a page of text, where the cost is a
 * one-off raster. A game re-rasterises its whole surface sixty times a second,
 * and fill rate scales with the SQUARE of the ratio: a phone reporting 3 is
 * asking for 9× the pixels of a 1× screen, every frame, on the hardware least
 * able to supply them. Two is the point past which a moving image stops looking
 * meaningfully sharper — and a game that holds 60fps at 2 reads as far crisper
 * than one that stutters at 3.
 *
 * The 3D games reach the same ceiling through `lib/render/tier.ts`, which also
 * factors in the GPU probe. This is the 2D equivalent, for canvases with no tier
 * system of their own.
 */
export const MAX_GAME_DPR = 2;

/** The parts of `window` a display scale is read from — narrowed so it can be faked. */
export type DisplayScaleSource = {
  devicePixelRatio?: number;
  visualViewport?: { scale?: number } | null;
};

/** A positive, finite reading, or 1 when the browser doesn't supply one. */
function positive(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * The live device-pixel scale: the display's own ratio times any pinch magnification
 * (the latter held to {@link MAX_PINCH_SCALE}). 1 on a plain 1× screen; 2 on an
 * unzoomed retina display; 4 on that same display at 200% browser zoom; 6 on a 3× phone
 * pinched to double.
 */
export function readDisplayScale(source: DisplayScaleSource): number {
  const pinch = Math.min(positive(source.visualViewport?.scale), MAX_PINCH_SCALE);
  return positive(source.devicePixelRatio) * pinch;
}

/**
 * Snap a scale to the next quarter-step *up*.
 *
 * Resizing a drawing buffer reallocates it, and a pinch gesture reports continuously —
 * quantising turns a stream of reallocations into a handful. Rounding up rather than to
 * nearest keeps the surface at or above the display's resolution (never under it), and
 * the epsilon means the ratios that are already exact steps — 1, 1.25, 1.5, 2, 3 — stay
 * exactly themselves rather than tipping over on float error.
 */
export function quantiseDisplayScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.ceil(scale * DISPLAY_SCALE_STEPS - EPSILON) / DISPLAY_SCALE_STEPS;
}

/**
 * The device-pixel ratio a full-screen game canvas should size its drawing buffer at:
 * the display's own ratio, held to {@link MAX_GAME_DPR} and never below 1.
 *
 * Deliberately ignores pinch magnification, unlike {@link readDisplayScale}. A player
 * pinching mid-run is not asking for a sharper render, and reallocating a full-screen
 * drawing buffer during a gesture is the one moment it costs the most.
 *
 * Whatever this returns must be used for BOTH the buffer size and the render
 * transform. Sizing the buffer from a clamped ratio while drawing at the raw one
 * silently scales the whole scene.
 */
export function gameSurfaceDpr(source: DisplayScaleSource): number {
  return Math.min(positive(source.devicePixelRatio), MAX_GAME_DPR);
}

/**
 * The pixel ratio to render a stage of `cssWidth × cssHeight` at: the display scale,
 * held to the pixel and edge ceilings, and never below 1. Sizes of 0 (nothing measured
 * yet) impose no ceiling, so the first frame renders at the display's real resolution.
 */
export function surfaceDprFor(scale: number, cssWidth: number, cssHeight: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  const w = Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : 0;
  const h = Number.isFinite(cssHeight) && cssHeight > 0 ? cssHeight : 0;
  if (!w || !h) return Math.max(1, scale);
  const byArea = Math.sqrt(MAX_SURFACE_PIXELS / (w * h));
  const byEdge = MAX_SURFACE_EDGE / Math.max(w, h);
  return Math.max(1, Math.min(scale, byArea, byEdge));
}
