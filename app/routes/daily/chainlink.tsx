import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const ChainlinkGame = lazy(() => import('@/components/daily-puzzles/ChainlinkGame').then(m => ({ default: m.ChainlinkGame })))

function ChainlinkPage() {
    return (
        <GameErrorBoundary gameName="Chainlink">
            <Suspense fallback={<GameLoadingFallback />}>
                <ChainlinkGame />
            </Suspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/chainlink')({
    component: ChainlinkPage,
})
