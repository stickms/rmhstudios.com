import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const LightsOutGame = lazy(() => import('@/components/lights-out/LightsOutGame').then(m => ({ default: m.LightsOutGame })))

function LightsOutPage() {
    return (
        <GameErrorBoundary gameName="Lights Out">
            <Suspense fallback={<GameLoadingFallback />}>
                <LightsOutGame />
            </Suspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/lights-out')({
    component: LightsOutPage,
})
