import { Suspense, lazy } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// The daily shop, bundles and loadouts are a separate chunk, fetched only when
// the store's Daily tab opens. The split lives here rather than in the route
// module because routes import their page statically (docs/performance, FOUC
// contract) — this wrapper is what the route imports.
const DailyShopPanel = lazy(() => import('./DailyShopPanel'));

export function DailyTab({ signedIn }: { signedIn: boolean }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3 pt-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      }
    >
      <DailyShopPanel signedIn={signedIn} />
    </Suspense>
  );
}
