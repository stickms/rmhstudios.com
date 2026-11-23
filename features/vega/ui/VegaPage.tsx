/**
 * Project Vega's page: the game and the way back to the games library. Mounted
 * by the island entry (`features/vega/island.tsx`, redesign audit B1).
 *
 * The way back is a plain link: `/games` is a site page, and leaving an island
 * is a document load.
 */
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import GameCanvas from './GameCanvas';
import { ArrivalSuspense } from '@/components/ui/arrive';

export function VegaPage() {
  const { t } = useTranslation('c-vega');
  return (
    <main className="fixed inset-0 bg-[#050505] flex flex-col overflow-hidden">
      <div className="absolute top-0 left-0 w-full p-4 pt-[calc(1rem+var(--safe-top,0px))] z-50 flex justify-between items-center pointer-events-none">
        <a
          href="/games"
          aria-label={t('back-to-games', { defaultValue: 'Back to games' })}
          className="pointer-events-auto flex items-center justify-center gap-2 min-h-11 min-w-11 text-slate-400 hover:text-white transition-colors group bg-slate-900/50 p-2 rounded-lg backdrop-blur-sm border border-slate-700/50 hover:border-slate-500"
        >
          <ArrowLeft aria-hidden className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-mono text-sm tracking-widest hidden sm:inline">RMH STUDIOS</span>
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
  );
}
