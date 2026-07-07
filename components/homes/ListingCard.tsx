'use client';

import { Link } from '@tanstack/react-router';
import { BedDouble, Bath, Ruler, MapPin, PawPrint } from 'lucide-react';
import type { Listing } from '@/lib/homes/types';
import {
  formatBaths,
  formatBeds,
  formatLocation,
  formatPostedAt,
  formatPrice,
  formatSqft,
  propertyTypeLabel,
} from '@/lib/homes/format';
import { Badge } from '@/components/ui/badge';
import { SaveButton } from './SaveButton';
import { SourceBadge } from './SourceBadge';

interface ListingCardProps {
  listing: Listing;
  saved: boolean;
  onSavedChange?: (id: string, saved: boolean) => void;
  /** Highlight when hovered/selected on the map. */
  active?: boolean;
  onHover?: (id: string | null) => void;
}

export function ListingCard({ listing, saved, onSavedChange, active, onHover }: ListingCardProps) {
  const location = formatLocation(listing);
  const sqft = formatSqft(listing.sqft);
  const posted = formatPostedAt(listing.postedAt, Date.now());

  return (
    <Link
      to="/homes/listing/$id"
      params={{ id: listing.id }}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`group flex h-full flex-col overflow-hidden rounded-site border bg-site-surface/80 shadow-site transition-all hover:-translate-y-0.5 hover:border-site-accent/50 ${
        active ? 'border-site-accent ring-1 ring-site-accent/40' : 'border-site-border'
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-site-bg">
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-site-text-dim">
            <MapPin className="h-8 w-8" />
          </div>
        )}
        {/* subtle gradient so overlaid chips stay legible on bright photos */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />
        <div className="absolute right-2 top-2">
          <SaveButton
            listing={listing}
            saved={saved}
            compact
            onChange={(s) => onSavedChange?.(listing.id, s)}
          />
        </div>
        <div className="absolute left-2 top-2">
          <SourceBadge source={listing.source} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-lg font-bold text-site-text"
            style={{ fontFamily: 'var(--site-font-display)' }}
          >
            {formatPrice(listing.price, listing.listingType)}
          </span>
          <Badge variant="outline" size="sm">
            {propertyTypeLabel(listing.propertyType)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-site-text-muted">
          <span className="inline-flex items-center gap-1">
            <BedDouble className="h-4 w-4" /> {formatBeds(listing.beds)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath className="h-4 w-4" /> {formatBaths(listing.baths)}
          </span>
          {sqft && (
            <span className="inline-flex items-center gap-1">
              <Ruler className="h-4 w-4" /> {sqft}
            </span>
          )}
          {listing.petsAllowed === true && (
            <span className="inline-flex items-center gap-1 text-site-success">
              <PawPrint className="h-4 w-4" /> Pets
            </span>
          )}
        </div>

        <p className="line-clamp-1 text-sm font-medium text-site-text">{listing.title}</p>

        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-site-text-dim">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{location || '—'}</span>
          </span>
          {posted && <span className="shrink-0">{posted}</span>}
        </div>
      </div>
    </Link>
  );
}
