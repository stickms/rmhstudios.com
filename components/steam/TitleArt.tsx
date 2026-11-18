import { OptimizedImage } from '@/components/ui/OptimizedImage';
import type { CuratedBuild } from '@/lib/builds/curated';
import { cn } from '@/lib/utils';

/**
 * `sizes` for art in a `.stm-capsules` grid (steam.css): `auto-fill` columns of at
 * least 110px below 767px — a third of a phone — and 150–300px above. Without it
 * a capsule's `sizes` came from its 240px intrinsic width, which on a 3x phone
 * asked for 720 device pixels and fetched the 960 variant into a 111px tile.
 */
export const CAPSULE_SIZES =
  '(max-width: 767px) 34vw, 240px';

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
  sizes,
}: {
  build: Pick<
    CuratedBuild,
    | 'title'
    | 'thumbnailUrl'
    | 'hue'
  >;
  width: number;
  height: number;
  className?: string;
  /** The slot's rendered width, when CSS draws it narrower than `width`. */
  sizes?: string;
}) {
  if (
    build.thumbnailUrl
  ) {
    return (
      <OptimizedImage
        src={
          build.thumbnailUrl
        }
        alt=""
        width={
          width
        }
        height={
          height
        }
        sizes={
          sizes
        }
        className={cn(
          'stm-art',
          className,
        )}
        // The site's media-reveal script stamps `data-loaded` on an <img> as it
        // finishes; art above the fold can finish before hydration. Expected.
        suppressHydrationWarning
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'stm-art stm-art-tile',
        className,
      )}
      style={{
        background: `hsl(${build.hue} 32% 22%)`,
      }}
    >
      {build.title.charAt(
        0,
      )}
    </span>
  );
}
