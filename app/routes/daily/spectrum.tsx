import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const SpectrumGame = lazy(() => import('@/components/daily-puzzles/SpectrumGame').then(m => ({ default: m.SpectrumGame })))

function SpectrumPage() {
    return (
        <GameErrorBoundary gameName="Spectrum">
            <Suspense fallback={<GameLoadingFallback />}>
                <SpectrumGame />
            </Suspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/spectrum')({
    component: SpectrumPage,
})
