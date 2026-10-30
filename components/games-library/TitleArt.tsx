'use client';

import { OptimizedImage } from '@/components/ui/OptimizedImage';
import type { CuratedBuild } from '@/lib/builds/curated';
import { cn } from '@/lib/utils';

/**
 * A title's card art: the portrait image when it has one, else a flat tile tinted
 * from its stable hue with the initial. Decorative — the title is always written
 * out next to it — so the image carries no alt text.
 */
export function TitleArt({
  build,
  width,
  height,
  className,
}: {
  build: Pick<CuratedBuild, 'title' | 'thumbnailUrl' | 'hue'>;
  width: number;
  height: number;
  className?: string;
}) {
  if (build.thumbnailUrl) {
    return (
      <OptimizedImage
        src={build.thumbnailUrl}
        alt=""
        width={width}
        height={height}
        className={cn('object-cover', className)}
        // The site's media-reveal script stamps `data-loaded` on an <img> as it
        // finishes loading. Art above the fold can finish before hydration, so the
        // client DOM has an attribute the server HTML lacks; that difference is
        // expected, not a bug.
        suppressHydrationWarning
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex items-center justify-center font-display text-lg font-semibold text-site-media-ink',
        className,
      )}
      style={{ background: `hsl(${build.hue} 32% 20%)` }}
    >
      {build.title.charAt(0)}
    </span>
  );
}
