import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const SynapseStormGate = lazy(() => import('@/components/synapse-storm/SynapseStormGate').then(m => ({ default: m.SynapseStormGate })))

function SynapseStormPage() {
  return (
    <GameErrorBoundary gameName="Synapse Storm">
      <Suspense fallback={<GameLoadingFallback />}>
        <SynapseStormGate />
      </Suspense>
    </GameErrorBoundary>
  )
}

export const Route = createFileRoute('/synapse-storm')({
  component: SynapseStormPage,
})
