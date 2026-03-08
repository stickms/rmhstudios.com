import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const Velum2099Game = lazy(() => import('@/components/velum2099/Velum2099Game').then(m => ({ default: m.Velum2099Game })))

function Velum2099Page() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <GameErrorBoundary gameName="VELUM 2099">
        <Suspense fallback={<GameLoadingFallback />}>
          <Velum2099Game />
        </Suspense>
      </GameErrorBoundary>
    </main>
  )
}

export const Route = createFileRoute('/velum2099')({
  component: Velum2099Page,
})
