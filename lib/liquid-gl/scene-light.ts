/**
 * The scene light and the aurora parallax offset, as plain numbers.
 *
 * ## Why these do not live on `<html>` as custom properties
 *
 * They used to. `useGlassLight` (fine pointer) and `useLiquidBackground` (device
 * tilt) wrote `--light-x/--light-y` onto the document element, and
 * `lib/liquid-gl/scene.ts` read them straight back out of the same inline style
 * — a JS→JS channel routed through the CSSOM, which **no CSS rule anywhere in
 * the tree ever read**.
 *
 * That round trip is not free, and on this site it is close to the most
 * expensive thing a frame can do. A custom-property mutation on an element
 * dirties the computed style of its whole subtree, because custom properties
 * inherit; the site declares ~250 tokens on `:root`, so every element in the
 * document has to rebuild that inherited map. Measured on `/store` (407
 * elements, headless Chromium at 4× CPU throttle):
 *
 * | mutation on `<html>`            | forced style+layout flush |
 * | ------------------------------- | ------------------------- |
 * | one custom property             | **~70ms**                 |
 * | a class toggle                  | ~2ms                      |
 * | inline transform on a leaf node | ~0ms                      |
 *
 * The pointer handlers ran that ~70ms recalculation on **every animation frame
 * the pointer moved** — which is exactly the window in which the interface has
 * to feel responsive. Dragging the navigation globe measured 4.4fps and 624ms
 * of input latency with all of it going to style recalculation, while the
 * globe's own frame loop was costing 2.8ms.
 *
 * So the values that only JavaScript reads are kept in JavaScript. The one pair
 * that CSS genuinely does read — the aurora offset, consumed by
 * `body::before`/`body::after` in `app/globals.css` — still has to be written to
 * the document element, so instead it is quantised and change-gated by its
 * writer (`hooks/useLiquidBackground`) and mirrored here, so the renderer reads
 * a number rather than re-parsing a pixel string every frame.
 *
 * Kept as its own tiny module, next to `active.ts` and for the same reason: the
 * hooks that write it must not statically import the orchestrator and drag the
 * detect/scene/renderer graph out of its lazy chunk.
 */

/** Scene light in viewport CSS px. `NaN` ⇒ no live light; use the sun default. */
let lightX = Number.NaN;
let lightY = Number.NaN;

/** Aurora parallax offset in CSS px, mirroring what is on `<html>`. */
let auroraX = 0;
let auroraY = 0;

/** Publish the scene light (viewport CSS px). */
export function setSceneLight(x: number, y: number): void {
  lightX = x;
  lightY = y;
}

/** Rest the light at the sun default (pointer left the document, tilt revoked). */
export function clearSceneLight(): void {
  lightX = Number.NaN;
  lightY = Number.NaN;
}

/** Publish the aurora parallax offset (CSS px) alongside the `<html>` write. */
export function setAuroraOffset(x: number, y: number): void {
  auroraX = x;
  auroraY = y;
}

/** True while a live light is being published. */
export function hasSceneLight(): boolean {
  return !Number.isNaN(lightX) && !Number.isNaN(lightY);
}

export function getSceneLightX(): number {
  return lightX;
}
export function getSceneLightY(): number {
  return lightY;
}
export function getAuroraX(): number {
  return auroraX;
}
export function getAuroraY(): number {
  return auroraY;
}
