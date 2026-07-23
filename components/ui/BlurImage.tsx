'use client';

import { ImgHTMLAttributes, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { buildOptimizedUrl, generateSrcSet, isOptimizable } from './OptimizedImage';

interface BlurImageProps extends Omit<
 ImgHTMLAttributes<HTMLImageElement>,
 'srcSet' | 'placeholder'
> {
 /** Image source URL (CDN, /api/feed/image/..., or external). */
 src: string;
 /** Alt text. */
 alt: string;
 /** object-fit behaviour of the rendered image (default 'cover'). */
 fit?: 'cover' | 'contain';
 /** Largest size this image is displayed at — drives the default src + `sizes`. */
 width?: number;
 /** Quality 1-100 for the full image (default 80). */
 quality?: number;
 /** `sizes` attribute for responsive srcSet (default '100vw'). */
 sizes?: string;
 /** Classes for the wrapper element. */
 className?: string;
 /** Classes for the <img> element itself. */
 imgClassName?: string;
 /**
 * Intrinsic aspect ratio (`width / height`). When set, the wrapper reserves a
 * box of this shape and the image fills it, so nothing shifts when the image
 * finishes loading. Leave unset when the ratio isn't known — the image then
 * sizes to its natural dimensions as before.
 */
 aspectRatio?: number;
 /**
 * Fires once with the image's decoded pixel size (from a `load` event or a
 * cache hit). Lets callers learn the ratio of legacy images so later renders
 * can reserve space for them.
 */
 onNaturalSize?: (width: number, height: number) => void;
}

// A tiny, heavily-compressed variant used as the blurred placeholder.
const PLACEHOLDER_WIDTH = 32;
const PLACEHOLDER_QUALITY = 30;

/**
 * Progressive "blur-up" image: a tiny blurred placeholder paints immediately,
 * then the full responsive image fades in once it has decoded. On slow
 * connections this gives instant visual feedback and — combined with the
 * responsive srcSet — avoids shipping full-resolution images into small slots.
 *
 * Static local assets that can't be resized are rendered as a plain <img>.
 */
export function BlurImage({
 src,
 alt,
 fit = 'cover',
 width,
 quality = 80,
 sizes = '100vw',
 className = '',
 imgClassName = '',
 loading = 'lazy',
 aspectRatio,
 onLoad,
 onNaturalSize,
 style,
 ...rest
}: BlurImageProps) {
 const imgRef = useRef<HTMLImageElement>(null);
 const [loaded, setLoaded] = useState(false);

 const reportSize = (img: HTMLImageElement | null) => {
 if (img && img.naturalWidth > 0) onNaturalSize?.(img.naturalWidth, img.naturalHeight);
 };

 // If the image is already cached the browser fires `load` before React
 // attaches the handler, so reconcile from `.complete` after mount.
 useEffect(() => {
 if (imgRef.current?.complete) {
 setLoaded(true);
 reportSize(imgRef.current);
 }
 // reportSize/onNaturalSize are stable enough for this reconcile-on-src effect.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [src]);

 const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';

 if (!src) return null;

 const optimizable = isOptimizable(src);
 const fullSrc = optimizable ? buildOptimizedUrl(src, width || 800, quality) : src;
 const srcSet = optimizable ? generateSrcSet(src, quality) : undefined;
 const placeholderSrc = optimizable
 ? buildOptimizedUrl(src, PLACEHOLDER_WIDTH, PLACEHOLDER_QUALITY)
 : undefined;

 // With a known ratio the wrapper reserves the box and the image fills it, so
 // the layout is stable before/after load. Without one, the image sizes itself.
 const reserve = typeof aspectRatio === 'number' && aspectRatio > 0;

 return (
 <span
 className={cn('relative block overflow-hidden', className)}
 style={reserve ? { aspectRatio: String(aspectRatio), ...style } : style}
 >
 {/* Skeleton behind everything so there's always a placeholder holding the
 space — even for non-optimizable images with no blur preview. */}
 {!loaded && (
 <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-site-surface" />
 )}
 {placeholderSrc && !loaded && (
 <img
 src={placeholderSrc}
 alt=""
 aria-hidden="true"
 draggable={false}
 // Match the main image's loading mode so a below-fold card's tiny blur
 // placeholder doesn't fire an eager request during hydration (it stayed
 // eager while the full image was already lazy).
 loading={loading}
 decoding="async"
 className={cn(
 'pointer-events-none absolute inset-0 h-full w-full scale-110 blur-xl',
 fitClass,
 )}
 />
 )}
 <img
 ref={imgRef}
 src={fullSrc}
 srcSet={srcSet}
 sizes={srcSet ? sizes : undefined}
 alt={alt}
 loading={loading}
 decoding="async"
 onLoad={(e) => {
 setLoaded(true);
 reportSize(e.currentTarget);
 onLoad?.(e);
 }}
 className={cn(
 fitClass,
 'transition-opacity duration-300',
 loaded ? 'opacity-100' : 'opacity-0',
 reserve && 'absolute inset-0 h-full w-full',
 imgClassName,
 )}
 {...rest}
 />
 </span>
 );
}
