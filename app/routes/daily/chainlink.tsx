import { createFileRoute } from '@tanstack/react-router'
import { buildCanonical, buildMeta } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { ChainlinkGame } from '@/components/daily-puzzles/ChainlinkGame'
import { ArrivalSuspense } from '@/components/ui/arrive'

function ChainlinkPage() {
    return (
        <GameErrorBoundary gameName="Chainlink">
            <ArrivalSuspense fallback={<GameLoadingFallback background="var(--site-bg)" foreground="var(--site-text)" />}>
                <ChainlinkGame />
            </ArrivalSuspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/chainlink')({
  head: () => ({
    meta: buildMeta({ title: 'Chainlink | Daily Puzzles | RMH Studios', description: "Link the words together in today's daily Chainlink puzzle.", path: '/daily/chainlink' }),
    links: [buildCanonical('/daily/chainlink')],
  }),
    component: ChainlinkPage,
})
