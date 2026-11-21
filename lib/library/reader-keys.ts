/**
 * Should a reader keyboard shortcut (B bookmark, F fullscreen) be ignored for
 * this event target? True while the user is typing, or interacting inside a
 * menu, listbox or dialog — the same guard the page-turn arrow keys use in
 * BookCanvas.
 */
const BLOCKED_ANCESTORS =
  'input, textarea, select, [role="menu"], [role="listbox"], [role="dialog"]';

export function isReaderKeyBlocked(
  target: EventTarget | null,
): boolean {
  if (
    !(
      target instanceof
      HTMLElement
    )
  )
    return false;
  return (
    target.isContentEditable ||
    target.closest(
      BLOCKED_ANCESTORS,
    ) !==
      null
  );
}

/**
 * Mod+F (Ctrl or Cmd, no other modifier). The reader opens its own find panel
 * for this, but only when the event reaches the reader container, i.e. while
 * focus is inside it; anywhere else the browser keeps its own find.
 */
export function isFindShortcut(
  event: Pick<
    KeyboardEvent,
    | 'key'
    | 'ctrlKey'
    | 'metaKey'
    | 'altKey'
    | 'shiftKey'
  >,
): boolean {
  return (
    (event.ctrlKey ||
      event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() ===
      'f'
  );
}

/**
 * Whether a Mod+F keydown at `target` should open the reader's find panel:
 * not while typing in another field, but yes inside the panel's own search
 * field (it re-focuses and selects it).
 */
export function shouldOpenFind(
  target: EventTarget | null,
): boolean {
  if (
    target instanceof
      HTMLElement &&
    target.closest(
      '[role="search"]',
    )
  )
    return true;
  return !isReaderKeyBlocked(
    target,
  );
}
