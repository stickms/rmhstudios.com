/**
 * Project Vega Route
 */

import { Suspense } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import GameCanvas from '@/components/vega/GameCanvas';

export const Route = createFileRoute('/secret/vega')({
  head: () => ({
    meta: [
      { title: 'Project Vega | RMH Studios' },
      { name: 'description', content: 'The Recursion Defense System' },
    ],
  }),
  component: VegaPage,
});

function VegaPage() {
  return (
    <main className="min-h-screen bg-[#050505] flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full p-4 z-50 flex justify-between items-center pointer-events-none">
        <Link to="/secret" className="pointer-events-auto flex items-center gap-2 text-slate-400 hover:text-white transition-colors group bg-slate-900/50 p-2 rounded-lg backdrop-blur-sm border border-slate-700/50 hover:border-slate-500">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-mono text-sm tracking-widest hidden sm:inline">RMH STUDIOS</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        <GameErrorBoundary gameName="Project Vega">
          <Suspense fallback={<GameLoadingFallback />}>
            <GameCanvas />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  );
}
