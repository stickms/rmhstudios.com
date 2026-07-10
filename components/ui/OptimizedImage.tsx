import { ImgHTMLAttributes, memo } from 'react';

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'srcSet'> {
  /** Image source URL */
  src: string;
  /** Alt text */
  alt: string;
  /** Desired display width — used to pick the best size */
  width?: number;
  /** Desired display height */
  height?: number;
  /** Layout mode: 'fullWidth' makes image fill container */
  layout?: 'fullWidth' | 'fixed' | 'constrained';
  /** Image quality 1-100 (default 80) */
  quality?: number;
  /** Output format override (auto-negotiated via Accept header if omitted) */
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
}

// Breakpoints for responsive srcSet
const WIDTHS = [320, 480, 640, 800, 1024, 1280, 1600];

// Internal routes that resize/re-encode on demand via query params (w/h/q/f).
const RESIZABLE_PREFIXES = [
  '/api/admin/curated-builds/image/',
  '/api/feed/image/',
  '/api/library/cover/',
];

/**
 * Build an optimized URL for a given source.
 * - Internal resizable routes (curated builds, feed images): append query params
 * - Other local/static paths: serve as-is (no optimization available)
 * - External / CDN https images: route through /api/image-proxy
 */
export function buildOptimizedUrl(src: string, w?: number, q?: number, f?: string): string {
  // Internal routes that support on-demand optimization — append query params.
  if (RESIZABLE_PREFIXES.some((p) => src.startsWith(p))) {
    const params = new URLSearchParams();
    if (w) params.set('w', String(w));
    if (q) params.set('q', String(q));
    if (f) params.set('f', f);
    const qs = params.toString();
    return qs ? `${src}?${qs}` : src;
  }

  // Local/static paths (e.g. /images/...) — serve as-is, no optimization available
  if (src.startsWith('/')) {
    return src;
  }

  // External URL — proxy through our optimizer
  const params = new URLSearchParams();
  params.set('url', src);
  if (w) params.set('w', String(w));
  if (q) params.set('q', String(q));
  if (f) params.set('f', f);
  return `/api/image-proxy?${params.toString()}`;
}

/** True if `src` can be resized/re-encoded by our optimizer (so a tiny blur
 *  placeholder and a responsive srcSet are available). Static local assets
 *  can't be, so callers fall back to serving them as-is. */
export function isOptimizable(src: string): boolean {
  if (RESIZABLE_PREFIXES.some((p) => src.startsWith(p))) return true;
  return !src.startsWith('/');
}

export function generateSrcSet(src: string, quality?: number, format?: string): string {
  return WIDTHS
    .map((w) => `${buildOptimizedUrl(src, w, quality, format)} ${w}w`)
    .join(', ');
}

/**
 * Optimized image component that serves resized/converted images
 * via Sharp on the server. Generates responsive srcSet for all images.
 */
function OptimizedImageImpl({
  src,
  alt,
  width,
  height,
  layout = 'constrained',
  quality = 80,
  format,
  className,
  loading = 'lazy',
  ...rest
}: OptimizedImageProps) {
  if (!src) return null;

  // Static local paths can't be optimized — skip srcSet
  const srcSet = isOptimizable(src) ? generateSrcSet(src, quality, format) : undefined;

  // Default sizes attribute based on layout
  const sizes =
    layout === 'fullWidth'
      ? '100vw'
      : width
        ? `(max-width: ${width}px) 100vw, ${width}px`
        : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

  // Optimized default src (pick a reasonable middle size)
  const defaultSrc = buildOptimizedUrl(src, width || 800, quality, format);

  return (
    <img
      src={defaultSrc}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      width={layout !== 'fullWidth' ? width : undefined}
      height={layout !== 'fullWidth' ? height : undefined}
      loading={loading}
      decoding="async"
      className={className}
      {...rest}
    />
  );
}

/**
 * Memoized: images recur throughout feed/library/build grids, so skipping
 * re-renders when props are unchanged avoids redundant srcSet recomputation.
 */
export const OptimizedImage = memo(OptimizedImageImpl);
