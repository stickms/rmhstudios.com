/**
 * Builds Layout Route
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { BuildsLayoutClient } from '@/components/builds/BuildsLayoutClient';

export const Route = createFileRoute('/_site/builds')({
  component: BuildsLayout,
});

function BuildsLayout() {
  return (
    <BuildsLayoutClient>
      <Outlet />
    </BuildsLayoutClient>
  );
}
