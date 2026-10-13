'use client';

import { lazy, Suspense } from 'react';
import { useSession } from '@/components/Providers';
import { useIdleReady } from '@/hooks/useIdleReady';

// The card, its fetch and its strings load after the feed is idle, and only for
// signed-in members (answering needs an account). Nothing here is on the first
// paint path.
const QotdCard = lazy(() => import('./QotdCard'));

export function QotdCardLazy() {
  const { data: session } = useSession();
  const idle = useIdleReady();
  if (!session || !idle) return null;
  return (
    <Suspense fallback={null}>
      <QotdCard />
    </Suspense>
  );
}
