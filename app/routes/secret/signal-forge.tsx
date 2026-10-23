/**
 * Signal Forge Route
 */

import { Suspense } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import { SignalForgeGame } from '@/components/signal-forge/SignalForgeGame';

export const Route = createFileRoute('/secret/signal-forge')({
  head: () => ({
    meta: [{ title: 'Signal Forge | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: SignalForgePage,
});

function SignalForgePage() {
  const { t } = useTranslation('r-secret');
  return (
    <main className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-[calc(0.75rem+var(--safe-top,0px))] pb-1 shrink-0 relative z-60">
        <Link to="/secret" aria-label={t("back-to-vault", { defaultValue: "Back to the Vault" })}>
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm min-h-11 min-w-11 justify-center"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">RMH Studios</span>
          </Button>
        </Link>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black rainbow-text tracking-tighter italic glitch-text leading-none absolute left-1/2 -translate-x-1/2">
          SIGNAL FORGE
        </h1>
        <div aria-hidden className="w-20" />
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
