import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameBackLink } from '@/components/shared/GameBackLink'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import KowloonKnockout from '@/components/kowloon-knockout/KowloonKnockout'

function KowloonKnockoutPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <GameBackLink to="/games" />
      <div className="grow relative overflow-hidden">
        <GameErrorBoundary gameName="Kowloon Knockout">
          <Suspense fallback={<GameLoadingFallback />}>
            <KowloonKnockout />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/kowloon-knockout/')({
  component: KowloonKnockoutPage,
})
