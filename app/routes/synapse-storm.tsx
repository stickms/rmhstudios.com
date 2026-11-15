import { lazy } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { ArrivalSuspense } from '@/components/ui/arrive';

const SynapseStormGate = lazy(() =>
  import('@features/synapse-storm/ui/SynapseStormGate').then((m) => ({
    default: m.SynapseStormGate,
  })),
);

function SynapseStormPage() {
  return (
    <GameErrorBoundary gameName="Synapse Storm">
      <ArrivalSuspense fallback={<GameLoadingFallback />}>
        <SynapseStormGate />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/synapse-storm')({
  head: () => gameRouteHead('synapse-storm'),
  component: SynapseStormPage,
});
