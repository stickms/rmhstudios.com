/**
 * Altair Multiplayer Lobby Page
 *
 * Renders the lobby view with player list, inline class selection,
 * chat, and host controls. Transitions to game screen when PLAYING.
 * Follows the /app/rmhbox/[lobbyId]/page.tsx pattern.
 */

'use client';

import { useEffect, useState, useCallback, use, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { connectToAltair, emit } from '@/lib/altair/multiplayer/socket';
import { useAltairMultiplayerStore } from '@/lib/altair/multiplayer/store';
import { C2S, S2C } from '@/lib/altair/multiplayer/events';
import { useAltairToastStore } from '@/lib/altair/stores/toast-store';
import AltairHeader from '@/components/altair/AltairHeader';
import ClassSelectLobby from '@/components/altair/multiplayer/ClassSelectLobby';
import LobbyWaiting from '@/components/altair/multiplayer/LobbyWaiting';
import type { GameResultsData } from '@/lib/altair/multiplayer/types';

// Lazy import for the multiplayer game screen
const MultiplayerGameScreen = lazy(
  () => import('@/components/altair/multiplayer/MultiplayerGameScreen'),
);

// Lazy import for results screen
const MultiplayerResultsScreen = lazy(
  () => import('@/components/altair/multiplayer/MultiplayerResultsScreen'),
);

export default function AltairLobbyPage({ params }: { params: Promise<{ lobbyId: string }> }) {
  const { lobbyId } = use(params);
  const router = useRouter();
  const lobby = useAltairMultiplayerStore((s) => s.lobby);
  const connectionStatus = useAltairMultiplayerStore((s) => s.connectionStatus);
  const countdown = useAltairMultiplayerStore((s) => s.countdown);
  const gameStarted = useAltairMultiplayerStore((s) => s.gameStarted);
  const results = useAltairMultiplayerStore((s) => s.results);
  const addToast = useAltairToastStore((s) => s.addToast);

  // Connect and join lobby on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const socket = await connectToAltair();

        // Join the lobby
        socket.emit(C2S.LOBBY_JOIN, { lobbyId });

        // Listen for kick
        socket.on(S2C.LOBBY_KICKED, () => {
          if (mounted) {
            useAltairMultiplayerStore.getState().leaveLobby();
            addToast('You were kicked from the lobby', 'warning');
            router.push('/altair/multiplayer');
          }
        });

        // Listen for disband
        socket.on(S2C.LOBBY_DISBANDED, () => {
          if (mounted) {
            useAltairMultiplayerStore.getState().leaveLobby();
            addToast('Lobby was disbanded', 'info');
            router.push('/altair/multiplayer');
          }
        });

        // Listen for errors
        socket.on(S2C.ERROR, (data: { code?: string; message?: string }) => {
          if (!mounted) return;
          if (data.code === 'LOBBY_NOT_FOUND' || data.code === 'NOT_IN_LOBBY') {
            useAltairMultiplayerStore.getState().leaveLobby();
            router.push('/altair/multiplayer');
          }
        });
      } catch (err) {
        if (mounted) addToast(err instanceof Error ? err.message : 'Failed to connect', 'error');
      }
    }

    init();
    return () => { mounted = false; };
  }, [lobbyId, router, addToast]);

  const handleLeave = useCallback(() => {
    emit(C2S.LOBBY_LEAVE, { lobbyId });
    useAltairMultiplayerStore.getState().leaveLobby();
    router.push('/altair/multiplayer');
  }, [lobbyId, router]);

  // Loading state
  if (connectionStatus === 'connecting' || connectionStatus === 'disconnected') {
    return (
      <div className="flex h-screen flex-col">
        <AltairHeader context="menu" title="Multiplayer" onBack={() => router.push('/altair/multiplayer')} connectionStatus={connectionStatus} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-2xl mb-4 text-(--altair-text)">Connecting...</div>
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto border-(--altair-accent)" style={{ borderTopColor: 'transparent' }} />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (connectionStatus === 'error') {
    return (
      <div className="flex h-screen flex-col">
        <AltairHeader context="menu" title="Multiplayer" onBack={() => router.push('/altair/multiplayer')} connectionStatus={connectionStatus} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-2xl mb-4 text-(--altair-danger)">Connection error</div>
            <button
              onClick={() => router.push('/altair/multiplayer')}
              className="px-6 py-2 rounded-lg bg-(--altair-accent) text-white font-semibold hover:bg-(--altair-accent-hover) transition-colors"
            >
              Back to Lobby Browser
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No lobby state yet
  if (!lobby) {
    return (
      <div className="flex h-screen flex-col">
        <AltairHeader context="menu" title="Multiplayer" onBack={() => router.push('/altair/multiplayer')} connectionStatus={connectionStatus} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-2xl mb-4 text-(--altair-text)">Joining lobby {lobbyId}...</div>
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto border-(--altair-accent)" style={{ borderTopColor: 'transparent' }} />
          </div>
        </div>
      </div>
    );
  }

  const isHost = lobby.hostUserId === lobby.myUserId;

  // Game in progress
  if (lobby.state === 'PLAYING' || gameStarted) {
    return (
      <Suspense fallback={
        <div className="fixed inset-0 bg-(--altair-bg) flex items-center justify-center">
          <div className="text-(--altair-accent) font-mono tracking-widest animate-pulse text-sm">
            LOADING GAME...
          </div>
        </div>
      }>
        <MultiplayerGameScreen lobbyId={lobbyId} />
      </Suspense>
    );
  }

  // Results
  if (lobby.state === 'RESULTS' && results) {
    return (
      <Suspense fallback={null}>
        <MultiplayerResultsScreen
          results={results}
          onPlayAgain={() => {
            // Host restarts, others stay in lobby
            useAltairMultiplayerStore.getState().setResults(null as unknown as GameResultsData);
          }}
          onLeave={handleLeave}
        />
      </Suspense>
    );
  }

  // Countdown
  if (lobby.state === 'COUNTDOWN' && countdown !== null) {
    return (
      <div className="flex h-screen flex-col">
        <AltairHeader context="menu" title="Multiplayer" connectionStatus={connectionStatus} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-sm text-(--altair-text-muted) mb-4 uppercase tracking-widest">Game starts in</div>
            <div
              className="text-9xl font-black text-(--altair-accent) animate-pulse"
              style={{ fontFamily: 'var(--altair-font-display)' }}
            >
              {countdown}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Class select phase
  if (lobby.state === 'CLASS_SELECT') {
    return (
      <div className="flex h-screen flex-col">
        <AltairHeader context="menu" title="Class Select" onBack={handleLeave} connectionStatus={connectionStatus} />
        <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable both-edges' }}>
          <ClassSelectLobby lobbyId={lobbyId} />
        </div>
      </div>
    );
  }

  // Waiting state (default)
  return (
    <div className="flex h-screen flex-col">
      <AltairHeader context="menu" title={`Lobby ${lobbyId}`} onBack={handleLeave} connectionStatus={connectionStatus} />
      <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable both-edges' }}>
        <LobbyWaiting lobbyId={lobbyId} onLeave={handleLeave} />
      </div>
    </div>
  );
}
