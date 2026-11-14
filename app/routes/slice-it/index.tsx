import { createFileRoute } from '@tanstack/react-router';
import { SliceThemeWrapper } from '@features/slice-it/ui/SliceThemeWrapper';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { SliceItLoading } from '@features/slice-it/ui/SliceItLoading';
import { validateLibrarySearch } from '@features/slice-it/engine/library-search';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useSliceItStore } from '@features/slice-it/engine/store';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// library for `SliceItLoading` — measured as the whole library vanishing for
// ~1.1s and coming back (docs/archive/2026/fouc-audit-2026-10-06.md §8, §13).
import { GameCanvas } from '@features/slice-it/ui/GameCanvas';
import { ArrivalSuspense } from '@/components/ui/arrive';

function SliceItPage() {
  // The menu is a document on a phone (slice-menu.css, "A phone"): the page scrolls, so
  // Safari's bars collapse and content passes under them. A run is a fixed viewport.
  const screen = useSliceItStore((s) => (s.status === 'MENU' ? 'menu' : 'play'));
  return (
    <SliceThemeWrapper>
      <main className="app-viewport slice-page slice-theme bg-slice-bg" data-slice-screen={screen}>
        {/* Game Canvas — occupies remaining space */}
        <div className="slice-page__body flex-1 min-h-0 w-full relative">
          <GameErrorBoundary gameName="Slice It">
            {/* Slice It's own skeleton, not the shared black sheet — see
                `SliceItLoading` for why this game does not use it. */}
            <ArrivalSuspense fallback={<SliceItLoading />}>
              <GameCanvas />
            </ArrivalSuspense>
          </GameErrorBoundary>
        </div>
      </main>
    </SliceThemeWrapper>
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
