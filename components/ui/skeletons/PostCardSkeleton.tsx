import { Skeleton } from '@/components/ui/skeleton';

/**
 * Layout-matched loading placeholders for data-heavy views. Using these instead
 * of a bare spinner keeps the page from reflowing when content arrives and
 * communicates the shape of what's loading. The pulse is preserved under
 * `prefers-reduced-motion` (see globals.css).
 */

/** A single feed post / RMHark placeholder. */
export function PostCardSkeleton() {
  return (
    <div className="glass-fill mx-3 mt-3 flex gap-3 rounded-site p-4" aria-hidden="true">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
        <div className="flex gap-6 pt-1">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
        </div>
      </div>
    </div>
  );
}

/** A vertical run of post placeholders. */
export function PostListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading posts">
      {Array.from({ length: count }, (_, i) => (
        <PostCardSkeleton key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** A compact user row (recommendations, followers, search people). */
export function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3" aria-hidden="true">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-8 w-20 rounded-full" />
    </div>
  );
}

/** A run of user rows. */
export function UserListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading users">
      {Array.from({ length: count }, (_, i) => (
        <UserRowSkeleton key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
