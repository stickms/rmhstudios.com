/**
 * RMH Ladder — Review (placeholder)
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/rmhladder/review')({
  component: ReviewPage,
});

function ReviewPage() {
  return (
    <div className="rl-page-header">
      <p className="rl-eyebrow">RMHLADDER · REVIEW</p>
      <h1 className="rl-display">Review</h1>
    </div>
  );
}
