import { memo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeOff } from 'lucide-react';
import { BlurImage } from '@/components/ui/BlurImage';
import { GifEmbed } from '@/components/feed/GifEmbed';
import { knownSize } from '@/lib/image-aspect';
import { AltChip } from '@/components/feed/AltChip';

/** Tiles rendered inline; anything past this is summarised as "+N". */
const MAX_TILES = 4;

/**
 * Aspect clamps for a lone image. A feed preview is a glance, not the artwork: a 1:4 vertical panorama would otherwise
 * own three screens of the feed and push every other post out of reach. Wide images keep their shape up to 16:9 and tall
 * ones are cropped to 4:5 by the tile; the full frame is one tap away on the post page, which is where the lightbox lives.
 */
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 16 / 9;
/** Used until an image's intrinsic size is known (legacy uploads carry none). */
const FALLBACK_RATIO = 16 / 10;

/**
 * The aspect box a single image renders in. Always a NUMBER, never undefined: reserving the box ahead of decode makes a
 * late image free of layout shift.
 */
function tileRatio(url: string): number {
  const size = knownSize(url);
  if (!size) return FALLBACK_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, size.width / size.height));
}

interface FeedMediaProps {
  imageUrls?: string[];
  /** Per-image alt text, aligned by index with `imageUrls` (may be shorter). */
  imageAlts?: string[];
  gifUrl?: string;
  /** Author-flagged sensitive media: covered until the post itself is opened. */
  sensitive?: boolean;
}

/** S4: a picture is `--site-bg-subtle` with a 1px border and the 8px radius. */
const FRAME = 'overflow-hidden rounded-site border border-site-border bg-site-bg-subtle';

/**
 * Post media in a feed row.
 *
 * Deliberately NON-INTERACTIVE: the row's body is a single `<Link>` to the post, so there is no lightbox button and no GIF
 * source link here (nesting either inside an anchor is invalid HTML). A tap on the media opens the post, where the full
 * grid (lightbox, alt text, reveal control) lives.
 *
 * Sensitive media is not blurred (R1, B2: no filter on the site tier) and is not fetched either: the reserved box holds a
 * solid cover with a static label, so the row is the height it will be once revealed and the picture never loads until
 * the post is opened.
 */
export const FeedMedia = memo(function FeedMedia({
  imageUrls,
  imageAlts,
  gifUrl,
  sensitive,
}: FeedMediaProps) {
  const { t } = useTranslation('feed');

  const urls = imageUrls ?? [];
  if (urls.length === 0 && !gifUrl) return null;

  const tiles = urls.slice(0, MAX_TILES);
  const overflow = urls.length - tiles.length;
  const single = tiles.length === 1;
  const ratio = single ? tileRatio(tiles[0]!) : undefined;

  if (sensitive) {
    return (
      <div
        className={`${FRAME} mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-site-text`}
        style={{ aspectRatio: ratio ?? FALLBACK_RATIO } as CSSProperties}
      >
        <EyeOff className="size-4" aria-hidden />
        {t('sensitive-content', { defaultValue: 'Sensitive content' })}
      </div>
    );
  }

  return (
    <div className="mt-3">
      {gifUrl && <GifEmbed url={gifUrl} linked={false} />}
      {tiles.length > 0 && (
        <div
          className={`grid gap-0.5 ${FRAME} ${single ? 'grid-cols-1' : 'grid-cols-2'}`}
          style={single ? ({ aspectRatio: ratio } as CSSProperties) : undefined}
        >
          {tiles.map((url, i) => (
            <div
              key={url}
              className={`relative overflow-hidden bg-site-bg-subtle ${
                single
                  ? 'h-full'
                  : tiles.length === 3 && i === 2
                    ? 'col-span-2 aspect-[2.4]'
                    : 'aspect-square'
              }`}
            >
              <BlurImage
                src={url}
                alt={imageAlts?.[i]?.trim() || ''}
                fit="cover"
                width={single ? 800 : 400}
                sizes={
                  single ? '(max-width: 34rem) 100vw, 544px' : '(max-width: 34rem) 50vw, 272px'
                }
                // Pinned rather than `h-full`: the tile's height comes from its aspect ratio, and a percentage
                // height against that resolves inconsistently across engines. `inset-0` needs no such thing.
                className="absolute inset-0"
                imgClassName="h-full w-full"
              />
              <AltChip alt={imageAlts?.[i]} />
              {i === tiles.length - 1 && overflow > 0 && (
                <span
                  className="absolute inset-0 grid place-content-center bg-site-bg text-base font-semibold tabular-nums text-site-text opacity-90"
                  aria-hidden
                >
                  +{overflow}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
