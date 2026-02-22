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

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { connectToRMHbox, getSocket, disconnectFromRMHbox, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import LeaderboardPanel from '@/components/rmhbox/LeaderboardPanel';
import type { PublicLobbyInfo } from '@/lib/rmhbox/types';

export default function RMHboxLanding() {
  const router = useRouter();
  const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
  const [joinCode, setJoinCode] = useState('');
  const [publicLobbies, setPublicLobbies] = useState<PublicLobbyInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Connect to WebSocket on mount
  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const socket = await connectToRMHbox();

        // Listen for lobby created event
        socket.on(S2C.LOBBY_CREATED, (data: { lobbyId: string }) => {
          if (mounted) router.push(`/rmhbox/${data.lobbyId}`);
        });

        // Listen for browse results
        socket.on(S2C.LOBBY_BROWSE_RESULT, (data: { lobbies: PublicLobbyInfo[] }) => {
          if (mounted) setPublicLobbies(data.lobbies ?? []);
        });

        // Listen for state snapshot (indicates successful join)
        socket.on(S2C.LOBBY_STATE_SNAPSHOT, (data: { lobbyId: string }) => {
          if (mounted && data.lobbyId) router.push(`/rmhbox/${data.lobbyId}`);
        });

        // Listen for errors
        socket.on(S2C.ERROR, (data: { message: string }) => {
          if (mounted) setError(data.message);
        });

        // Browse public lobbies on connect
        socket.emit(C2S.LOBBY_BROWSE, {});
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Connection failed');
      }
    }

    connect();
    return () => {
      mounted = false;
    };
  }, [router]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Only disconnect if not navigating to a lobby
      const socket = getSocket();
      if (socket && !socket.connected) {
        disconnectFromRMHbox();
      }
    };
  }, []);

  const handleCreateLobby = useCallback(() => {
    setError(null);
    emit(C2S.LOBBY_CREATE, {});
  }, []);

  const handleJoinLobby = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }
    setError(null);
    emit(C2S.LOBBY_JOIN, { lobbyId: code });
  }, [joinCode]);

  const handleBrowse = useCallback(() => {
    emit(C2S.LOBBY_BROWSE, {});
  }, []);

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: 'var(--rmhbox-bg, #0f0f1a)', color: 'var(--rmhbox-text, #e0e0f0)' }}>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center py-8">
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent" style={{ fontFamily: 'var(--rmhbox-font-display, Nunito, sans-serif)' }}>
            RMHbox
          </h1>
          <p className="mt-2 text-lg" style={{ color: 'var(--rmhbox-text-muted, #8888aa)' }}>
            Party game madness with friends
          </p>
          <div className="mt-2 text-sm" style={{ color: 'var(--rmhbox-text-muted, #8888aa)' }}>
            {connectionStatus === 'connected' && '🟢 Connected'}
            {connectionStatus === 'connecting' && '🟡 Connecting...'}
            {connectionStatus === 'disconnected' && '🔴 Disconnected'}
            {connectionStatus === 'error' && '🔴 Connection Error'}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'rgba(248, 113, 113, 0.1)', color: 'var(--rmhbox-danger, #f87171)', border: '1px solid var(--rmhbox-danger, #f87171)' }}>
            {error}
          </div>
        )}

        {/* Create & Join */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Lobby */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--rmhbox-surface, #1a1a2e)', border: '1px solid var(--rmhbox-border, #2a2a4a)' }}>
            <h2 className="text-xl font-semibold mb-4">Create Lobby</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--rmhbox-text-muted, #8888aa)' }}>
              Start a new game session and invite friends.
            </p>
            <button
              onClick={handleCreateLobby}
              disabled={connectionStatus !== 'connected'}
              className="w-full py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--rmhbox-accent, #7c5cfc)', color: '#fff' }}
            >
              Create Lobby
            </button>
          </div>

          {/* Join Lobby */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--rmhbox-surface, #1a1a2e)', border: '1px solid var(--rmhbox-border, #2a2a4a)' }}>
            <h2 className="text-xl font-semibold mb-4">Join Lobby</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--rmhbox-text-muted, #8888aa)' }}>
              Enter a 6-character room code to join.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABCDEF"
                className="flex-1 px-4 py-3 rounded-lg font-mono text-lg uppercase tracking-widest text-center"
                style={{ backgroundColor: 'var(--rmhbox-bg, #0f0f1a)', border: '1px solid var(--rmhbox-border, #2a2a4a)', color: 'var(--rmhbox-text, #e0e0f0)' }}
              />
              <button
                onClick={handleJoinLobby}
                disabled={connectionStatus !== 'connected' || joinCode.trim().length !== 6}
                className="px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--rmhbox-accent, #7c5cfc)', color: '#fff' }}
              >
                Join
              </button>
            </div>
          </div>
        </div>

        {/* Public Lobbies */}
        <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--rmhbox-surface, #1a1a2e)', border: '1px solid var(--rmhbox-border, #2a2a4a)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Public Lobbies</h2>
            <button
              onClick={handleBrowse}
              className="text-sm px-3 py-1 rounded-md transition-colors"
              style={{ backgroundColor: 'var(--rmhbox-surface-hover, #252540)', color: 'var(--rmhbox-text-muted, #8888aa)' }}
            >
              Refresh
            </button>
          </div>
          {publicLobbies.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--rmhbox-text-muted, #8888aa)' }}>
              No public lobbies available. Create one!
            </p>
          ) : (
            <div className="space-y-2">
              {publicLobbies.map((lobby) => (
                <div
                  key={lobby.lobbyId}
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors"
                  style={{ backgroundColor: 'var(--rmhbox-bg, #0f0f1a)', border: '1px solid var(--rmhbox-border, #2a2a4a)' }}
                  onClick={() => {
                    setJoinCode(lobby.lobbyId);
                    emit(C2S.LOBBY_JOIN, { lobbyId: lobby.lobbyId });
                  }}
                >
                  <div>
                    <span className="font-mono font-bold">{lobby.lobbyId}</span>
                    <span className="ml-3 text-sm" style={{ color: 'var(--rmhbox-text-muted, #8888aa)' }}>
                      Host: {lobby.hostName}
                    </span>
                  </div>
                  <div className="text-sm" style={{ color: 'var(--rmhbox-text-muted, #8888aa)' }}>
                    {lobby.playerCount}/{lobby.maxPlayers} players
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <LeaderboardPanel />
      </div>
    </div>
  );
}
