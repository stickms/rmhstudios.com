'use client';

import { ImgHTMLAttributes, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { buildOptimizedUrl, generateSrcSet, isOptimizable } from './OptimizedImage';

interface BlurImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'srcSet' | 'placeholder'> {
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
  ...rest
}: BlurImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // If the image is already cached the browser fires `load` before React
  // attaches the handler, so reconcile from `.complete` after mount.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, [src]);

  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';

  if (!src) return null;

  const optimizable = isOptimizable(src);
  const fullSrc = optimizable ? buildOptimizedUrl(src, width || 800, quality) : src;
  const srcSet = optimizable ? generateSrcSet(src, quality) : undefined;
  const placeholderSrc = optimizable
    ? buildOptimizedUrl(src, PLACEHOLDER_WIDTH, PLACEHOLDER_QUALITY)
    : undefined;

  return (
    <span className={cn('relative block overflow-hidden', className)}>
      {placeholderSrc && !loaded && (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={cn(
            'pointer-events-none absolute inset-0 h-full w-full scale-110 blur-xl',
            fitClass
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
        onLoad={() => setLoaded(true)}
        className={cn(
          fitClass,
          'transition-opacity duration-500',
          loaded ? 'opacity-100' : 'opacity-0',
          imgClassName
        )}
        {...rest}
      />
    </span>
  );
}
