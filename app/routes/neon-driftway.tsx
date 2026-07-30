import { lazy, Suspense } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const NeonDriftwayGame = lazy(() => import('@/components/neon-driftway/NeonDriftwayGame').then(m => ({ default: m.NeonDriftwayGame })))

function NeonDriftwayPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div
        className="absolute left-3 z-50"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
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

      {/* The cockpit fills the viewport at every aspect ratio — the renderer
          adapts its field of view rather than letterboxing a fixed frame. */}
      <div className="grow relative overflow-hidden">
        <GameErrorBoundary gameName="Neon Driftway">
          <Suspense fallback={<GameLoadingFallback />}>
            <NeonDriftwayGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/neon-driftway')({
  component: NeonDriftwayPage,
})
