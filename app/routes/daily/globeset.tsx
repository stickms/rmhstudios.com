import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildMeta } from '@/lib/seo';

const GlobeSetGame = lazy(() =>
  import('@/components/daily-puzzles/globeset/GlobeSetGame').then((m) => ({
    default: m.GlobeSetGame,
  })),
);

const PATH = '/daily/globeset';

function GlobeSetPage() {
  return (
    <GameErrorBoundary gameName="GlobeSet">
      <Suspense fallback={<GameLoadingFallback background="#efeae0" foreground="#1b1a17" />}>
        <GlobeSetGame />
      </Suspense>
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/daily/globeset')({
  /**
   * Meta but deliberately NO `buildCanonical`.
   *
   * The `/daily` layout route already emits a canonical pointing at the hub,
   * and `lib/sitemap.ts` classifies this path `duplicate` — "alias of a
   * canonical URL that IS listed" — for the reason every daily puzzle is:
   * the content rotates every night, so the hub is the stable address. Adding
   * a second `<link rel="canonical">` here does not override that one, it
   * emits BOTH (verified in the rendered head), and two canonicals means a
   * crawler honours neither. `buildMeta` still runs, so the page keeps its own
   * title, description and share card.
   */
  head: () => ({
    meta: buildMeta({
      title: 'GlobeSet — the daily globe puzzle | RMH Studios',
      description:
        'Sixty-three cards on a glass globe you turn with a finger. Find every group whose colours all pair up, clear the deck against the clock, and share your grid. Turn the gyroscope on and the globe stays put in the room while you walk around it. A new deal every day at midnight EST — the same one for everyone.',
      path: PATH,
    }),
  }),
  component: GlobeSetPage,
});
