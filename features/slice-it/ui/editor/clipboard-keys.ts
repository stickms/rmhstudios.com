/**
 * Key bindings for the clipboard and time operations (design doc §13), as a pure
 * function so the table is testable without mounting the editor.
 *
 * `Ctrl` and `Meta` are the same modifier here, the way `Ctrl+Z` / `Ctrl+S` treat
 * them, so macOS works with Cmd. A key pressed in a text field, a dialog or an
 * open menu belongs to that control and maps to nothing.
 */

import type { ClipboardOp } from './useClipboardActions';

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

/** A text field, or a dialog or menu: the editor's shortcuts stay out of it. */
export function keyTargetIsOwned(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  return (
    typeof el.closest === 'function' &&
    !!el.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')
  );
}

/** The operation a key press asks for, or null when it is not one of ours. */
export function clipboardOpForEvent(event: KeyLike): ClipboardOp | null {
  if (keyTargetIsOwned(event.target) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    switch (key) {
      case 'c':
        return event.shiftKey ? null : 'copy';
      case 'x':
        return event.shiftKey ? null : 'cut';
      case 'v':
        return event.shiftKey ? 'paste-mirrored' : 'paste';
      case 'd':
        return event.shiftKey ? null : 'duplicate';
      case 'i':
        // Ctrl+Shift+I opens devtools in Chromium and Firefox, so remove time is Ctrl+Shift+L.
        return event.shiftKey ? null : 'insert-time';
      case 'l':
        return event.shiftKey ? 'remove-time' : null;
      case 's':
        return event.shiftKey ? 'scale' : null;
      default:
        return null;
    }
  }
  if (event.shiftKey) return null;
  if (key === 'h') return 'mirror';
  if (key === 'q') return 'quantize';
  return null;
}
