import { lazy, Suspense, useSyncExternalStore } from 'react';
import { subscribeToasterWanted, toasterWanted } from '@/lib/toast';

const SiteToaster = lazy(() =>
  import('@/components/ui/site-toaster').then((m) => ({ default: m.SiteToaster })),
);

const neverOnServer = () => false;

/**
 * Where the site's toaster mounts. It renders nothing, and loads nothing, until
 * the first `toast()` (lib/toast.ts); from then on it is the sonner `<Toaster>`
 * (components/ui/site-toaster.tsx), which replays whatever was queued while it
 * loaded. Mounted once by `components/Providers.tsx` and once by
 * `components/island/IslandProviders.tsx`.
 */
export function ToastHost({ theme }: { theme: 'light' | 'dark' }) {
  const wanted = useSyncExternalStore(subscribeToasterWanted, toasterWanted, neverOnServer);
  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <SiteToaster theme={theme} />
    </Suspense>
  );
}
