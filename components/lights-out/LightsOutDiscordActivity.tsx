'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getDateSeed,
    formatDateKey,
    createSeededRng,
} from '@/lib/lights-out/seed';
import { getDailyShape, getShapeLabel, isActiveCell } from '@/lib/lights-out/shapes';
import { ensureTrailingSlash } from '@/lib/url';
import {
    generatePuzzle,
    toggleCellInGrid,
    isSolved,
    createEmptyGrid,
    getOptimalMoves,
    type Grid,
} from '@/lib/lights-out/lights-out';
import { getPerformanceRating } from '@/lib/lights-out/share';
import { type DiscordContext, setActivityStatus } from '@/lib/discord-sdk';
import {
    Sparkles, Trophy, Undo2,
    Check, Users, Swords, Calendar, Crown, Clock,
    ArrowLeft,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

type GameMode = 'menu' | 'daily' | 'race';

interface DailyCompletion {
    moves: number;
    optimalMoves: number | null;
    ratingLabel: string;
    ratingEmoji: string;
}

type LobbyPhase = 'empty' | 'waiting' | 'countdown' | 'racing' | 'results';

interface LobbyParticipant {
    discordId: string;
    username: string;
    avatar: string | null;
    ready: boolean;
    status: 'idle' | 'solving' | 'solved' | 'dnf';
    moves: number;
    finishedAt: number | null;
}

type RaceMode = 'time' | 'moves';

interface LobbyState {
    phase: LobbyPhase;
    hostId: string;
    seed: number | null;
    roundNumber: number;
    raceMode: RaceMode;
    countdownStartedAt: number | null;
    raceStartedAt: number | null;
    participants: LobbyParticipant[];
}

// ─── Daily persistence (localStorage + server DB) ───────────────────

const DAILY_KEY_PREFIX = 'lightsout-discord-daily-';
const INSTRUCTIONS_SEEN_KEY = 'lightsout-discord-instructions-seen';

/** Check localStorage first (fast), fall back to server DB (cross-platform). */
function getDailyCompletion(dateKey: string): DailyCompletion | null {
    try {
        const raw = localStorage.getItem(DAILY_KEY_PREFIX + dateKey);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

/** Fetch completion from server DB (for cross-platform sync). */
async function fetchDailyCompletion(discordId: string, dateKey: string): Promise<DailyCompletion | null> {
    try {
        const res = await fetch(`/api/discord/embed?discordId=${encodeURIComponent(discordId)}&dateKey=${encodeURIComponent(dateKey)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.completed) {
            const completion: DailyCompletion = {
                moves: data.moves,
                optimalMoves: null, // not stored in DB
                ratingLabel: data.ratingLabel ?? 'Solved!',
                ratingEmoji: data.ratingEmoji ?? '\u{1F4A1}',
            };
            // Cache locally so future checks are instant
            try { localStorage.setItem(DAILY_KEY_PREFIX + dateKey, JSON.stringify(completion)); } catch {}
            return completion;
        }
        return null;
    } catch { return null; }
}

function saveDailyCompletion(dateKey: string, data: DailyCompletion): void {
    try {
        localStorage.setItem(DAILY_KEY_PREFIX + dateKey, JSON.stringify(data));
    } catch {}
}

// ─── Embed notification helper ───────────────────────────────────────

function notifyEmbed(
    discord: DiscordContext,
    action: 'started' | 'completed',
    dateKey: string,
    result?: { moves: number; optimalMoves: number | null; ratingEmoji: string; ratingLabel: string }
) {
    // Always send — server handles null guildId/channelId gracefully
    fetch('/api/discord/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            channelId: discord.channelId ?? null,
            guildId: discord.guildId ?? null,
            action,
            dateKey,
            // Server verifies this token to derive the real Discord identity —
            // the client-supplied user fields below are display-only hints.
            accessToken: discord.accessToken,
            user: {
                id: discord.user.id,
                username: discord.user.global_name || discord.user.username,
                avatar: discord.user.avatar,
            },
            result,
        }),
    }).catch(() => {});
}

// ─── Props ───────────────────────────────────────────────────────────

interface LightsOutDiscordActivityProps {
    discord: DiscordContext;
}

// ─── Layout Mode Detection (PIP / Grid / Focused) ───────────────────

type LayoutMode = 'focused' | 'pip' | 'grid';

function useLayoutMode(sdk: DiscordContext['sdk']): LayoutMode {
    const [mode, setMode] = useState<LayoutMode>('focused');

    useEffect(() => {
        // Subscribe to Discord's layout mode updates
        const handleUpdate = (event: { layout_mode: number }) => {
            switch (event.layout_mode) {
                case 1: setMode('pip'); break;
                case 2: setMode('grid'); break;
                default: setMode('focused'); break;
            }
        };

        sdk.subscribe('ACTIVITY_LAYOUT_MODE_UPDATE', handleUpdate).catch(() => {
            // Subscription may fail on older clients — fall back to viewport check
        });

        return () => {
            sdk.unsubscribe('ACTIVITY_LAYOUT_MODE_UPDATE', handleUpdate).catch(() => {});
        };
    }, [sdk]);

    return mode;
}

// ─── Main Component ──────────────────────────────────────────────────

export function LightsOutDiscordActivity({ discord }: LightsOutDiscordActivityProps) {
    const [mode, setMode] = useState<GameMode>('menu');
    const layoutMode = useLayoutMode(discord.sdk);

    // PIP / Grid mode — show logo
    if (layoutMode === 'pip' || layoutMode === 'grid') {
        return (
            <div className="h-dvh w-dvw bg-[#1d1d20] flex items-center justify-center overflow-hidden">
                <img
                    src="/images/activities/lightsout.png"
                    alt="Lights Out"
                    className="max-w-[75%] max-h-[75%] object-contain"
                />
            </div>
        );
    }

    if (mode === 'menu') {
        return <ModeMenu discord={discord} onSelect={setMode} />;
    }
    if (mode === 'daily') {
        return <DailyGame discord={discord} onBack={() => setMode('menu')} />;
    }
    return <RaceGame discord={discord} onBack={() => setMode('menu')} />;
}

// ─── Mode Selection Menu ─────────────────────────────────────────────

function ModeMenu({ discord, onSelect }: { discord: DiscordContext; onSelect: (mode: GameMode) => void }) {
    const displayName = discord.user.global_name || discord.user.username;
    const todayKey = formatDateKey(new Date());
    const [alreadyCompleted, setAlreadyCompleted] = useState<DailyCompletion | null>(getDailyCompletion(todayKey));

    useEffect(() => {
        setActivityStatus(discord.sdk, 'Choosing a game mode');
    }, [discord.sdk]);

    // Check server for cross-platform completion
    useEffect(() => {
        if (alreadyCompleted) return; // already know from localStorage
        fetchDailyCompletion(discord.user.id, todayKey).then(result => {
            if (result) setAlreadyCompleted(result);
        });
    }, [discord.user.id, todayKey, alreadyCompleted]);

    return (
        <div className="min-h-dvh bg-[#313338] flex items-center justify-center p-4 pt-14 sm:pt-4">
            <div className="max-w-sm w-full space-y-6">
                {/* Header */}
                <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <Sparkles className="w-8 h-8 text-amber-400" />
                        <h1 className="text-3xl font-bold text-white">Lights Out</h1>
                    </div>
                    <p className="text-[#b5bac1] text-sm">
                        Welcome, {displayName}!
                    </p>
                    {discord.linkedUserId && (
                        <p className="text-emerald-400 text-xs mt-1 flex items-center justify-center gap-1">
                            <Check className="w-3 h-3" /> Account linked
                        </p>
                    )}
                </div>

                {/* Mode Buttons */}
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => onSelect('daily')}
                        className="w-full flex items-center gap-4 p-4 rounded-xl bg-[#2b2d31] border border-[#3f4147] hover:border-amber-500/50 transition-colors text-left group"
                    >
                        <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                            <Calendar className="w-6 h-6 text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <div className="text-white font-semibold group-hover:text-amber-400 transition-colors">Daily Puzzle</div>
                            <div className="text-[#b5bac1] text-sm">
                                {alreadyCompleted
                                    ? `Completed — ${alreadyCompleted.ratingEmoji} ${alreadyCompleted.moves} moves`
                                    : "Today's puzzle — same for everyone worldwide"}
                            </div>
                        </div>
                        {alreadyCompleted && (
                            <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => onSelect('race')}
                        className="w-full flex items-center gap-4 p-4 rounded-xl bg-[#2b2d31] border border-[#3f4147] hover:border-purple-500/50 transition-colors text-left group"
                    >
                        <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                            <Swords className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <div className="text-white font-semibold group-hover:text-purple-400 transition-colors">Race Mode</div>
                            <div className="text-[#b5bac1] text-sm">Race your friends — first to solve wins!</div>
                        </div>
                    </button>
                </div>

                {/* Participants */}
                {discord.participants.length > 1 && (
                    <div className="flex items-center justify-center gap-2 text-[#b5bac1] text-xs">
                        <Users className="w-3.5 h-3.5" />
                        <span>{discord.participants.length} players in activity</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Shared Grid Renderer ────────────────────────────────────────────

const cellBase = 'rounded-xl transition-all duration-150 touch-manipulation select-none';
const cellOn = 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30';
const cellOff = 'bg-[#1e1f22] border border-[#3f4147]';

function GameGrid({
    grid,
    shape,
    solved,
    onCellClick,
    containerWidth,
}: {
    grid: Grid;
    shape: ReturnType<typeof getDailyShape>;
    solved: boolean;
    onCellClick: (r: number, c: number) => void;
    containerWidth?: number;
}) {
    const isTriangle = shape.type === 'triangle';
    const isCustom = shape.type === 'custom';
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    if (isTriangle) {
        const maxCells = shape.size;
        const gap = 5; // conservative estimate for clamp(4px, 1.5vw, 6px)
        const cellSize = containerWidth
            ? Math.min(Math.floor((containerWidth - (maxCells - 1) * gap) / maxCells), 56)
            : 40;

        return (
            <div className="flex flex-col items-center gap-[clamp(4px,1.5vw,6px)]">
                {grid.map((row, r) => (
                    <div key={r} className="flex justify-center gap-[clamp(4px,1.5vw,6px)]">
                        {row.map((on, c) => (
                            <button
                                key={`${r}-${c}`}
                                type="button"
                                onClick={() => onCellClick(r, c)}
                                disabled={solved}
                                style={{ width: cellSize, height: cellSize }}
                                className={`
                                    ${cellBase}
                                    ${on ? cellOn : cellOff}
                                    ${!solved && 'hover:opacity-90 active:scale-95 cursor-pointer'}
                                    ${solved && 'cursor-default'}
                                `}
                            />
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div
            className="grid gap-[clamp(4px,1.5vw,8px)] w-full"
            style={{
                gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                aspectRatio: `${gridCols} / ${gridRows}`,
            }}
        >
            {grid.map((row, r) =>
                row.map((on, c) => {
                    const active = isActiveCell(shape, r, c);

                    if (isCustom && !active) {
                        return <div key={`${r}-${c}`} />;
                    }

                    return (
                        <button
                            key={`${r}-${c}`}
                            type="button"
                            onClick={() => onCellClick(r, c)}
                            disabled={solved || !active}
                            className={`
                                ${cellBase} min-h-0 min-w-0
                                ${on ? cellOn : cellOff}
                                ${!solved && active && 'hover:opacity-90 active:scale-95 cursor-pointer'}
                                ${(solved || !active) && 'cursor-default'}
                            `}
                        />
                    );
                })
            )}
        </div>
    );
}

// ─── Congrats Modal ──────────────────────────────────────────────────

function CongratsModal({
    moves,
    optimalMoves,
    ratingLabel,
    dateKey,
    shapeLabel,
    guildId,
    onReturn,
}: {
    moves: number;
    optimalMoves: number | null;
    ratingLabel: string;
    dateKey: string;
    shapeLabel: string;
    guildId: string | null;
    onReturn: () => void;
}) {
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-xs rounded-2xl bg-[#2b2d31] border border-[#3f4147] overflow-hidden my-auto"
            >
                <div className="px-6 pt-6 pb-4 text-center">
                    <h2 className="text-2xl font-bold text-white mb-1">{ratingLabel}</h2>
                    <p className="text-[#b5bac1] text-sm">{dateKey} · {shapeLabel}</p>
                </div>

                <div className="px-6 pb-4 space-y-2">
                    <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-[#1e1f22]">
                        <span className="text-[#b5bac1] text-sm">Your moves</span>
                        <span className="text-white font-mono font-bold text-lg">{moves}</span>
                    </div>
                    {optimalMoves != null && (
                        <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-[#1e1f22]">
                            <span className="text-[#b5bac1] text-sm">Optimal</span>
                            <span className="text-amber-400 font-mono font-bold text-lg">{optimalMoves}</span>
                        </div>
                    )}
                </div>

                <div className="px-6 pb-6 flex flex-col gap-2">
                    {guildId && (
                        <button
                            type="button"
                            onClick={() => setShowLeaderboard(true)}
                            className="w-full py-3 rounded-xl bg-[#1e1f22] border border-[#3f4147] hover:border-amber-500/50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <Trophy className="w-4 h-4 text-amber-400" />
                            Leaderboard
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onReturn}
                        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold text-sm transition-colors"
                    >
                        Return
                    </button>
                </div>
            </motion.div>

            <AnimatePresence>
                {showLeaderboard && guildId && (
                    <LeaderboardModal
                        guildId={guildId}
                        dateKey={dateKey}
                        onClose={() => setShowLeaderboard(false)}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Leaderboard Modal ──────────────────────────────────────────────

interface LeaderboardEntry {
    username: string;
    status: string;
    moves: number | null;
    ratingEmoji: string | null;
}

function LeaderboardModal({
    guildId,
    dateKey,
    onClose,
}: {
    guildId: string;
    dateKey: string;
    onClose: () => void;
}) {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/discord/embed?guildId=${encodeURIComponent(guildId)}&dateKey=${encodeURIComponent(dateKey)}&leaderboard=1`)
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data.participants)) setEntries(data.participants);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [guildId, dateKey]);

    const completed = entries.filter(e => e.status === 'completed').sort((a, b) => (a.moves ?? 999) - (b.moves ?? 999));
    const playing = entries.filter(e => e.status !== 'completed');
    const ranked = [...completed, ...playing];
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-xs rounded-2xl bg-[#2b2d31] border border-[#3f4147] overflow-hidden my-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 pt-5 pb-3 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-400" />
                        Leaderboard
                    </h2>
                    <button type="button" onClick={onClose} className="text-[#b5bac1] hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 pb-6">
                    {loading ? (
                        <div className="text-center text-[#b5bac1] text-sm py-6 animate-pulse">Loading...</div>
                    ) : ranked.length === 0 ? (
                        <div className="text-center text-[#949ba4] text-sm py-6">No one has played yet today.</div>
                    ) : (
                        <div className="space-y-1.5">
                            {ranked.map((entry, i) => {
                                const isCompleted = entry.status === 'completed';
                                const medal = isCompleted ? (medals[completed.indexOf(entry)] ?? '') : '';

                                return (
                                    <div
                                        key={entry.username + i}
                                        className="flex items-center justify-between p-2.5 rounded-lg bg-[#1e1f22]"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {medal ? (
                                                <span className="text-base w-5 text-center shrink-0">{medal}</span>
                                            ) : (
                                                <span className="text-xs text-[#949ba4] w-5 text-center shrink-0">
                                                    {isCompleted ? completed.indexOf(entry) + 1 : '\u2014'}
                                                </span>
                                            )}
                                            <span className="text-sm text-white truncate">{entry.username}</span>
                                        </div>
                                        <span className={`text-sm font-mono shrink-0 ${
                                            isCompleted ? 'text-emerald-400' : 'text-[#949ba4]'
                                        }`}>
                                            {isCompleted ? `${entry.moves} move${entry.moves !== 1 ? 's' : ''}` : 'playing...'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─── Instructions Modal ──────────────────────────────────────────────

function InstructionsModal({ onClose }: { onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-xs rounded-2xl bg-[#2b2d31] border border-[#3f4147] overflow-hidden my-auto"
            >
                <div className="px-6 pt-6 pb-4 text-center">
                    <div className="text-4xl mb-3">{'\u{1F4A1}'}</div>
                    <h2 className="text-xl font-bold text-white mb-1">How to Play</h2>
                    <p className="text-[#b5bac1] text-sm">Turn off every light to win</p>
                </div>

                <div className="px-6 pb-4 space-y-3">
                    <div className="flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-lg bg-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[#b5bac1] text-sm">
                            <span className="text-white font-semibold">Tap a light</span> to toggle it and all its neighbors on or off.
                        </p>
                    </div>
                    <div className="flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-lg bg-[#1e1f22] border border-[#3f4147] shrink-0 mt-0.5" />
                        <p className="text-[#b5bac1] text-sm">
                            <span className="text-white font-semibold">Goal:</span> turn all lights dark. Fewer moves = better rating.
                        </p>
                    </div>
                    <div className="py-2 px-3 rounded-lg bg-[#1e1f22] text-center">
                        <p className="text-[#949ba4] text-xs">
                            The daily puzzle has no undos or restarts — every move counts!
                        </p>
                    </div>
                </div>

                <div className="px-6 pb-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold text-sm transition-colors"
                    >
                        Let&apos;s Go
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─── Daily Game Mode ─────────────────────────────────────────────────

function DailyGame({ discord, onBack }: { discord: DiscordContext; onBack: () => void }) {
    const todayKey = formatDateKey(new Date());
    const seed = getDateSeed(new Date());
    const shape = getDailyShape(seed);
    const shapeLabel = getShapeLabel(shape);

    const [grid, setGrid] = useState<Grid | null>(null);
    const [moves, setMoves] = useState(0);
    const [solved, setSolved] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [optimalMoves, setOptimalMoves] = useState<number | null>(null);
    const [scoreSynced, setScoreSynced] = useState(false);
    const [ratingLabel, setRatingLabel] = useState('');
    const [ratingEmoji, setRatingEmoji] = useState('');
    const notifiedStart = useRef(false);
    const [gameAreaEl, setGameAreaEl] = useState<HTMLDivElement | null>(null);
    const [gridSize, setGridSize] = useState<number | undefined>(undefined);

    // Activity status
    useEffect(() => {
        const imgParams = new URLSearchParams({
            type: 'daily',
            userId: discord.user.id,
            avatar: discord.user.avatar ?? '',
            username: discord.user.global_name || discord.user.username,
            status: solved ? 'completed' : 'solving',
        });
        setActivityStatus(discord.sdk, solved ? 'Completed today\'s puzzle' : 'Solving today\'s puzzle', {
            details: shapeLabel,
            imageUrl: `${window.location.origin}/api/discord/activity-image?${imgParams}`,
        });
    }, [discord.sdk, solved, shapeLabel]);

    // Instructions modal — show once per user
    const [showInstructions, setShowInstructions] = useState(() => {
        try { return !localStorage.getItem(INSTRUCTIONS_SEEN_KEY); }
        catch { return true; }
    });
    const dismissInstructions = () => {
        setShowInstructions(false);
        try { localStorage.setItem(INSTRUCTIONS_SEEN_KEY, '1'); } catch {}
    };

    // Load progress from server (authoritative) — restores grid + moves across guilds/devices
    useEffect(() => {
        let cancelled = false;
        const initialGrid = generatePuzzle(createSeededRng(seed), shape);
        const opt = getOptimalMoves(initialGrid, shape);

        async function load() {
            try {
                const res = await fetch(
                    `/api/discord/daily-progress?discordId=${encodeURIComponent(discord.user.id)}&dateKey=${encodeURIComponent(todayKey)}`,
                );
                if (!res.ok) throw new Error('fetch failed');
                const data = await res.json();

                if (cancelled) return;

                setOptimalMoves(opt);

                if (data.completed) {
                    setGrid(createEmptyGrid(shape));
                    setMoves(data.moves);
                    setSolved(true);
                    setRatingLabel(data.ratingLabel ?? 'Solved!');
                    setRatingEmoji(data.ratingEmoji ?? '\u{1F4A1}');
                    setShowModal(true);
                    setScoreSynced(true);
                    // Notify embed even when revisiting a completed puzzle
                    notifyEmbed(discord, 'completed', todayKey, {
                        moves: data.moves,
                        optimalMoves: opt,
                        ratingEmoji: data.ratingEmoji ?? '\u{1F4A1}',
                        ratingLabel: data.ratingLabel ?? 'Solved!',
                    });
                } else if (data.gridJson) {
                    // Resume in-progress game
                    try {
                        setGrid(JSON.parse(data.gridJson));
                    } catch {
                        setGrid(initialGrid);
                    }
                    setMoves(data.moves);
                } else {
                    // Fresh puzzle
                    setGrid(initialGrid);
                }
            } catch {
                if (cancelled) return;
                // Network error — fall back to fresh puzzle (localStorage check for completion)
                setOptimalMoves(opt);
                const local = getDailyCompletion(todayKey);
                if (local) {
                    setGrid(createEmptyGrid(shape));
                    setMoves(local.moves);
                    setSolved(true);
                    setRatingLabel(local.ratingLabel);
                    setRatingEmoji(local.ratingEmoji);
                    setShowModal(true);
                    setScoreSynced(true);
                } else {
                    setGrid(initialGrid);
                }
            }
        }

        load();
        return () => { cancelled = true; };
    }, [discord.user.id, todayKey, seed, shape]);

    // Notify embed on start (once)
    useEffect(() => {
        if (!notifiedStart.current && !solved && grid) {
            notifiedStart.current = true;
            notifyEmbed(discord, 'started', todayKey);
        }
    }, [discord, todayKey, solved, grid]);

    // Save progress to server (fire-and-forget)
    const saveProgress = useCallback((newGrid: Grid, newMoves: number, completed: boolean, label?: string, emoji?: string) => {
        fetch('/api/discord/daily-progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discordId: discord.user.id,
                dateKey: todayKey,
                gridJson: JSON.stringify(newGrid),
                moves: newMoves,
                completed,
                ...(completed ? { ratingLabel: label, ratingEmoji: emoji } : {}),
            }),
        }).catch(() => {});
    }, [discord.user.id, todayKey]);

    // Sync score + notify embed on solve
    useEffect(() => {
        if (!solved || scoreSynced) return;

        notifyEmbed(discord, 'completed', todayKey, {
            moves,
            optimalMoves,
            ratingEmoji,
            ratingLabel,
        });

        if (discord.linkedUserId) {
            fetch('/api/discord/sync-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: discord.accessToken,
                    dateKey: todayKey,
                    moves,
                    hintUsed: false,
                    dnf: false,
                    resultJson: { moves, hintUsed: false, dnf: false, optimalMoves },
                }),
            }).then(() => setScoreSynced(true)).catch(() => {});
        }

        setScoreSynced(true);
    }, [solved, scoreSynced, discord, todayKey, moves, optimalMoves, ratingEmoji, ratingLabel]);

    // Grid dimensions for aspect-ratio-aware sizing
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    // Compute grid size to always fit within the available game area
    useEffect(() => {
        if (!gameAreaEl) return;

        const compute = () => {
            const areaPad = 16;
            const wrapPad = 16;
            const maxGridH = gameAreaEl.clientHeight - areaPad - wrapPad;
            const maxGridW = gameAreaEl.clientWidth - areaPad - wrapPad;
            const fromH = maxGridH * (gridCols / gridRows);
            const fitW = Math.min(maxGridW, fromH, 400);
            setGridSize(Math.max(fitW + wrapPad, 80));
        };

        const observer = new ResizeObserver(compute);
        observer.observe(gameAreaEl);
        compute();
        return () => observer.disconnect();
    }, [gameAreaEl, gridCols, gridRows]);

    const handleCellClick = (r: number, c: number) => {
        if (!grid || solved) return;
        if (!isActiveCell(shape, r, c)) return;

        const next = toggleCellInGrid(grid, r, c, shape);
        setGrid(next);
        const newMoves = moves + 1;
        setMoves(newMoves);

        if (isSolved(next, shape)) {
            setSolved(true);
            const rating = optimalMoves != null
                ? getPerformanceRating(newMoves, optimalMoves, false)
                : { label: 'Solved!', emoji: '\u{1F4A1}', tier: 4 };
            setRatingLabel(rating.label);
            setRatingEmoji(rating.emoji);
            setShowModal(true);

            // Persist to server + localStorage
            saveProgress(next, newMoves, true, rating.label, rating.emoji);
            saveDailyCompletion(todayKey, {
                moves: newMoves,
                optimalMoves,
                ratingLabel: rating.label,
                ratingEmoji: rating.emoji,
            });
        } else {
            // Save in-progress state to server
            saveProgress(next, newMoves, false);
        }
    };

    if (!grid) {
        return (
            <div className="min-h-dvh bg-[#313338] flex items-center justify-center">
                <div className="animate-pulse text-[#b5bac1]">Loading...</div>
            </div>
        );
    }

    return (
        <div className="h-dvh bg-[#313338] flex flex-col overflow-hidden pt-10 sm:pt-0">
            {/* Header */}
            <div className="shrink-0 px-4 pt-3 pb-1">
                <div className="max-w-md mx-auto flex items-center justify-between">
                    <button type="button" onClick={onBack} className="text-[#b5bac1] hover:text-white text-sm transition-colors p-1">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-amber-400" />
                            Daily Puzzle
                        </h2>
                        <p className="text-[#b5bac1] text-[11px]">{todayKey} · {shapeLabel}</p>
                    </div>
                    <div className="w-7" />
                </div>
            </div>

            {/* Move counter — outside grid area so sizing is accurate */}
            <div className="shrink-0 flex justify-center items-center gap-4 py-1 text-sm">
                <div className="flex items-center gap-1.5">
                    <span className="text-[#b5bac1]">Moves</span>
                    <span className="text-white font-mono font-semibold">{moves}</span>
                </div>
            </div>

            {/* Grid area — fills remaining space, grid sizes to fit */}
            <div ref={setGameAreaEl} className="flex-1 min-h-0 flex items-center justify-center p-2 overflow-hidden">
                <div
                    className="p-2 rounded-xl bg-[#2b2d31] border border-[#3f4147]"
                    style={{ width: gridSize, maxWidth: '100%' }}
                >
                    <GameGrid
                        grid={grid}
                        shape={shape}
                        solved={solved}
                        onCellClick={handleCellClick}
                        containerWidth={gridSize ? gridSize - 16 : undefined}
                    />
                </div>
            </div>

            {/* Instructions Modal */}
            <AnimatePresence>
                {showInstructions && !solved && (
                    <InstructionsModal onClose={dismissInstructions} />
                )}
            </AnimatePresence>

            {/* Congrats Modal */}
            <AnimatePresence>
                {showModal && (
                    <CongratsModal
                        moves={moves}
                        optimalMoves={optimalMoves}
                        ratingLabel={ratingLabel}
                        dateKey={todayKey}
                        shapeLabel={shapeLabel}
                        guildId={discord.guildId}
                        onReturn={onBack}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Race Mode (Lobby-based, WebSocket) ─────────────────────────────

function RaceGame({ discord, onBack }: { discord: DiscordContext; onBack: () => void }) {
    // Use channelId as lobby key so all players in the same channel share one lobby,
    // regardless of how they launched the activity. Falls back to instanceId for DMs.
    const instanceId = discord.channelId ?? discord.sdk.instanceId;
    const discordId = discord.user.id;
    const username = discord.user.global_name || discord.user.username;
    const [lobby, setLobby] = useState<LobbyState | null>(null);
    const socketRef = useRef<ReturnType<typeof import('socket.io-client').io> | null>(null);
    const [useHttp, setUseHttp] = useState(false);
    const notifiedRoundRef = useRef<number>(-1);

    // Try socket.io first; fall back to HTTP polling if it fails
    useEffect(() => {
        if (useHttp) return;
        let mounted = true;
        let fallbackTimer: ReturnType<typeof setTimeout>;

        import('socket.io-client').then(({ io: ioClient }) => {
            if (!mounted) return;

            // Connect to actual server — patchUrlMappings (called during SDK init)
            // rewrites this to go through Discord's proxy automatically
            const socketUrl = ensureTrailingSlash(import.meta.env.VITE_SOCKET_URL || window.location.origin);
            const socket = ioClient(socketUrl, {
                path: '/socket/',
                withCredentials: false,
                reconnection: true,
                reconnectionAttempts: 3,
                reconnectionDelay: 2000,
                timeout: 10000,
            });

            socketRef.current = socket;

            socket.on('connect', () => {
                clearTimeout(fallbackTimer);
                console.log('[lights-out] Socket connected');
                socket.emit('lights-out:join', {
                    instanceId, discordId, username, avatar: discord.user.avatar,
                });
            });

            socket.on('lights-out:state', (state: LobbyState) => {
                setLobby(state);
            });

            socket.on('connect_error', (err: Error) => {
                console.warn('[lights-out] Socket connect error:', err.message);
            });

            // If socket doesn't connect within 3s, fall back to HTTP polling
            fallbackTimer = setTimeout(() => {
                if (!socket.connected && mounted) {
                    console.warn('[lights-out] Socket failed, falling back to HTTP polling');
                    socket.disconnect();
                    socketRef.current = null;
                    setUseHttp(true);
                }
            }, 3000);
        });

        return () => {
            mounted = false;
            clearTimeout(fallbackTimer);
            if (socketRef.current) {
                socketRef.current.emit('lights-out:leave', { instanceId, discordId });
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [instanceId, discordId, username, discord.user.avatar, useHttp]);

    // HTTP polling fallback (same as before — works reliably through Discord proxy)
    useEffect(() => {
        if (!useHttp) return;

        // Join via HTTP
        fetch('/api/discord/race', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instanceId, action: 'join', discordId, username, avatar: discord.user.avatar }),
        }).catch(() => {});

        const poll = async () => {
            try {
                const res = await fetch(`/api/discord/race?instanceId=${encodeURIComponent(instanceId)}&discordId=${encodeURIComponent(discordId)}`);
                if (res.ok) setLobby(await res.json());
            } catch {}
        };

        poll();
        const interval = setInterval(poll, 1500);

        return () => {
            clearInterval(interval);
            fetch('/api/discord/race', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instanceId, action: 'leave', discordId }),
            }).catch(() => {});
        };
    }, [useHttp, instanceId, discordId, username, discord.user.avatar]);

    const emit = useCallback((event: string, data: Record<string, unknown>) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit(event, { instanceId, discordId, ...data });
        } else {
            // HTTP fallback — map socket events to POST actions
            const actionMap: Record<string, string> = {
                'lights-out:ready': 'ready',
                'lights-out:start': 'start',
                'lights-out:update': 'update',
                'lights-out:leave': 'leave',
                'lights-out:return': 'return_to_lobby',
            };
            const action = actionMap[event];
            if (action) {
                fetch('/api/discord/race', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instanceId, action, discordId, ...data }),
                }).catch(() => {});
            }
        }
    }, [instanceId, discordId]);

    const handleBack = useCallback(() => {
        emit('lights-out:leave', {});
        socketRef.current?.disconnect();
        onBack();
    }, [emit, onBack]);

    // Activity status
    const playerCount = lobby?.participants.length ?? 0;
    useEffect(() => {
        if (!lobby) return;
        const status =
            lobby.phase === 'waiting' ? 'In race lobby' :
            lobby.phase === 'countdown' || lobby.phase === 'racing' ? 'Racing!' :
            lobby.phase === 'results' ? 'Viewing race results' :
            'Race Mode';
        const playersData = lobby.participants.map(p => ({
            username: p.username,
            userId: p.discordId,
            avatar: p.avatar,
            status: p.status,
            moves: p.moves,
            finishedAt: p.finishedAt,
        }));
        const raceImgParams = new URLSearchParams({
            type: 'race',
            players: JSON.stringify(playersData),
            phase: lobby.phase,
            round: String(lobby.roundNumber),
            raceMode: lobby.raceMode,
            raceStartedAt: String(lobby.raceStartedAt ?? 0),
        });
        setActivityStatus(discord.sdk, status, {
            details: `${playerCount} player${playerCount !== 1 ? 's' : ''}`,
            partySize: [playerCount, 10],
            imageUrl: `${window.location.origin}/api/discord/activity-image?${raceImgParams}`,
        });

        // Notify embed API when a race round completes (once per round)
        if (lobby.phase === 'results' && lobby.roundNumber !== notifiedRoundRef.current) {
            notifiedRoundRef.current = lobby.roundNumber;
            fetch('/api/discord/embed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channelId: discord.channelId ?? null,
                    guildId: discord.guildId ?? null,
                    action: 'race_completed',
                    dateKey: new Date().toISOString().slice(0, 10),
                    user: {
                        id: discord.user.id,
                        username: discord.user.global_name || discord.user.username,
                        avatar: discord.user.avatar,
                    },
                    raceResults: {
                        roundNumber: lobby.roundNumber,
                        raceMode: lobby.raceMode,
                        raceStartedAt: lobby.raceStartedAt,
                        participants: playersData,
                    },
                }),
            }).catch(() => {});
        }
    }, [discord.sdk, lobby?.phase, playerCount]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!lobby || lobby.phase === 'empty') {
        return (
            <div className="h-dvh bg-[#313338] flex items-center justify-center">
                <div className="animate-pulse text-[#b5bac1]">Joining lobby...</div>
            </div>
        );
    }

    const isHost = lobby.hostId === discordId;

    switch (lobby.phase) {
        case 'waiting':
            return (
                <LobbyWaiting
                    lobby={lobby}
                    discordId={discordId}
                    isHost={isHost}
                    emit={emit}
                    onBack={handleBack}
                />
            );
        case 'countdown':
        case 'racing':
            return (
                <RaceGameplay
                    lobby={lobby}
                    discord={discord}
                    emit={emit}
                    onBack={handleBack}
                />
            );
        case 'results':
            return (
                <RaceResults
                    lobby={lobby}
                    discordId={discordId}
                    isHost={isHost}
                    emit={emit}
                    onBack={handleBack}
                />
            );
        default:
            return null;
    }
}

// ─── Lobby Waiting ──────────────────────────────────────────────────

type EmitFn = (event: string, data: Record<string, unknown>) => void;

function LobbyWaiting({
    lobby, discordId, isHost, emit, onBack,
}: {
    lobby: LobbyState; discordId: string; isHost: boolean; emit: EmitFn; onBack: () => void;
}) {
    const me = lobby.participants.find(p => p.discordId === discordId);
    const canStart = isHost && !!me?.ready;

    return (
        <div className="h-dvh bg-[#313338] flex flex-col overflow-hidden pt-10 sm:pt-0">
            <div className="shrink-0 px-4 pt-4 pb-2">
                <div className="max-w-sm mx-auto flex items-center justify-between">
                    <button type="button" onClick={onBack} className="text-[#b5bac1] hover:text-white text-sm transition-colors p-1">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Swords className="w-5 h-5 text-purple-400" />
                            Race Lobby
                        </h2>
                        <p className="text-[#b5bac1] text-xs">
                            {lobby.roundNumber > 0 ? `Round ${lobby.roundNumber + 1}` : 'Waiting for players'}
                        </p>
                    </div>
                    <div className="w-7" />
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4 min-h-0">
                {/* Participants */}
                <div className="w-full max-w-sm space-y-2 mb-6">
                    {lobby.participants.map(p => (
                        <div
                            key={p.discordId}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                                p.ready
                                    ? 'bg-emerald-500/10 border-emerald-500/30'
                                    : 'bg-[#2b2d31] border-[#3f4147]'
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                {p.discordId === lobby.hostId && (
                                    <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                                )}
                                <span className={p.discordId === discordId ? 'text-white font-semibold' : 'text-[#b5bac1]'}>
                                    {p.username}
                                </span>
                            </div>
                            <span className={`text-xs font-medium ${p.ready ? 'text-emerald-400' : 'text-[#949ba4]'}`}>
                                {p.ready ? 'Ready' : 'Not Ready'}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Race mode setting */}
                <div className="w-full max-w-sm mb-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#2b2d31] border border-[#3f4147]">
                        <span className="text-[#b5bac1] text-sm">Ranking</span>
                        {isHost ? (
                            <div className="flex rounded-lg overflow-hidden border border-[#3f4147]">
                                <button
                                    type="button"
                                    onClick={() => emit('lights-out:set-mode', { raceMode: 'time' })}
                                    className={`px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                                        lobby.raceMode === 'time'
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-[#1e1f22] text-[#949ba4] hover:text-white'
                                    }`}
                                >
                                    <Clock className="w-3 h-3" /> Timed
                                </button>
                                <button
                                    type="button"
                                    onClick={() => emit('lights-out:set-mode', { raceMode: 'moves' })}
                                    className={`px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                                        lobby.raceMode === 'moves'
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-[#1e1f22] text-[#949ba4] hover:text-white'
                                    }`}
                                >
                                    <Sparkles className="w-3 h-3" /> Fewest Moves
                                </button>
                            </div>
                        ) : (
                            <span className="text-white text-sm font-medium flex items-center gap-1">
                                {lobby.raceMode === 'time' ? (
                                    <><Clock className="w-3.5 h-3.5 text-purple-400" /> Timed Race</>
                                ) : (
                                    <><Sparkles className="w-3.5 h-3.5 text-purple-400" /> Fewest Moves</>
                                )}
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 w-full max-w-sm">
                    <button
                        type="button"
                        onClick={() => emit('lights-out:ready', { ready: !me?.ready })}
                        className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${
                            me?.ready
                                ? 'bg-[#2b2d31] border border-[#3f4147] text-[#b5bac1] hover:text-white'
                                : 'bg-emerald-500 hover:bg-emerald-400 text-white'
                        }`}
                    >
                        {me?.ready ? 'Unready' : 'Ready Up'}
                    </button>

                    {isHost && (
                        <button
                            type="button"
                            onClick={() => emit('lights-out:start', {})}
                            disabled={!canStart}
                            className="w-full py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {lobby.participants.length === 1 ? 'Start Solo Practice' : 'Start Race'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Race Gameplay ──────────────────────────────────────────────────

function RaceGameplay({
    lobby, discord, emit, onBack,
}: {
    lobby: LobbyState; discord: DiscordContext; emit: EmitFn; onBack: () => void;
}) {
    const discordId = discord.user.id;
    const seed = lobby.seed!;
    const shape = getDailyShape(seed);
    const me = lobby.participants.find(p => p.discordId === discordId);
    const isRacer = me?.status !== 'idle';

    const [grid, setGrid] = useState<Grid | null>(null);
    const [moveHistory, setMoveHistory] = useState<Grid[]>([]);
    const [moves, setMoves] = useState(0);
    const [solved, setSolved] = useState(false);
    const [gameAreaEl, setGameAreaEl] = useState<HTMLDivElement | null>(null);
    const [gridSize, setGridSize] = useState<number | undefined>(undefined);

    // Countdown state
    const isCountdown = lobby.phase === 'countdown';
    const [countdownNum, setCountdownNum] = useState<number | null>(null);

    useEffect(() => {
        if (!isCountdown || !lobby.countdownStartedAt) {
            setCountdownNum(null);
            return;
        }
        const tick = () => {
            const remaining = Math.ceil((lobby.countdownStartedAt! + 3000 - Date.now()) / 1000);
            setCountdownNum(remaining > 0 ? remaining : null);
        };
        tick();
        const interval = setInterval(tick, 100);
        return () => clearInterval(interval);
    }, [isCountdown, lobby.countdownStartedAt]);

    // Init puzzle from lobby seed
    useEffect(() => {
        const initialGrid = generatePuzzle(createSeededRng(seed), shape);
        setGrid(initialGrid);
    }, [seed, shape]);

    // Grid sizing
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    useEffect(() => {
        if (!gameAreaEl) return;

        const compute = () => {
            const areaPad = 16;
            const wrapPad = 16;
            const maxGridH = gameAreaEl.clientHeight - areaPad - wrapPad;
            const maxGridW = gameAreaEl.clientWidth - areaPad - wrapPad;
            const fromH = maxGridH * (gridCols / gridRows);
            const fitW = Math.min(maxGridW, fromH, 400);
            setGridSize(Math.max(fitW + wrapPad, 80));
        };

        const observer = new ResizeObserver(compute);
        observer.observe(gameAreaEl);
        compute();
        return () => observer.disconnect();
    }, [gameAreaEl, gridCols, gridRows]);

    const handleCellClick = (r: number, c: number) => {
        if (!grid || solved || !isRacer || isCountdown) return;
        if (!isActiveCell(shape, r, c)) return;

        setMoveHistory(prev => [...prev, grid.map(row => [...row])]);
        const next = toggleCellInGrid(grid, r, c, shape);
        setGrid(next);
        const newMoves = moves + 1;
        setMoves(newMoves);

        if (isSolved(next, shape)) {
            setSolved(true);
            emit('lights-out:update', {
                status: 'solved',
                moves: newMoves,
                finishedAt: Date.now(),
            });
        }
    };

    const handleUndo = () => {
        if (!grid || solved || moveHistory.length === 0 || isCountdown) return;
        setGrid(moveHistory[moveHistory.length - 1]);
        setMoveHistory(h => h.slice(0, -1));
        setMoves(m => m - 1);
    };

    if (!grid) {
        return (
            <div className="h-dvh bg-[#313338] flex items-center justify-center">
                <div className="animate-pulse text-[#b5bac1]">Loading...</div>
            </div>
        );
    }

    const racers = lobby.participants.filter(p => p.status !== 'idle');

    return (
        <div className="h-dvh bg-[#313338] flex flex-col overflow-hidden pt-10 sm:pt-0 relative">
            {/* Countdown overlay */}
            <AnimatePresence>
                {countdownNum != null && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-40 bg-[#313338]/90 flex items-center justify-center"
                    >
                        <motion.div
                            key={countdownNum}
                            initial={{ scale: 2, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="text-7xl font-bold text-purple-400"
                        >
                            {countdownNum}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="shrink-0 px-4 pt-3 pb-1">
                <div className="max-w-md mx-auto flex items-center justify-between">
                    <button type="button" onClick={onBack} className="text-[#b5bac1] hover:text-white text-sm transition-colors p-1">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                            <Swords className="w-4 h-4 text-purple-400" />
                            Race Mode
                        </h2>
                        <p className="text-[#b5bac1] text-[11px]">{getShapeLabel(shape)}</p>
                    </div>
                    <div className="w-7" />
                </div>
            </div>

            {/* Main content — vertical on mobile, horizontal on desktop */}
            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                {/* Racers panel — top on mobile, right sidebar on desktop */}
                {racers.length > 0 && (
                    <div className="shrink-0 order-first md:order-last md:w-52 md:border-l md:border-[#3f4147] overflow-y-auto">
                        <div className="px-3 py-2 md:p-3">
                            <div className="text-[#b5bac1] text-xs font-medium mb-1 md:mb-2 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" /> Racers
                            </div>
                            {/* Horizontal scroll on mobile, vertical list on desktop */}
                            <div className="flex md:flex-col gap-3 md:gap-1.5 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0">
                                {racers.map((p: LobbyParticipant) => (
                                    <div key={p.discordId} className="flex items-center justify-between gap-2 text-sm min-w-fit md:min-w-0 md:w-full">
                                        <span className={`truncate ${p.discordId === discord.user.id ? 'text-white font-semibold' : 'text-[#b5bac1]'}`}>
                                            {p.username}
                                        </span>
                                        <span className={`text-xs font-mono whitespace-nowrap ${
                                            p.status === 'solved' ? 'text-emerald-400' :
                                            p.status === 'dnf' ? 'text-red-400' : 'text-[#949ba4]'
                                        }`}>
                                            {p.status === 'solved' ? `\u2713 ${p.moves} moves` :
                                             p.status === 'dnf' ? 'DNF' : 'solving...'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Game column */}
                <div className="flex-1 min-h-0 flex flex-col">
                    {/* Move counter + timer */}
                    {isRacer && (
                        <div className="shrink-0 flex justify-center items-center gap-4 py-1 text-sm">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[#b5bac1]">Moves</span>
                                <span className="text-white font-mono font-semibold">{moves}</span>
                            </div>
                            {lobby.raceStartedAt && (
                                <Timer startTime={lobby.raceStartedAt} stopped={solved} />
                            )}
                        </div>
                    )}

                    {/* Grid area */}
                    <div ref={setGameAreaEl} className="flex-1 min-h-0 flex items-center justify-center p-2 overflow-hidden">
                        <div
                            className="p-2 rounded-xl bg-[#2b2d31] border border-[#3f4147]"
                            style={{ width: gridSize, maxWidth: '100%' }}
                        >
                            <GameGrid
                                grid={grid}
                                shape={shape}
                                solved={solved || !isRacer}
                                onCellClick={handleCellClick}
                                containerWidth={gridSize ? gridSize - 16 : undefined}
                            />
                        </div>
                    </div>

                    {/* Undo button */}
                    {isRacer && !solved && !isCountdown && (
                        <div className="shrink-0 flex justify-center gap-2 py-1.5">
                            <button
                                type="button"
                                onClick={handleUndo}
                                disabled={moveHistory.length === 0}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-[#2b2d31] border border-[#3f4147] text-white hover:border-[#5865f2]/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Undo2 className="w-4 h-4" /> Undo
                            </button>
                        </div>
                    )}

                    {!isRacer && (
                        <p className="shrink-0 text-[#949ba4] text-xs text-center py-2">Spectating — joined mid-race</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Race Results ───────────────────────────────────────────────────

function RaceResults({
    lobby, discordId, isHost, emit, onBack,
}: {
    lobby: LobbyState; discordId: string; isHost: boolean; emit: EmitFn; onBack: () => void;
}) {
    const seed = lobby.seed!;
    const shape = getDailyShape(seed);
    const shapeLabel = getShapeLabel(shape);
    const puzzleGrid = generatePuzzle(createSeededRng(seed), shape);
    const optimal = getOptimalMoves(puzzleGrid, shape);

    const isTimed = lobby.raceMode !== 'moves';
    const solved = lobby.participants
        .filter((p: LobbyParticipant) => p.status === 'solved')
        .sort((a: LobbyParticipant, b: LobbyParticipant) =>
            isTimed
                ? ((a.finishedAt ?? 0) - (b.finishedAt ?? 0)) || (a.moves - b.moves)
                : (a.moves - b.moves) || ((a.finishedAt ?? 0) - (b.finishedAt ?? 0))
        );
    const dnf = lobby.participants.filter((p: LobbyParticipant) => p.status === 'dnf');
    const idle = lobby.participants.filter((p: LobbyParticipant) => p.status === 'idle');
    const ranked = [...solved, ...dnf, ...idle];
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

    return (
        <div className="h-dvh bg-[#313338] flex flex-col overflow-hidden pt-10 sm:pt-0">
            <div className="shrink-0 px-4 pt-4 pb-2">
                <div className="max-w-sm mx-auto text-center">
                    <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-400" />
                        Race Results
                    </h2>
                    <p className="text-[#b5bac1] text-xs">Round {lobby.roundNumber} · {shapeLabel} · {isTimed ? 'Timed' : 'Fewest Moves'}{optimal != null ? ` · Optimal: ${optimal}` : ''}</p>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center px-4 pb-4 min-h-0 overflow-y-auto">
                {/* Leaderboard */}
                <div className="w-full max-w-sm space-y-2 mt-4">
                    {ranked.map((p: LobbyParticipant) => {
                        const isSolvedP = p.status === 'solved';
                        const medal = isSolvedP ? (medals[solved.indexOf(p)] ?? '') : '';
                        const isMe = p.discordId === discordId;

                        return (
                            <div
                                key={p.discordId}
                                className={`flex items-center justify-between p-3 rounded-lg border ${
                                    isMe ? 'bg-purple-500/10 border-purple-500/30' : 'bg-[#2b2d31] border-[#3f4147]'
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    {medal && <span className="text-lg">{medal}</span>}
                                    <span className={isMe ? 'text-white font-semibold' : 'text-[#b5bac1]'}>
                                        {p.username}
                                    </span>
                                </div>
                                <span className={`text-sm font-mono ${
                                    isSolvedP ? 'text-emerald-400' :
                                    p.status === 'dnf' ? 'text-red-400' : 'text-[#949ba4]'
                                }`}>
                                    {isSolvedP ? (
                                        isTimed && p.finishedAt && lobby.raceStartedAt
                                            ? `${((p.finishedAt - lobby.raceStartedAt) / 1000).toFixed(1)}s · ${p.moves} move${p.moves !== 1 ? 's' : ''}`
                                            : `${p.moves} move${p.moves !== 1 ? 's' : ''}${p.finishedAt && lobby.raceStartedAt ? ` · ${((p.finishedAt - lobby.raceStartedAt) / 1000).toFixed(1)}s` : ''}`
                                    ) : p.status === 'dnf' ? 'DNF' : 'Spectator'}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 w-full max-w-sm mt-6">
                    {isHost ? (
                        <button
                            type="button"
                            onClick={() => emit('lights-out:return', {})}
                            className="w-full py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-sm transition-colors"
                        >
                            Return to Lobby
                        </button>
                    ) : (
                        <p className="text-center text-[#949ba4] text-sm">Waiting for host to start next round...</p>
                    )}
                    <button
                        type="button"
                        onClick={onBack}
                        className="w-full py-3 rounded-xl bg-[#2b2d31] border border-[#3f4147] text-white font-bold text-sm transition-colors hover:border-[#5865f2]/50"
                    >
                        Exit
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Shared UI ───────────────────────────────────────────────────────

function Timer({ startTime, stopped }: { startTime: number; stopped: boolean }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (stopped) return;
        const interval = setInterval(() => {
            setElapsed(Math.round((Date.now() - startTime) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime, stopped]);

    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;

    return (
        <div className="flex items-center gap-1.5 text-[#b5bac1] text-sm">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono">{mins}:{String(secs).padStart(2, '0')}</span>
        </div>
    );
}
