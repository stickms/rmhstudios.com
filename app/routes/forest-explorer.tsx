/**
 * Forest Explorer Layout
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';

function ForestExplorerLayout() {
  return <Outlet />;
}

export const Route = createFileRoute('/forest-explorer')({
  head: () => gameRouteHead('forest-explorer'),
  component: ForestExplorerLayout,
});
