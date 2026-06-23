import { lazy, Suspense } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const ExploreGame = lazy(() => import('@/components/forest-explorer/explore/ExploreGame').then(m => ({ default: m.ExploreGame })))

function ForestExplorerExplorePage() {
  const { t } = useTranslation("r-forest-explorer")
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="absolute top-3 left-3 z-50">
        <Link to="/forest-explorer">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{t("back", { defaultValue: "Back" })}</span>
          </Button>
        </Link>
      </div>
      <div className="grow relative overflow-hidden">
        <GameErrorBoundary gameName="Forest Explorer">
          <Suspense fallback={<GameLoadingFallback />}>
            <ExploreGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/forest-explorer/explore')({
  component: ForestExplorerExplorePage,
})
