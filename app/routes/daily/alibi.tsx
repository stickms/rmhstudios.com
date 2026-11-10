import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { buildCanonical, buildMeta } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { AlibiGame } from '@/components/daily-puzzles/AlibiGame'

function AlibiPage() {
    return (
        <GameErrorBoundary gameName="Alibi">
            <Suspense fallback={<GameLoadingFallback background="var(--site-bg)" foreground="var(--site-text)" />}>
                <AlibiGame />
            </Suspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/alibi')({
  head: () => ({
    meta: buildMeta({ title: 'Alibi | Daily Puzzles | RMH Studios', description: "Question the suspects and spot the lie in today's daily alibi puzzle.", path: '/daily/alibi' }),
    links: [buildCanonical('/daily/alibi')],
  }),
    component: AlibiPage,
})
