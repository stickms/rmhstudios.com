/**
 * Forest Explorer Layout
 */

import { createFileRoute, Outlet } from '@tanstack/react-router'

function ForestExplorerLayout() {
  return <Outlet />
}

export const Route = createFileRoute('/forest-explorer')({
  component: ForestExplorerLayout,
})
