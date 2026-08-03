/** Daily Puzzles layout — a plain full-screen shell. The hub and each puzzle
 *  render their own layouts (the persistent 3D desk was retired in favour of the
 *  interactive non-3D hub at /daily). */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';

function DailyLayout() {
  return (
    <div className="min-h-screen bg-site-bg pb-16 pt-8 text-site-text">
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/daily')({
  head: () => gameRouteHead('daily-puzzles'),
  component: DailyLayout,
});
