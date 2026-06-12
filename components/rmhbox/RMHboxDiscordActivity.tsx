'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PartyPopper, Trophy, Gamepad2 } from 'lucide-react';
import type { DiscordContext } from '@/lib/discord-sdk';
import { connectToRMHbox, getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { toast } from '@/lib/rmhbox/toast-store';
import type { VoteCandidate, PlayerRanking, SessionStanding, Award, RoundResultsPayload, MatchSummary } from '@/lib/rmhbox/types';
import RMHboxShell from '@/components/rmhbox/RMHboxShell';
import LobbyView from '@/components/rmhbox/LobbyView';
// ToastContainer is rendered by RMHboxShell — no need to render it again
import GameVoting from '@/components/rmhbox/GameVoting';
import GameSettingsPhase from '@/components/rmhbox/GameSettingsPhase';
import InstructionsScreen from '@/components/rmhbox/InstructionsScreen';
import PreloadScreen from '@/components/rmhbox/PreloadScreen';
import ResultsScreen from '@/components/rmhbox/ResultsScreen';
import SpectatorBanner from '@/components/rmhbox/SpectatorBanner';
import MinigameRenderer from '@/components/rmhbox/minigames/MinigameRenderer';
import GameShell from '@/components/rmhbox/GameShell';
import ToastContainer from '@/components/rmhbox/ToastContainer';

// Discord embedded app layout modes
const LAYOUT_FOCUSED = 0;
const LAYOUT_PIP = 1;
// LAYOUT_GRID = 2 — still show full UI in grid, only PiP gets minimized

interface Props {
    discord: DiscordContext;
}

// ─── PiP Overlay ─────────────────────────────────────────────────

function PipOverlay({ gameStatus }: { gameStatus: string | null }) {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#1a1a2e] select-none">
            <div className="flex flex-col items-center gap-2">
                <Gamepad2 className="w-10 h-10 text-[#5865f2]" />
                <span className="text-white font-bold text-base tracking-wide">RMHBox</span>
                {gameStatus && (
                    <span className="text-[#b5bac1] text-xs text-center max-w-30 leading-tight">
                        {gameStatus}
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── Lobby Browser Screen ─────────────────────────────────────────

interface LobbyBrowserProps {
    connectionStatus: string;
    onCreateLobby: () => void;
    onJoinLobby: (code: string) => void;
}

function LobbyBrowser({ connectionStatus, onCreateLobby, onJoinLobby }: LobbyBrowserProps) {
    const [joinCode, setJoinCode] = useState('');

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="text-center pt-2 pb-1">
                <div className="flex items-center justify-center gap-2">
                    <Gamepad2 className="w-6 h-6 text-(--rmhbox-accent)" />
                    <h1 className="text-2xl font-bold text-(--rmhbox-text)">RMHBox</h1>
                </div>
                <p className="text-xs text-(--rmhbox-text-muted) mt-1">Party games for Discord</p>
            </div>

            {/* Create Lobby */}
            <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
                <h2 className="text-base font-semibold mb-2">Create Lobby</h2>
                <p className="text-xs mb-3 text-(--rmhbox-text-muted)">Start a new session and invite friends.</p>
                <button
                    onClick={onCreateLobby}
                    disabled={connectionStatus !== 'connected'}
                    className="w-full py-2.5 rounded-lg font-semibold text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhbox-accent) hover:bg-(--rmhbox-accent-hover)"
                >
                    Create Lobby
                </button>
            </div>

            {/* Join Lobby */}
            <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
                <h2 className="text-base font-semibold mb-2">Join Lobby</h2>
                <p className="text-xs mb-3 text-(--rmhbox-text-muted)">Enter a 6-character room code.</p>
                <form
                    onSubmit={(e) => { e.preventDefault(); onJoinLobby(joinCode); }}
                    className="flex gap-2"
                >
                    <input
                        type="text"
                        maxLength={6}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="ABCDEF"
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg font-mono text-sm uppercase tracking-widest text-center border border-(--rmhbox-border) bg-(--rmhbox-bg) text-(--rmhbox-text) placeholder:text-(--rmhbox-text-dim) outline-none focus:ring-1 focus:ring-(--rmhbox-accent)"
                    />
                    <button
                        type="submit"
                        disabled={connectionStatus !== 'connected' || joinCode.trim().length !== 6}
                        className="px-4 py-2 rounded-lg font-semibold text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhbox-accent) hover:bg-(--rmhbox-accent-hover)"
                    >
                        Join
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────

export function RMHboxDiscordActivity({ discord }: Props) {
    const lobby = useRMHboxStore((s) => s.lobby);
    const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
    const spectatorTarget = useRMHboxStore((s) => s.spectatorTarget);

    const [layoutMode, setLayoutMode] = useState<number>(LAYOUT_FOCUSED);
    const [voteCandidates, setVoteCandidates] = useState<VoteCandidate[]>([]);
    const [voteDuration, setVoteDuration] = useState(30);
    const [voteEndsAt, setVoteEndsAt] = useState(0);
    const [instructions, setInstructions] = useState<{
        title: string; description: string; rules: string[]; tips: string[]; durationSeconds: number;
    } | null>(null);
    const [preloadPlayers, setPreloadPlayers] = useState<{ userId: string; userName: string; ready: boolean }[]>([]);
    const [countdownValue, setCountdownValue] = useState(3);
    const [roundResults, setRoundResults] = useState<{
        rankings: PlayerRanking[]; sessionStandings: SessionStanding[]; awards: Award[]; roundNumber: number;
    } | null>(null);
    const [sessionResults, setSessionResults] = useState<{
        standings: SessionStanding[]; matchHistory: MatchSummary[];
    } | null>(null);

    const mountedRef = useRef(true);
    const pipRef = useRef(false); // track current away state to avoid redundant emits

    // ─── PiP status for overlay text ─────────────────────────
    const pipStatusText = lobby
        ? lobby.currentGame
            ? `Playing: ${lobby.currentGame.displayName}`
            : `Lobby ${lobby.lobbyId}`
        : null;

    // ─── Discord Activity layout mode subscription ────────────
    useEffect(() => {
        const sdk = discord.sdk;
        const handler = ({ layout_mode }: { layout_mode: number }) => {
            if (!mountedRef.current) return;
            setLayoutMode(layout_mode);

            const nowAway = layout_mode === LAYOUT_PIP;
            if (nowAway !== pipRef.current) {
                pipRef.current = nowAway;
                const socket = getSocket();
                if (socket?.connected && lobby) {
                    emit(nowAway ? C2S.PLAYER_AWAY : C2S.PLAYER_ACTIVE);
                }
            }
        };

        sdk.subscribe('ACTIVITY_LAYOUT_MODE_UPDATE', handler);
        return () => { sdk.unsubscribe('ACTIVITY_LAYOUT_MODE_UPDATE', handler); };
    }, [discord.sdk, lobby]);

    // ─── Reset away state when lobby changes ──────────────────
    useEffect(() => {
        if (!lobby) pipRef.current = false;
    }, [lobby]);

    // ─── Socket connection ─────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true;

        async function connect() {
            try {
                const socket = await connectToRMHbox(discord.accessToken);
                if (!mountedRef.current) return;

                // If already in a lobby from a reconnect, stay there
                const existingLobby = useRMHboxStore.getState().lobby;
                if (existingLobby) return;

                socket.on(S2C.LOBBY_CREATED, (data: { lobbyId: string }) => {
                    if (!mountedRef.current) return;
                    // Join the lobby we just created
                    emit(C2S.LOBBY_JOIN, { lobbyId: data.lobbyId });
                });

                socket.on(S2C.GAME_VOTE_STARTED, (data: { candidates: VoteCandidate[]; durationSeconds: number; endsAt: number }) => {
                    if (!mountedRef.current) return;
                    setVoteCandidates(data.candidates);
                    setVoteDuration(data.durationSeconds);
                    setVoteEndsAt(data.endsAt);
                });

                socket.on(S2C.GAME_INSTRUCTIONS, (data: { title: string; description: string; rules?: string[]; tips?: string[]; durationSeconds: number }) => {
                    if (!mountedRef.current) return;
                    setInstructions({
                        title: data.title,
                        description: data.description,
                        rules: data.rules ?? [],
                        tips: data.tips ?? [],
                        durationSeconds: data.durationSeconds,
                    });
                });

                socket.on(S2C.GAME_PRELOAD_PROGRESS, (data: { players: { userId: string; userName: string; ready: boolean }[] }) => {
                    if (mountedRef.current) setPreloadPlayers(data.players);
                });

                socket.on(S2C.GAME_PRELOAD_START, () => {
                    if (mountedRef.current) setPreloadPlayers([]);
                });

                socket.on(S2C.GAME_COUNTDOWN, (data: { seconds: number }) => {
                    if (mountedRef.current) setCountdownValue(data.seconds);
                });

                socket.on(S2C.GAME_ROUND_RESULTS, (data: RoundResultsPayload) => {
                    if (mountedRef.current) setRoundResults(data);
                });

                socket.on(S2C.GAME_SESSION_RESULTS, (data: { standings: SessionStanding[]; matchHistory: MatchSummary[] }) => {
                    if (mountedRef.current) setSessionResults(data);
                });

                socket.on(S2C.LOBBY_KICKED, () => {
                    if (!mountedRef.current) return;
                    useRMHboxStore.getState().leaveLobby();
                });

                socket.on(S2C.LOBBY_DISBANDED, () => {
                    if (!mountedRef.current) return;
                    useRMHboxStore.getState().leaveLobby();
                });

                socket.on(S2C.ERROR, (data: { code?: string }) => {
                    if (!mountedRef.current) return;
                    if (data.code === 'LOBBY_NOT_FOUND') {
                        useRMHboxStore.getState().leaveLobby();
                    }
                });

            } catch (err) {
                if (mountedRef.current) toast.error(err instanceof Error ? err.message : 'Connection failed');
            }
        }

        connect();
        return () => { mountedRef.current = false; };
    }, [discord.accessToken]);

    // ─── Clear stale round results on new game ─────────────────
    useEffect(() => {
        if (lobby?.state === 'PLAYING' || lobby?.state === 'COUNTDOWN') {
            setRoundResults(null);
        }
    }, [lobby?.state]);

    const handleCreateLobby = useCallback(() => emit(C2S.LOBBY_CREATE, {}), []);

    const handleJoinLobby = useCallback((code: string) => {
        const trimmed = code.trim().toUpperCase();
        if (trimmed.length !== 6) { toast.warning('Room code must be 6 characters'); return; }
        emit(C2S.LOBBY_JOIN, { lobbyId: trimmed });
    }, []);

    // ─── Render ────────────────────────────────────────────────

    const isPip = layoutMode === LAYOUT_PIP;

    const isSpectator = lobby?.myRole === 'spectator';
    const isHost = lobby ? lobby.hostUserId === lobby.myUserId : false;
    const lobbyId = lobby?.lobbyId ?? '';
    const spectatorMode = lobby?.currentGame?.spectatorMode ?? null;

    return (
        <RMHboxShell>
            {isPip && <PipOverlay gameStatus={pipStatusText} />}

            <div className="flex h-screen flex-col overflow-hidden">
                {/* Connecting state — no lobby yet */}
                {!lobby && (connectionStatus === 'connecting' || connectionStatus === 'disconnected') && (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="text-center">
                            <div className="text-xl mb-4 text-(--rmhbox-text)">Connecting...</div>
                            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto border-(--rmhbox-accent)" />
                        </div>
                    </div>
                )}

                {/* Lobby browser — no lobby joined yet */}
                {!lobby && connectionStatus === 'connected' && (
                    <LobbyBrowser
                        connectionStatus={connectionStatus}
                        onCreateLobby={handleCreateLobby}
                        onJoinLobby={handleJoinLobby}
                    />
                )}

                {/* In-lobby view */}
                {lobby && (
                    <div className="flex-1 min-h-0 overflow-y-auto relative">
                        {isSpectator && (
                            <SpectatorBanner
                                lobbyState={lobby.state}
                                onRequestPromotion={() => emit(C2S.LOBBY_REQUEST_PROMOTION, { lobbyId })}
                                spectatorTarget={spectatorTarget}
                                spectatorMode={spectatorMode}
                                onSelectPlayer={(targetPlayerId) => emit(C2S.SPECTATOR_SELECT_PLAYER, { lobbyId, targetPlayerId })}
                            />
                        )}

                        {lobby.state === 'WAITING' && <LobbyView />}

                        {lobby.state === 'VOTING' && (
                            <GameVoting
                                candidates={voteCandidates}
                                durationSeconds={voteDuration}
                                endsAt={voteEndsAt}
                                onVote={(minigameId) => emit(C2S.GAME_CAST_VOTE, { lobbyId, minigameId })}
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
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center">
                                        <div className="text-xl mb-3 text-(--rmhbox-text)">Starting game...</div>
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
                                                    <span className="text-(--rmhbox-success) flex items-center gap-1">
                                                        <Trophy className="h-3.5 w-3.5" /> {m.winnerUserName ?? 'N/A'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => useRMHboxStore.getState().leaveLobby()}
                                    className="px-8 py-3 rounded-lg font-semibold bg-(--rmhbox-accent) text-white hover:bg-(--rmhbox-accent-hover) transition-colors"
                                >
                                    Back to Lobby Browser
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ToastContainer />
        </RMHboxShell>
    );
}
