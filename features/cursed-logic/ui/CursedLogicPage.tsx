/**
 * Cursed Logic's page: the terminal's frame (the way back to the games library, the wordmark, the manual) around
 * the game. Mounted by the island entry (`features/cursed-logic/island.tsx`, redesign audit B1), without the site's
 * router, shell or providers.
 *
 * The way back is a plain link: `/games` is a site page, and leaving an island is a document load.
 */
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { useCursedLogicStore } from '@features/cursed-logic/engine/gameState';
import { CursedLogicGame } from './CursedLogicGame';
import { HowToPlayModal } from './HowToPlayModal';
import { Wordmark } from './glyphs';
import { useCopy } from './copy';

export function CursedLogicPage() {
  const copy = useCopy();
  const { t } = useTranslation('c-cursed-logic');
  const [helpOpen, setHelpOpen] = useState(false);
  const screen = useCursedLogicStore((s) => s.screen);
  const startTutorial = useCursedLogicStore((s) => s.startTutorial);

  return (
    <main className="cl-theme fixed inset-0 flex flex-col overflow-hidden">
      <header className="relative z-20 shrink-0 flex items-center gap-2 px-[calc(0.75rem+var(--safe-left,0px))] pt-[calc(0.5rem+var(--safe-top,0px))] pb-2 border-b border-[#3b2a5c] bg-[#06040a]">
        <a href="/games" className="cl-cmd cl-cmd-ghost !px-3 !text-[0.75rem]" aria-label={t('back-to-games', { defaultValue: 'Back to games' })}>
          <ArrowLeft className="w-4 h-4" aria-hidden />
          <span className="hidden sm:inline">{t('games', { defaultValue: 'Games' })}</span>
        </a>
        {screen !== 'menu' && <Wordmark className="h-7 w-auto" title={t('title', { defaultValue: 'Cursed Logic' })} />}
        {screen === 'menu' && <h1 className="sr-only">{t('title', { defaultValue: 'Cursed Logic' })}</h1>}
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="cl-cmd cl-cmd-ghost ml-auto !px-3 !text-[0.75rem]"
          aria-label={t('how-to-play', { defaultValue: 'How to play' })}
        >
          <HelpCircle className="w-4 h-4" aria-hidden />
          <span className="hidden sm:inline">{t('manual', { defaultValue: 'Manual' })}</span>
        </button>
      </header>

      <div className="grow relative overflow-y-auto cl-scroll pt-3" data-jelly-zone="playfield">
        <GameErrorBoundary gameName="Cursed Logic">
          <CursedLogicGame onHelp={() => setHelpOpen(true)} />
        </GameErrorBoundary>
      </div>

      <HowToPlayModal open={helpOpen} onClose={() => setHelpOpen(false)} onTraining={startTutorial} copy={copy} />
    </main>
  );
}
