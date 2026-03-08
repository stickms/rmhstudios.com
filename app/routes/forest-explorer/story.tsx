import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const StoryGame = lazy(() => import('@/components/forest-explorer/story/StoryGame').then(m => ({ default: m.StoryGame })))

function ForestExplorerStoryPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="grow relative overflow-hidden">
        <GameErrorBoundary gameName="Forest Explorer">
          <Suspense fallback={<GameLoadingFallback />}>
            <StoryGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/forest-explorer/story')({
  component: ForestExplorerStoryPage,
})
