import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/fouc-audit-2026-10-06.md §13).
import Hl2PlayPage from '@/components/sp-game/Hl2PlayPage';

function HalfLife2Page() {
  return (
    <GameErrorBoundary gameName="Half-Life 2">
      <Hl2PlayPage />
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/half-life-2')({
  head: () => gameRouteHead('half-life-2'),
  component: HalfLife2Page,
});
