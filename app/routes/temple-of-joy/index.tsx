import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const TempleOfJoyGate = lazy(() => import('@/components/temple-of-joy/TempleOfJoyGate').then(m => ({ default: m.TempleOfJoyGate })));

export const Route = createFileRoute('/temple-of-joy/')({ component: TempleOfJoyPage });

function TempleOfJoyPage() {
  return (
    <GameCanvasPage
      routeId="/temple-of-joy/"
      title="Temple of Joy"
      mirrorDescription="A 3D temple-run arcade game by RMH Studios."
      game={<GameErrorBoundary gameName="Temple of Joy"><Suspense fallback={<GameLoadingFallback />}><TempleOfJoyGate /></Suspense></GameErrorBoundary>}
    />
  );
}
