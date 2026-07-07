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
      className={`group flex flex-col overflow-hidden rounded-xl border bg-site-surface transition ${
        active
          ? 'border-site-accent shadow-lg shadow-site-accent/10'
          : 'border-site-border hover:border-site-border-bright'
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-site-bg">
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-site-text-muted">
            <MapPin className="h-8 w-8" />
          </div>
        )}
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

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold text-site-text">
            {formatPrice(listing.price, listing.listingType)}
          </span>
          <span className="shrink-0 rounded-md bg-site-bg px-1.5 py-0.5 text-[11px] text-site-text-muted">
            {propertyTypeLabel(listing.propertyType)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-site-text-dim">
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
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <PawPrint className="h-4 w-4" /> Pets
            </span>
          )}
        </div>

        <p className="line-clamp-1 text-sm text-site-text">{listing.title}</p>

        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-site-text-muted">
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
