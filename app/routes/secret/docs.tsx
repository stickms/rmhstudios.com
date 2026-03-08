/**
 * Docs Layout Route
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/secret/docs')({
  head: () => ({
    meta: [
      { title: 'RMH Docs' },
      { name: 'description', content: 'Professional collaborative word processor.' },
    ],
  }),
  component: DocsLayout,
});

function DocsLayout() {
  return (
    <div className="font-sans">
      <Outlet />
    </div>
  );
}
