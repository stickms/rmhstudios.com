/**
 * Cursed Logic's page: the frame around the duel (title, the way back to the games library, the
 * fragment count, the shop and help buttons). Mounted by the island entry
 * (`features/cursed-logic/island.tsx`, redesign audit B1), without the site's router, shell or providers.
 *
 * The way back is a plain link styled as the ghost button it always was: `/games` is a site page, and
 * leaving an island is a document load.
 */
import { useState } from 'react';
import { ArrowLeft, HelpCircle, ShoppingBag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { Button } from '@/components/ui/button';
import { CursedLogicGame } from './CursedLogicGame';
import { HowToPlayModal } from './HowToPlayModal';
import { ShopModal } from './ShopModal';
import { useShopStore } from '@features/cursed-logic/engine/shopState';

export function CursedLogicPage() {
  const { t } = useTranslation('c-cursed-logic');
  const [helpOpen, setHelpOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const fragments = useShopStore((s) => s.fragments);

  return (
    <main className="fixed inset-0 bg-[#0a0a0f] flex flex-col overflow-hidden">
      <div className="absolute top-[calc(0.75rem+var(--safe-top,0px))] left-[calc(0.75rem+var(--safe-left,0px))] z-50">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm min-h-11 min-w-11 justify-center"
        >
          <a href="/games" aria-label={t('back-to-games', { defaultValue: 'Back to games' })}>
            <ArrowLeft className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">RMH Studios</span>
          </a>
        </Button>
      </div>

      <div className="text-center pt-3 pb-1 shrink-0">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-cyan-400">CURSED LOGIC</h1>
        <p className="text-white/50 text-sm mt-1">{t('duel-the-protocol', { defaultValue: 'Duel the Protocol' })}</p>
      </div>

      <div className="grow relative overflow-auto" data-jelly-zone="playfield">
        <GameErrorBoundary gameName="Cursed Logic">
          <CursedLogicGame />
        </GameErrorBoundary>
      </div>

      <div className="shrink-0 flex flex-wrap justify-center items-center gap-2 sm:gap-4 pt-4 px-4 pb-[calc(1rem+var(--safe-bottom,0px))] bg-[#0a0a0f]/95 border-t border-white/10">
        <span className="font-mono text-amber-200 text-lg font-bold px-4 py-2.5 rounded-xl bg-amber-500/15 border-2 border-amber-500/50 shadow-lg">
          {t('fragments-count', {
            defaultValue_one: '{{count}} Fragment',
            defaultValue: '{{count}} Fragments',
            count: fragments,
          })}
        </span>
        <button
          type="button"
          onClick={() => setShopOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border-2 border-amber-500/50 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200 transition-colors shadow-lg font-mono font-bold text-sm"
          aria-label={t('shop', { defaultValue: 'Shop' })}
        >
          <ShoppingBag className="w-6 h-6" aria-hidden />
          {t('shop', { defaultValue: 'Shop' })}
        </button>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/15 border-2 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/25 hover:text-cyan-200 transition-colors shadow-lg font-mono font-bold text-sm"
          aria-label={t('how-to-play', { defaultValue: 'How to play' })}
        >
          <HelpCircle className="w-6 h-6" aria-hidden />
          {t('how-to-play', { defaultValue: 'How to play' })}
        </button>
      </div>

      <HowToPlayModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} />
    </main>
  );
}
