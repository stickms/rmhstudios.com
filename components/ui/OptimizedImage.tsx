import { ImgHTMLAttributes, memo, useState } from 'react';
import { IMAGE_VARIANTS, variantUrl } from '@/lib/images/variants.gen';

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
 /**
 * Mark this image as the page's LCP candidate: `fetchpriority=high`, eager
 * loading and a synchronous decode. Without it the browser has to finish
 * layout before it learns a hero image matters, and that wait IS what LCP
 * measures.
 *
 * **At most one per page.** A second "priority" image splits the bandwidth the
 * first one was given and halves the benefit; `decoding="sync"` on a large
 * image also blocks the main thread, which is only ever worth it for the one
 * element the metric is about. Never set it on a list item.
 */
 priority?: boolean;
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

 // Static assets under public/images/** with build-time variants (OPT-24).
 // `scripts/gen-image-variants.ts` emits /images/_variants/<stem>-<w>.webp and
 // records what it wrote in variants.gen.ts, so this only ever points at a
 // file that exists — an image missing from the manifest falls through to the
 // as-is branch below and behaves exactly as it did before.
 const entry = w ? IMAGE_VARIANTS[src] : undefined;
 if (entry) {
 // Smallest variant that still covers the requested width; otherwise the
 // largest one we have (never upscale past the source).
 const pick = entry.widths.find((candidate) => candidate >= w!) ?? entry.widths.at(-1)!;
 return variantUrl(src, pick) ?? src;
 }

 // Other local/static paths — serve as-is, no optimization available.
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
 * placeholder and a responsive srcSet are available). Static local assets
 * can't be, so callers fall back to serving them as-is. */
export function isOptimizable(src: string): boolean {
 if (RESIZABLE_PREFIXES.some((p) => src.startsWith(p))) return true;
 // Static art with build-time variants (OPT-24) is resizable too — it just
 // resolves to a pre-generated file instead of an on-demand resize.
 if (IMAGE_VARIANTS[src]) return true;
 return !src.startsWith('/');
}

export function generateSrcSet(src: string, quality?: number, format?: string): string {
 // A build-time-variant image advertises exactly the widths that were
 // generated. Running it through `WIDTHS` instead would emit descriptors that
 // lie — `…-640.webp 480w` claims a 640px file is 480px wide, and the browser
 // picks its candidate from the descriptor, not from the file.
 const entry = IMAGE_VARIANTS[src];
 if (entry) {
 return entry.widths.map((w) => `${variantUrl(src, w)} ${w}w`).join(', ');
 }
 return WIDTHS
 .map((w) => `${buildOptimizedUrl(src, w, quality, format)} ${w}w`)
 .join(', ');
}

/**
 * The AVIF srcSet for a build-time-variant image, or null when there isn't one.
 *
 * `scripts/gen-image-variants.ts` emits every width in **both** AVIF and WebP, so
 * this is always available for a manifest-listed path and is always exactly the
 * same width set as {@link generateSrcSet}. Measured on the shipped art: 2.93 MB
 * of AVIF against 4.38 MB of WebP, i.e. **~33% less** for the same pixels.
 *
 * Returns null (and the caller renders a bare `<img>`) for anything not in the
 * manifest — an on-demand resize route or an external URL, where the format is
 * negotiated by the optimizer instead and a second `<source>` would just be a
 * duplicate request waiting to happen.
 */
function avifSrcSet(src: string): string | null {
 const entry = IMAGE_VARIANTS[src];
 if (!entry) return null;
 return entry.widths.map((w) => `${variantUrl(src, w, 'avif')} ${w}w`).join(', ');
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
 priority = false,
 onError,
 ...rest
}: OptimizedImageProps) {
 // Variant art is a pre-generated FILE, and the manifest that names it ships
 // committed while the files themselves are gitignored and written by
 // `pnpm images:variants`. A build path that skips that step leaves every entry
 // in the manifest pointing at a 404 — and because both `src` and `srcSet` here
 // resolve to variant URLs, there is nothing left to fall back to and the image
 // breaks outright. On the first error we drop back to the untouched master,
 // which is always on disk. Tracked by VALUE rather than a boolean so a changed
 // `src` stops matching on its own and re-attempts the variants, instead of a
 // recycled element inheriting the previous image's failure.
 const [failedSrc, setFailedSrc] = useState<string | null>(null);
 const degraded = failedSrc === src;

 if (!src) return null;

 // Static local paths can't be optimized — skip srcSet
 const srcSet = !degraded && isOptimizable(src) ? generateSrcSet(src, quality, format) : undefined;

 // Default sizes attribute based on layout
 const sizes =
 layout === 'fullWidth'
 ? '100vw'
 : width
 ? `(max-width: ${width}px) 100vw, ${width}px`
 : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

 // Optimized default src (pick a reasonable middle size)
 const defaultSrc = degraded ? src : buildOptimizedUrl(src, width || 800, quality, format);

 // AVIF is offered through a `<source>` rather than mixed into `srcSet`, because
 // `srcSet` selects on WIDTH and `<source type>` selects on FORMAT — a single
 // srcSet cannot express "prefer AVIF, fall back to WebP at the same widths".
 // Skipped when the caller pinned an explicit `format`, and when the image has
 // already failed once and degraded to its master.
 const avif = !degraded && !format ? avifSrcSet(src) : null;

 const img = (
 <img
 src={defaultSrc}
 srcSet={srcSet}
 sizes={srcSet ? sizes : undefined}
 alt={alt}
 width={layout !== 'fullWidth' ? width : undefined}
 height={layout !== 'fullWidth' ? height : undefined}
 // `priority` overrides the lazy/async defaults rather than reading them:
 // an eager fetch that the browser still schedules at Low priority buys
 // nothing, so the three attributes move together or not at all.
 fetchPriority={priority ? 'high' : undefined}
 loading={priority ? 'eager' : loading}
 decoding={priority ? 'sync' : 'async'}
 className={className}
 onError={(e) => {
 if (!degraded) setFailedSrc(src);
 onError?.(e);
 }}
 {...rest}
 />
 );

 if (!avif) return img;

 // The `<img>` keeps its own `srcSet` (WebP) and stays the styled, measured,
 // error-handling element — `<picture>` is a selection wrapper with no box of its
 // own, so `className`, `width`/`height` and any parent layout keep working
 // untouched. A browser that doesn't understand `image/avif` ignores the
 // `<source>` and uses the `<img>` exactly as before, which is why this is
 // additive rather than a swap.
 //
 // Note the `onError` degrade path lands on the `<img>`: if the variant files are
 // missing (a build that skipped `pnpm images:variants`) the AVIF source is also
 // missing, `avif` recomputes to null on the re-render, and the whole element
 // falls back to the untouched master.
 return (
 <picture>
 <source type="image/avif" srcSet={avif} sizes={sizes} />
 {img}
 </picture>
 );
}

/**
 * Memoized: images recur throughout feed/library/build grids, so skipping
 * re-renders when props are unchanged avoids redundant srcSet recomputation.
 */
export const OptimizedImage = memo(OptimizedImageImpl);
