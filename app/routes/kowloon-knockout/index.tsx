import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const KowloonKnockout = lazy(() => import('@/components/kowloon-knockout/KowloonKnockout'));

export const Route = createFileRoute('/kowloon-knockout/')({ component: KowloonKnockoutPage });

function KowloonKnockoutPage() {
  return (
    <GameCanvasPage
      routeId="/kowloon-knockout/"
      title="Kowloon Knockout"
      backTo="/builds"
      mirrorDescription="A 3D multiplayer brawler by RMH Studios."
      game={<GameErrorBoundary gameName="Kowloon Knockout"><Suspense fallback={<GameLoadingFallback />}><KowloonKnockout /></Suspense></GameErrorBoundary>}
    />
  );
}
