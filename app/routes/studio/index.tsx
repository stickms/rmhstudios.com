import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const StudioShell = lazy(() => import('@/components/studio/StudioShell'));

export const Route = createFileRoute('/studio/')({
  component: StudioPage,
});

function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[var(--site-bg)]">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
            <p className="text-sm text-[var(--site-muted)]">Loading RMH Studio...</p>
          </div>
        </div>
      }
    >
      <StudioShell />
    </Suspense>
  );
}
