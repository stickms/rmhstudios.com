import { ImgHTMLAttributes } from 'react';

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

/**
 * Build an optimized URL for a given source.
 * - Internal curated build images: append query params to the existing URL
 * - External images: route through /api/image-proxy
 */
function buildOptimizedUrl(src: string, w?: number, q?: number, f?: string): string {
  // Curated build images — append optimization query params
  if (src.startsWith('/api/admin/curated-builds/image/')) {
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

function generateSrcSet(src: string, quality?: number, format?: string): string {
  return WIDTHS
    .map((w) => `${buildOptimizedUrl(src, w, quality, format)} ${w}w`)
    .join(', ');
}

/**
 * Optimized image component that serves resized/converted images
 * via Sharp on the server. Generates responsive srcSet for all images.
 */
export function OptimizedImage({
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
  const isLocalStatic = src.startsWith('/') && !src.startsWith('/api/admin/curated-builds/image/');
  const srcSet = isLocalStatic ? undefined : generateSrcSet(src, quality, format);

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
