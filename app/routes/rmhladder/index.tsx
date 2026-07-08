/**
 * RMH Ladder — Overview (placeholder)
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/rmhladder/')({
  component: OverviewPage,
});

function OverviewPage() {
  return (
    <div className="rl-page-header">
      <p className="rl-eyebrow">RMHLADDER · OVERVIEW</p>
      <h1 className="rl-display">Overview</h1>
    </div>
  );
}
