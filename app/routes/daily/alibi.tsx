import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const AlibiGame = lazy(() => import('@/components/daily-puzzles/AlibiGame').then(m => ({ default: m.AlibiGame })))

function AlibiPage() {
    return (
        <GameErrorBoundary gameName="Alibi">
            <Suspense fallback={<GameLoadingFallback background="#efeae0" foreground="#1b1a17" />}>
                <AlibiGame />
            </Suspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/alibi')({
    component: AlibiPage,
})
