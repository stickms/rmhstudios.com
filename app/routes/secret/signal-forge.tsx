/**
 * Signal Forge Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const SignalForgeGame = lazy(() => import('@/components/signal-forge/SignalForgeGame').then(m => ({ default: m.SignalForgeGame })));

export const Route = createFileRoute('/secret/signal-forge')({
  component: SignalForgePage,
});

function SignalForgePage() {
  return (
    <main className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0 relative z-60">
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
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black rainbow-text tracking-tighter italic glitch-text leading-none absolute left-1/2 -translate-x-1/2">
          SIGNAL FORGE
        </h1>
        <div className="w-20" />
      </div>

      <div className="grow relative min-h-0 overflow-hidden">
        <GameErrorBoundary gameName="Signal Forge">
          <Suspense fallback={<GameLoadingFallback />}>
            <SignalForgeGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  );
}
