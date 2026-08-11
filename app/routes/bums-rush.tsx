import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameBackLink } from '@/components/shared/GameBackLink';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import bumsRushCss from '@/components/bums-rush/bums-rush.css?url';

const BumsRushGame = lazy(() =>
  import('@/components/bums-rush/BumsRushGame').then((m) => ({ default: m.BumsRushGame })),
);

/**
 * `?room=ABC123` is the invite link from design doc §9.7. It is a JOIN code and
 * carries no authority, which is why it is safe in a URL — unlike a party
 * ticket, which goes through router state and never appears here.
 */
/**
 * Hand-rolled rather than a zod schema, and this one genuinely has to be:
 * `validateSearch` runs in the BROWSER on every navigation, so unlike a server
 * function's validator it cannot hide behind a `.server` module. A top-level
 * `import { z } from 'zod'` in any route file is aggregated into the shared entry
 * chunk, which put zod (71 KB raw) on the critical path of every page on the site
 * — to parse two optional search params on one game route.
 *
 * The checks are the same ones the schema made: `room` is a 6-character join code
 * or absent, `editor` is a boolean coerced from whatever the URL carried. An
 * invalid value is dropped rather than thrown on, which is what `.optional()` did.
 */
interface BumsRushSearch {
  room?: string;
  editor?: boolean;
}

function parseSearch(search: Record<string, unknown>): BumsRushSearch {
  const out: BumsRushSearch = {};
  const room = search.room;
  if (typeof room === 'string' && room.length === 6) out.room = room;
  // `Boolean(...)`, matching `z.coerce.boolean()` exactly — including that it
  // treats the string '0' as true. Preserved rather than "fixed": the flag is
  // only ever produced by the editor link, so presence is the signal, and
  // tightening it here would be a behaviour change smuggled into a perf fix.
  const editor = search.editor;
  if (editor !== undefined) out.editor = Boolean(editor);
  return out;
}

function BumsRushPage() {
  const { room } = Route.useSearch();

  return (
    /*
     * Deliberately NOT `fixed inset-0`, which is what the other full-screen
     * games use. Bum's Rush has document-shaped screens (title, world map,
     * wardrobe, results) as well as a fixed-viewport one (the level), and
     * pinning the route would cost a phone the collapsing address bar on every
     * one of them — design-language.md §12.1 rule 6. The game component owns
     * that switch, because it is the only thing that knows which screen is up.
     */
    <div className="bums-theme min-h-[100svh] bg-bum-paper text-bum-ink">
      {/* `light` because this game's ground is cream paper, not the near-black
          every other full-screen game uses. */}
      <GameBackLink to="/games" tone="light" />
      <GameErrorBoundary gameName="Bum's Rush">
        <Suspense fallback={<GameLoadingFallback />}>
          <BumsRushGame initialRoomCode={room ?? null} />
        </Suspense>
      </GameErrorBoundary>
    </div>
  );
}

export const Route = createFileRoute('/bums-rush')({
  validateSearch: parseSearch,
  head: () => gameRouteHead('bums-rush', { links: [{ rel: 'stylesheet', href: bumsRushCss }] }),
  component: BumsRushPage,
});
