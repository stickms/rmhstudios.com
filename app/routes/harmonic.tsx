import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/fouc-audit-2026-10-06.md §13).
import HarmonicPlayPage from '@/components/harmonic-game/HarmonicPlayPage';

function HarmonicPage() {
  return (
    <GameErrorBoundary gameName="Harmonic">
      <HarmonicPlayPage />
    </GameErrorBoundary>
  );
}

// Not in the catalog until the vertical slice plays end to end (plan D8): noindex.
export const Route = createFileRoute('/harmonic')({
  head: () => noindexHead('Harmonic'),
  component: HarmonicPage,
});
