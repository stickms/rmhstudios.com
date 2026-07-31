import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { GameBackLink } from '@/components/shared/GameBackLink'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'
import { DesktopControlsGate } from '@/components/shared/DesktopControlsGate'

const ExploreGame = lazy(() => import('@/components/forest-explorer/explore/ExploreGame').then(m => ({ default: m.ExploreGame })))

function ForestExplorerExplorePage() {
  const { t } = useTranslation("r-forest-explorer")
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <GameBackLink to="/forest-explorer" label={t("back", { defaultValue: "Back" })} />
      <div className="grow relative overflow-hidden">
        <GameErrorBoundary gameName="Forest Explorer">
          <DesktopControlsGate gameName="Forest Explorer" backTo="/forest-explorer">
            <Suspense fallback={<GameLoadingFallback />}>
              <ExploreGame />
            </Suspense>
          </DesktopControlsGate>
        </GameErrorBoundary>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/forest-explorer/explore')({
  component: ForestExplorerExplorePage,
})
