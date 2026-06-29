// app/routes/daily.tsx
/** Daily Puzzles Layout — hosts the persistent 3D desk; child routes feed it. */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const DeskScene = lazy(() =>
  import('@/components/daily-puzzles/three/DeskScene').then((m) => ({ default: m.DeskScene })),
);

// Child routes register the game element (or null for the hub) here.
const DeskSlotCtx = createContext<(node: ReactNode) => void>(() => {});
export const useDeskSlot = () => useContext(DeskSlotCtx);

function DailyLayout() {
  const [gameNode, setGameNode] = useState<ReactNode>(null);
  return (
    <div className="fixed inset-0 bg-site-bg text-site-text">
      <GameErrorBoundary gameName="Daily Puzzles">
        <Suspense fallback={<GameLoadingFallback />}>
          <DeskScene>{gameNode}</DeskScene>
        </Suspense>
      </GameErrorBoundary>
      {/* Hidden mount point: child route runs effects to register its game node */}
      <DeskSlotCtx.Provider value={setGameNode}>
        <Outlet />
      </DeskSlotCtx.Provider>
    </div>
  );
}

export const Route = createFileRoute('/daily')({
  component: DailyLayout,
});
