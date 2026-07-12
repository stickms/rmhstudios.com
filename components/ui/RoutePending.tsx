import { Skeleton } from '@/components/ui/skeleton';

/**
 * Default `pendingComponent` for the router (see `app/router.tsx`).
 *
 * Route loaders block navigation; without a pending fallback the old page just
 * freezes until the new loader resolves. This renders a neutral, centered
 * shimmer so a slow route reads as "content is on its way" instead of a stuck
 * click. It only appears once a loader has been pending past the router's
 * `defaultPendingMs`, so fast navigations never flash it.
 *
 * Deliberately generic (a column of shimmer bars, not a feed-specific layout)
 * because it backs every route in the app — feed, profile, library, and the
 * many mini-apps.
 */
export function RoutePending() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="mx-auto w-full max-w-2xl px-4 py-8 animate-in fade-in duration-200"
    >
      <div className="flex gap-3">
        <Skeleton shimmer className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton shimmer className="h-4 w-40" />
          <Skeleton shimmer className="h-3.5 w-24" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <Skeleton shimmer className="h-3.5 w-full" />
        <Skeleton shimmer className="h-3.5 w-11/12" />
        <Skeleton shimmer className="h-3.5 w-4/5" />
        <Skeleton shimmer className="h-40 w-full rounded-site" />
        <Skeleton shimmer className="h-3.5 w-3/4" />
        <Skeleton shimmer className="h-3.5 w-2/3" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
