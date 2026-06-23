import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const RMHCodingSimulator = lazy(() =>
  import('@/components/rmh-coding-simulator/RMHCodingSimulator').then((m) => ({
    default: m.RMHCodingSimulator,
  })),
)

function RMHCodingSimulatorPage() {
  return (
    <GameErrorBoundary gameName="RMH Coding Simulator">
      <Suspense fallback={<GameLoadingFallback />}>
        <RMHCodingSimulator />
      </Suspense>
    </GameErrorBoundary>
  )
}

export const Route = createFileRoute('/rmh-coding-simulator')({
  head: () => ({
    meta: [
      { title: 'RMH Coding Simulator | RMH Studios' },
      {
        name: 'description',
        content:
          'Write Lines of Code, hire AI developers, ship products, and IPO your studio in this deep idle clicker — with an AI Architect powered by DeepSeek.',
      },
    ],
  }),
  component: RMHCodingSimulatorPage,
})
