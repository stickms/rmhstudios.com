/**
 * Altair — Main page orchestrating all game screens.
 * Routes between menu, class select, game, game over, meta shop, and settings
 * based on the game store phase.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAltairGameStore } from '@/lib/altair/stores/game-store'
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store'
import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store'
import AltairHeader from '@/components/altair/AltairHeader'
import MenuScreen from '@/components/altair/screens/MenuScreen'
import ClassSelectScreen from '@/components/altair/screens/ClassSelectScreen'
import GameOverScreen from '@/components/altair/screens/GameOverScreen'
import MetaShopScreen from '@/components/altair/screens/MetaShopScreen'
import SettingsScreen from '@/components/altair/screens/SettingsScreen'
import BestiaryScreen from '@/components/altair/screens/BestiaryScreen'

// Lazy import for the game canvas
const GameScreen = lazy(() => import('@/components/altair/screens/GameScreen'))

function AltairPage() {
  const { t } = useTranslation('r-altair')
  const navigate = useNavigate()
  const phase = useAltairGameStore((s) => s.phase)
  const setPhase = useAltairGameStore((s) => s.setPhase)
  const goToMenu = useAltairGameStore((s) => s.goToMenu)
  const goToClassSelect = useAltairGameStore((s) => s.goToClassSelect)
  const startRun = useAltairGameStore((s) => s.startRun)

  const settingsDoubleTime = useAltairSettingsStore((s) => s.doubleTime)
  const [showSettings, setShowSettings] = useState(false)
  const [showBestiary, setShowBestiary] = useState(false)

  // Track whether run-end side effects have been applied for the current run.
  const runFinalizedRef = useRef(false)
  // Track whether score has been submitted for this run to prevent duplicates.
  const scoreSubmittedRef = useRef(false)

  const computeFinalCoins = useCallback(() => {
    const gameState = useAltairGameStore.getState()
    const meta = useAltairMetaStore.getState()
    const greedLevel = meta.getUpgradeLevel('greed')
    const greedMultiplier = 1 + greedLevel * 0.1
    const dtMultiplier = gameState.doubleTime ? 1.5 : 1
    return Math.floor(gameState.coins * greedMultiplier * dtMultiplier)
  }, [])

  const submitScore = useCallback((keepalive = false) => {
    if (scoreSubmittedRef.current) return

    const gameState = useAltairGameStore.getState()
    const payload = {
      timeSurvived: gameState.timeSurvived,
      kills: gameState.kills,
      totalXP: gameState.xp,
      gold: computeFinalCoins(),
    }

    scoreSubmittedRef.current = true

    if (keepalive && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      if (navigator.sendBeacon('/api/altair/score', blob)) return
    }

    void fetch('/api/altair/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive,
    }).catch(() => { /* silently ignore leaderboard submission failures */ })
  }, [computeFinalCoins])

  const handleClassSelect = useCallback((classId: string) => {
    const meta = useAltairMetaStore.getState()
    const bonuses = meta.getMetaStatBonuses()
    const rerolls = meta.getUpgradeLevel('reroll')
    const banishes = meta.getUpgradeLevel('banish')
    const revival = meta.getUpgradeLevel('revival')
    const extraChoice = meta.getUpgradeLevel('extra_choice') > 0

    startRun(classId, settingsDoubleTime && meta.doubleTimeUnlocked, bonuses, rerolls, banishes, revival, extraChoice)
    meta.incrementRuns()
    runFinalizedRef.current = false
    scoreSubmittedRef.current = false
  }, [startRun, settingsDoubleTime])

  // Music is now managed by AltairShell (persists across all /altair/* routes)

  // Meta progress is loaded from DB in AltairShell (shared across all /altair routes)

  // Retroactive unlock check — runs on mount and when entering class select
  // so players who already met conditions (e.g. after condition changes) get their unlocks
  useEffect(() => {
    useAltairMetaStore.getState().checkUnlocks()
  }, [phase])

  const handleGameEnd = useCallback((keepalive = false) => {
    if (runFinalizedRef.current) return

    const gameState = useAltairGameStore.getState()
    const meta = useAltairMetaStore.getState()

    runFinalizedRef.current = true
    const finalCoins = computeFinalCoins()

    if (gameState.phase === 'victory' && gameState.selectedClassId) {
      const bonus = meta.recordFirstClear(gameState.selectedClassId)
      if (bonus > 0) {
        useAltairGameStore.getState().addCoins(bonus, 'firstClearBonus')
      }
      meta.unlockDoubleTime()
    }

    // Persist best run stats and check all unlock conditions (retroactive)
    meta.updateRunStats(
      gameState.timeSurvived,
      gameState.kills,
      gameState.bossesDefeatedThisRun,
    )
    meta.checkUnlocks()

    meta.addCoins(finalCoins)
    submitScore(keepalive)
    meta.saveToServerNow(keepalive)
  }, [computeFinalCoins, submitScore])

  // Submit score immediately when game ends (death or victory)
  useEffect(() => {
    if (phase !== 'dead' && phase !== 'victory') return
    submitScore()
  }, [phase, submitScore])

  // If the tab closes, page unloads, or user navigates away mid-run, finalize as if Exit was pressed.
  useEffect(() => {
    const finalizeIfRunActive = (keepalive: boolean) => {
      const currentPhase = useAltairGameStore.getState().phase
      if (currentPhase === 'playing' || currentPhase === 'paused' || currentPhase === 'upgrading') {
        handleGameEnd(keepalive)
      }
    }

    const onBeforeUnload = () => finalizeIfRunActive(true)
    const onPageHide = () => finalizeIfRunActive(true)

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      // Covers SPA navigation away from /altair as well.
      finalizeIfRunActive(false)
      // Ensure returning to /altair always lands on the main menu.
      useAltairGameStore.getState().goToMenu()
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [handleGameEnd])

  if (showBestiary) {
    return (
      <>
        <AltairHeader
          context="menu"
          title={t("bestiary", { defaultValue: "Bestiary" })}
          onBack={() => {
            setShowBestiary(false)
          }}
        />
        <BestiaryScreen
          onBack={() => {
            setShowBestiary(false)
          }}
        />
      </>
    )
  }

  if (showSettings) {
    return (
      <>
        <AltairHeader
          context="settings"
          title={t("settings", { defaultValue: "Settings" })}
          onBack={() => {
            setShowSettings(false)
          }}
        />
        <SettingsScreen
          onBack={() => {
            setShowSettings(false)
          }}
        />
      </>
    )
  }

  switch (phase) {
    case 'menu':
      return (
        <>
          <AltairHeader context="menu" />
          <MenuScreen
            onPlay={goToClassSelect}
            onMultiplayer={() => navigate({ to: '/altair/multiplayer' })}
            onMetaShop={() => setPhase('meta_shop')}
            onSettings={() => {
              setShowSettings(true)
            }}
            onBestiary={() => {
              setShowBestiary(true)
            }}
          />
        </>
      )

    case 'class_select':
      return (
        <>
          <AltairHeader context="class_select" title={t("class-select", { defaultValue: "Class Select" })} onBack={goToMenu} />
          <ClassSelectScreen onSelect={handleClassSelect} onBack={goToMenu} />
        </>
      )

    case 'playing':
    case 'paused':
    case 'upgrading':
      return (
        <Suspense fallback={
          <div className="fixed inset-0 bg-(--altair-bg) flex items-center justify-center">
            <div className="text-(--altair-accent) font-mono tracking-widest animate-pulse text-sm">
              {t("initializing", { defaultValue: "INITIALIZING..." })}
            </div>
          </div>
        }>
          <GameScreen
            onQuit={() => {
              handleGameEnd()
              goToMenu()
            }}
            onSettings={() => {
              setShowSettings(true)
            }}
          />
        </Suspense>
      )

    case 'dead':
    case 'victory':
      return (
        <GameOverScreen
          onPlayAgain={() => {
            handleGameEnd()
            goToClassSelect()
          }}
          onMetaShop={() => {
            handleGameEnd()
            setPhase('meta_shop')
          }}
          onMenu={() => {
            handleGameEnd()
            goToMenu()
          }}
        />
      )

    case 'meta_shop':
      return (
        <>
          <AltairHeader context="meta_shop" title={t("meta-shop", { defaultValue: "Meta Shop" })} onBack={goToMenu} />
          <MetaShopScreen onBack={goToMenu} />
        </>
      )

    default:
      return null
  }
}

export const Route = createFileRoute('/altair/')({
  component: AltairPage,
})
