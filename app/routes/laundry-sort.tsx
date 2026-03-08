import { lazy, Suspense } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const LaundryGame = lazy(() => import('@/components/laundry-sort/LaundryGame').then(m => ({ default: m.LaundryGame })))

function LaundryPage() {
  return (
    <main className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      {/* Back button */}
      <div className="absolute top-3 left-3 z-50">
        <Link to="/builds">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">RMH Studios</span>
          </Button>
        </Link>
      </div>

      {/* Title */}
      <div className="text-center pt-3 pb-1 shrink-0">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black rainbow-text tracking-tighter italic glitch-text leading-none">
          LAUNDRY SORT
        </h1>
      </div>

      {/* Game area — fills remaining space */}
      <div className="grow relative">
        <GameErrorBoundary gameName="Laundry Sort">
          <Suspense fallback={<GameLoadingFallback />}>
            <LaundryGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/laundry-sort')({
  component: LaundryPage,
})
