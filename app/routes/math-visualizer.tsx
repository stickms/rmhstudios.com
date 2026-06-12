import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const MathVisualizer = lazy(() => import('@/components/math-visualizer/MathVisualizer'));

function MathVisualizerPage() {
  return (
    <main className="fixed inset-0 bg-[var(--site-bg)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--site-accent)] border-t-transparent" />
              <p className="text-sm text-[var(--site-text-muted)]">Loading Math Visualizer...</p>
            </div>
          </div>
        }
      >
        <MathVisualizer />
      </Suspense>
    </main>
  );
}

export const Route = createFileRoute('/math-visualizer')({
  head: () => ({
    meta: [
      { title: 'Math Visualizer | rmhstudios' },
      { name: 'description', content: 'Interactive math visualizations — graph functions, explore fractals, surfaces, and more.' },
    ],
  }),
  component: MathVisualizerPage,
});
