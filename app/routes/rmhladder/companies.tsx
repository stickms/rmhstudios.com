/**
 * RMH Ladder — Companies (placeholder)
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/rmhladder/companies')({
  component: CompaniesPage,
});

function CompaniesPage() {
  return (
    <div className="rl-page-header">
      <p className="rl-eyebrow">RMHLADDER · COMPANIES</p>
      <h1 className="rl-display">Companies</h1>
    </div>
  );
}
