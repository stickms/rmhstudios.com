'use client';

import { lazy, Suspense } from 'react';
import { useIdleReady } from '@/hooks/useIdleReady';

const ReadabilityPanel = lazy(() => import('./ReadabilityPanel'));

/**
 * L4 — the readability meter for Markdown editors. A thin wrapper so editors
 * import a few lines, not the analysis: the panel loads after idle, and only
 * when there is something to measure.
 */
export function ReadabilityMeter({ text, className }: { text: string; className?: string }) {
  const idle = useIdleReady();
  if (!idle || text.trim().length === 0) return null;
  return (
    <Suspense fallback={null}>
      <ReadabilityPanel text={text} className={className} />
    </Suspense>
  );
}
