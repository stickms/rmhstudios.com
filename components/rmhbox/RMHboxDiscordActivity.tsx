'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PartyPopper, Trophy, Gamepad2 } from 'lucide-react';
import { setActivityStatus, type DiscordContext } from '@/lib/discord-sdk';
import { connectToRMHbox, getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { toast } from '@/lib/rmhbox/toast-store';
import type { VoteCandidate, PlayerRanking, SessionStanding, Award, RoundResultsPayload, MatchSummary } from '@/lib/rmhbox/types';
import RMHboxShell from '@/components/rmhbox/RMHboxShell';
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
    const { t } = useTranslation("c-rmhbox");
    const [joinCode, setJoinCode] = useState('');

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="text-center pt-2 pb-1">
                <div className="flex items-center justify-center gap-2">
                    <Gamepad2 className="w-6 h-6 text-(--app-accent)" />
                    <h1 className="text-2xl font-bold text-(--app-text)">RMHBox</h1>
                </div>
                <p className="text-xs text-(--app-text-muted) mt-1">{t("party-games-tagline", { defaultValue: "Party games for Discord" })}</p>
            </div>

            {/* Create Lobby */}
            <div className="rounded-xl border border-(--app-border) bg-(--app-surface) p-4">
                <h2 className="text-base font-semibold mb-2">{t("create-lobby", { defaultValue: "Create Lobby" })}</h2>
                <p className="text-xs mb-3 text-(--app-text-muted)">{t("create-lobby-desc", { defaultValue: "Start a new session and invite friends." })}</p>
                <button
                    onClick={onCreateLobby}
                    disabled={connectionStatus !== 'connected'}
                    className="w-full py-2.5 rounded-lg font-semibold text-(--app-accent-fg) text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--app-accent) hover:bg-(--app-accent-hover)"
                >
                    {t("create-lobby", { defaultValue: "Create Lobby" })}
                </button>
            </div>

            {/* Join Lobby */}
            <div className="rounded-xl border border-(--app-border) bg-(--app-surface) p-4">
                <h2 className="text-base font-semibold mb-2">{t("join-lobby", { defaultValue: "Join Lobby" })}</h2>
                <p className="text-xs mb-3 text-(--app-text-muted)">{t("join-lobby-desc", { defaultValue: "Enter a 6-character room code." })}</p>
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
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg font-mono text-sm uppercase tracking-widest text-center border border-(--app-border) bg-(--app-bg) text-(--app-text) placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent)"
                    />
                    <button
                        type="submit"
                        disabled={connectionStatus !== 'connected' || joinCode.trim().length !== 6}
                        className="px-4 py-2 rounded-lg font-semibold text-(--app-accent-fg) text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--app-accent) hover:bg-(--app-accent-hover)"
                    >
                        {t("join", { defaultValue: "Join" })}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────

export function RMHboxDiscordActivity({ discord }: Props) {
    const { t } = useTranslation("c-rmhbox");
    const lobby = useRMHboxStore((s) => s.lobby);
    const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
    const spectatorTarget = useRMHboxStore((s) => s.spectatorTarget);
    const timerInfo = useRMHboxStore((s) => s.timerInfo);

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
    // The game-lifecycle listeners below are the only source for the
    // instructions / preload / countdown / results screens, so they are wired
    // unconditionally and torn down on unmount. They used to sit behind an
    // early `if (lobby) return`, which meant a remount while the socket
    // singleton was still alive (it outlives this component — nothing calls
    // disconnectFromRMHbox in the Activity) left the Activity subscribed to
    // nothing: the lobby rendered, then every phase after "start game" was a
    // blank screen because no INSTRUCTIONS / COUNTDOWN / ROUND_RESULTS event
    // was ever handled.
    useEffect(() => {
        mountedRef.current = true;
        let cleanup: (() => void) | null = null;
        let cancelled = false;

        async function connect() {
            try {
                const socket = await connectToRMHbox(discord.accessToken, {
                    channelId: discord.channelId,
                    guildId: discord.guildId,
                });
                if (cancelled) return;

                const onLobbyCreated = (data: { lobbyId: string }) => {
                    // Join the lobby we just created
                    emit(C2S.LOBBY_JOIN, { lobbyId: data.lobbyId });
                };

                const onVoteStarted = (data: { candidates: VoteCandidate[]; durationSeconds: number; endsAt: number }) => {
                    setVoteCandidates(data.candidates);
                    setVoteDuration(data.durationSeconds);
                    setVoteEndsAt(data.endsAt);
                };

                const onInstructions = (data: { title: string; description: string; rules?: string[]; tips?: string[]; durationSeconds: number }) => {
                    setInstructions({
                        title: data.title,
                        description: data.description,
                        rules: data.rules ?? [],
                        tips: data.tips ?? [],
                        durationSeconds: data.durationSeconds,
                    });
                };

                const onPreloadProgress = (data: { players: { userId: string; userName: string; ready: boolean }[] }) => {
                    setPreloadPlayers(data.players);
                };

                const onPreloadStart = () => setPreloadPlayers([]);
                const onCountdown = (data: { seconds: number }) => setCountdownValue(data.seconds);
                const onRoundResults = (data: RoundResultsPayload) => setRoundResults(data);
                const onSessionResults = (data: { standings: SessionStanding[]; matchHistory: MatchSummary[] }) => setSessionResults(data);
                const onLeftLobby = () => useRMHboxStore.getState().leaveLobby();
                const onError = (data: { code?: string }) => {
                    if (data.code === 'LOBBY_NOT_FOUND') useRMHboxStore.getState().leaveLobby();
                };

                socket.on(S2C.LOBBY_CREATED, onLobbyCreated);
                socket.on(S2C.GAME_VOTE_STARTED, onVoteStarted);
                socket.on(S2C.GAME_INSTRUCTIONS, onInstructions);
                socket.on(S2C.GAME_PRELOAD_PROGRESS, onPreloadProgress);
                socket.on(S2C.GAME_PRELOAD_START, onPreloadStart);
                socket.on(S2C.GAME_COUNTDOWN, onCountdown);
                socket.on(S2C.GAME_ROUND_RESULTS, onRoundResults);
                socket.on(S2C.GAME_SESSION_RESULTS, onSessionResults);
                socket.on(S2C.LOBBY_KICKED, onLeftLobby);
                socket.on(S2C.LOBBY_DISBANDED, onLeftLobby);
                socket.on(S2C.ERROR, onError);

                cleanup = () => {
                    socket.off(S2C.LOBBY_CREATED, onLobbyCreated);
                    socket.off(S2C.GAME_VOTE_STARTED, onVoteStarted);
                    socket.off(S2C.GAME_INSTRUCTIONS, onInstructions);
                    socket.off(S2C.GAME_PRELOAD_PROGRESS, onPreloadProgress);
                    socket.off(S2C.GAME_PRELOAD_START, onPreloadStart);
                    socket.off(S2C.GAME_COUNTDOWN, onCountdown);
                    socket.off(S2C.GAME_ROUND_RESULTS, onRoundResults);
                    socket.off(S2C.GAME_SESSION_RESULTS, onSessionResults);
                    socket.off(S2C.LOBBY_KICKED, onLeftLobby);
                    socket.off(S2C.LOBBY_DISBANDED, onLeftLobby);
                    socket.off(S2C.ERROR, onError);
                };

                // QoL: everyone who opens the Activity from the same Discord voice
                // channel is auto-connected to the same lobby — no room code needed.
                // Users without a voice channel fall through to the manual browser.
                // Skipped when the store already has a lobby: the hub re-attaches
                // a returning socket to its slot on its own.
                if (discord.channelId && !useRMHboxStore.getState().lobby) {
                    emit(C2S.LOBBY_AUTO_JOIN);
                }

            } catch (err) {
                if (!cancelled) toast.error(err instanceof Error ? err.message : 'Connection failed');
            }
        }

        connect();
        return () => {
            cancelled = true;
            mountedRef.current = false;
            cleanup?.();
        };
    }, [discord.accessToken, discord.channelId, discord.guildId]);

    // ─── Clear stale round results on new game ─────────────────
    useEffect(() => {
        if (lobby?.state === 'PLAYING' || lobby?.state === 'COUNTDOWN') {
            setRoundResults(null);
        }
    }, [lobby?.state]);

    // ─── Discord rich presence ─────────────────────────────────
    // Without this the Activity shows only the generic app name in the party
    // header and on every player's profile — the same gap Lights Out already
    // fills via setActivityStatus.
    const lobbyState = lobby?.state ?? null;
    const currentGameName = lobby?.currentGame?.displayName ?? null;
    const partyCount = lobby?.players.length ?? 0;
    const partyMax = lobby?.settings.maxPlayers ?? 0;
    const roomCode = lobby?.lobbyId ?? null;

    useEffect(() => {
        if (!lobbyState) {
            setActivityStatus(discord.sdk, t("presence-browsing", { defaultValue: "Picking a lobby" }));
            return;
        }

        const state = currentGameName && (lobbyState === 'PLAYING' || lobbyState === 'COUNTDOWN' || lobbyState === 'INSTRUCTIONS' || lobbyState === 'PRELOADING')
            ? t("presence-playing", { defaultValue: "Playing {{game}}", game: currentGameName })
            : lobbyState === 'VOTING'
                ? t("presence-voting", { defaultValue: "Voting on the next game" })
                : lobbyState === 'ROUND_RESULTS' || lobbyState === 'SESSION_RESULTS'
                    ? t("presence-results", { defaultValue: "Looking at the scores" })
                    : t("presence-waiting", { defaultValue: "In the lobby" });

        setActivityStatus(discord.sdk, state, {
            details: roomCode ? t("presence-room", { defaultValue: "Room {{code}}", code: roomCode }) : undefined,
            partySize: partyCount > 0 && partyMax > 0 ? [partyCount, partyMax] : undefined,
        });
    }, [discord.sdk, t, lobbyState, currentGameName, partyCount, partyMax, roomCode]);

    const handleCreateLobby = useCallback(() => emit(C2S.LOBBY_CREATE, {}), []);

    const handleJoinLobby = useCallback((code: string) => {
        const trimmed = code.trim().toUpperCase();
        if (trimmed.length !== 6) { toast.warning(t("room-code-length-error", { defaultValue: "Room code must be 6 characters" })); return; }
        emit(C2S.LOBBY_JOIN, { lobbyId: trimmed });
    }, [t]);

    // ─── Render ────────────────────────────────────────────────

    const isPip = layoutMode === LAYOUT_PIP;

    const isSpectator = lobby?.myRole === 'spectator';
    const isHost = lobby ? lobby.hostUserId === lobby.myUserId : false;
    const lobbyId = lobby?.lobbyId ?? '';
    const spectatorMode = lobby?.currentGame?.spectatorMode ?? null;

    // The header owns the phase timer ring and the host's pause / skip / end
    // controls. The standalone /rmhbox lobby page has always rendered it; the
    // Activity did not, so Discord players had no countdown for instructions,
    // countdown or results — and a Discord host had no way to pause or skip.
    // Only the 'game' context is used here: the others render a back link to
    // /rmhbox, which would navigate the iframe out of the Activity.
    const isGamePhase = !!lobby && (
        lobby.state === 'INSTRUCTIONS' || lobby.state === 'PRELOADING' ||
        lobby.state === 'COUNTDOWN' || lobby.state === 'PLAYING' ||
        lobby.state === 'ROUND_RESULTS' || lobby.state === 'GAME_SETTINGS'
    );

    return (
        <RMHboxShell>
            {isPip && <PipOverlay gameStatus={pipStatusText} />}

            <div className="app-viewport">
                {isGamePhase && (
                    <RMHboxHeader context="game" title={lobby?.currentGame?.displayName} />
                )}

                {/* Connecting state — no lobby yet */}
                {!lobby && (connectionStatus === 'connecting' || connectionStatus === 'disconnected') && (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="text-center">
                            <div className="text-xl mb-4 text-(--app-text)">{t("connecting", { defaultValue: "Connecting..." })}</div>
                            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto border-(--app-accent)" />
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
                                <div className="text-9xl font-bold animate-pulse text-(--app-accent)" style={{ fontFamily: 'var(--app-font-display)' }}>
                                    {/* Read from the centralized timer (TIMER_START/TICK), not
                                        currentGame.timeRemaining — the latter is reset to null by
                                        every full sync, which would freeze the countdown on the
                                        stale countdownValue fallback if a sync lands mid-countdown. */}
                                    {timerInfo && !timerInfo.infinite ? Math.max(0, Math.ceil(timerInfo.remaining)) : countdownValue}
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
                                        <div className="text-xl mb-3 text-(--app-text)">{t("starting-game", { defaultValue: "Starting game..." })}</div>
                                        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto" style={{ borderColor: 'var(--app-accent)', borderTopColor: 'transparent' }} />
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
                                <h1 className="text-4xl font-bold" style={{ fontFamily: 'var(--app-font-display)' }}>
                                    {t("session-complete", { defaultValue: "Session Complete!" })} <PartyPopper className="h-8 w-8 inline" />
                                </h1>

                                {sessionResults?.standings && sessionResults.standings.length > 0 && (
                                    <div className="w-full rounded-xl border border-(--app-border) bg-(--app-surface) p-4">
                                        <h2 className="mb-3 text-lg font-semibold text-(--app-accent)">{t("final-standings", { defaultValue: "Final Standings" })}</h2>
                                        <div className="space-y-2">
                                            {sessionResults.standings.map((s) => (
                                                <div key={s.userId} className="flex items-center justify-between rounded-lg bg-(--app-bg) px-4 py-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xl font-bold" style={{ color: s.rank === 1 ? 'var(--app-warning)' : s.rank === 2 ? '#c0c0c0' : s.rank === 3 ? '#cd7f32' : 'var(--app-text-muted)' }}>
                                                            #{s.rank}
                                                        </span>
                                                        <span className="font-semibold">{s.userName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm">
                                                        <span className="text-(--app-text-muted)">{t("wins-count", { count: s.wins, defaultValue: "{{count}} win" })}</span>
                                                        <span className="font-bold text-(--app-accent)">{t("score-pts", { count: s.totalScore, defaultValue: "{{count}} pts" })}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {sessionResults?.matchHistory && sessionResults.matchHistory.length > 0 && (
                                    <div className="w-full rounded-xl border border-(--app-border) bg-(--app-surface) p-4">
                                        <h2 className="mb-3 text-lg font-semibold text-(--app-accent)">{t("match-history", { defaultValue: "Match History" })}</h2>
                                        <div className="space-y-2">
                                            {sessionResults.matchHistory.map((m) => (
                                                <div key={m.matchId} className="flex items-center justify-between rounded-lg bg-(--app-bg) px-4 py-2 text-sm">
                                                    <div>
                                                        <span className="font-semibold">{m.minigameDisplayName}</span>
                                                        <span className="ml-2 text-(--app-text-muted)">· {t("player-count", { count: m.playerCount, defaultValue: "{{count}} players" })}</span>
                                                    </div>
                                                    <span className="text-(--app-success) flex items-center gap-1">
                                                        <Trophy className="h-3.5 w-3.5" /> {m.winnerUserName ?? 'N/A'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => useRMHboxStore.getState().leaveLobby()}
                                    className="px-8 py-3 rounded-lg font-semibold bg-(--app-accent) text-(--app-accent-fg) hover:bg-(--app-accent-hover) transition-colors"
                                >
                                    {t("back-to-lobby-browser", { defaultValue: "Back to Lobby Browser" })}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </RMHboxShell>
    );
}
