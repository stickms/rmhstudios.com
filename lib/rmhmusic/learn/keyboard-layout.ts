/**
 * The on-screen piano's window — pure.
 *
 * The keyboard shows as many WHOLE white keys as fit at {@link MIN_WHITE_PX} or wider, between
 * {@link MIN_WHITE_KEYS} (a phone: one octave) and {@link MAX_WHITE_KEYS} (two octaves). The
 * count is decided by CSS container queries from the keyboard's own width
 * (`.rmm-keys` in components/rmhmusic/rmhmusic.css: one step per 44px), so the server render and
 * the first client render agree and nothing moves after mount; {@link whiteKeysFor} is the same
 * rule for code that needs to know which keys are in view (focus order), and the test pins the
 * two together.
 *
 * The window starts on a C; the octave buttons and the swipe strip move it one octave at a time
 * between {@link MIN_OCTAVE} and {@link MAX_OCTAVE}.
 */

export const MIN_WHITE_PX = 44;
export const MIN_WHITE_KEYS = 7;
export const MAX_WHITE_KEYS = 14;
/** The octave the window starts on: C4 (middle C) by default. */
export const DEFAULT_OCTAVE = 4;
export const MIN_OCTAVE = 2;
export const MAX_OCTAVE = 6;
/** A drag along the swipe strip shorter than this is not a swipe. */
export const SWIPE_MIN_PX = 40;
/** A black key's width as a share of a white key's (27px at the 44px minimum: over WCAG 2.5.8's 24px). */
export const BLACK_SHARE = 0.62;

const WHITE_SEMITONES = new Set([0, 2, 4, 5, 7, 9, 11]);

/** White keys shown at a keyboard width of `px` CSS pixels. */
export function whiteKeysFor(px: number): number {
  const n = Math.floor((Number.isFinite(px) ? px : 0) / MIN_WHITE_PX);
  return Math.max(MIN_WHITE_KEYS, Math.min(MAX_WHITE_KEYS, n));
}

export interface PianoKey {
  midi: number;
  black: boolean;
  /** White keys to the left of this key, inside the window. */
  whiteBefore: number;
}

/** The two octaves the window can show from `octave`'s C (the CSS shows the first N whites). */
export function windowKeys(octave: number): PianoKey[] {
  const first = 12 * (octave + 1);
  const out: PianoKey[] = [];
  let whites = 0;
  for (let midi = first; midi < first + 24; midi++) {
    const black = !WHITE_SEMITONES.has(midi % 12);
    out.push({ midi, black, whiteBefore: whites });
    if (!black) whites++;
  }
  return out;
}

/**
 * Whether a key is in view when `whites` white keys show. A black key counts only when the white
 * key to its right is in view too: the one past the last white would be a sliver at the clipped
 * edge, so the CSS collapses it (`.rmm-keys__black`, `--rmm-shown`) and it leaves the tab order.
 */
export function inView(key: PianoKey, whites: number): boolean {
  return key.whiteBefore < whites;
}

export function clampOctave(octave: number): number {
  return Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, Math.round(octave)));
}

/**
 * A swipe along the strip: −1 (to lower notes: the finger moved right, dragging the keys along),
 * +1 (to higher notes) or 0 (too short, or more up-and-down than sideways: a scroll).
 */
export function swipeShift(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 1.5 * Math.abs(dy)) return 0;
  return dx > 0 ? -1 : 1;
}

/**
 * The octave to open the window on so `midi` is in view, moving as little as it can from `octave`:
 * the same one when the key already shows, else the nearest window that does (clamped to the
 * range). A key no window can show leaves the window where it is. `whites` is how many white keys
 * fit ({@link whiteKeysFor}).
 */
export function octaveShowing(midi: number, octave: number, whites: number): number {
  let best = octave;
  let bestDistance = Infinity;
  for (let o = MIN_OCTAVE; o <= MAX_OCTAVE; o++) {
    const key = windowKeys(o).find((k) => k.midi === midi);
    if (!key || !inView(key, whites)) continue;
    const distance = Math.abs(o - octave);
    if (distance < bestDistance) {
      best = o;
      bestDistance = distance;
    }
  }
  return best;
}
