import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const RmhFarmingSim = lazy(() => import('@/components/rmh-farming-sim/RmhFarmingSim'));

export const Route = createFileRoute('/rmh-farming-sim/')({ component: RmhFarmingSimPage });

function RmhFarmingSimPage() {
  return (
    <GameCanvasPage
      routeId="/rmh-farming-sim/"
      title="RMH Farming Simulator"
      backTo="/builds"
      mirrorDescription="A 3D multiplayer farming simulator by RMH Studios."
      game={<GameErrorBoundary gameName="RMH Farming Simulator"><Suspense fallback={<GameLoadingFallback />}><RmhFarmingSim /></Suspense></GameErrorBoundary>}
    />
  );
}
