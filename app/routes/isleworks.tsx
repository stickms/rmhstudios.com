import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameBackLink } from '@/components/shared/GameBackLink';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';

const IsleworksGame = lazy(() => import('@/components/isleworks/IsleworksGame'));

function IsleworksPage() {
  return (
    <main
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#8ecbe8]"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <GameBackLink to="/create" z="z-[60]" />

      {/* The island fills whatever viewport it is given — there is no fixed
          playfield to letterbox, so no `.app-stage` here. */}
      <div className="relative grow overflow-hidden">
        <GameErrorBoundary gameName="Isleworks">
          {/* The fallback wears the game's own sky so the chunk arriving reads as
              the island appearing rather than as a different app flashing. */}
          <Suspense fallback={<GameLoadingFallback background="#8ecbe8" foreground="#12314a" />}>
            <IsleworksGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/isleworks')({
  head: () => ({
    meta: buildMeta({
      title: 'Isleworks — isometric island city builder | RMH Studios',
      description:
        'Build a pastel low-poly city on a floating island: lay roads, house residents, wire up power and water, and keep pollution, traffic and happiness in balance.',
      path: '/isleworks',
      image: ogCardPath('game', 'isleworks'),
      imageAlt: 'Isleworks on RMH Studios — an isometric island city builder.',
    }),
    links: [buildCanonical('/isleworks')],
  }),
  component: IsleworksPage,
});
