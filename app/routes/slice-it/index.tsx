import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { DarkModeWrapper } from '@/components/slice-it/DarkModeWrapper';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const GameCanvas = lazy(() => import('@/components/game/GameCanvas').then(m => ({ default: m.GameCanvas })));

export const Route = createFileRoute('/slice-it/')({ component: SliceItPage });

function SliceItPage() {
  return (
    <GameCanvasPage
      routeId="/slice-it/"
      title="Slice-It"
      backTo="/builds"
      visibleTitle="Slice-It"
      mirrorDescription="A fast-paced fruit-slicing arcade game by RMH Studios."
      game={
        <DarkModeWrapper>
          <GameErrorBoundary gameName="Slice It">
            <Suspense fallback={<GameLoadingFallback />}><GameCanvas /></Suspense>
          </GameErrorBoundary>
        </DarkModeWrapper>
      }
    />
  );
}
