/**
 * Light / dark for RMH Music — the pure half (no DOM, no storage).
 *
 * The app opens in the system's colour scheme (`prefers-color-scheme`) until the learner picks
 * one with the header toggle; the pick is stored under {@link MODE_STORAGE_KEY} as
 * `{"dark":true}` or `{"dark":false}`.
 *
 * The stored shape is the one the site's pre-paint script already reads: `/rmhmusic` is an
 * entry in `APP_ROUTE_THEME_BG` (`stores/themeStore.ts`) with `darkFlag: 'dark'` and
 * `system: true`, so before any bundle loads the script paints the document ground and stamps
 * `data-app-dark` on `<html>` from this same value, and `rmhmusic.css` keys the palette off that
 * attribute. A boolean wins; anything else (nothing stored, another app's junk, unparsable
 * JSON) falls back to the system preference — which is exactly how that script resolves it, so
 * the server-rendered page, the pre-paint script and this module can never disagree.
 */

export type Mode = 'light' | 'dark';

/** The localStorage key the learner's choice lives under (also named in `APP_ROUTE_THEME_BG`). */
export const MODE_STORAGE_KEY = 'rmhmusic-mode';

/**
 * The mode to show: a stored choice wins, anything else follows the system.
 * `stored` is the raw localStorage value (or null when there is none or storage is blocked).
 */
export function resolveMode(stored: string | null, prefersDark: boolean): Mode {
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        const dark = (parsed as { dark?: unknown }).dark;
        if (typeof dark === 'boolean') return dark ? 'dark' : 'light';
      }
    } catch {
      // Not ours, or corrupted: follow the system.
    }
  }
  return prefersDark ? 'dark' : 'light';
}

/** The value stored for an explicit choice. */
export function serializeMode(mode: Mode): string {
  return JSON.stringify({ dark: mode === 'dark' });
}
