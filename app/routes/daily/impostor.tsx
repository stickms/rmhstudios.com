import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const ImpostorGame = lazy(() => import('@/components/daily-puzzles/ImpostorGame').then(m => ({ default: m.ImpostorGame })))

function ImpostorPage() {
    return (
        <GameErrorBoundary gameName="Impostor">
            <Suspense fallback={<GameLoadingFallback background="#efeae0" foreground="#1b1a17" />}>
                <ImpostorGame />
            </Suspense>
        </GameErrorBoundary>
    )
}

export const Route = createFileRoute('/daily/impostor')({
    component: ImpostorPage,
})
