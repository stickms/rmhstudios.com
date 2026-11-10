/**
 * Signal Forge's page: what the router used to render at `/secret/signal-forge`
 * — the `/secret` layout's frame (`app/routes/secret.tsx`: every Vault page sits
 * in its scroller) around the title bar, the way back to the Vault and the game.
 * Mounted by the island entry (`features/signal-forge/island.tsx`, redesign
 * audit B1).
 *
 * The way back is a plain link styled as the ghost button it always was:
 * `/secret` is a site page, and leaving an island is a document load.
 */
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { Button } from '@/components/ui/button';
import { SignalForgeGame } from './SignalForgeGame';

export function SignalForgePage() {
  const { t } = useTranslation('r-secret');
  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <div className="h-full overflow-y-auto">
        <main className="fixed inset-0 bg-black flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-[calc(0.75rem+var(--safe-top,0px))] pb-1 shrink-0 relative z-60">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm min-h-11 min-w-11 justify-center"
            >
              <a
                href="/secret"
                aria-label={t('back-to-vault', { defaultValue: 'Back to the Vault' })}
              >
                <ArrowLeft className="w-4 h-4" aria-hidden />
                <span className="hidden sm:inline">RMH Studios</span>
              </a>
            </Button>
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
      </div>
    </div>
  );
}
