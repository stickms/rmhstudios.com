/** Daily Puzzles Layout — hosts the persistent 3D desk for desk routes; legacy
 *  puzzle routes (not yet desk-integrated) render full-screen as before. */
import { createContext, useContext, useState, lazy, Suspense, type ReactNode } from 'react';
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const DeskScene = lazy(() =>
  import('@/components/daily-puzzles/three/DeskScene').then((m) => ({ default: m.DeskScene })),
);

// Child routes register the game element (or null for the hub) here.
const DeskSlotCtx = createContext<(node: ReactNode) => void>(() => {});
export const useDeskSlot = () => useContext(DeskSlotCtx);

// Only these routes render inside the 3D desk; everything else under /daily is a
// legacy full-screen puzzle until its own sub-project wires it into the desk.
const DESK_ROUTES = new Set(['/daily', '/daily/', '/daily/spectrum']);

function DailyLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [gameNode, setGameNode] = useState<ReactNode>(null);

  if (!DESK_ROUTES.has(pathname)) {
    return (
      <div className="min-h-screen bg-site-bg text-site-text pt-8 pb-16">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-site-bg text-site-text">
      <GameErrorBoundary gameName="Daily Puzzles">
        <Suspense fallback={<GameLoadingFallback />}>
          <DeskScene>{gameNode}</DeskScene>
        </Suspense>
      </GameErrorBoundary>
      <DeskSlotCtx.Provider value={setGameNode}>
        <Outlet />
      </DeskSlotCtx.Provider>
    </div>
  );
}

export const Route = createFileRoute('/daily')({
  component: DailyLayout,
});
