/**
 * Builds Index Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { CategoryPicker } from '@/components/builds/CategoryPicker';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

export const Route = createFileRoute('/_site/builds/')({
  head: () => ({
    meta: [
      { title: 'Official Builds | RMH Studios' },
      { name: 'description', content: 'Explore our collection of games, apps, and tools.' },
    ],
  }),
  component: BuildsPage,
});

function BuildsPage() {
  return (
    <div className="px-4 pt-4 pb-12">
      <p className="text-site-text-muted text-sm mb-8">
        Our full collection of games, apps, and digital experiences — all built by the RMH team.
      </p>
      <CategoryPicker entertainmentCount={games.length} appCount={apps.filter(a => !a.hidden).length} />
    </div>
  );
}
