/** Daily Puzzles layout — a full-screen DOCUMENT shell (`.app-page`, §12.1 rule 6).
 *  It owns the ground and the page scroll; the hub and each puzzle render their
 *  own column inside it via `PuzzlePage` (components/daily-puzzles/PuzzleShell),
 *  so no puzzle re-adds top/bottom padding. `.app-page` also takes back the
 *  scrollbar gutter so a growing board never re-centres the column sideways. */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';

function DailyLayout() {
  return (
    <div className="app-page bg-site-bg text-site-text">
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/daily')({
  head: () => gameRouteHead('daily-puzzles'),
  component: DailyLayout,
});
