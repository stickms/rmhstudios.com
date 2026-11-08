import { lazy, Suspense } from 'react';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';

const HearthworksGame = lazy(() => import('@/components/hearthworks/HearthworksGame'));

const SKY = '#dff3f8';
const INK = '#1f6a74';

function HearthworksPage() {
  return (
    <main
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: SKY, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="relative grow overflow-hidden">
        <GameErrorBoundary gameName="Hearthworks">
          {/* <Canvas> cannot render on the server, so SSR emits the fallback and the world mounts after hydration. */}
          <ClientOnly fallback={<GameLoadingFallback background={SKY} foreground={INK} />}>
            <Suspense fallback={<GameLoadingFallback background={SKY} foreground={INK} />}>
              <HearthworksGame />
            </Suspense>
          </ClientOnly>
        </GameErrorBoundary>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/hearthworks')({
  head: () => ({
    meta: buildMeta({
      title: 'Hearthworks — build a cozy town, farm, cook and trade | RMH Studios',
      description:
        'Build a town, farm and forage, cook and sell to your neighbours, and automate it all — in one world you play from above or on foot.',
      path: '/hearthworks',
      image: ogCardPath('game', 'hearthworks'),
      imageAlt: 'Hearthworks on RMH Studios — a cozy town builder on floating islands.',
    }),
    links: [buildCanonical('/hearthworks')],
  }),
  component: HearthworksPage,
});
