/**
 * Cursed Logic Layout Route
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/secret/cursed-logic')({
  head: () => ({
    meta: [
      { title: 'Cursed Logic | RMH Studios' },
      { name: 'description', content: 'A turn-based duel against an unstable Protocol.' },
    ],
  }),
  component: CursedLogicLayout,
});

function CursedLogicLayout() {
  return <Outlet />;
}
