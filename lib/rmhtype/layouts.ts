/**
 * Keyboard layouts for the touch-typing course (sprint 11, feature 11).
 *
 * Pure and client-safe. The course is written once, in QWERTY keys (`COURSE_SPEC`, `lessons.ts`). Every other layout
 * reaches it through **physical position**: a QWERTY key sits at a row and a column, and the key at the same place on
 * Dvorak, Colemak or AZERTY is the one that lesson teaches. Fingers follow position, never the character, so the
 * home-row lesson trains the same two fingers on every layout.
 *
 * The three letter rows come from `KEYBOARD_ROWS` (`keystats.ts`), which is also what the heatmap draws, so the
 * lesson keyboard and the heatmap can never disagree about where a key is. The digit row and the one extra key at the
 * right of the digit and home rows are written out here.
 */
import { KEYBOARD_ROWS, type TypingLayout } from '@/lib/rmhtype/keystats';
import type { FingerId } from '@/lib/rmhtype/lessons';

/** The prefix a layout's lesson ids carry. QWERTY has none, so its ids and every member's stars are unchanged. */
export const LAYOUT_ID_PREFIX: Record<TypingLayout, string> = {
  qwerty: '',
  azerty: 'az-',
  dvorak: 'dv-',
  colemak: 'cm-',
};

/** The unshifted digit-row keys (ten digits, then the one beside 0). */
const DIGIT_ROW: Record<TypingLayout, string> = {
  qwerty: '1234567890-',
  dvorak: '1234567890[',
  colemak: '1234567890-',
  // AZERTY's digits need Shift; these are what the bare keys print.
  azerty: '&é"\'(-è_çà',
};

/** The key past the last column of the top row (Dvorak keeps `/` and `?` here). */
const TOP_EDGE: Record<TypingLayout, string> = { qwerty: '', dvorak: '/', colemak: '', azerty: '' };

/** The key past the last column of the home row. */
const HOME_EDGE: Record<TypingLayout, string> = { qwerty: "'", dvorak: '-', colemak: "'", azerty: '' };

/** The same four rows with Shift held, by position. */
const SHIFT_ROWS: Record<TypingLayout, readonly string[]> = {
  qwerty: ['!@#$%^&*()_', 'QWERTYUIOP', 'ASDFGHJKL:"', 'ZXCVBNM<>?'],
  dvorak: ['!@#$%^&*(){', '"<>PYFGCRL?', 'AOEUIDHTNS_', ':QJKXBMWVZ'],
  colemak: ['!@#$%^&*()_', 'QWFPGJLUY:', 'ARSTDHNEIO"', 'ZXCVBKM<>?'],
  azerty: ['1234567890', 'AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN?./§'],
};

/** The four rows of a layout, top to bottom: the digit row, then the three letter rows plus the home-row edge key. */
export function keyboardRows(layout: TypingLayout): readonly string[] {
  const [top, home, bottom] = KEYBOARD_ROWS[layout];
  return [
    DIGIT_ROW[layout],
    (top ?? []).join('') + TOP_EDGE[layout],
    (home ?? []).join('') + HOME_EDGE[layout],
    (bottom ?? []).join(''),
  ];
}

/** The QWERTY rows, the reference every other layout is mapped from. */
const QWERTY_ROWS: readonly string[] = keyboardRows('qwerty');

/** The finger for a column, the same on every layout: positions, not characters. */
const FINGER_BY_COLUMN: readonly FingerId[] = [
  'left-pinky',
  'left-ring',
  'left-middle',
  'left-index',
  'left-index',
  'right-index',
  'right-index',
  'right-middle',
  'right-ring',
  'right-pinky',
];

export interface KeyPosition {
  row: number;
  col: number;
  /** Whether the character is struck with Shift held. */
  shift: boolean;
}

/** Where a character is on a layout, or `null` when the layout has no key for it. */
export function locate(layout: TypingLayout, char: string): KeyPosition | null {
  const rows = keyboardRows(layout);
  for (const [row, keys] of rows.entries()) {
    const col = [...keys].indexOf(char);
    if (col >= 0) return { row, col, shift: false };
  }
  const shifted = SHIFT_ROWS[layout];
  for (const [row, keys] of shifted.entries()) {
    const col = [...keys].indexOf(char);
    if (col >= 0) return { row, col, shift: true };
  }
  return null;
}

/** The unshifted key at a position of a layout, if there is one. */
function keyAt(layout: TypingLayout, row: number, col: number): string | undefined {
  return [...(keyboardRows(layout)[row] ?? '')][col];
}

/**
 * The key a QWERTY key's position holds on `layout`. A character that is not on a QWERTY key position (a capital, a
 * symbol) comes back unchanged: the caller decides what to do with it.
 */
export function mapKey(qwertyKey: string, layout: TypingLayout): string {
  if (layout === 'qwerty') return qwertyKey;
  for (const [row, keys] of QWERTY_ROWS.entries()) {
    const col = [...keys].indexOf(qwertyKey);
    if (col >= 0) return keyAt(layout, row, col) ?? qwertyKey;
  }
  return qwertyKey;
}

/** The unshifted key a character is struck on, on `layout`: `A` is the `a` key, `?` the key it shares with `/`. */
export function baseKeyOn(layout: TypingLayout, char: string): string | null {
  const at = locate(layout, char);
  return at ? (keyAt(layout, at.row, at.col) ?? null) : null;
}

/** The finger that presses the character's key on `layout`, by position. */
export function fingerForOn(layout: TypingLayout, char: string): FingerId | null {
  if (char === ' ') return 'thumb';
  const at = locate(layout, char);
  if (!at) return null;
  return FINGER_BY_COLUMN[at.col] ?? 'right-pinky';
}

/** Whether the character needs Shift on `layout`. */
export function needsShiftOn(layout: TypingLayout, char: string): boolean {
  return locate(layout, char)?.shift ?? false;
}

/** The pinky that holds Shift: the hand opposite the key being struck. `null` when no Shift is needed. */
export function shiftFingerForOn(layout: TypingLayout, char: string): FingerId | null {
  if (!needsShiftOn(layout, char)) return null;
  const finger = fingerForOn(layout, char);
  if (!finger) return null;
  return finger.startsWith('left') ? 'right-pinky' : 'left-pinky';
}
