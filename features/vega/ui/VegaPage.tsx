/**
 * Project Vega's page: what the router used to render at `/secret/vega` — the
 * `/secret` layout's frame (`app/routes/secret.tsx`: every Vault page sits in
 * its scroller) around the game and the way back to the Vault. Mounted by the
 * island entry (`features/vega/island.tsx`, redesign audit B1).
 *
 * The way back is a plain link: `/secret` is a site page, and leaving an island
 * is a document load.
 */
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import GameCanvas from './GameCanvas';
import { ArrivalSuspense } from '@/components/ui/arrive';

export function VegaPage() {
  const { t } = useTranslation('r-secret');
  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <div className="h-full overflow-y-auto">
        <main className="min-h-dvh bg-[#050505] flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full p-4 pt-[calc(1rem+var(--safe-top,0px))] z-50 flex justify-between items-center pointer-events-none">
            <a
              href="/secret"
              aria-label={t('back-to-vault', { defaultValue: 'Back to the Vault' })}
              className="pointer-events-auto flex items-center justify-center gap-2 min-h-11 min-w-11 text-slate-400 hover:text-white transition-colors group bg-slate-900/50 p-2 rounded-lg backdrop-blur-sm border border-slate-700/50 hover:border-slate-500"
            >
              <ArrowLeft
                aria-hidden
                className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
              />
              <span className="font-mono text-sm tracking-widest hidden sm:inline">
                RMH STUDIOS
              </span>
            </a>
          </div>

          <div className="flex-1 flex items-center justify-center relative">
            <GameErrorBoundary gameName="Project Vega">
              <ArrivalSuspense fallback={<GameLoadingFallback />}>
                <GameCanvas />
              </ArrivalSuspense>
            </GameErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
