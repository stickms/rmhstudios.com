/**
 * Slides Layout Route
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/secret/slides')({
  head: () => ({
    meta: [
      { title: 'RMH Slides' },
      { name: 'description', content: 'Professional presentation editor.' },
    ],
  }),
  component: SlidesLayout,
});

function SlidesLayout() {
  return (
    <div className="font-sans">
      <Outlet />
    </div>
  );
}
