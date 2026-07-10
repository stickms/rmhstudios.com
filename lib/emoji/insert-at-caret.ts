/**
 * Insert `insertion` into `value`, replacing the [start, end) selection.
 * Offsets are UTF-16 code-unit indices, matching textarea selectionStart/End.
 */
export function insertAtCaret(
  value: string,
  insertion: string,
  start: number,
  end: number,
): { next: string; caret: number } {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  const next = value.slice(0, s) + insertion + value.slice(e);
  return { next, caret: s + insertion.length };
}
