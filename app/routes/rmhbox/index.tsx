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

  const connected = connectionStatus === 'connected';
  const card = 'flex flex-col gap-3 rounded-(--app-radius) border border-(--app-border) bg-(--app-surface) px-4 py-4 md:px-6 md:py-5';
  const primaryBtn =
    'rounded-(--app-radius-sm) bg-(--app-accent) px-6 py-3 font-semibold text-(--app-accent-fg) transition-colors hover:bg-(--app-accent-hover) disabled:cursor-not-allowed disabled:opacity-50';

  return (
    // A landing is a DOCUMENT (design-language §12.1 rule 6): `.app-page`, so the
    // page scrolls and mobile Safari can collapse its toolbars. It used to be a
    // viewport-height shell with a `flex-1 overflow-y-auto` box inside it.
    <div className="app-page">
      <RMHboxHeader backLabel='Games' backHref='/games' />

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pt-4 pb-12 md:gap-6 md:px-8 md:pt-8">
        {/* Create & Join */}
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {/* Create Lobby */}
          <section className={card}>
            <h2 className="text-xl font-semibold">{t("create-lobby", { defaultValue: "Create Lobby" })}</h2>
            <p className="flex-1 text-sm text-(--app-text-muted)">
              {t("create-lobby-desc", { defaultValue: "Start a new game session and invite friends." })}
            </p>
            <button
              type="button"
              onClick={handleCreateLobby}
              disabled={!connected}
              className={`w-full ${primaryBtn}`}
            >
              {t("create-lobby", { defaultValue: "Create Lobby" })}
            </button>
          </section>

          {/* Join Lobby */}
          <section className={card}>
            <h2 className="text-xl font-semibold">{t("join-lobby", { defaultValue: "Join Lobby" })}</h2>
            <p className="text-sm text-(--app-text-muted)">
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
                aria-label={t("room-code", { defaultValue: "Room code" })}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 py-3 text-center font-mono text-lg uppercase tracking-widest text-(--app-text) placeholder:text-(--app-text-dim)"
              />
              <button
                type="submit"
                disabled={!connected || joinCode.trim().length !== 6}
                className={primaryBtn}
              >
                {t("join", { defaultValue: "Join" })}
              </button>
            </form>
          </section>
        </div>

        {/* Public Lobbies */}
        <section className={card}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t("public-lobbies", { defaultValue: "Public Lobbies" })}</h2>
            <button
              type="button"
              onClick={handleBrowse}
              className="rounded-(--app-radius-sm) bg-(--app-surface-hover) px-3 py-2 text-sm text-(--app-text-muted) transition-colors hover:text-(--app-text)"
            >
              {t("refresh", { defaultValue: "Refresh" })}
            </button>
          </div>
          {publicLobbies.length === 0 ? (
            <p className="py-4 text-center text-sm text-(--app-text-muted)">
              {t("no-public-lobbies", { defaultValue: "No public lobbies available. Create one!" })}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {publicLobbies.map((lobby) => (
                <li key={lobby.lobbyId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 py-3 text-left transition-colors hover:bg-(--app-surface-hover)"
                    onClick={() => {
                      setJoinCode(lobby.lobbyId);
                      emit(C2S.LOBBY_JOIN, { lobbyId: lobby.lobbyId });
                    }}
                  >
                    <span className="min-w-0">
                      <span className="font-mono font-bold">{lobby.lobbyId}</span>
                      <span className="ml-3 text-sm text-(--app-text-muted)">
                        {t("host-name", { defaultValue: "Host: {{name}}", name: lobby.hostName })}
                      </span>
                      {lobby.selectedGame && (
                        <span className="ml-2 text-xs text-(--app-accent)">· {lobby.selectedGame}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm text-(--app-text-muted)">
                      {t("player-count-of-max", { defaultValue: "{{count}}/{{max}} players", count: lobby.playerCount, max: lobby.maxPlayers })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* View Minigames */}
        <button
          type="button"
          onClick={() => navigate({ to: '/rmhbox/minigames' })}
          className="flex w-full items-center justify-center gap-2 rounded-(--app-radius) border border-(--app-border) bg-(--app-surface) px-4 py-3 font-semibold text-(--app-text) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-accent)"
          data-testid="view-minigames-btn"
        >
          <Gamepad2 className="h-5 w-5" aria-hidden />
          {t("view-minigames", { defaultValue: "View Minigames" })}
        </button>

        {/* Leaderboard */}
        <LeaderboardPanel />
      </main>
    </div>
  );
}

export const Route = createFileRoute('/rmhbox/')({
  component: RMHboxLanding,
});
