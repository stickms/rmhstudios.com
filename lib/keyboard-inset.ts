/**
 * How much of the layout viewport a software keyboard is covering.
 *
 * Split out from `hooks/useKeyboardInset` so the guards below — which are the
 * whole difficulty — can be tested against readings that are impossible to
 * produce in a headless browser.
 *
 * Under the default `interactive-widget: resizes-visual`, a keyboard does not
 * change the layout viewport at all; it shrinks the VISUAL one. The difference
 * between the two is therefore the keyboard's height — but only after two other
 * things that move the same number are ruled out.
 */

/** The parts of `window` a reading needs — narrowed so it can be faked. */
export type KeyboardInsetSource = {
  /** `document.documentElement.clientHeight` — the layout viewport. */
  layoutHeight: number;
  visualViewport?: { height?: number; offsetTop?: number; scale?: number } | null;
};

/**
 * Smallest covered region treated as a keyboard.
 *
 * Every software keyboard is far taller than this. What lands below it is
 * browser-chrome transition frames and sub-pixel rounding, and reacting to those
 * would resize the game a few pixels at a time while someone scrolls.
 */
export const MIN_KEYBOARD_PX = 100;

/**
 * Pinch tolerance. An unzoomed page rarely reports exactly 1 — and pinch is a
 * deliberate accessibility gesture, so a magnified page must not be mistaken for
 * a covered one and resized under the reader.
 */
export const MAX_UNZOOMED_SCALE = 1.01;

/**
 * The keyboard's height in CSS pixels, or 0 when no keyboard is up.
 *
 * `offsetTop` is included because the engine may already have panned the visual
 * viewport down to reveal the field: what is hidden at the bottom is then the
 * pan plus the keyboard, and that whole region is what the layout has to give
 * back. It converges rather than oscillating — once the shell is short enough
 * for the field to be visible, the engine stops panning and the reading settles
 * at the keyboard height alone.
 */
export function keyboardInset(source: KeyboardInsetSource): number {
  const visual = source.visualViewport;
  if (!visual) return 0;

  const scale = typeof visual.scale === 'number' ? visual.scale : 1;
  if (!Number.isFinite(scale) || scale > MAX_UNZOOMED_SCALE) return 0;

  const height = typeof visual.height === 'number' ? visual.height : 0;
  const offsetTop = typeof visual.offsetTop === 'number' ? visual.offsetTop : 0;
  const layout = source.layoutHeight;
  if (!Number.isFinite(height) || !Number.isFinite(layout) || height <= 0) return 0;

  const covered = layout - (height + offsetTop);
  return covered >= MIN_KEYBOARD_PX ? Math.round(covered) : 0;
}
