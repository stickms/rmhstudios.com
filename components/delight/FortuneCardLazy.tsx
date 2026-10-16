'use client';

import { lazy, Suspense } from 'react';
import { useIdleReady } from '@/hooks/useIdleReady';

// Below the fold in the wheel and mounted after idle: nothing on the first paint path.
const FortuneCard = lazy(() => import('./FortuneCard'));

export function FortuneCardLazy() {
  const idle = useIdleReady();
  if (!idle) return null;
  return (
    <Suspense fallback={null}>
      <FortuneCard />
    </Suspense>
  );
}
