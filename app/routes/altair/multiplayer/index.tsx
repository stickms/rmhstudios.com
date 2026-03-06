/**
 * Altair Multiplayer Landing Page
 *
 * Entry point for Altair co-op. Provides lobby creation with settings,
 * join-by-code, and a public lobby browser.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Users, Zap, UserPlus, RefreshCw, Globe, Lock, Eye } from 'lucide-react'
import { connectToAltair, getSocket, disconnectFromAltair, emit } from '@/lib/altair/multiplayer/socket'
import { useAltairMultiplayerStore } from '@/lib/altair/multiplayer/store'
import { S2C, C2S } from '@/lib/altair/multiplayer/events'
import { useAltairToastStore } from '@/lib/altair/stores/toast-store'
import AltairHeader from '@/components/altair/AltairHeader'
import type { PublicLobbyInfo, AltairLobbySettings } from '@/lib/altair/multiplayer/types'

const VISIBILITY_LABELS: Record<AltairLobbySettings['visibility'], string> = {
  public: 'Public',
  friends_only: 'Friends Only',
  private: 'Private',
}

const VISIBILITY_ICONS: Record<AltairLobbySettings['visibility'], typeof Globe> = {
  public: Globe,
  friends_only: Eye,
  private: Lock,
}

const DROP_IN_LABELS: Record<AltairLobbySettings['dropInWindow'], string> = {
  first_5min: 'First 5 min',
  first_10min: 'First 10 min',
  anytime: 'Anytime',
}

function AltairMultiplayerLanding() {
  const navigate = useNavigate()
  const connectionStatus = useAltairMultiplayerStore((s) => s.connectionStatus)
  const addToast = useAltairToastStore((s) => s.addToast)

  const [joinCode, setJoinCode] = useState('')
  const [publicLobbies, setPublicLobbies] = useState<PublicLobbyInfo[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Lobby creation settings
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(4)
  const [visibility, setVisibility] = useState<AltairLobbySettings['visibility']>('private')
  const [doubleTime, setDoubleTime] = useState(false)
  const [dropInAllowed, setDropInAllowed] = useState(true)
  const [dropInWindow, setDropInWindow] = useState<AltairLobbySettings['dropInWindow']>('first_10min')

  // Connect to WebSocket on mount
  useEffect(() => {
    let mounted = true
    let browseInterval: ReturnType<typeof setInterval> | null = null

    async function connect() {
      try {
        const socket = await connectToAltair()

        // If already in a lobby, redirect immediately
        const existingLobby = useAltairMultiplayerStore.getState().lobby
        if (existingLobby && mounted) {
          navigate({ to: '/altair/multiplayer/$lobbyId', params: { lobbyId: existingLobby.lobbyId } })
          return
        }

        // Listen for lobby created event
        socket.on(S2C.LOBBY_CREATED, (data: { lobbyId: string }) => {
          if (mounted) navigate({ to: '/altair/multiplayer/$lobbyId', params: { lobbyId: data.lobbyId } })
        })

        // Listen for browse results
        socket.on(S2C.LOBBY_BROWSE_RESULT, (data: { lobbies: PublicLobbyInfo[] }) => {
          if (mounted) {
            setPublicLobbies(data.lobbies ?? [])
            setIsRefreshing(false)
          }
        })

        // Listen for state snapshot (indicates successful join)
        socket.on(S2C.LOBBY_STATE_SNAPSHOT, (data: { lobbyId: string }) => {
          const currentLobby = useAltairMultiplayerStore.getState().lobby
          if (mounted && data.lobbyId && currentLobby?.lobbyId === data.lobbyId) {
            navigate({ to: '/altair/multiplayer/$lobbyId', params: { lobbyId: data.lobbyId } })
          }
        })

        // Browse public lobbies on connect
        socket.emit(C2S.LOBBY_BROWSE, {})

        // Refresh every 10 seconds
        browseInterval = setInterval(() => {
          if (mounted && socket.connected) {
            socket.emit(C2S.LOBBY_BROWSE, {})
          }
        }, 10_000)
      } catch (err) {
        if (mounted) addToast(err instanceof Error ? err.message : 'Connection failed', 'error')
      }
    }

    connect()
    return () => {
      mounted = false
      if (browseInterval) clearInterval(browseInterval)
    }
  }, [navigate, addToast])

  // Clean up stale socket on unmount
  useEffect(() => {
    return () => {
      const socket = getSocket()
      if (socket && !socket.connected && !socket.active) {
        disconnectFromAltair()
      }
    }
  }, [])

  const handleCreateLobby = useCallback(() => {
    emit(C2S.LOBBY_CREATE, {
      settings: { maxPlayers, visibility, doubleTime, dropInAllowed, dropInWindow },
    })
  }, [maxPlayers, visibility, doubleTime, dropInAllowed, dropInWindow])

  const handleJoinLobby = useCallback(() => {
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) {
      addToast('Room code must be 6 characters', 'warning')
      return
    }
    emit(C2S.LOBBY_JOIN, { lobbyId: code })
  }, [joinCode, addToast])

  const handleBrowse = useCallback(() => {
    setIsRefreshing(true)
    emit(C2S.LOBBY_BROWSE, {})
    // Reset refreshing after a timeout in case server doesn't respond
    setTimeout(() => setIsRefreshing(false), 3000)
  }, [])

  return (
    <div className="flex h-screen flex-col">
      <AltairHeader context="menu" title="Multiplayer" onBack={() => navigate({ to: '/altair' })} connectionStatus={connectionStatus} />

      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Create & Join */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Create Lobby */}
            <div className="rounded-xl border border-(--altair-border) bg-(--altair-surface) p-6">
              <h2 className="text-xl font-bold text-(--altair-text) mb-4 flex items-center gap-2">
                <Users size={20} className="text-(--altair-accent)" />
                Create Lobby
              </h2>

              {/* Settings */}
              <div className="space-y-3 mb-5">
                {/* Max Players */}
                <div>
                  <label className="text-xs font-semibold text-(--altair-text-muted) uppercase tracking-wider">Players</label>
                  <div className="flex gap-2 mt-1">
                    {([2, 3, 4] as const).map((n) => (
                      <button
                        key={n}
                        onClick={() => setMaxPlayers(n)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                          maxPlayers === n
                            ? 'bg-(--altair-accent) text-white'
                            : 'bg-(--altair-bg) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visibility */}
                <div>
                  <label className="text-xs font-semibold text-(--altair-text-muted) uppercase tracking-wider">Visibility</label>
                  <div className="flex gap-2 mt-1">
                    {(['private', 'public'] as const).map((v) => {
                      const Icon = VISIBILITY_ICONS[v]
                      return (
                        <button
                          key={v}
                          onClick={() => setVisibility(v)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                            visibility === v
                              ? 'bg-(--altair-accent) text-white'
                              : 'bg-(--altair-bg) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
                          }`}
                        >
                          <Icon size={14} />
                          {VISIBILITY_LABELS[v]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Double Time */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={doubleTime}
                    onChange={(e) => setDoubleTime(e.target.checked)}
                    className="w-4 h-4 rounded accent-(--altair-warning)"
                  />
                  <span className="text-sm text-(--altair-text) flex items-center gap-1.5">
                    <Zap size={14} className="text-(--altair-warning)" />
                    Double Time (2x speed)
                  </span>
                </label>

                {/* Drop-in */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dropInAllowed}
                    onChange={(e) => setDropInAllowed(e.target.checked)}
                    className="w-4 h-4 rounded accent-(--altair-accent)"
                  />
                  <span className="text-sm text-(--altair-text)">Allow drop-in</span>
                </label>
                {dropInAllowed && (
                  <div className="pl-7">
                    <div className="flex gap-2">
                      {(['first_5min', 'first_10min', 'anytime'] as const).map((w) => (
                        <button
                          key={w}
                          onClick={() => setDropInWindow(w)}
                          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                            dropInWindow === w
                              ? 'bg-(--altair-accent) text-white'
                              : 'bg-(--altair-bg) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
                          }`}
                        >
                          {DROP_IN_LABELS[w]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleCreateLobby}
                disabled={connectionStatus !== 'connected'}
                className="w-full py-3 rounded-lg font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--altair-accent) hover:bg-(--altair-accent-hover)"
              >
                Create Lobby
              </button>
            </div>

            {/* Join Lobby */}
            <div className="rounded-xl border border-(--altair-border) bg-(--altair-surface) p-6">
              <h2 className="text-xl font-bold text-(--altair-text) mb-4 flex items-center gap-2">
                <UserPlus size={20} className="text-(--altair-accent)" />
                Join by Code
              </h2>
              <p className="text-sm mb-4 text-(--altair-text-muted)">
                Enter a 6-character room code to join a friend&apos;s lobby.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); handleJoinLobby() }} className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABCDEF"
                  className="w-10 min-w-0 flex-1 px-4 py-3 rounded-lg font-mono text-lg uppercase tracking-widest text-center border border-(--altair-border) bg-(--altair-bg) text-(--altair-text) placeholder:text-(--altair-text-dim) outline-none focus:ring-1 focus:ring-(--altair-accent)"
                />
                <button
                  type="submit"
                  disabled={connectionStatus !== 'connected' || joinCode.trim().length !== 6}
                  className="px-6 py-3 rounded-lg font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--altair-accent) hover:bg-(--altair-accent-hover)"
                >
                  Join
                </button>
              </form>
            </div>
          </div>

          {/* Public Lobbies */}
          <div className="rounded-xl border border-(--altair-border) bg-(--altair-surface) p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-(--altair-text) flex items-center gap-2">
                <Globe size={20} className="text-(--altair-accent)" />
                Public Lobbies
              </h2>
              <button
                onClick={handleBrowse}
                disabled={connectionStatus !== 'connected'}
                className="text-sm px-3 py-1.5 rounded-md transition-colors bg-(--altair-surface-hover) text-(--altair-text-muted) hover:text-(--altair-text) disabled:opacity-50 flex items-center gap-1.5"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {publicLobbies.length === 0 ? (
              <p className="text-sm text-center py-6 text-(--altair-text-muted)">
                No public lobbies available. Create one!
              </p>
            ) : (
              <div className="space-y-2">
                {publicLobbies.map((lobby) => (
                  <button
                    key={lobby.lobbyId}
                    className="w-full flex items-center justify-between p-3 rounded-lg transition-colors border border-(--altair-border) bg-(--altair-bg) hover:bg-(--altair-surface-hover) text-left"
                    onClick={() => {
                      setJoinCode(lobby.lobbyId)
                      emit(C2S.LOBBY_JOIN, { lobbyId: lobby.lobbyId })
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-(--altair-text)">{lobby.lobbyId}</span>
                      <span className="text-sm text-(--altair-text-muted)">
                        Host: {lobby.hostName}
                      </span>
                      {lobby.doubleTime && (
                        <span className="text-xs text-(--altair-warning) flex items-center gap-0.5">
                          <Zap size={12} /> 2x
                        </span>
                      )}
                      {lobby.state === 'PLAYING' && lobby.dropInAllowed && (
                        <span className="text-xs text-(--altair-success) font-semibold">Drop-in</span>
                      )}
                    </div>
                    <div className="text-sm text-(--altair-text-muted) flex items-center gap-1">
                      <Users size={14} />
                      {lobby.playerCount}/{lobby.maxPlayers}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/altair/multiplayer/')({
  component: AltairMultiplayerLanding,
})
