import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const DailyPuzzleHub = lazy(() => import('@/components/daily-puzzles/DailyPuzzleHub').then(m => ({ default: m.DailyPuzzleHub })))

function DailyPuzzlesPage() {
    return (
        <GameErrorBoundary gameName="Daily Puzzles">
            <Suspense fallback={<GameLoadingFallback />}>
                <DailyPuzzleHub />
            </Suspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/')({
    component: DailyPuzzlesPage,
})
