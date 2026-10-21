/**
 * Request-parameter normalisation for the on-demand image-variant routes
 * (`/api/feed/image/*`, `/api/image-proxy`) — pure and client-safe.
 *
 * ## Why widths are snapped
 *
 * The routes used to accept any integer `w` (and `h`, and any `q`) up to 2048.
 * Every distinct tuple is a separate cache entry and a separate sharp encode, so
 * `?w=1`, `?w=2`, ... `?w=2048` is 2048 uncached encodes of one object from an
 * unauthenticated client — the feed route has no rate limit at all — and the
 * AVIF ones cost 0.3-0.8 s each (results/ws-6.md). A browser never needs that
 * freedom: `OptimizedImage` asks for a fixed ladder, and the rest is `sizePx *
 * 2` avatars and 32 px blur placeholders.
 *
 * So a requested width is rounded **up** to the next rung of {@link VARIANT_WIDTHS}
 * (up, so a request is never served smaller than it asked for) and the image is
 * resized to that rung. The rungs include every width the client emits today, so
 * for real traffic the bytes are unchanged; an odd width gets the next rung up,
 * which a browser downscales exactly as it would have downscaled the exact size.
 * Quality snaps to the nearest 5, which is below anything visible and keeps the
 * key space at 20 values instead of 100.
 */

/** The ladder. Dense where small images live (avatars), coarse where photos do. */
export const VARIANT_WIDTHS: readonly number[] = [
  16, 24, 32, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 448, 480, 512, 640, 768, 800,
  960, 1024, 1280, 1600, 1920, 2048,
];

/** Largest dimension any variant route will produce. */
export const VARIANT_MAX_DIMENSION = 2048;

/**
 * A `w` / `h` query value to a ladder rung, or `undefined` when absent or not a
 * positive integer (the route then applies no constraint on that axis, as it
 * does for a missing parameter).
 */
export function snapDimension(raw: string | null | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const capped = Math.min(n, VARIANT_MAX_DIMENSION);
  return VARIANT_WIDTHS.find((rung) => rung >= capped) ?? VARIANT_MAX_DIMENSION;
}

/** A `q` query value to 5..100 in steps of 5; the default (80) when absent/invalid. */
export function snapQuality(raw: string | null | undefined, fallback = 80): number {
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(Math.max(n, 1), 100);
  return Math.min(100, Math.max(5, Math.round(clamped / 5) * 5));
}
