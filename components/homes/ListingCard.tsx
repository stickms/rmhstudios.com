/**
 * One listing in a Homes list, in one of two layouts.
 *
 * - `card`: a picture with its caption under it, for the grid (and every phone list).
 * - `row`: a small picture at the start and the caption beside it, one row on a rule, for the list column
 *   next to the map.
 *
 * Both follow the Steel picture recipe: the picture is `--site-bg-subtle` with a 1px border and the 8px
 * radius, and the text sits on the page with no box around it (R3). Nothing in the caption can be squeezed
 * into wrapping mid-phrase: the price and each fact are `whitespace-nowrap`, the facts wrap between
 * items, the title takes two lines, and the place and age share one meta line where the place truncates.
 *
 * The save control is a sibling of the link, not a child of it (a button inside an anchor is invalid and
 * made the whole card one ambiguous target). On a card it sits on the picture's top end corner as a 44px
 * media chip; the tenure and type that used to be badges in the opposite corner are words in the caption
 * now, so nothing shares the picture with it. In a row it sits at the end of the row.
 */
import { Link } from '@tanstack/react-router';
import { Globe, ImageOff, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Listing } from '@/lib/homes/types';
import {
  formatBaths,
  formatBeds,
  formatLocation,
  formatPostedAt,
  formatPrice,
  formatSqft,
  propertyTypeLabel,
  statusLabel,
} from '@/lib/homes/format';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FavoriteButton } from './FavoriteButton';

interface ListingCardProps {
  listing: Listing;
  onFavoriteChange?: (id: string, favorited: boolean) => void;
  active?: boolean;
  onHover?: (id: string | null) => void;
  /** Show status pill for non-active listings (used on the manage page). */
  showStatus?: boolean;
  layout?: 'card' | 'row';
}

export function ListingCard({
  listing,
  onFavoriteChange,
  active,
  onHover,
  showStatus,
  layout = 'card',
}: ListingCardProps) {
  const { t } = useTranslation('site');
  const location = formatLocation(listing);
  const posted = formatPostedAt(listing.createdAt, Date.now());
  const cover = listing.images[0];
  const row = layout === 'row';

  const tenure =
    listing.listingType === 'RENT'
      ? t('homes-tenure-rent', { defaultValue: 'Rent' })
      : t('homes-tenure-sale', { defaultValue: 'Sale' });
  const facts = [
    formatBeds(listing.beds),
    formatBaths(listing.baths),
    formatSqft(listing.sqft),
    listing.petsAllowed ? t('homes-fact-pets', { defaultValue: 'Pets OK' }) : '',
  ].filter(Boolean);

  return (
    <article
      data-slot="homes-listing"
      data-layout={layout}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn('group relative min-w-0', row && 'border-b border-site-border py-3.5')}
    >
      <Link
        to="/homes/listing/$id"
        params={{ id: listing.id }}
        className={cn('flex min-w-0', row ? 'items-start gap-3 pe-12' : 'flex-col')}
      >
        <div
          className={cn(
            'relative shrink-0 overflow-hidden rounded-site border bg-site-bg-subtle transition-colors duration-(--m1)',
            row ? 'aspect-[4/3] w-32' : 'aspect-[3/2] w-full',
            active ? 'border-site-text' : 'border-site-border group-hover:border-site-text',
          )}
        >
          {cover ? (
            <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-site-text-muted">
              <ImageOff className={row ? 'size-5' : 'size-7'} aria-hidden />
            </div>
          )}
          {cover && listing.aiImages.includes(cover) && (
            <span className="absolute start-2 bottom-2 inline-flex items-center gap-1 rounded-site-sm bg-site-media-scrim-strong px-1.5 py-0.5 text-micro font-medium text-site-media-ink">
              <Sparkles className="size-3" aria-hidden />
              {t('homes-ai-image', { defaultValue: 'AI' })}
            </span>
          )}
          {listing.source === 'EXTERNAL' && !row && (
            <span
              className="absolute end-2 bottom-2 inline-flex max-w-[70%] items-center gap-1 rounded-site-sm bg-site-media-scrim-strong px-1.5 py-0.5 text-micro font-medium text-site-media-ink"
              title={
                listing.sourceName ??
                t('homes-source-aggregated', { defaultValue: 'Aggregated listing' })
              }
            >
              <Globe className="size-3 shrink-0" aria-hidden />
              <span className="truncate">
                {listing.sourceName ?? t('homes-source-web', { defaultValue: 'Web' })}
              </span>
            </span>
          )}
        </div>

        <div className={cn('min-w-0 flex-1', !row && 'pt-2.5')}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="t-heading whitespace-nowrap">
              {formatPrice(listing.price, listing.listingType)}
            </span>
            <span className="t-meta whitespace-nowrap">
              {tenure} · {propertyTypeLabel(listing.propertyType)}
            </span>
            {showStatus && listing.status !== 'ACTIVE' && (
              <Badge variant="warning">{statusLabel(listing.status)}</Badge>
            )}
          </div>

          <p className="t-body mt-1 line-clamp-2 font-medium break-words text-site-text">
            {listing.title}
          </p>

          <p className="t-body mt-1 flex flex-wrap gap-x-1.5 text-site-text-muted">
            {facts.map((fact, i) => (
              <span key={fact} className="whitespace-nowrap">
                {fact}
                {i < facts.length - 1 && <span aria-hidden> ·</span>}
              </span>
            ))}
          </p>

          <p className="t-meta mt-1.5 flex min-w-0 gap-x-1.5">
            <span className="min-w-0 truncate">{location || '—'}</span>
            {posted && (
              <>
                <span aria-hidden>·</span>
                <span className="shrink-0 whitespace-nowrap">{posted}</span>
              </>
            )}
          </p>
        </div>
      </Link>

      <div className={cn('absolute', row ? 'end-0 top-2' : 'end-1.5 top-1.5')}>
        <FavoriteButton
          listingId={listing.id}
          favorited={listing.favorited}
          compact
          onMedia={!row}
          onChange={(f) => onFavoriteChange?.(listing.id, f)}
        />
      </div>
    </article>
  );
}
