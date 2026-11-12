/**
 * The globe's open/close rules as pure functions (Steel G4, G7), so the keyboard contract is testable without a DOM
 * and GlobeNav carries no decision of its own.
 */

/** What a key does to the globe. `open` is the current state; `stops` are the focusable places in the nav. */
export type GlobeKeyAction =
  | { type: 'close' }
  | { type: 'focus'; index: number }
  | { type: 'none' };

interface KeyInput {
  key: string;
  shiftKey: boolean;
  open: boolean;
  /** Number of focus stops (the pins, the links under them and the globe button). */
  stops: number;
  /** Index of the focused stop, or -1 when focus is outside the nav. */
  active: number;
}

/**
 * Escape closes. Tab never leaves: past either end it wraps, and from outside the nav it comes back to the nearest
 * end. Everything else, and everything while closed, is left to the browser.
 */
export function globeKeyAction({ key, shiftKey, open, stops, active }: KeyInput): GlobeKeyAction {
  if (!open) return { type: 'none' };
  if (key === 'Escape') return { type: 'close' };
  if (key !== 'Tab' || stops === 0) return { type: 'none' };
  const last = stops - 1;
  if (shiftKey) return active <= 0 ? { type: 'focus', index: last } : { type: 'none' };
  return active === -1 || active === last ? { type: 'focus', index: 0 } : { type: 'none' };
}
