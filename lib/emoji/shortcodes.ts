export type ShortcodeMap = Record<string, string>;

let cache: ShortcodeMap | null = null;
let pending: Promise<ShortcodeMap> | null = null;

/** The map if already loaded, else null. Used for synchronous keystroke-time conversion. */
export function getShortcodesSync(): ShortcodeMap | null {
  return cache;
}

/** Lazy-load the shortcode JSON (kept out of the main bundle via dynamic import). */
export function loadShortcodes(): Promise<ShortcodeMap> {
  if (cache) return Promise.resolve(cache);
  pending ??= import('./shortcodes.json').then((mod) => {
    cache = mod.default as ShortcodeMap;
    return cache;
  });
  return pending;
}
