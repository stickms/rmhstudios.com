'use client';

import { OptimizedImage } from '@/components/ui/OptimizedImage';
import type { CuratedBuild } from '@/lib/builds/curated';
import { cn } from '@/lib/utils';

/**
 * A title's card art, Steam-style: the portrait image when it has one, else a flat
 * tile tinted from its stable hue with the initial. Decorative — the title is always
 * written out next to it — so the image carries no alt text.
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
        className={cn('stm-art', className)}
        // The site's media-reveal script stamps `data-loaded` on an <img> as it
        // finishes; art above the fold can finish before hydration. Expected.
        suppressHydrationWarning
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn('stm-art stm-art-tile', className)}
      style={{ background: `hsl(${build.hue} 32% 22%)` }}
    >
      {build.title.charAt(0)}
    </span>
  );
}
