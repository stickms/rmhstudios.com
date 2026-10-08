import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameBackLink } from '@/components/shared/GameBackLink'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import RmhFarmingSim from '@/components/rmh-farming-sim/RmhFarmingSim'

function RmhFarmingSimPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      <GameBackLink to="/games" />
      <div className="grow relative overflow-hidden">
        <GameErrorBoundary gameName="RMH Farming Simulator">
          <Suspense fallback={<GameLoadingFallback />}>
            <RmhFarmingSim />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/rmh-farming-sim/')({
  component: RmhFarmingSimPage,
})
