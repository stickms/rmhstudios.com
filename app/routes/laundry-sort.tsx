/**
 * Laundry Sort — canvas-converted. The game (LaundryGame) keeps its own 2D
 * <canvas> + imperative UI, hosted via LayeredCanvasHost as an overlay; the
 * Konva scene draws the chrome (back link + title). Full-screen (no shell).
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { CanvasLink } from '@/canvas-ui/widgets/Link';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons } from '@/canvas-ui/widgets/icons';
import { LayeredCanvasHost } from '@/canvas-ui/overlay/LayeredCanvasHost';

const LaundryGame = lazy(() => import('@/components/laundry-sort/LaundryGame').then(m => ({ default: m.LaundryGame })));

export const Route = createFileRoute('/laundry-sort')({
  component: LaundryPage,
});

function LaundryScene() {
  return (
    <Box name="laundry-sort" style={tw('flex flex-col w-full h-full bg-[#000000]')}>
      {/* Title bar */}
      <Box style={tw('flex flex-row items-center justify-center w-full pt-3 pb-1')}>
        <Box style={tw('flex flex-row absolute top-3 left-3')}>
          <CanvasLink to="/builds" label="RMH Studios" style={tw('flex flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-site-sm bg-[rgba(0,0,0,0.5)] border border-[#27272a]')}>
            <Icon node={icons['arrow-left']} size={16} color="#71717a" />
            <CanvasText style="text-sm text-[#71717a]">RMH Studios</CanvasText>
          </CanvasLink>
        </Box>
        <CanvasText style="text-4xl font-black italic text-[#ffffff]">LAUNDRY SORT</CanvasText>
      </Box>

      {/* Game surface — the 2D canvas game as a layered overlay. */}
      <LayeredCanvasHost kind="game-2d" under={false} style={tw('flex flex-col flex-1 w-full')}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <GameErrorBoundary gameName="Laundry Sort">
            <Suspense fallback={<GameLoadingFallback />}>
              <LaundryGame />
            </Suspense>
          </GameErrorBoundary>
        </div>
      </LayeredCanvasHost>
    </Box>
  );
}

function LaundryMirror() {
  return (
    <div>
      <h1>Laundry Sort</h1>
      <p>A fast-paced laundry-sorting arcade game by RMH Studios.</p>
      <a href="/builds">Back to RMH Studios</a>
    </div>
  );
}

function LaundryPage() {
  return (
    <CanvasPage
      routeId="/laundry-sort"
      scene={LaundryScene}
      sceneProps={{}}
      mirror={<LaundryMirror />}
      shell="fullscreen"
      title="Laundry Sort"
    />
  );
}
