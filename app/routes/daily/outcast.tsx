import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const OutcastGame = lazy(() => import('@/components/daily-puzzles/OutcastGame').then(m => ({ default: m.OutcastGame })))

function OutcastPage() {
    return (
        <GameErrorBoundary gameName="Outcast">
            <Suspense fallback={<GameLoadingFallback background="#efeae0" foreground="#1b1a17" />}>
                <OutcastGame />
            </Suspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/outcast')({
    component: OutcastPage,
})
