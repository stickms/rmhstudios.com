/**
 * Project Vega's page: the game, inside the error boundary. Mounted by the island entry
 * (`features/vega/island.tsx`, redesign audit B1). The way back to the games library is a plain link inside the
 * game's own chrome (`/games` is a site page, and leaving an island is a document load).
 */
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { ArrivalSuspense } from '@/components/ui/arrive';
import GameCanvas from './GameCanvas';
import './vega.css';

export function VegaPage() {
  return (
    <GameErrorBoundary gameName="Project Vega">
      <ArrivalSuspense fallback={<GameLoadingFallback />}>
        <GameCanvas />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}
