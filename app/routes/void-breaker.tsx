import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameBackLink } from '@/components/shared/GameBackLink'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const VoidBreakerGame = lazy(() => import('@/components/void-breaker/VoidBreakerGame').then(m => ({ default: m.VoidBreakerGame })))

function VoidBreakerPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <GameBackLink to="/builds" />
      <div className="grow relative flex items-center justify-center overflow-hidden">
        <GameErrorBoundary gameName="Void Breaker">
          <Suspense fallback={<GameLoadingFallback />}>
            <VoidBreakerGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/void-breaker')({
  component: VoidBreakerPage,
})
