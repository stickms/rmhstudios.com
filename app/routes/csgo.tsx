import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/fouc-audit-2026-10-06.md §13).
import CsPlayPage from '@/components/csgo-game/CsPlayPage';

function CsgoPage() {
  return (
    <GameErrorBoundary gameName="Counter-Strike: Global Offensive">
      <CsPlayPage />
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/csgo')({
  head: () => gameRouteHead('csgo'),
  component: CsgoPage,
});
