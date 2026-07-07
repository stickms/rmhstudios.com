'use client';

import { Home, Loader2, SearchX } from 'lucide-react';
import type { Listing } from '@/lib/homes/types';
import { ListingCard } from './ListingCard';

interface ListingGridProps {
  listings: Listing[];
  savedIds: Set<string>;
  loading: boolean;
  searched: boolean;
  activeId: string | null;
  onHover: (id: string | null) => void;
  onSavedChange: (id: string, saved: boolean) => void;
}

export function ListingGrid({
  listings,
  savedIds,
  loading,
  searched,
  activeId,
  onHover,
  onSavedChange,
}: ListingGridProps) {
  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-site-text-muted">
        <Loader2 className="mb-3 h-8 w-8 animate-spin" />
        <p>Searching listings…</p>
      </div>
    );
  }

  if (!searched) {
    return (
      <div className="grid place-items-center py-20 text-center text-site-text-muted">
        <Home className="mb-3 h-10 w-10" />
        <p className="max-w-xs">Enter a location above to find apartments and houses near you.</p>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="grid place-items-center py-20 text-center text-site-text-muted">
        <SearchX className="mb-3 h-10 w-10" />
        <p className="max-w-xs">No listings matched your filters. Try widening your search.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {listings.map((l) => (
        <ListingCard
          key={l.id}
          listing={l}
          saved={savedIds.has(l.id)}
          active={l.id === activeId}
          onHover={onHover}
          onSavedChange={onSavedChange}
        />
      ))}
    </div>
  );
}
