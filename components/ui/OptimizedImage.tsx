import { Image } from '@unpic/react';
import type { ImageProps } from '@unpic/react';

/**
 * Drop-in optimized image component backed by @unpic/react.
 * Provides automatic lazy loading, width/height to prevent CLS,
 * and responsive srcset when served from a supported image CDN.
 */
export function OptimizedImage(props: ImageProps) {
  return <Image {...props} />;
}
