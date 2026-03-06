/**
 * Jobs Layout Route
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/secret/jobs')({
  head: () => ({
    meta: [
      { title: 'RMH Job Search' },
      { name: 'description', content: 'Browse hundreds of job listings. Some real. Some ridiculous. All rejections guaranteed.' },
    ],
  }),
  component: RMHJobsLayout,
});

function RMHJobsLayout() {
  return (
    <div className="jobs-theme grid-bg" style={{ minHeight: '100vh', background: 'var(--jobs-bg)', color: 'var(--jobs-text)' }}>
      <Outlet />
    </div>
  );
}
