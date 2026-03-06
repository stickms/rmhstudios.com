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

import { useEffect, useState, use } from 'react';
import { connectToRMHbox, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { C2S, S2C } from '@/lib/rmhbox/events';
import { toast } from '@/lib/rmhbox/toast-store';
import { PartyPopper, Trophy } from 'lucide-react';
import LobbyView from '@/components/rmhbox/LobbyView';
import GameVoting from '@/components/rmhbox/GameVoting';
import GameSettingsPhase from '@/components/rmhbox/GameSettingsPhase';
import InstructionsScreen from '@/components/rmhbox/InstructionsScreen';
import PreloadScreen from '@/components/rmhbox/PreloadScreen';
import ResultsScreen from '@/components/rmhbox/ResultsScreen';
import SpectatorBanner from '@/components/rmhbox/SpectatorBanner';
import MinigameRenderer from '@/components/rmhbox/minigames/MinigameRenderer';
import GameShell from '@/components/rmhbox/GameShell';
import RMHboxHeader from '@/components/rmhbox/RMHboxHeader';
import type { VoteCandidate, PlayerRanking, SessionStanding, Award, RoundResultsPayload, MatchSummary } from '@/lib/rmhbox/types';
import { useRouter } from '@tanstack/react-router';

export default function LobbyPage({ params }: { params: Promise<{ lobbyId: string }> }) {
  const { lobbyId } = use(params);
  const router = useRouter();
  const lobby = useRMHboxStore((s) => s.lobby);
  const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
  const spectatorTarget = useRMHboxStore((s) => s.spectatorTarget);

  const backlinkLabel = "Leave";
  const backlinkHref = '/rmhbox';

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

  // Round results state
  const [roundResults, setRoundResults] = useState<{
    rankings: PlayerRanking[];
    sessionStandings: SessionStanding[];
    awards: Award[];
    roundNumber: number;
  } | null>(null);

  // Session results state
  const [sessionResults, setSessionResults] = useState<{
    standings: SessionStanding[];
    matchHistory: MatchSummary[];
  } | null>(null);

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

        // Listen for round results
        socket.on(S2C.GAME_ROUND_RESULTS, (data: RoundResultsPayload) => {
          if (mounted) setRoundResults(data);
        });

        // Listen for session results
        socket.on(S2C.GAME_SESSION_RESULTS, (data: { standings: SessionStanding[]; matchHistory: MatchSummary[] }) => {
          if (mounted) setSessionResults(data);
        });

        // Listen for kick
        socket.on(S2C.LOBBY_KICKED, () => {
          if (mounted) {
            useRMHboxStore.getState().leaveLobby();
            router.navigate({ to: '/rmhbox' });
          }
        });

        // Listen for disband
        socket.on(S2C.LOBBY_DISBANDED, () => {
          if (mounted) {
            useRMHboxStore.getState().leaveLobby();
            router.navigate({ to: '/rmhbox' });
          }
        });

        // Listen for errors — only handle redirects here.
        // Toast display is handled by the global S2C.ERROR listener in socket.ts.
        socket.on(S2C.ERROR, (data: { code?: string; message?: string }) => {
          if (!mounted) return;
          if (data.code === 'LOBBY_NOT_FOUND') {
            useRMHboxStore.getState().leaveLobby();
            router.navigate({ to: '/rmhbox' });
          }
        });

        // If the server tells us we're not in any lobby (e.g. after long idle
        // and auto-reconnect), redirect back to the landing page.
        socket.on(S2C.NOT_IN_LOBBY, () => {
          if (!mounted) return;
          useRMHboxStore.getState().leaveLobby();
          router.navigate({ to: '/rmhbox' });
        });
      } catch (err) {
        if (mounted) toast.error(err instanceof Error ? err.message : 'Failed to connect');
      }
    }

    init();
    return () => { mounted = false; };
  }, [lobbyId, router]);

  // Reset stale round results when entering a new game to prevent
  // the ResultsScreen from briefly rendering outdated data.
  useEffect(() => {
    if (lobby?.state === 'PLAYING' || lobby?.state === 'COUNTDOWN') {
      setRoundResults(null);
    }
  }, [lobby?.state]);

  // Loading state
  if (connectionStatus === 'connecting' || connectionStatus === 'disconnected') {
    return (
      <div className="flex h-screen flex-col">
        <RMHboxHeader backLabel={backlinkLabel} backHref={backlinkHref}/>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-2xl mb-4 text-(--rmhbox-text)">Connecting...</div>
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto border-(--rmhbox-accent)" style={{ borderTopColor: 'transparent' }} />
          </div>
        </div>
      </div>
    );
  }

  // Error state — no longer blocks the screen; errors go to toast
  if (connectionStatus === 'error') {
    return (
      <div className="flex h-screen flex-col">
        <RMHboxHeader backLabel={backlinkLabel} backHref={backlinkHref}/>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-2xl mb-4 text-(--rmhbox-danger)">
              Connection error
            </div>
            <button
              onClick={() => router.navigate({ to: '/rmhbox' })}
              className="px-6 py-2 rounded-lg bg-(--rmhbox-accent) text-white font-semibold hover:bg-(--rmhbox-accent-hover) transition-colors"
            >
              Back to Lobby
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
        <RMHboxHeader backLabel={backlinkLabel} backHref={backlinkHref}/>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-2xl mb-4 text-(--rmhbox-text)">Joining lobby {lobbyId}...</div>
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto border-(--rmhbox-accent)" style={{ borderTopColor: 'transparent' }} />
          </div>
        </div>
      </div>
    );
  }

  const isSpectator = lobby.myRole === 'spectator';
  const isHost = lobby.hostUserId === lobby.myUserId;
  const spectatorMode = lobby.currentGame?.spectatorMode ?? null;

  // Determine header context and title based on current lobby state
  const isGamePhase = lobby.state === 'PLAYING' || lobby.state === 'COUNTDOWN'
    || lobby.state === 'INSTRUCTIONS' || lobby.state === 'PRELOADING'
    || lobby.state === 'ROUND_RESULTS' || lobby.state === 'GAME_SETTINGS';
  const headerContext = isGamePhase ? 'game' as const : 'lobby' as const;
  const headerTitle = lobby.currentGame ? lobby.currentGame.displayName : undefined;

  return (
    <div className="flex h-screen flex-col overflow-hidden relative">
      <RMHboxHeader
        context={headerContext}
        title={headerTitle}
        backLabel={backlinkLabel}
        backHref={backlinkHref}
      />

      {/* Content area below header */}
      <div className="flex-1 min-h-0 overflow-y-auto relative" style={lobby.state === 'WAITING' ? { scrollbarGutter: 'stable both-edges' } : undefined}>
        {/* Spectator Banner */}
        {isSpectator && (
          <SpectatorBanner
            lobbyState={lobby.state}
            onRequestPromotion={() => emit(C2S.LOBBY_REQUEST_PROMOTION, { lobbyId })}
            spectatorTarget={spectatorTarget}
            spectatorMode={spectatorMode}
            onSelectPlayer={(targetPlayerId) => emit(C2S.SPECTATOR_SELECT_PLAYER, { lobbyId, targetPlayerId })}
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

      {lobby.state === 'GAME_SETTINGS' && <GameSettingsPhase />}

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
        <PreloadScreen players={preloadPlayers} lobbyId={lobbyId} />
      )}

      {lobby.state === 'COUNTDOWN' && (
        <div className="flex items-center justify-center h-full">
          <div className="text-9xl font-bold animate-pulse text-(--rmhbox-accent)" style={{ fontFamily: 'var(--rmhbox-font-display)' }}>
            {lobby.currentGame?.timeRemaining ?? countdownValue}
          </div>
        </div>
      )}

      {lobby.state === 'PLAYING' && (
        lobby.currentGame ? (
          <GameShell
            roundNumber={lobby.roundNumber}
            score={lobby.players.find((p) => p.userId === lobby.myUserId)?.score ?? 0}
            playerCount={lobby.players.length}
          >
            <MinigameRenderer minigameId={lobby.currentGame.minigameId} />
          </GameShell>
        ) : (
          /* Brief loading state while GAME_SELECTED action is in-flight */
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-xl mb-3 text-(--rmhbox-text)">Starting game…</div>
              <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto" style={{ borderColor: 'var(--rmhbox-accent)', borderTopColor: 'transparent' }} />
            </div>
          </div>
        )
      )}

      {lobby.state === 'ROUND_RESULTS' && roundResults && (
        <ResultsScreen
          rankings={roundResults.rankings}
          sessionStandings={roundResults.sessionStandings}
          awards={roundResults.awards}
          roundNumber={roundResults.roundNumber}
          isHost={isHost}
          lobbyId={lobbyId}
        />
      )}

      {lobby.state === 'SESSION_RESULTS' && (
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 p-6 h-full justify-center">
          <h1 className="text-4xl font-bold" style={{ fontFamily: 'var(--rmhbox-font-display)' }}>
            Session Complete! <PartyPopper className="h-8 w-8 inline" />
          </h1>

          {/* Final Standings */}
          {sessionResults?.standings && sessionResults.standings.length > 0 && (
            <div className="w-full rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
              <h2 className="mb-3 text-lg font-semibold text-(--rmhbox-accent)">Final Standings</h2>
              <div className="space-y-2">
                {sessionResults.standings.map((s) => (
                  <div key={s.userId} className="flex items-center justify-between rounded-lg bg-(--rmhbox-bg) px-4 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold" style={{ color: s.rank === 1 ? 'var(--rmhbox-warning)' : s.rank === 2 ? '#c0c0c0' : s.rank === 3 ? '#cd7f32' : 'var(--rmhbox-text-muted)' }}>
                        #{s.rank}
                      </span>
                      <span className="font-semibold">{s.userName}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-(--rmhbox-text-muted)">{s.wins} win{s.wins !== 1 ? 's' : ''}</span>
                      <span className="font-bold text-(--rmhbox-accent)">{s.totalScore} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match History */}
          {sessionResults?.matchHistory && sessionResults.matchHistory.length > 0 && (
            <div className="w-full rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
              <h2 className="mb-3 text-lg font-semibold text-(--rmhbox-accent)">Match History</h2>
              <div className="space-y-2">
                {sessionResults.matchHistory.map((m) => (
                  <div key={m.matchId} className="flex items-center justify-between rounded-lg bg-(--rmhbox-bg) px-4 py-2 text-sm">
                    <div>
                      <span className="font-semibold">{m.minigameDisplayName}</span>
                      <span className="ml-2 text-(--rmhbox-text-muted)">· {m.playerCount} players</span>
                    </div>
                    <span className="text-(--rmhbox-success) flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> {m.winnerUserName ?? 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              useRMHboxStore.getState().leaveLobby();
              router.navigate({ to: '/rmhbox' });
            }}
            className="px-8 py-3 rounded-lg font-semibold bg-(--rmhbox-accent) text-white hover:bg-(--rmhbox-accent-hover) transition-colors"
          >
            Back to Lobby
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
