/**
 * RMH Ladder — Alerts (placeholder)
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/rmhladder/alerts')({
  component: AlertsPage,
});

function AlertsPage() {
  return (
    <div className="rl-page-header">
      <p className="rl-eyebrow">RMHLADDER · ALERTS</p>
      <h1 className="rl-display">Alerts</h1>
    </div>
  );
}
