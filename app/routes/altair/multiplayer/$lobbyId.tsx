/**
 * Altair Multiplayer Lobby Page
 *
 * Renders the lobby view with player list, inline class selection,
 * chat, and host controls. Transitions to game screen when PLAYING.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { connectToAltair, emit } from '@/lib/altair/multiplayer/socket'
import { useAltairMultiplayerStore } from '@/lib/altair/multiplayer/store'
import { C2S, S2C } from '@/lib/altair/multiplayer/events'
import { useAltairToastStore } from '@/lib/altair/stores/toast-store'
import AltairHeader from '@/components/altair/AltairHeader'
import ClassSelectLobby from '@/components/altair/multiplayer/ClassSelectLobby'
import LobbyWaiting from '@/components/altair/multiplayer/LobbyWaiting'
import type { GameResultsData } from '@/lib/altair/multiplayer/types'

// Lazy import for the multiplayer game screen
const MultiplayerGameScreen = lazy(
  () => import('@/components/altair/multiplayer/MultiplayerGameScreen'),
)

// Lazy import for results screen
const MultiplayerResultsScreen = lazy(
  () => import('@/components/altair/multiplayer/MultiplayerResultsScreen'),
)

function AltairLobbyPage() {
  const { t } = useTranslation("r-altair")
  const { lobbyId } = Route.useParams()
  const navigate = useNavigate()
  const lobby = useAltairMultiplayerStore((s) => s.lobby)
  const connectionStatus = useAltairMultiplayerStore((s) => s.connectionStatus)
  const countdown = useAltairMultiplayerStore((s) => s.countdown)
  const gameStarted = useAltairMultiplayerStore((s) => s.gameStarted)
  const results = useAltairMultiplayerStore((s) => s.results)
  const addToast = useAltairToastStore((s) => s.addToast)

  // Connect and join lobby on mount
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const socket = await connectToAltair()

        // Join the lobby
        socket.emit(C2S.LOBBY_JOIN, { lobbyId })

        // Listen for kick
        socket.on(S2C.LOBBY_KICKED, () => {
          if (mounted) {
            useAltairMultiplayerStore.getState().leaveLobby()
            addToast(t("kicked-from-lobby", { defaultValue: "You were kicked from the lobby" }), 'warning')
            navigate({ to: '/altair/multiplayer' })
          }
        })

        // Listen for disband
        socket.on(S2C.LOBBY_DISBANDED, () => {
          if (mounted) {
            useAltairMultiplayerStore.getState().leaveLobby()
            addToast(t("lobby-disbanded", { defaultValue: "Lobby was disbanded" }), 'info')
            navigate({ to: '/altair/multiplayer' })
          }
        })

        // Listen for errors
        socket.on(S2C.ERROR, (data: { code?: string; message?: string }) => {
          if (!mounted) return
          if (data.code === 'LOBBY_NOT_FOUND' || data.code === 'NOT_IN_LOBBY') {
            useAltairMultiplayerStore.getState().leaveLobby()
            navigate({ to: '/altair/multiplayer' })
          }
        })
      } catch (err) {
        if (mounted) addToast(err instanceof Error ? err.message : t("failed-to-connect", { defaultValue: "Failed to connect" }), 'error')
      }
    }

    init()
    return () => { mounted = false }
  }, [lobbyId, navigate, addToast])

  const handleLeave = useCallback(() => {
    emit(C2S.LOBBY_LEAVE, { lobbyId })
    useAltairMultiplayerStore.getState().leaveLobby()
    navigate({ to: '/altair/multiplayer' })
  }, [lobbyId, navigate])

  // Loading state
  if (connectionStatus === 'connecting' || connectionStatus === 'disconnected') {
    return (
      <>
        <AltairHeader context="menu" title={t("multiplayer-title", { defaultValue: "Multiplayer" })} onBack={() => navigate({ to: '/altair/multiplayer' })} connectionStatus={connectionStatus} />
        <div className="flex flex-1 items-center-safe justify-center-safe p-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-2xl text-(--altair-text)">{t("connecting", { defaultValue: "Connecting..." })}</div>
            <div role="status" aria-label={t("loading", { defaultValue: "Loading…" })} className="mx-auto size-8 animate-spin rounded-full border-2 border-(--altair-accent) border-t-transparent" />
          </div>
        </div>
      </>
    )
  }

  // Error state
  if (connectionStatus === 'error') {
    return (
      <>
        <AltairHeader context="menu" title={t("multiplayer-title", { defaultValue: "Multiplayer" })} onBack={() => navigate({ to: '/altair/multiplayer' })} connectionStatus={connectionStatus} />
        <div className="flex flex-1 items-center-safe justify-center-safe p-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-2xl text-(--altair-danger)">{t("connection-error", { defaultValue: "Connection error" })}</div>
            <button
              onClick={() => navigate({ to: '/altair/multiplayer' })}
              className="min-h-11 px-6 py-2 rounded-(--altair-radius) bg-(--altair-accent) text-(--altair-accent-fg) font-semibold hover:bg-(--altair-accent-hover) transition-colors"
            >
              {t("back-to-lobby-browser", { defaultValue: "Back to Lobby Browser" })}
            </button>
          </div>
        </div>
      </>
    )
  }

  // No lobby state yet
  if (!lobby) {
    return (
      <>
        <AltairHeader context="menu" title={t("multiplayer-title", { defaultValue: "Multiplayer" })} onBack={() => navigate({ to: '/altair/multiplayer' })} connectionStatus={connectionStatus} />
        <div className="flex flex-1 items-center-safe justify-center-safe p-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-2xl text-(--altair-text)">{t("joining-lobby", { defaultValue: "Joining lobby {{lobbyId}}...", lobbyId })}</div>
            <div role="status" aria-label={t("loading", { defaultValue: "Loading…" })} className="mx-auto size-8 animate-spin rounded-full border-2 border-(--altair-accent) border-t-transparent" />
          </div>
        </div>
      </>
    )
  }

  const isHost = lobby.hostUserId === lobby.myUserId

  // Game in progress
  if (lobby.state === 'PLAYING' || gameStarted) {
    return (
      <Suspense fallback={
        <div className="fixed inset-0 bg-(--altair-bg) flex items-center justify-center">
          <div className="text-(--altair-accent) font-mono tracking-widest animate-pulse text-sm">
            {t("loading-game", { defaultValue: "LOADING GAME..." })}
          </div>
        </div>
      }>
        <MultiplayerGameScreen lobbyId={lobbyId} />
      </Suspense>
    )
  }

  // Results
  if (lobby.state === 'RESULTS' && results) {
    return (
      <Suspense fallback={null}>
        <MultiplayerResultsScreen
          results={results}
          onPlayAgain={() => {
            // Host restarts, others stay in lobby
            useAltairMultiplayerStore.getState().setResults(null as unknown as GameResultsData)
          }}
          onLeave={handleLeave}
        />
      </Suspense>
    )
  }

  // Countdown
  if (lobby.state === 'COUNTDOWN' && countdown !== null) {
    return (
      <>
        <AltairHeader context="menu" title={t("multiplayer-title", { defaultValue: "Multiplayer" })} connectionStatus={connectionStatus} />
        <div className="flex flex-1 items-center-safe justify-center-safe p-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-sm tracking-widest text-(--altair-text-muted)">{t("game-starts-in", { defaultValue: "Game starts in" })}</div>
            <div
              className="text-9xl font-black text-(--altair-accent) animate-pulse"
              style={{ fontFamily: 'var(--altair-font-display)' }}
            >
              {countdown}
            </div>
          </div>
        </div>
      </>
    )
  }

  // Class select phase
  if (lobby.state === 'CLASS_SELECT') {
    return (
      <>
        <AltairHeader context="menu" title={t("class-select", { defaultValue: "Class Select" })} onBack={handleLeave} connectionStatus={connectionStatus} />
        <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable both-edges' }}>
          <ClassSelectLobby lobbyId={lobbyId} />
        </div>
      </>
    )
  }

  // Waiting state (default)
  return (
    <>
      <AltairHeader context="menu" title={t("lobby-title", { defaultValue: "Lobby {{lobbyId}}", lobbyId })} onBack={handleLeave} connectionStatus={connectionStatus} />
      <LobbyWaiting lobbyId={lobbyId} onLeave={handleLeave} />
    </>
  )
}

export const Route = createFileRoute('/altair/multiplayer/$lobbyId')({
  component: AltairLobbyPage,
})
