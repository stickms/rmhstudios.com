'use client';

/**
 * Mounts the library's reading strip (L3 challenge, L7 shelves, L1 highlights)
 * for signed-in members, after idle. A wrapper rather than a `lazy()` in the
 * route module, which the FOUC contract forbids; the strip's code is only
 * fetched once this decides to render it.
 */

import { lazy, Suspense } from 'react';
import { useSession } from '@/components/Providers';
import { useIdleReady } from '@/hooks/useIdleReady';

const LibraryReadingStrip = lazy(() => import('./LibraryReadingStrip'));

export function LibraryReadingMount() {
  const { data } = useSession();
  const idle = useIdleReady();
  if (!data || !idle) return null;
  return (
    <Suspense fallback={null}>
      <LibraryReadingStrip />
    </Suspense>
  );
}
