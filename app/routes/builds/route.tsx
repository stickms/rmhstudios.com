/**
 * Builds Layout Route
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { BuildsLayoutClient } from '@/app/builds/BuildsLayoutClient';

export const Route = createFileRoute('/builds')({
  component: BuildsLayout,
});

function BuildsLayout() {
  return (
    <BuildsLayoutClient>
      <Outlet />
    </BuildsLayoutClient>
  );
}
