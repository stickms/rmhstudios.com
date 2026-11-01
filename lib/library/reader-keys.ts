/**
 * Should a reader keyboard shortcut (B bookmark, F fullscreen) be ignored for
 * this event target? True while the user is typing, or interacting inside a
 * menu, listbox or dialog — the same guard the page-turn arrow keys use in
 * BookCanvas.
 */
const BLOCKED_ANCESTORS = 'input, textarea, select, [role="menu"], [role="listbox"], [role="dialog"]';

export function isReaderKeyBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest(BLOCKED_ANCESTORS) !== null;
}
