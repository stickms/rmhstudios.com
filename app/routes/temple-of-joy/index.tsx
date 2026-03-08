import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const TempleOfJoyGate = lazy(() => import('@/components/temple-of-joy/TempleOfJoyGate').then(m => ({ default: m.TempleOfJoyGate })))

function TempleOfJoyPage() {
  return (
    <GameErrorBoundary gameName="Temple of Joy">
      <Suspense fallback={<GameLoadingFallback />}>
        <TempleOfJoyGate />
      </Suspense>
    </GameErrorBoundary>
  )
}

export const Route = createFileRoute('/temple-of-joy/')({
  component: TempleOfJoyPage,
})
