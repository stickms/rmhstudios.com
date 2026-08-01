'use client';

import { memo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeOff } from 'lucide-react';
import { BlurImage } from '@/components/ui/BlurImage';
import { GifEmbed } from '@/components/feed/GifEmbed';
import { knownSize } from '@/lib/image-aspect';

/** Tiles rendered inline; anything past this is summarised as "+N". */
const MAX_TILES = 4;

/**
 * Aspect clamps for a lone image. A feed preview is a glance, not the artwork:
 * a 1:4 vertical panorama would otherwise own three screens of the wheel and
 * push every other post out of reach. Wide images keep their shape up to 16:9
 * and tall ones are cropped to 4:5 by the tile — the full frame is one tap away
 * on the post page, which is where the lightbox lives.
 */
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 16 / 9;
/** Used until an image's intrinsic size is known (legacy uploads carry none). */
const FALLBACK_RATIO = 16 / 10;

/**
 * The aspect box a single image renders in. Always a NUMBER, never undefined:
 * the wheel caches every card's document centre and rebuilds that cache on any
 * content resize, so an image that arrives without a reserved box costs a
 * re-measure of every mounted slot on top of the layout shift it causes.
 * Reserving the box ahead of decode makes a late image free.
 */
function tileRatio(url: string): number {
  const size = knownSize(url);
  if (!size) return FALLBACK_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, size.width / size.height));
}

interface RmharkMediaProps {
  imageUrls?: string[];
  /** Per-image alt text, aligned by index with `imageUrls` (may be shorter). */
  imageAlts?: string[];
  gifUrl?: string;
  /** Author-flagged sensitive media — covered until the post itself is opened. */
  sensitive?: boolean;
}

/**
 * Post media on a radial feed card.
 *
 * Deliberately NON-INTERACTIVE: the whole card is a single `<Link>` to the post,
 * so there is no lightbox button and no GIF source link here — nesting either
 * inside the card's anchor is invalid HTML, and un-nesting it is what browsers
 * do instead of what we meant. A tap on the media opens the post, where the full
 * grid (lightbox, alt text, reveal control) lives.
 */
export const RmharkMedia = memo(function RmharkMedia({
  imageUrls,
  imageAlts,
  gifUrl,
  sensitive,
}: RmharkMediaProps) {
  const { t } = useTranslation('feed');

  const urls = imageUrls ?? [];
  if (urls.length === 0 && !gifUrl) return null;

  const tiles = urls.slice(0, MAX_TILES);
  const overflow = urls.length - tiles.length;
  const single = tiles.length === 1;
  const gridStyle = single
    ? ({ '--rmhark-media-ratio': String(tileRatio(tiles[0])) } as CSSProperties)
    : undefined;

  const media = (
    <>
      {gifUrl && <GifEmbed url={gifUrl} linked={false} />}
      {tiles.length > 0 && (
        <div
          className={`rmhark__media-grid${single ? ' rmhark__media-grid--single' : ''}`}
          style={gridStyle}
        >
          {tiles.map((url, i) => (
            <div key={url} className="rmhark__media-tile">
              <BlurImage
                src={url}
                alt={imageAlts?.[i]?.trim() || ''}
                fit="cover"
                width={single ? 800 : 400}
                sizes={
                  single ? '(max-width: 34rem) 100vw, 544px' : '(max-width: 34rem) 50vw, 272px'
                }
                // Pinned rather than `h-full`: the tile's height comes from its
                // `aspect-ratio`, and a percentage height against that resolves
                // inconsistently across engines. `inset-0` needs no such thing.
                className="absolute inset-0"
                imgClassName="h-full w-full"
              />
              {i === tiles.length - 1 && overflow > 0 && (
                <span className="rmhark__media-more" aria-hidden>
                  +{overflow}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (!sensitive) return <div className="rmhark__media">{media}</div>;

  // Sensitive media stays mounted (so the card keeps the height it will have
  // once revealed) but blurred, behind a static label rather than a reveal
  // button — the reveal control lives on the post page this card links to.
  return (
    <div className="rmhark__media rmhark__media--sensitive">
      <div className="rmhark__media-blur" aria-hidden>
        {media}
      </div>
      <span className="rmhark__media-cover">
        <EyeOff aria-hidden />
        {t('sensitive-content', { defaultValue: 'Sensitive content' })}
      </span>
    </div>
  );
});
