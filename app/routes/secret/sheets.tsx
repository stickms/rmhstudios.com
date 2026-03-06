/**
 * Sheets Layout Route
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/secret/sheets')({
  head: () => ({
    meta: [
      { title: 'RMH Sheets' },
      { name: 'description', content: 'Professional spreadsheet editor.' },
    ],
  }),
  component: SheetsLayout,
});

function SheetsLayout() {
  return (
    <div className="font-sans">
      <Outlet />
    </div>
  );
}
