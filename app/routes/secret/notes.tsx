/**
 * Notes Layout Route
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/secret/notes')({
  head: () => ({
    meta: [
      { title: 'RMH Notes' },
      { name: 'description', content: 'Cozy notes & reminders app.' },
    ],
  }),
  component: NotesLayout,
});

function NotesLayout() {
  return <Outlet />;
}
