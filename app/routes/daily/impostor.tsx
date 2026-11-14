import { createFileRoute } from '@tanstack/react-router'
import { buildCanonical, buildMeta } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { ImpostorGame } from '@/components/daily-puzzles/ImpostorGame'
import { ArrivalSuspense } from '@/components/ui/arrive'

function ImpostorPage() {
    return (
        <GameErrorBoundary gameName="Impostor">
            <ArrivalSuspense fallback={<GameLoadingFallback background="var(--site-bg)" foreground="var(--site-text)" />}>
                <ImpostorGame />
            </ArrivalSuspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/impostor')({
  head: () => ({
    meta: buildMeta({ title: 'Impostor | Daily Puzzles | RMH Studios', description: "Find the impostor in today's daily deduction puzzle.", path: '/daily/impostor' }),
    links: [buildCanonical('/daily/impostor')],
  }),
    component: ImpostorPage,
})
