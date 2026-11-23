/**
 * Signal Forge's page: the way back to the games library and the game. Mounted by the island entry
 * (`features/signal-forge/island.tsx`). The way back is a plain link: `/games` is a site page, and leaving an
 * island is a document load.
 */
import { useTranslation } from 'react-i18next';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { SignalForgeGame } from './SignalForgeGame';
import './signal-forge.css';

export function SignalForgePage() {
  const { t } = useTranslation('c-signal-forge');
  return (
    <main className="sf-page">
      <a className="sf-back" href="/games" aria-label={t('back-to-games', { defaultValue: 'Back to games' })}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{t('games', { defaultValue: 'Games' })}</span>
      </a>
      <GameErrorBoundary gameName="Signal Forge">
        <ArrivalSuspense fallback={<GameLoadingFallback />}>
          <SignalForgeGame />
        </ArrivalSuspense>
      </GameErrorBoundary>
    </main>
  );
}
