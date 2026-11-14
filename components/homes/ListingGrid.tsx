/**
 * The list of listings on every Homes surface: its loading, empty and filled states.
 *
 * `layout="grid"` is a responsive grid of cards. The columns come from the space the grid actually has
 * (`repeat(auto-fill, minmax(240px, 1fr))`), not from the viewport: the old `sm:grid-cols-2 xl:grid-cols-3`
 * asked for three columns at a 1280px window whatever the width of the column the grid sat in, and beside
 * the map that column was 250px, which is how a card ended up 70px wide with every word on its own line.
 * `layout="rows"` is rows on rules, for the list column beside the map.
 *
 * The results that replace the skeleton fade in (Steel M9); nothing else animates (R5).
 */
import type { ReactNode } from 'react';
import { Home, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Listing } from '@/lib/homes/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
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
  /** Rendered inside the empty state. Prefer this over telling the reader to
   *  find a control elsewhere on the page — see the homes index. */
  emptyAction?: ReactNode;
  layout?: 'grid' | 'rows';
}

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-x-4 gap-y-6';

function CardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[3/2] w-full rounded-site" />
      <div className="space-y-2 pt-2.5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex gap-3 border-b border-site-border py-3.5">
      <Skeleton className="aspect-[4/3] w-32 shrink-0 rounded-site" />
      <div className="flex-1 space-y-2">
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
  emptyAction,
  layout = 'grid',
}: ListingGridProps) {
  const { t } = useTranslation('site');
  const rows = layout === 'rows';
  const arrival = useArrival(!loading);

  if (loading) {
    return (
      <div className={rows ? undefined : GRID} aria-busy="true">
        {Array.from({ length: rows ? 4 : 6 }).map((_, i) =>
          rows ? <RowSkeleton key={i} /> : <CardSkeleton key={i} />,
        )}
      </div>
    );
  }

  if (!searched) {
    return (
      <EmptyState
        className={arrival}
        icon={Home}
        title={t('homes-start-title', { defaultValue: 'Start your search' })}
        description={t('homes-start-desc', {
          defaultValue: 'Enter a location above to find homes near you, or browse everything.',
        })}
      />
    );
  }

  if (listings.length === 0) {
    return (
      <EmptyState
        className={arrival}
        icon={SearchX}
        title={emptyTitle ?? t('homes-none-title', { defaultValue: 'No listings yet' })}
        description={
          emptyDescription ??
          t('homes-none-desc', {
            defaultValue:
              'No homes matched your filters. Try widening your radius or clearing some filters.',
          })
        }
        action={emptyAction}
      />
    );
  }

  return (
    <div
      data-slot="homes-list"
      data-layout={layout}
      className={cn(rows ? undefined : GRID, arrival)}
    >
      {listings.map((l) => (
        <ListingCard
          key={l.id}
          listing={l}
          layout={rows ? 'row' : 'card'}
          active={l.id === activeId}
          onHover={onHover}
          onFavoriteChange={onFavoriteChange}
          showStatus={showStatus}
        />
      ))}
    </div>
  );
}
