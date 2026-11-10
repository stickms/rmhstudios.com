/**
 * Dream Rift — a Touhou-style co-op danmaku bullet hell.
 */

import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { DreamRiftGate } from '@features/dream-rift/ui/DreamRiftGate';
// Cinzel + Playfair Display, the game's lettering — self-hosted with
// `font-display: optional` (app/fonts/) and loaded with this route only.
import dreamRiftFontsCss from '@/app/fonts/dream-rift.css?url';

export const Route = createFileRoute('/dream-rift')({
  head: () => gameRouteHead('dream-rift', { links: [{ rel: 'stylesheet', href: dreamRiftFontsCss }] }),
  component: DreamRiftPage,
});

function DreamRiftPage() {
  return (
    <GameErrorBoundary gameName="Dream Rift">
      <Suspense fallback={<GameLoadingFallback />}>
        <DreamRiftGate />
      </Suspense>
    </GameErrorBoundary>
  );
}
