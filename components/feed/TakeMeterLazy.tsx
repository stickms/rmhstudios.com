'use client';

import { lazy, Suspense } from 'react';

// The meter, its fetch and its vote handling load only for posts that ARE takes
// (X6) — a normal card never pays for any of it.
const TakeMeter = lazy(() => import('./TakeMeter'));

/**
 * Reserves the meter's footprint while its chunk loads, so a take scrolling
 * into view does not shove the actions row down. Matches TakeMeter's `min-h-28`.
 */
export function TakeMeterLazy({ postId }: { postId: string }) {
  return (
    <Suspense fallback={<div className="glass-fill mt-2 min-h-28 rounded-site" aria-hidden />}>
      <TakeMeter postId={postId} />
    </Suspense>
  );
}
