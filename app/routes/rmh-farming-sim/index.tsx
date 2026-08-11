import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameBackLink } from '@/components/shared/GameBackLink'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const RmhFarmingSim = lazy(() => import('@/components/rmh-farming-sim/RmhFarmingSim'))

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
