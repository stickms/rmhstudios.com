/**
 * Light / dark for RMH Med Schools: the pure half (no DOM, no storage). The browser half is
 * `ui/shell/useMedMode.ts`; the shape and the reasoning are RMH Music's (`lib/rmhmusic/learn/mode.ts`).
 *
 * The app opens in the system's colour scheme until the visitor picks one with the top bar's toggle; the pick is stored
 * on this device only (never the account, never the site Day/Night edition) under {@link MODE_STORAGE_KEY} as
 * `{"dark":true}` or `{"dark":false}`. That is the shape the site's pre-paint script already reads: `/med` is
 * an entry in `APP_ROUTE_THEME_BG` (`stores/themeStore.ts`) with `darkFlag: 'dark'` and `system: true`.
 */

export type Mode = 'light' | 'dark';

/** The localStorage key the choice lives under (also named in `APP_ROUTE_THEME_BG` and the device registry). */
// Keeps the pre-rename route name (the URL is now /med) so a saved light/dark choice survives the rename.
export const MODE_STORAGE_KEY = 'rmh-medschool-mode';

/** The mode to show: a stored boolean wins, anything else (nothing, junk, blocked storage) follows the system. */
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
