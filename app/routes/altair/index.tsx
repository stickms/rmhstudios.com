/**
 * Altair — Main page orchestrating all game screens.
 * Routes between menu, class select, game, game over, meta shop, and settings
 * based on the game store phase.
 */

import { createFileRoute } from '@tanstack/react-router'
import { gameRouteHead } from '@/lib/seo-catalog';
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAltairGameStore } from '@features/altair/engine/stores/game-store'
import { useAltairMetaStore } from '@features/altair/engine/stores/meta-store'
import { useAltairSettingsStore } from '@features/altair/engine/stores/settings-store'
import { finalCoinsFor, loadoutFromUpgrades } from '@features/altair/engine/solo/loadout'
import { clearSoloSession, getActiveRun, getSoloSession, setSoloSession } from '@features/altair/engine/solo/session'
import { startServerRun, submitSoloRun, waitForVerdict } from '@features/altair/engine/solo/client'
import { setFallbackRun } from '@features/altair/engine/stores/meta-store'
import { useSignInGate } from '@/components/shared/SignInRequiredDialog'
import AltairHeader from '@features/altair/ui/AltairHeader'
import MenuScreen from '@features/altair/ui/screens/MenuScreen'
import ClassSelectScreen from '@features/altair/ui/screens/ClassSelectScreen'
import GameOverScreen from '@features/altair/ui/screens/GameOverScreen'
import MetaShopScreen from '@features/altair/ui/screens/MetaShopScreen'
import SettingsScreen from '@features/altair/ui/screens/SettingsScreen'
import BestiaryScreen from '@features/altair/ui/screens/BestiaryScreen'

// Lazy import for the game canvas
const GameScreen = lazy(() => import('@features/altair/ui/screens/GameScreen'))

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

  // Co-op is the only part of Altair that needs an account, so it is the only
  // part that asks. A modal rather than the route's own redirect: the redirect
  // still guards the URL, but reaching it by tapping MULTIPLAYER in a game you
  // are already playing should not cost you the screen you were on.
  const coopGate = useSignInGate()

  // Track whether run-end side effects have been applied for the current run.
  const runFinalizedRef = useRef(false)
  // Track whether score has been submitted for this run to prevent duplicates.
  const scoreSubmittedRef = useRef(false)

  const computeFinalCoins = useCallback(() => {
    const gameState = useAltairGameStore.getState()
    const meta = useAltairMetaStore.getState()
    return finalCoinsFor(gameState.coins, meta.getUpgradeLevel('meta_greed'), gameState.doubleTime, gameState.heat)
  }, [])

  const submitScore = useCallback((keepalive = false) => {
    if (scoreSubmittedRef.current) return
    // A server-issued run is scored from its replay (features/altair/engine/solo), never from these numbers.
    if (getSoloSession()?.runId && getActiveRun()) return

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

  const startingRef = useRef(false)
  const handleClassSelect = useCallback(async (classId: string) => {
    if (startingRef.current) return
    startingRef.current = true
    try {
      const meta = useAltairMetaStore.getState()
      const bonuses = meta.getMetaStatBonuses()
      const wantDoubleTime = settingsDoubleTime && meta.doubleTimeUnlocked

      // The server issues the seed and the loadout (from its own copy of the upgrades). Without one
      // (signed out, offline) the run is played and saved locally exactly as before.
      setSoloSession(null)
      clearSoloSession()
      // Heat needs a server-issued run (it is replay-verified and its tier is checked against the account's
      // verified victories); a run that falls back to local play is always standard.
      const wantHeat = useAltairSettingsStore.getState().heat
      const issued = await startServerRun(classId, wantDoubleTime, wantHeat)
      const doubleTime = issued ? issued.doubleTime : wantDoubleTime
      const loadout = issued ? issued.loadout : loadoutFromUpgrades(meta.upgrades)

      startRun(classId, doubleTime, bonuses, loadout.rerolls, loadout.banishes, loadout.revival, loadout.extraChoice, loadout.heat ?? 0)
      meta.incrementRuns()
      runFinalizedRef.current = false
      scoreSubmittedRef.current = false
    } finally {
      startingRef.current = false
    }
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

    const session = getSoloSession()
    const run = getActiveRun()
    const clearedClass = gameState.phase === 'victory' ? gameState.selectedClassId : null
    // The first-clear bonus is flat (not multiplied) and paid ONCE per class. A server-issued run gets it
    // from the server, which adds it to the replay's payout (features/altair/engine/solo/persist.server.ts); this
    // client claims none. Every other path (signed out / offline, or a run the server could not take)
    // pays it locally, into the same payout that is saved below.
    const payFirstClear = () => {
      if (!clearedClass) return 0
      const bonus = meta.recordFirstClear(clearedClass)
      if (bonus > 0) useAltairGameStore.getState().addCoins(bonus, 'firstClearBonus')
      return bonus
    }
    if (clearedClass) meta.unlockDoubleTime()

    // Persist best run stats and check all unlock conditions (retroactive)
    meta.updateRunStats(
      gameState.timeSurvived,
      gameState.kills,
      gameState.bossesDefeatedThisRun,
    )
    meta.checkUnlocks()

    if (session?.runId && run) {
      // Server-verified run: hand in the log. Coins and leaderboard rows come from its replay.
      const runId = session.runId
      // Captured now: the run store is reset the moment the player leaves the results screen.
      const legacyScore = {
        timeSurvived: gameState.timeSurvived,
        kills: gameState.kills,
        totalXP: gameState.xp,
        gold: finalCoins,
      }
      clearSoloSession()
      meta.saveToServerNow(keepalive)
      void (async () => {
        const sent = await submitSoloRun(runId, run, keepalive)
        if (sent === 'queued' || sent === 'inline') {
          const verdict = await waitForVerdict(runId)
          if (verdict === 'verified') await useAltairMetaStore.getState().loadFromServer()
          if (verdict !== 'unverified') return
        } else if (sent === 'duplicate') {
          return
        }
        // The server could not take or verify it: fall back to the capped legacy payout, once.
        setFallbackRun(runId)
        const bonus = payFirstClear()
        useAltairMetaStore.getState().addCoins(finalCoins + bonus)
        void fetch('/api/altair/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(legacyScore),
        }).catch(() => { /* silently ignore leaderboard submission failures */ })
        useAltairMetaStore.getState().saveToServerNow(false)
      })()
      return
    }

    const bonus = payFirstClear()
    meta.addCoins(finalCoins + bonus)
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
            onMultiplayer={() =>
              coopGate.require(
                () => navigate({ to: '/altair/multiplayer' }),
                t('multiplayer-feature', { defaultValue: 'Playing Altair with someone else' }),
              )
            }
            onMetaShop={() => setPhase('meta_shop')}
            onSettings={() => {
              setShowSettings(true)
            }}
            onBestiary={() => {
              setShowBestiary(true)
            }}
          />
          {coopGate.dialog}
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
  head: () => gameRouteHead('altair'),
  component: AltairPage,
})
