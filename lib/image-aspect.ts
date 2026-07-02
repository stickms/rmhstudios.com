import { parseImageDimensions } from '@/lib/storage/keys';

/**
 * Intrinsic-size resolution for feed images, used to reserve layout space before
 * an image loads so it never pushes content down on arrival (cumulative layout
 * shift). Two sources, in priority order:
 *
 *  1. A `-WxH` tag baked into the URL at upload time (see `withImageDimensions`)
 *     — available immediately, even on first paint. New uploads always have it.
 *  2. The size measured from a previously-loaded `<img>` this session — the
 *     fallback for legacy images uploaded before dimensions were tagged. Cached
 *     so scrolling back to (or opening the detail view of) an image reserves
 *     space without a second shift.
 */

export type ImageSize = { width: number; height: number };

// url (sans query) → decoded natural size, learned from a loaded <img>.
const measured = new Map<string, ImageSize>();

/** Drop any query string so the CDN-resized and origin URLs share one cache key. */
function baseKey(url: string): string {
  return url.split('?')[0];
}

/**
 * The known intrinsic size for an image, or `undefined` if it can't be
 * determined ahead of decoding. Carries absolute pixels (not just a ratio) so
 * callers can both reserve the aspect box and avoid upscaling small images.
 */
export function knownSize(url: string): ImageSize | undefined {
  return parseImageDimensions(url) ?? measured.get(baseKey(url));
}

/**
 * Record the natural size of a freshly-decoded image so later renders of the
 * same URL can reserve space for it. No-ops on absurd/zero sizes.
 */
export function rememberSize(url: string, naturalWidth: number, naturalHeight: number): void {
  if (naturalWidth > 0 && naturalHeight > 0) {
    measured.set(baseKey(url), { width: naturalWidth, height: naturalHeight });
  }
}
