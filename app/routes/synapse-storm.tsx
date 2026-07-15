import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const SynapseStormGate = lazy(() => import('@/components/synapse-storm/SynapseStormGate').then(m => ({ default: m.SynapseStormGate })));

export const Route = createFileRoute('/synapse-storm')({ component: SynapseStormPage });

function SynapseStormPage() {
  return (
    <GameCanvasPage
      routeId="/synapse-storm"
      title="Synapse Storm"
      mirrorDescription="A fast-paced multiplayer word-association party game by RMH Studios."
      game={
        <GameErrorBoundary gameName="Synapse Storm">
          <Suspense fallback={<GameLoadingFallback />}><SynapseStormGate /></Suspense>
        </GameErrorBoundary>
      }
    />
  );
}
