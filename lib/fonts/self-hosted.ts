/**
 * Preloading a self-hosted display face.
 *
 * Every display family the site uses is self-hosted with `font-display:
 * optional` (`scripts/gen-self-hosted-fonts.ts`, `app/fonts/`): the face gets a
 * ~100ms window and, if it misses, the fallback stays for the rest of that page
 * view — no swap, ever. That trade only stays invisible if the face usually
 * MAKES the window, so a route whose first screen is set in one preloads it: the
 * download starts with the document instead of after the stylesheet has been
 * parsed and the text laid out. (Chrome also holds first render for a preloaded
 * `optional` face for that window, which is the behaviour we want.)
 *
 * Preload only the Latin file of the one face the first screen needs. A preload
 * is a high-priority fetch whether or not the page uses it, and the other
 * subsets are behind `unicode-range` for a reason.
 *
 * This replaces `lib/fonts/deferred.ts`, which appended a Google Fonts
 * stylesheet on idle — guaranteeing that every heading set in one of those
 * faces painted in the fallback first and swapped in front of the reader
 * (docs/fouc-audit-2026-10-06.md §10).
 */

/**
 * A `<link rel="preload">` for a `.woff2` URL from a `?url` import, e.g.
 *
 * ```ts
 * import outfitLatin from '@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?url';
 * links: [preloadFont(outfitLatin)]
 * ```
 *
 * `crossOrigin` is required even same-origin: fonts are fetched in CORS mode,
 * and a preload without it is a second, uncredentialed fetch instead of a warm
 * cache hit. The literal types matter for TanStack's `head().links`.
 */
export function preloadFont(href: string) {
  return {
    rel: 'preload',
    as: 'font',
    type: 'font/woff2',
    href,
    crossOrigin: 'anonymous',
  } as const;
}
