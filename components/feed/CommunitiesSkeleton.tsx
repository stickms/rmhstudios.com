import { Skeleton } from '@/components/ui/skeleton';
import { ColumnHeader } from './ColumnHeader';

/** A single community card placeholder — mirrors the real card's layout. */
function CommunityCardSkeleton() {
  return (
    <li className="flex items-start gap-4 rounded-site border border-site-border bg-site-surface p-4">
      <Skeleton className="h-14 w-14 shrink-0 rounded-site" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
        <div className="mt-1 flex gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </li>
  );
}

/** A run of community card placeholders. */
export function CommunityListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3 p-3" role="status" aria-label="Loading communities">
      {Array.from({ length: count }, (_, i) => (
        <CommunityCardSkeleton key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </ul>
  );
}

/**
 * Full-page communities skeleton, matching the header + search chrome and card
 * list. Used as the route's `pendingComponent` so a cold navigation (one whose
 * loader data wasn't already prefetched on hover) shows this exact shape and the
 * real page swaps in with no layout shift.
 */
export function CommunitiesSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Real ColumnHeader, skeleton contents: the drawer button is live and
          usable while the page loads, and the header doesn't shift when the real
          one swaps in. */}
      <ColumnHeader actions={<Skeleton className="h-8 w-16 rounded-site-sm" />}>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-32" />
        </div>
      </ColumnHeader>
      <div className="border-b border-site-border p-3">
        <Skeleton className="h-9 w-full rounded-site-sm" />
      </div>
      <CommunityListSkeleton />
    </div>
  );
}
