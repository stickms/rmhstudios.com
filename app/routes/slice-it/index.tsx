import { Suspense } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DarkModeWrapper } from '@/components/slice-it/DarkModeWrapper';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { SliceItLoading } from '@/components/slice-it/SliceItLoading';
import { validateLibrarySearch } from '@/lib/slice-it/library-search';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// library for `SliceItLoading` — measured as the whole library vanishing for
// ~1.1s and coming back (docs/fouc-audit-2026-10-06.md §8, §13).
import { GameCanvas } from '@/components/slice-it/GameCanvas';

function SliceItPage() {
  const { t } = useTranslation('r-slice-it');
  const goBack = useBackOrFallback();
  return (
    <DarkModeWrapper>
      <main className="app-viewport slice-theme bg-slice-bg transition-colors duration-site">
        {/* Header — clears the notch (§12.1 rule 1); the world below runs edge to edge. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slice-shadow-dark/30 bg-slice-bg pt-[calc(0.75rem+var(--safe-top))] pr-[calc(0.75rem+var(--safe-right))] pb-3 pl-[calc(0.75rem+var(--safe-left))] transition-colors duration-site">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-slice-text-muted transition-colors hover:bg-slice-shadow-dark/20 hover:text-slice-text"
          >
            <Link to="/games" onClick={goBack}>
              <ArrowLeft aria-hidden />
              <span className="hidden font-bold sm:inline">
                {t('back-to-builds', { defaultValue: 'Back to Builds' })}
              </span>
              <span className="sr-only sm:hidden">
                {t('back-to-builds', { defaultValue: 'Back to Builds' })}
              </span>
            </Link>
          </Button>
          <span aria-hidden className="hidden text-xs font-black text-slice-text-light sm:inline">
            |
          </span>
          <span className="hidden text-sm font-black text-slice-text sm:inline">Slice-It</span>
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
  // back-button correct. `validateLibrarySearch` passes through `?lobby=` (the
  // multiplayer join-code param `MultiplayerLobby.tsx` reads) untouched.
  validateSearch: validateLibrarySearch,
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
