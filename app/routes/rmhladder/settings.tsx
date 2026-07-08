/**
 * RMH Ladder — Settings (placeholder)
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/rmhladder/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="rl-page-header">
      <p className="rl-eyebrow">RMHLADDER · SETTINGS</p>
      <h1 className="rl-display">Settings</h1>
    </div>
  );
}
