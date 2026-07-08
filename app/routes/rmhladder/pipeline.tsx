/**
 * RMH Ladder — Pipeline (placeholder)
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/rmhladder/pipeline')({
  component: PipelinePage,
});

function PipelinePage() {
  return (
    <div className="rl-page-header">
      <p className="rl-eyebrow">RMHLADDER · PIPELINE</p>
      <h1 className="rl-display">Pipeline</h1>
    </div>
  );
}
