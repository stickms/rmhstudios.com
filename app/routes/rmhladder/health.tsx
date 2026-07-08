/**
 * RMH Ladder — Health (placeholder)
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/rmhladder/health')({
  component: HealthPage,
});

function HealthPage() {
  return (
    <div className="rl-page-header">
      <p className="rl-eyebrow">RMHLADDER · HEALTH</p>
      <h1 className="rl-display">Health</h1>
    </div>
  );
}
