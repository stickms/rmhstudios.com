'use client';

import { motion } from 'framer-motion';
import { Home, SearchX } from 'lucide-react';
import type { Listing } from '@/lib/homes/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ListingCard } from './ListingCard';

interface ListingGridProps {
  listings: Listing[];
  loading: boolean;
  searched: boolean;
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  onFavoriteChange?: (id: string, favorited: boolean) => void;
  showStatus?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-site border border-site-border bg-site-surface/80">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-3.5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

export function ListingGrid({
  listings,
  loading,
  searched,
  activeId,
  onHover,
  onFavoriteChange,
  showStatus,
  emptyTitle,
  emptyDescription,
}: ListingGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!searched) {
    return (
      <EmptyState
        icon={Home}
        title="Start your search"
        description="Enter a location above to find homes near you, or browse everything."
      />
    );
  }

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={emptyTitle ?? 'No listings yet'}
        description={
          emptyDescription ??
          'No homes matched your filters. Try widening your radius or clearing some filters.'
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {listings.map((l, i) => (
        <motion.div
          key={l.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
        >
          <ListingCard
            listing={l}
            active={l.id === activeId}
            onHover={onHover}
            onFavoriteChange={onFavoriteChange}
            showStatus={showStatus}
          />
        </motion.div>
      ))}
    </div>
  );
}
