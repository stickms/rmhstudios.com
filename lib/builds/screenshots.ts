/**
 * Screenshots of a User Build (s07-17), the pure half: the cap, the rules a saved list must meet and the reorder
 * helper. Client-safe; the writes and reads are in `screenshots.server.ts`.
 *
 * A screenshot is an upload from the `build` surface plus a description. The description is what a screen reader
 * reads, so a screenshot without one is never saved (the form holds it back and the server refuses it).
 */

/** Most screenshots one build carries. */
export const MAX_SCREENSHOTS = 8;
/** Longest description, and the column's width. */
export const SCREENSHOT_DESCRIPTION_MAX = 500;
/** Longest stored image address. */
export const SCREENSHOT_URL_MAX = 500;
/** Most pixels either side of a stored image can claim (the `build` surface stores one 1280 px variant). */
export const SCREENSHOT_DIMENSION_MAX = 10_000;

/** One screenshot as the build page, the editor and the public API carry it. */
export interface ScreenshotView {
  url: string;
  width: number;
  height: number;
  description: string;
}

/** A screenshot as the owner saves it. */
export type ScreenshotInput = ScreenshotView;

export type ScreenshotProblem =
  | {
      code: 'TOO_MANY';
      max: number;
    }
  | {
      code: 'DESCRIPTION_REQUIRED';
      index: number;
    }
  | {
      code: 'DESCRIPTION_TOO_LONG';
      index: number;
    }
  | {
      code: 'DUPLICATE';
      index: number;
    };

/**
 * The first reason a list cannot be saved, or null. Order matters for the message the owner sees: the cap first,
 * then the first undescribed screenshot (its position in the list, from 0), then an over-long description, then a
 * picture listed twice.
 */
export function screenshotProblem(items: readonly ScreenshotInput[]): ScreenshotProblem | null {
  if (items.length > MAX_SCREENSHOTS)
    return {
      code: 'TOO_MANY',
      max: MAX_SCREENSHOTS,
    };
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.description.trim().length === 0)
      return {
        code: 'DESCRIPTION_REQUIRED',
        index: i,
      };
  }
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.description.trim().length > SCREENSHOT_DESCRIPTION_MAX) {
      return {
        code: 'DESCRIPTION_TOO_LONG',
        index: i,
      };
    }
  }
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const url = items[i]!.url;
    if (seen.has(url))
      return {
        code: 'DUPLICATE',
        index: i,
      };
    seen.add(url);
  }
  return null;
}

/** A copy of the list with the item at `from` moved to `to`; an index outside the list leaves it as it was. */
export function moveScreenshot<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length || from === to) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

/** The index a viewer lands on when stepping `by` from `index`, wrapping at both ends. */
export function stepIndex(index: number, by: 1 | -1, length: number): number {
  if (length <= 0) return 0;
  return (index + by + length) % length;
}

/**
 * What an arrow key does in the viewer. Left and Right follow reading direction, so in a right-to-left language Left
 * moves on and Right goes back; Home and End jump to the ends. Any other key is the dialog's own.
 */
export function viewerKeyAction(key: string, rtl: boolean): 'next' | 'previous' | 'first' | 'last' | null {
  if (key === 'ArrowRight') return rtl ? 'previous' : 'next';
  if (key === 'ArrowLeft') return rtl ? 'next' : 'previous';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return null;
}
