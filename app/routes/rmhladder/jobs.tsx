/**
 * RMH Ladder — Jobs (placeholder)
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/rmhladder/jobs')({
  component: JobsPage,
});

function JobsPage() {
  return (
    <div className="rl-page-header">
      <p className="rl-eyebrow">RMHLADDER · JOBS</p>
      <h1 className="rl-display">Jobs</h1>
    </div>
  );
}
