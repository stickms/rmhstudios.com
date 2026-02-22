/**
 * RMHbox Lobby Page
 *
 * Renders the appropriate view based on the current lobby state:
 * WAITING → LobbyView, VOTING → GameVoting, INSTRUCTIONS → InstructionsScreen,
 * PRELOADING → PreloadScreen, COUNTDOWN → countdown overlay,
 * PLAYING → MinigameRenderer, ROUND_RESULTS → ResultsScreen, etc.
 *
 * Connects to the WebSocket server on mount and joins the lobby.
 * Shows a SpectatorBanner if the user is spectating.
 *
 * Reference: docs/rmhbox/implementation/phase-4.md §6.3
 */

'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { connectToRMHbox, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { C2S, S2C } from '@/lib/rmhbox/events';
import LobbyView from '@/components/rmhbox/LobbyView';
import GameVoting from '@/components/rmhbox/GameVoting';
import InstructionsScreen from '@/components/rmhbox/InstructionsScreen';
import PreloadScreen from '@/components/rmhbox/PreloadScreen';
import ResultsScreen from '@/components/rmhbox/ResultsScreen';
import SpectatorBanner from '@/components/rmhbox/SpectatorBanner';
import MinigameRenderer from '@/components/rmhbox/minigames/MinigameRenderer';
import GameShell from '@/components/rmhbox/GameShell';
import type { VoteCandidate } from '@/lib/rmhbox/types';

export default function LobbyPage({ params }: { params: Promise<{ lobbyId: string }> }) {
  const { lobbyId } = use(params);
  const router = useRouter();
  const lobby = useRMHboxStore((s) => s.lobby);
  const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
  const [error, setError] = useState<string | null>(null);

  // Voting state (received via separate events)
  const [voteCandidates, setVoteCandidates] = useState<VoteCandidate[]>([]);
  const [voteDuration, setVoteDuration] = useState(30);
  const [voteEndsAt, setVoteEndsAt] = useState(0);

  // Instructions state
  const [instructions, setInstructions] = useState<{
    title: string; description: string; rules: string[]; tips: string[]; durationSeconds: number;
  } | null>(null);

  // Preload state
  const [preloadPlayers, setPreloadPlayers] = useState<{ userId: string; userName: string; ready: boolean }[]>([]);

  // Countdown state
  const [countdownValue, setCountdownValue] = useState(3);

  // Connect and join lobby on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const socket = await connectToRMHbox();

        // Join the lobby
        socket.emit(C2S.LOBBY_JOIN, { lobbyId });

        // Listen for voting events
        socket.on(S2C.GAME_VOTE_STARTED, (data: { candidates: VoteCandidate[]; durationSeconds: number; endsAt: number }) => {
          if (mounted) {
            setVoteCandidates(data.candidates);
            setVoteDuration(data.durationSeconds);
            setVoteEndsAt(data.endsAt);
          }
        });

        // Listen for instructions
        socket.on(S2C.GAME_INSTRUCTIONS, (data: { title: string; description: string; rules?: string[]; tips?: string[]; durationSeconds: number }) => {
          if (mounted) {
            setInstructions({
              title: data.title,
              description: data.description,
              rules: data.rules ?? [],
              tips: data.tips ?? [],
              durationSeconds: data.durationSeconds,
            });
          }
        });

        // Listen for preload progress
        socket.on(S2C.GAME_PRELOAD_PROGRESS, (data: { players: { userId: string; userName: string; ready: boolean }[] }) => {
          if (mounted) setPreloadPlayers(data.players);
        });

        // Listen for preload start
        socket.on(S2C.GAME_PRELOAD_START, () => {
          if (mounted) setPreloadPlayers([]);
        });

        // Listen for countdown
        socket.on(S2C.GAME_COUNTDOWN, (data: { seconds: number }) => {
          if (mounted) setCountdownValue(data.seconds);
        });

        // Listen for kick
        socket.on(S2C.LOBBY_KICKED, () => {
          if (mounted) router.push('/rmhbox');
        });

        // Listen for disband
        socket.on(S2C.LOBBY_DISBANDED, () => {
          if (mounted) router.push('/rmhbox');
        });

        // Listen for errors
        socket.on(S2C.ERROR, (data: { message: string }) => {
          if (mounted) setError(data.message);
        });
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    }

    init();
    return () => { mounted = false; };
  }, [lobbyId, router]);

  // Loading state
  if (connectionStatus === 'connecting' || connectionStatus === 'disconnected') {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--rmhbox-bg, #0f0f1a)', color: 'var(--rmhbox-text, #e0e0f0)' }}>
        <div className="text-center">
          <div className="text-2xl mb-4">Connecting...</div>
          <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto" style={{ borderColor: 'var(--rmhbox-accent, #7c5cfc)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    );
  }

  // Error state
  if (error || connectionStatus === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--rmhbox-bg, #0f0f1a)', color: 'var(--rmhbox-text, #e0e0f0)' }}>
        <div className="text-center">
          <div className="text-2xl mb-4" style={{ color: 'var(--rmhbox-danger, #f87171)' }}>
            {error ?? 'Connection error'}
          </div>
          <button
            onClick={() => router.push('/rmhbox')}
            className="px-6 py-2 rounded-lg"
            style={{ backgroundColor: 'var(--rmhbox-accent, #7c5cfc)', color: '#fff' }}
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // No lobby state yet
  if (!lobby) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--rmhbox-bg, #0f0f1a)', color: 'var(--rmhbox-text, #e0e0f0)' }}>
        <div className="text-center">
          <div className="text-2xl mb-4">Joining lobby {lobbyId}...</div>
          <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto" style={{ borderColor: 'var(--rmhbox-accent, #7c5cfc)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    );
  }

  const isSpectator = lobby.myRole === 'spectator';
  const isHost = lobby.hostUserId === lobby.myUserId;

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: 'var(--rmhbox-bg, #0f0f1a)', color: 'var(--rmhbox-text, #e0e0f0)' }}>
      {/* Spectator Banner */}
      {isSpectator && (
        <SpectatorBanner
          lobbyState={lobby.state}
          onRequestPromotion={() => emit(C2S.LOBBY_REQUEST_PROMOTION, { lobbyId })}
        />
      )}

      {/* State-based view rendering */}
      {lobby.state === 'WAITING' && <LobbyView />}

      {lobby.state === 'VOTING' && (
        <GameVoting
          candidates={voteCandidates}
          durationSeconds={voteDuration}
          endsAt={voteEndsAt}
          onVote={(minigameId: string) => emit(C2S.GAME_CAST_VOTE, { lobbyId, minigameId })}
        />
      )}

      {lobby.state === 'INSTRUCTIONS' && instructions && (
        <InstructionsScreen
          title={instructions.title}
          description={instructions.description}
          rules={instructions.rules}
          tips={instructions.tips}
          durationSeconds={instructions.durationSeconds}
          isHost={isHost}
          onSkip={() => emit(C2S.GAME_FORCE_SKIP, { lobbyId })}
        />
      )}

      {lobby.state === 'PRELOADING' && (
        <PreloadScreen players={preloadPlayers} />
      )}

      {lobby.state === 'COUNTDOWN' && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-9xl font-bold animate-pulse" style={{ color: 'var(--rmhbox-accent, #7c5cfc)', fontFamily: 'var(--rmhbox-font-display, Nunito, sans-serif)' }}>
            {countdownValue}
          </div>
        </div>
      )}

      {lobby.state === 'PLAYING' && lobby.currentGame && (
        <GameShell
          gameName={lobby.currentGame.displayName}
          timeRemaining={lobby.currentGame.timeRemaining}
          roundNumber={lobby.roundNumber}
          score={lobby.players.find((p) => p.userId === lobby.myUserId)?.score ?? 0}
          playerCount={lobby.players.length}
        >
          <MinigameRenderer minigameId={lobby.currentGame.minigameId} />
        </GameShell>
      )}

      {lobby.state === 'ROUND_RESULTS' && (
        <ResultsScreen
          rankings={[]}
          sessionStandings={[]}
          awards={[]}
          roundNumber={lobby.roundNumber}
        />
      )}

      {lobby.state === 'SESSION_RESULTS' && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4" style={{ fontFamily: 'var(--rmhbox-font-display, Nunito, sans-serif)' }}>
              Session Complete!
            </h1>
            <button
              onClick={() => router.push('/rmhbox')}
              className="px-8 py-3 rounded-lg font-semibold"
              style={{ backgroundColor: 'var(--rmhbox-accent, #7c5cfc)', color: '#fff' }}
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
