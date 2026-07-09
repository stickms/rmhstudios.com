import type { RefObject } from 'react';
import { insertAtCaret } from './insert-at-caret';

type TextField = HTMLTextAreaElement | HTMLInputElement;

/**
 * Returns a callback that inserts an emoji at the field's current caret
 * (replacing any selection), then restores focus and caret position.
 * Falls back to appending when the ref isn't mounted.
 */
export function useEmojiInsert(
  ref: RefObject<TextField | null>,
  value: string,
  onChange: (next: string) => void,
): (emoji: string) => void {
  return (emoji: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { next, caret } = insertAtCaret(value, emoji, start, end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };
}
