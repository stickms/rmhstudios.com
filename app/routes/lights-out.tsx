import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const LightsOutGame = lazy(() => import('@/components/lights-out/LightsOutGame').then(m => ({ default: m.LightsOutGame })))

function LightsOutPage() {
  return (
    <div className="min-h-screen bg-site-bg text-site-text pt-8 pb-16">
      <GameErrorBoundary gameName="Lights Out">
        <Suspense fallback={<GameLoadingFallback />}>
          <LightsOutGame />
        </Suspense>
      </GameErrorBoundary>
    </div>
  )
}

export const Route = createFileRoute('/lights-out')({
  component: LightsOutPage,
})
