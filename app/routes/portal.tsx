import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/fouc-audit-2026-10-06.md §13).
import PortalPlayPage from '@/components/sp-game/PortalPlayPage';

function PortalPage() {
  return (
    <GameErrorBoundary gameName="Portal">
      <PortalPlayPage />
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/portal')({
  head: () => gameRouteHead('portal'),
  component: PortalPage,
});
