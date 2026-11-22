/**
 * V8: the explicit "the page's content changed" signal for code that may not import the renderer (V4).
 *
 * An overlay (dialog, sheet, menu, select, command palette) opening or closing changes the picture of the page the
 * chrome reflects (V5), but it is not a route change, a resize or a font load, so nothing else tells the renderer.
 * The overlay primitives call this when they mount and unmount; the renderer, if it is running, listens for the event
 * and repaints the environment once the overlay's M5 fade has ended. No MutationObserver (V8, B3): the overlay says so.
 *
 * This module imports nothing and is a few bytes, so a component may import it statically.
 */
export const CHROME_CONTENT_EVENT = 'chrome:content';

export function chromeContentChanged(): void {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new Event(CHROME_CONTENT_EVENT));
}
