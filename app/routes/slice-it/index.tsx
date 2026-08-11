import { lazy, Suspense } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DarkModeWrapper } from '@/components/slice-it/DarkModeWrapper';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { SliceItLoading } from '@/components/slice-it/SliceItLoading';
import { librarySearchSchema } from '@/lib/slice-it/library-filters';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';

const GameCanvas = lazy(() =>
  import('@/components/slice-it/GameCanvas').then((m) => ({ default: m.GameCanvas })),
);

function SliceItPage() {
  const { t } = useTranslation('r-slice-it');
  const goBack = useBackOrFallback();
  return (
    <DarkModeWrapper>
      <main className="fixed inset-0 slice-theme overflow-hidden flex flex-col bg-slice-bg transition-colors duration-300">
        {/* Header */}
        <div className="p-3 shrink-0 flex items-center gap-3 shadow-sm z-10 bg-slice-bg border-b border-slice-shadow-dark/30 transition-colors duration-300">
          <Link to="/games" onClick={goBack}>
            <Button
              variant="ghost"
              size="sm"
              className="text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark/20 transition-colors rounded-lg text-xs"
            >
              <ArrowLeft className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline font-bold">
                {t('back-to-builds', { defaultValue: 'Back to Builds' })}
              </span>
            </Button>
          </Link>
          <span className="text-xs font-black text-slice-text-light uppercase tracking-widest hidden sm:inline">
            |
          </span>
          <span className="text-sm font-black text-slice-text uppercase tracking-widest hidden sm:inline">
            Slice-It
          </span>
        </div>

        {/* Game Canvas — occupies remaining space */}
        <div className="flex-1 min-h-0 w-full relative">
          <GameErrorBoundary gameName="Slice It">
            {/* Slice It's own skeleton, not the shared black sheet — see
                `SliceItLoading` for why this game does not use it. */}
            <Suspense fallback={<SliceItLoading />}>
              <GameCanvas />
            </Suspense>
          </GameErrorBoundary>
        </div>
      </main>
    </DarkModeWrapper>
  );
}

export const Route = createFileRoute('/slice-it/')({
  // L18 — the library's search/sort/view state lives here now instead of in
  // component state, so it survives navigation, is shareable, and is
  // back-button correct. `librarySearchSchema` passes through `?lobby=` (the
  // multiplayer join-code param `MultiplayerLobby.tsx` reads) untouched.
  validateSearch: librarySearchSchema,
  /**
   * The game itself is `authGate: true`, so a crawler sees a sign-in gate
   * rather than the library — which is exactly why `V12` added `/games/slice-it`
   * as the indexable surface, and why the canonical here points there rather
   * than at this URL. This head exists so the browser tab says what the page is;
   * the SEO lives on the hub.
   */
  head: () => ({
    meta: buildMeta({
      title: 'Slice It! | RMH Studios',
      description: 'Upload any track, get a chart, race up to eight players.',
      path: '/games/slice-it',
    }),
    links: [buildCanonical('/games/slice-it')],
  }),
  component: SliceItPage,
});
