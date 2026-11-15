/**
 * Altair Multiplayer Lobby Page
 *
 * Renders the lobby view with player list, inline class selection,
 * chat, and host controls. Transitions to game screen when PLAYING.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { noindexHead } from '@/lib/seo';
import { useEffect, useState, useCallback, lazy } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { connectToAltair, emit } from '@features/altair/engine/multiplayer/socket'
import { useAltairMultiplayerStore } from '@features/altair/engine/multiplayer/store'
import { C2S, S2C } from '@features/altair/engine/multiplayer/events'
import { useAltairToastStore } from '@features/altair/engine/stores/toast-store'
import AltairHeader from '@features/altair/ui/AltairHeader'
import LobbyWaiting from '@features/altair/ui/multiplayer/LobbyWaiting'
import { ArrivalSuspense, useArrival } from '@/components/ui/arrive'
import { cn } from '@/lib/utils'

// Lazy import for the multiplayer game screen
const MultiplayerGameScreen = lazy(
  () => import('@features/altair/ui/multiplayer/MultiplayerGameScreen'),
)

// Lazy import for results screen
const MultiplayerResultsScreen = lazy(
  () => import('@features/altair/ui/multiplayer/MultiplayerResultsScreen'),
)

/** Player-facing text for a hub rejection (falls back to the hub's own message). */
function lobbyErrorText(
  t: TFunction,
  data: { code?: string; message?: string },
): string {
  switch (data.code) {
    case 'NOT_HOST':
      return t("error-not-host", { defaultValue: "Only the host can do that." })
    case 'NOT_READY':
      return t("error-not-ready", { defaultValue: "Everyone needs a class and to be ready before the match can start." })
    case 'NEED_MORE_PLAYERS':
      return t("error-need-more-players", { defaultValue: "Co-op needs at least 2 players." })
    case 'WRONG_STATE':
      return t("error-wrong-state", { defaultValue: "That is not possible while the match is starting." })
    default:
      return data.message || t("error-generic", { defaultValue: "Something went wrong in the lobby." })
  }
}

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

  // Connect and join lobby on mount. The listeners are removed on unmount:
  // without that every revisit of the lobby route stacked another set, so a
  // single server error toasted once per visit.
  useEffect(() => {
    let mounted = true
    let cleanup: (() => void) | null = null

    async function init() {
      try {
        const socket = await connectToAltair()
        if (!mounted) return

        const onKicked = () => {
          useAltairMultiplayerStore.getState().leaveLobby()
          addToast(t("kicked-from-lobby", { defaultValue: "You were kicked from the lobby" }), 'warning')
          navigate({ to: '/altair/multiplayer' })
        }
        const onDisbanded = () => {
          useAltairMultiplayerStore.getState().leaveLobby()
          addToast(t("lobby-disbanded", { defaultValue: "Lobby was disbanded" }), 'info')
          navigate({ to: '/altair/multiplayer' })
        }
        const onError = (data: { code?: string; message?: string }) => {
          if (data.code === 'LOBBY_NOT_FOUND' || data.code === 'NOT_IN_LOBBY') {
            useAltairMultiplayerStore.getState().leaveLobby()
            navigate({ to: '/altair/multiplayer' })
            return
          }
          addToast(lobbyErrorText(t, data), 'error')
        }
        socket.on(S2C.LOBBY_KICKED, onKicked)
        socket.on(S2C.LOBBY_DISBANDED, onDisbanded)
        socket.on(S2C.ERROR, onError)
        cleanup = () => {
          socket.off(S2C.LOBBY_KICKED, onKicked)
          socket.off(S2C.LOBBY_DISBANDED, onDisbanded)
          socket.off(S2C.ERROR, onError)
        }

        // Join the lobby (after the listeners, so a rejection is never missed)
        socket.emit(C2S.LOBBY_JOIN, { lobbyId })
      } catch (err) {
        if (mounted) addToast(err instanceof Error ? err.message : t("failed-to-connect", { defaultValue: "Failed to connect" }), 'error')
      }
    }

    init()
    return () => {
      mounted = false
      cleanup?.()
    }
  }, [lobbyId, navigate, addToast, t])

  const handleLeave = useCallback(() => {
    emit(C2S.LOBBY_LEAVE, { lobbyId })
    useAltairMultiplayerStore.getState().leaveLobby()
    navigate({ to: '/altair/multiplayer' })
  }, [lobbyId, navigate])

  // A live match must survive a dropped socket: the host's page IS the simulation, so
  // unmounting it for a "Connecting..." screen would throw the whole run away. The match
  // screen shows its own reconnect banner instead.
  const inMatch = !!lobby && (lobby.state === 'PLAYING' || gameStarted)
  const connecting = connectionStatus === 'connecting' || connectionStatus === 'disconnected' || connectionStatus === 'error'
  const arrival = useArrival(!!lobby && (inMatch || !connecting))

  // Loading state
  if (!inMatch && (connectionStatus === 'connecting' || connectionStatus === 'disconnected')) {
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
  if (!inMatch && connectionStatus === 'error') {
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
      <ArrivalSuspense fallback={
        <div className="fixed inset-0 bg-(--altair-bg) flex items-center justify-center">
          <div className="text-(--altair-accent) font-mono tracking-widest animate-pulse text-sm">
            {t("loading-game", { defaultValue: "LOADING GAME..." })}
          </div>
        </div>
      }>
        <MultiplayerGameScreen lobbyId={lobbyId} onLeave={handleLeave} />
      </ArrivalSuspense>
    )
  }

  // Results
  if (lobby.state === 'RESULTS' && results) {
    return (
      <ArrivalSuspense fallback={null}>
        <MultiplayerResultsScreen results={results} onLeave={handleLeave} />
      </ArrivalSuspense>
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

  // Waiting state (default)
  return (
    <>
      <AltairHeader context="menu" title={t("lobby-title", { defaultValue: "Lobby {{lobbyId}}", lobbyId })} onBack={handleLeave} connectionStatus={connectionStatus} />
      {/* No box (display: contents): the lobby fades in after the joining spinner (M9). */}
      <div className={cn('contents', arrival && 'arrive-group')}>
        <LobbyWaiting lobbyId={lobbyId} onLeave={handleLeave} />
      </div>
    </>
  )
}

export const Route = createFileRoute('/altair/multiplayer/$lobbyId')({
  head: () => noindexHead('Altair Lobby'),
  component: AltairLobbyPage,
})
