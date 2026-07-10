/**
 * RMHbox Landing Page
 *
 * Main entry point for the RMHbox party game platform.
 * Provides lobby creation, room code join, public lobby browser,
 * and a leaderboard panel.
 *
 * Connects to the RMHbox WebSocket server on mount and navigates
 * to the lobby page on successful create/join.
 *
 * Reference: docs/rmhbox/implementation/phase-4.md §6.2
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import { connectToRMHbox, getSocket, disconnectFromRMHbox, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { toast } from '@/lib/rmhbox/toast-store';
import LeaderboardPanel from '@/components/rmhbox/LeaderboardPanel';
import RMHboxHeader from '@/components/rmhbox/RMHboxHeader';
import type { PublicLobbyInfo } from '@/lib/rmhbox/types';

function RMHboxLanding() {
  const { t } = useTranslation("r-rmhbox");
  const navigate = useNavigate();
  const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
  const [joinCode, setJoinCode] = useState('');
  const [publicLobbies, setPublicLobbies] = useState<PublicLobbyInfo[]>([]);

  // Connect to WebSocket on mount
  useEffect(() => {
    let mounted = true;
    let browseInterval: ReturnType<typeof setInterval> | null = null;

    async function connect() {
      try {
        const socket = await connectToRMHbox();

        // If already in a lobby (e.g. navigated back while still connected), redirect immediately
        const existingLobby = useRMHboxStore.getState().lobby;
        if (existingLobby && mounted) {
          navigate({ to: '/rmhbox/$lobbyId', params: { lobbyId: existingLobby.lobbyId } });
          return;
        }

        // Listen for lobby created event
        socket.on(S2C.LOBBY_CREATED, (data: { lobbyId: string }) => {
          if (mounted) navigate({ to: '/rmhbox/$lobbyId', params: { lobbyId: data.lobbyId } });
        });

        // Listen for browse results
        socket.on(S2C.LOBBY_BROWSE_RESULT, (data: { lobbies: PublicLobbyInfo[] }) => {
          if (mounted) setPublicLobbies(data.lobbies ?? []);
        });

        // Listen for state snapshot (indicates successful join via join/create)
        // Only redirect if we're still on the landing page and haven't just left a lobby
        socket.on(S2C.LOBBY_STATE_SNAPSHOT, (data: { lobbyId: string }) => {
          // Only navigate if the store has a lobby (i.e. we're actively in one, not just received a stale snapshot)
          const currentLobby = useRMHboxStore.getState().lobby;
          if (mounted && data.lobbyId && currentLobby?.lobbyId === data.lobbyId) {
            navigate({ to: '/rmhbox/$lobbyId', params: { lobbyId: data.lobbyId } });
          }
        });

        // Errors are handled by the global S2C.ERROR listener in socket.ts.
        // No page-specific error listener needed here.

        // Browse public lobbies on connect
        socket.emit(C2S.LOBBY_BROWSE, {});

        // Periodically refresh the lobby list every 10 seconds
        browseInterval = setInterval(() => {
          if (mounted && socket.connected) {
            socket.emit(C2S.LOBBY_BROWSE, {});
          }
        }, 10_000);
      } catch (err) {
        if (mounted) toast.error(err instanceof Error ? err.message : t("connection-failed", { defaultValue: "Connection failed" }));
      }
    }

    connect();
    return () => {
      mounted = false;
      if (browseInterval) clearInterval(browseInterval);
    };
  }, [navigate]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Only disconnect if the socket is truly dead (not reconnecting).
      // socket.active is true while the manager is still retrying.
      const socket = getSocket();
      if (socket && !socket.connected && !socket.active) {
        disconnectFromRMHbox();
      }
    };
  }, []);

  const handleCreateLobby = useCallback(() => {
    emit(C2S.LOBBY_CREATE, {});
  }, []);

  const handleJoinLobby = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      toast.warning(t("room-code-length", { defaultValue: "Room code must be 6 characters" }));
      return;
    }
    emit(C2S.LOBBY_JOIN, { lobbyId: code });
  }, [joinCode]);

  const handleBrowse = useCallback(() => {
    emit(C2S.LOBBY_BROWSE, {});
  }, []);

  return (
    <div className="flex h-screen flex-col">
      {/* Shared header — fixed at top */}
      <RMHboxHeader backLabel='Builds' backHref='/builds' />

      {/* Scrollable content below header */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Create & Join */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Lobby */}
          <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-6">
            <h2 className="text-xl font-semibold mb-4">{t("create-lobby", { defaultValue: "Create Lobby" })}</h2>
            <p className="text-sm mb-4 text-(--rmhbox-text-muted)">
              {t("create-lobby-desc", { defaultValue: "Start a new game session and invite friends." })}
            </p>
            <button
              onClick={handleCreateLobby}
              disabled={connectionStatus !== 'connected'}
              className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhbox-accent) hover:bg-(--rmhbox-accent-hover)"
            >
              {t("create-lobby", { defaultValue: "Create Lobby" })}
            </button>
          </div>

          {/* Join Lobby */}
          <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-6">
            <h2 className="text-xl font-semibold mb-4">{t("join-lobby", { defaultValue: "Join Lobby" })}</h2>
            <p className="text-sm mb-4 text-(--rmhbox-text-muted)">
              {t("join-lobby-desc", { defaultValue: "Enter a 6-character room code to join." })}
            </p>
            <form onSubmit={(e) => { e.preventDefault(); handleJoinLobby(); }} className="flex gap-2">
              <input
                id="joinCode"
                name="joinCode"
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABCDEF"
                className="w-10 min-w-0 flex-1 px-4 py-3 rounded-lg font-mono text-lg uppercase tracking-widest text-center border border-(--rmhbox-border) bg-(--rmhbox-bg) text-(--rmhbox-text) placeholder:text-(--rmhbox-text-dim) outline-none focus:ring-1 focus:ring-(--rmhbox-accent)"
              />
              <button
                type="submit"
                disabled={connectionStatus !== 'connected' || joinCode.trim().length !== 6}
                className="px-6 py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhbox-accent) hover:bg-(--rmhbox-accent-hover)"
              >
                {t("join", { defaultValue: "Join" })}
              </button>
            </form>
          </div>
        </div>

        {/* Public Lobbies */}
        <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{t("public-lobbies", { defaultValue: "Public Lobbies" })}</h2>
            <button
              onClick={handleBrowse}
              className="text-sm px-3 py-1 rounded-md transition-colors bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted) hover:text-(--rmhbox-text)"
            >
              {t("refresh", { defaultValue: "Refresh" })}
            </button>
          </div>
          {publicLobbies.length === 0 ? (
            <p className="text-sm text-center py-4 text-(--rmhbox-text-muted)">
              {t("no-public-lobbies", { defaultValue: "No public lobbies available. Create one!" })}
            </p>
          ) : (
            <div className="space-y-2">
              {publicLobbies.map((lobby) => (
                <div
                  key={lobby.lobbyId}
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border border-(--rmhbox-border) bg-(--rmhbox-bg) hover:bg-(--rmhbox-surface-hover)"
                  onClick={() => {
                    setJoinCode(lobby.lobbyId);
                    emit(C2S.LOBBY_JOIN, { lobbyId: lobby.lobbyId });
                  }}
                >
                  <div>
                    <span className="font-mono font-bold">{lobby.lobbyId}</span>
                    <span className="ml-3 text-sm text-(--rmhbox-text-muted)">
                      {t("host-name", { defaultValue: "Host: {{name}}", name: lobby.hostName })}
                    </span>
                    {lobby.selectedGame && (
                      <span className="ml-2 text-xs text-(--rmhbox-accent)">
                        · {lobby.selectedGame}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-(--rmhbox-text-muted)">
                    {t("player-count", { defaultValue: "{{count}}/{{max}} players", count: lobby.playerCount, max: lobby.maxPlayers })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* View Minigames */}
        <button
          onClick={() => navigate({ to: '/rmhbox/minigames' })}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) font-semibold transition-colors text-(--rmhbox-text) hover:bg-(--rmhbox-surface-hover) hover:text-(--rmhbox-accent)"
          data-testid="view-minigames-btn"
        >
          <Gamepad2 className="h-5 w-5" />
          {t("view-minigames", { defaultValue: "View Minigames" })}
        </button>

        {/* Leaderboard */}
        <LeaderboardPanel />
      </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/rmhbox/')({
  component: RMHboxLanding,
});
