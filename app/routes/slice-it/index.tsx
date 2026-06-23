import { lazy, Suspense } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { DarkModeWrapper } from '@/components/slice-it/DarkModeWrapper'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const GameCanvas = lazy(() => import('@/components/game/GameCanvas').then(m => ({ default: m.GameCanvas })))

function SliceItPage() {
  const { t } = useTranslation("r-slice-it")
  return (
    <DarkModeWrapper>
      <main className="fixed inset-0 slice-theme overflow-hidden flex flex-col bg-slice-bg transition-colors duration-300">
        {/* Header */}
        <div className="p-3 shrink-0 flex items-center gap-3 shadow-sm z-10 bg-slice-bg border-b border-slice-shadow-dark/30 transition-colors duration-300">
          <Link to="/builds">
            <Button
              variant="ghost"
              size="sm"
              className="text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark/20 transition-all rounded-lg text-xs"
            >
              <ArrowLeft className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline font-bold">{t("back-to-builds", { defaultValue: "Back to Builds" })}</span>
            </Button>
          </Link>
          <span className="text-xs font-black text-slice-text-light uppercase tracking-widest hidden sm:inline">|</span>
          <span className="text-sm font-black text-slice-text uppercase tracking-widest hidden sm:inline">Slice-It</span>
        </div>

        {/* Game Canvas — occupies remaining space */}
        <div className="flex-1 min-h-0 w-full relative">
          <GameErrorBoundary gameName="Slice It">
            <Suspense fallback={<GameLoadingFallback />}>
              <GameCanvas />
            </Suspense>
          </GameErrorBoundary>
        </div>
      </main>
    </DarkModeWrapper>
  )
}

export const Route = createFileRoute('/slice-it/')({
  component: SliceItPage,
})
