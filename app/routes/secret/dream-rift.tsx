/**
 * Dream Rift Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const DreamRiftGame = lazy(() => import('@/components/dream-rift/DreamRiftGame').then(m => ({ default: m.DreamRiftGame })));

export const Route = createFileRoute('/secret/dream-rift')({
  head: () => ({
    meta: [
      { title: 'Dream Rift — RMH Studios' },
      { name: 'description', content: 'A bullet hell story. Dodge, graze, and fight through waves of beautiful danmaku patterns.' },
    ],
  }),
  component: DreamRiftPage,
});

function DreamRiftPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' } as any}
    >
      <div className="absolute top-3 left-3 z-50">
        <Link to="/secret">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">RMH Studios</span>
          </Button>
        </Link>
      </div>

      <div className="grow relative flex items-center justify-center overflow-hidden">
        <GameErrorBoundary gameName="Dream Rift">
          <Suspense fallback={<GameLoadingFallback />}>
            <DreamRiftGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  );
}
