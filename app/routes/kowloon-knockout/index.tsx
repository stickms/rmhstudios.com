import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GameBackLink } from '@/components/shared/GameBackLink'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const KowloonKnockout = lazy(() => import('@/components/kowloon-knockout/KowloonKnockout'))

function KowloonKnockoutPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <GameBackLink to="/games" />
      <div className="grow relative overflow-hidden">
        <GameErrorBoundary gameName="Kowloon Knockout">
          <Suspense fallback={<GameLoadingFallback />}>
            <KowloonKnockout />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/kowloon-knockout/')({
  component: KowloonKnockoutPage,
})
