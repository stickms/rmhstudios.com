/** Signal Forge Route */
import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const SignalForgeGame = lazy(() => import('@/components/signal-forge/SignalForgeGame').then(m => ({ default: m.SignalForgeGame })));

export const Route = createFileRoute('/secret/signal-forge')({ component: SignalForgePage });

function SignalForgePage() {
  return (
    <GameCanvasPage
      routeId="/secret/signal-forge"
      title="Signal Forge"
      backTo="/secret"
      visibleTitle="SIGNAL FORGE"
      mirrorDescription="A signal-routing puzzle game by RMH Studios."
      game={<GameErrorBoundary gameName="Signal Forge"><Suspense fallback={<GameLoadingFallback />}><SignalForgeGame /></Suspense></GameErrorBoundary>}
    />
  );
}
