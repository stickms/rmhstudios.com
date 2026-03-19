'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getDateSeed,
    formatDateKey,
    createSeededRng,
} from '@/lib/lights-out/seed';
import { getDailyShape, getShapeLabel, isActiveCell } from '@/lib/lights-out/shapes';
import {
    generatePuzzle,
    toggleCellInGrid,
    isSolved,
    createEmptyGrid,
    getOptimalMoves,
    type Grid,
} from '@/lib/lights-out/lights-out';
import { getPerformanceRating } from '@/lib/lights-out/share';
import type { DiscordContext } from '@/lib/discord-sdk';
import {
    Sparkles, Trophy, Undo2,
    Share2, Check, Play, Users, Swords, Calendar, Crown, Clock,
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

interface RaceParticipant {
    discordId: string;
    username: string;
    avatar: string | null;
    status: 'solving' | 'solved' | 'dnf';
    moves: number;
    finishedAt: number | null;
}

interface RaceState {
    seed: number;
    participants: RaceParticipant[];
    startedAt: number;
}

// ─── Daily persistence (localStorage) ────────────────────────────────

const DAILY_KEY_PREFIX = 'lightsout-discord-daily-';

function getDailyCompletion(dateKey: string): DailyCompletion | null {
    try {
        const raw = localStorage.getItem(DAILY_KEY_PREFIX + dateKey);
        return raw ? JSON.parse(raw) : null;
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

// ─── PIP Detection ───────────────────────────────────────────────────

function usePipMode(): boolean {
    const [isPip, setIsPip] = useState(false);

    useEffect(() => {
        // Real PIP is very small (160-320px). Don't trigger on phones (typically 360+).
        const check = () => setIsPip(window.innerWidth < 280 && window.innerHeight < 280);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    return isPip;
}

// ─── Main Component ──────────────────────────────────────────────────

export function LightsOutDiscordActivity({ discord }: LightsOutDiscordActivityProps) {
    const [mode, setMode] = useState<GameMode>('menu');
    const isPip = usePipMode();

    // PIP mode — show logo
    if (isPip) {
        return (
            <div className="min-h-dvh bg-[#313338] flex items-center justify-center p-4">
                <img
                    src="/images/activities/lightsout.png"
                    alt="Lights Out"
                    className="w-32 h-32 object-contain"
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
    const alreadyCompleted = getDailyCompletion(todayKey);

    return (
        <div className="min-h-dvh bg-[#313338] flex items-center justify-center p-4">
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
                                    : "Today's challenge — no undos, no restarts"}
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
}: {
    grid: Grid;
    shape: ReturnType<typeof getDailyShape>;
    solved: boolean;
    onCellClick: (r: number, c: number) => void;
}) {
    const isTriangle = shape.type === 'triangle';
    const isCustom = shape.type === 'custom';
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    if (isTriangle) {
        return (
            <div className="flex flex-col items-center gap-[clamp(4px,1.5vw,6px)] py-2">
                {grid.map((row, r) => (
                    <div key={r} className="flex justify-center gap-[clamp(4px,1.5vw,6px)]">
                        {row.map((on, c) => (
                            <button
                                key={`${r}-${c}`}
                                type="button"
                                onClick={() => onCellClick(r, c)}
                                disabled={solved}
                                className={`
                                    aspect-square w-[clamp(36px,12vw,48px)] ${cellBase}
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
    ratingEmoji,
    ratingLabel,
    dateKey,
    shapeLabel,
    scoreSynced,
    linkedUserId,
    onReturn,
}: {
    moves: number;
    optimalMoves: number | null;
    ratingEmoji: string;
    ratingLabel: string;
    dateKey: string;
    shapeLabel: string;
    scoreSynced: boolean;
    linkedUserId: string | null;
    onReturn: () => void;
}) {
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
                {/* Celebration header */}
                <div className="bg-linear-to-b from-amber-500/20 to-transparent px-6 pt-8 pb-4 text-center">
                    <div className="text-5xl mb-3">{ratingEmoji}</div>
                    <h2 className="text-2xl font-bold text-white mb-1">{ratingLabel}</h2>
                    <p className="text-[#b5bac1] text-sm">{dateKey} · {shapeLabel}</p>
                </div>

                {/* Stats */}
                <div className="px-6 py-4 space-y-3">
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

                    {/* Rating tiers */}
                    {optimalMoves != null && (
                        <div className="pt-1">
                            {[
                                { emoji: '\u{1F31F}', label: 'Perfect!', desc: 'Optimal' },
                                { emoji: '\u2728', label: 'Excellent!', desc: '+1' },
                                { emoji: '\u{1F525}', label: 'Great!', desc: '+2\u20133' },
                                { emoji: '\u{1F44D}', label: 'Good!', desc: '+4\u20136' },
                                { emoji: '\u{1F4A1}', label: 'Solved!', desc: '+7+' },
                            ].map(tier => (
                                <div
                                    key={tier.label}
                                    className={`flex items-center gap-2 py-1 px-2 rounded text-xs ${
                                        ratingLabel === tier.label
                                            ? 'bg-amber-500/15 text-amber-400 font-semibold'
                                            : 'text-[#949ba4]'
                                    }`}
                                >
                                    <span className="w-5 text-center">{tier.emoji}</span>
                                    <span className="w-16">{tier.label}</span>
                                    <span className="text-[#949ba4] font-normal">{tier.desc}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {linkedUserId && scoreSynced && (
                        <p className="text-emerald-400 text-xs flex items-center justify-center gap-1 pt-1">
                            <Check className="w-3 h-3" /> Score synced to your account
                        </p>
                    )}
                </div>

                {/* Return button */}
                <div className="px-6 pb-6">
                    <button
                        type="button"
                        onClick={onReturn}
                        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold text-sm transition-colors"
                    >
                        Return
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

    // Check if already completed
    const existingCompletion = getDailyCompletion(todayKey);
    const [showModal, setShowModal] = useState(!!existingCompletion);

    const [grid, setGrid] = useState<Grid | null>(null);
    const [moves, setMoves] = useState(existingCompletion?.moves ?? 0);
    const [solved, setSolved] = useState(!!existingCompletion);
    const [optimalMoves, setOptimalMoves] = useState<number | null>(existingCompletion?.optimalMoves ?? null);
    const [scoreSynced, setScoreSynced] = useState(false);
    const [ratingLabel, setRatingLabel] = useState(existingCompletion?.ratingLabel ?? '');
    const [ratingEmoji, setRatingEmoji] = useState(existingCompletion?.ratingEmoji ?? '');
    const notifiedStart = useRef(false);

    // Init puzzle
    useEffect(() => {
        const initialGrid = generatePuzzle(createSeededRng(seed), shape);
        if (existingCompletion) {
            // Show empty grid behind the modal
            setGrid(createEmptyGrid(shape));
        } else {
            setGrid(initialGrid);
        }
        const opt = getOptimalMoves(initialGrid, shape);
        setOptimalMoves(opt);
    }, [seed, shape, existingCompletion]);

    // Notify embed on start (once)
    useEffect(() => {
        if (!notifiedStart.current && !existingCompletion) {
            notifiedStart.current = true;
            notifyEmbed(discord, 'started', todayKey);
        }
    }, [discord, todayKey, existingCompletion]);

    // Sync score + notify embed on solve
    useEffect(() => {
        if (!solved || scoreSynced || existingCompletion) return;

        // Notify embed
        notifyEmbed(discord, 'completed', todayKey, {
            moves,
            optimalMoves,
            ratingEmoji,
            ratingLabel,
        });

        // Sync to rmhstudios account if linked
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
    }, [solved, scoreSynced, existingCompletion, discord, todayKey, moves, optimalMoves, ratingEmoji, ratingLabel]);

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

            // Persist
            saveDailyCompletion(todayKey, {
                moves: newMoves,
                optimalMoves,
                ratingLabel: rating.label,
                ratingEmoji: rating.emoji,
            });
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
        <div className="min-h-dvh bg-[#313338] p-4">
            <div className="max-w-sm mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <button type="button" onClick={onBack} className="text-[#b5bac1] hover:text-white text-sm transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-amber-400" />
                            Daily Puzzle
                        </h2>
                        <p className="text-[#b5bac1] text-xs">{todayKey} · {shapeLabel}</p>
                    </div>
                    <div className="w-4" />
                </div>

                {/* Stats — just move counter, no hints */}
                <div className="flex justify-center items-center gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#b5bac1]">Moves</span>
                        <span className="text-white font-mono font-semibold">{moves}</span>
                    </div>
                </div>

                {/* Grid */}
                <div className="w-full max-w-[min(280px,80vw)] mx-auto p-3 rounded-xl bg-[#2b2d31] border border-[#3f4147]">
                    <GameGrid
                        grid={grid}
                        shape={shape}
                        solved={solved}
                        onCellClick={handleCellClick}
                    />
                </div>

                {/* No action buttons — daily is a pure challenge */}
            </div>

            {/* Congrats Modal */}
            <AnimatePresence>
                {showModal && (
                    <CongratsModal
                        moves={existingCompletion?.moves ?? moves}
                        optimalMoves={existingCompletion?.optimalMoves ?? optimalMoves}
                        ratingEmoji={existingCompletion?.ratingEmoji ?? ratingEmoji}
                        ratingLabel={existingCompletion?.ratingLabel ?? ratingLabel}
                        dateKey={todayKey}
                        shapeLabel={shapeLabel}
                        scoreSynced={scoreSynced}
                        linkedUserId={discord.linkedUserId}
                        onReturn={onBack}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Race Mode ───────────────────────────────────────────────────────

function RaceGame({ discord, onBack }: { discord: DiscordContext; onBack: () => void }) {
    const raceSeed = useMemo(() => {
        const base = discord.channelId || discord.user.id;
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
            hash = ((hash << 5) - hash + base.charCodeAt(i)) | 0;
        }
        return Math.abs(hash);
    }, [discord.channelId, discord.user.id]);

    const shape = getDailyShape(raceSeed);
    const [grid, setGrid] = useState<Grid | null>(null);
    const [moveHistory, setMoveHistory] = useState<Grid[]>([]);
    const [moves, setMoves] = useState(0);
    const [solved, setSolved] = useState(false);
    const [optimalMoves, setOptimalMoves] = useState<number | null>(null);
    const [startTime] = useState(() => Date.now());
    const [solveTime, setSolveTime] = useState<number | null>(null);
    const [raceState, setRaceState] = useState<RaceState | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval>>();
    const instanceId = discord.sdk.instanceId;

    useEffect(() => {
        const initialGrid = generatePuzzle(createSeededRng(raceSeed), shape);
        setGrid(initialGrid);
        setOptimalMoves(getOptimalMoves(initialGrid, shape));
    }, [raceSeed, shape]);

    // Register + poll
    useEffect(() => {
        const update = (status: 'solving' | 'solved' | 'dnf', moveCount: number) => {
            fetch('/api/discord/race', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId,
                    seed: raceSeed,
                    participant: {
                        discordId: discord.user.id,
                        username: discord.user.global_name || discord.user.username,
                        avatar: discord.user.avatar,
                        status,
                        moves: moveCount,
                        finishedAt: status !== 'solving' ? Date.now() : null,
                    },
                }),
            }).catch(() => {});
        };

        update('solving', 0);

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/discord/race?instanceId=${instanceId}`);
                if (res.ok) setRaceState(await res.json());
            } catch {}
        }, 2000);

        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [instanceId, raceSeed, discord.user]);

    const syncStatus = useCallback((status: 'solving' | 'solved' | 'dnf', moveCount: number) => {
        fetch('/api/discord/race', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instanceId,
                seed: raceSeed,
                participant: {
                    discordId: discord.user.id,
                    username: discord.user.global_name || discord.user.username,
                    avatar: discord.user.avatar,
                    status,
                    moves: moveCount,
                    finishedAt: status !== 'solving' ? Date.now() : null,
                },
            }),
        }).catch(() => {});
    }, [instanceId, raceSeed, discord.user]);

    const handleCellClick = (r: number, c: number) => {
        if (!grid || solved) return;
        if (!isActiveCell(shape, r, c)) return;

        setMoveHistory(prev => [...prev, grid.map(row => [...row])]);
        const next = toggleCellInGrid(grid, r, c, shape);
        setGrid(next);
        const newMoves = moves + 1;
        setMoves(newMoves);

        if (isSolved(next, shape)) {
            setSolved(true);
            setSolveTime(Math.round((Date.now() - startTime) / 1000));
            syncStatus('solved', newMoves);
        }
    };

    const handleUndo = () => {
        if (!grid || solved || moveHistory.length === 0) return;
        setGrid(moveHistory[moveHistory.length - 1]);
        setMoveHistory(h => h.slice(0, -1));
        setMoves(m => m - 1);
    };

    if (!grid) {
        return (
            <div className="min-h-dvh bg-[#313338] flex items-center justify-center">
                <div className="animate-pulse text-[#b5bac1]">Loading...</div>
            </div>
        );
    }

    const winner = raceState?.participants
        .filter(p => p.status === 'solved')
        .sort((a, b) => (a.moves - b.moves) || ((a.finishedAt ?? 0) - (b.finishedAt ?? 0)))[0];

    return (
        <div className="min-h-dvh bg-[#313338] p-4">
            <div className="max-w-sm mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <button type="button" onClick={onBack} className="text-[#b5bac1] hover:text-white text-sm transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Swords className="w-5 h-5 text-purple-400" />
                            Race Mode
                        </h2>
                        <p className="text-[#b5bac1] text-xs">{getShapeLabel(shape)}</p>
                    </div>
                    <div className="w-4" />
                </div>

                {/* Participants bar */}
                {raceState && raceState.participants.length > 0 && (
                    <div className="mb-4 p-3 rounded-lg bg-[#2b2d31] border border-[#3f4147]">
                        <div className="text-[#b5bac1] text-xs font-medium mb-2 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> Racers
                        </div>
                        <div className="space-y-1.5">
                            {raceState.participants.map(p => (
                                <div key={p.discordId} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        {winner?.discordId === p.discordId && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                                        <span className={p.discordId === discord.user.id ? 'text-white font-semibold' : 'text-[#b5bac1]'}>
                                            {p.username}
                                        </span>
                                    </div>
                                    <span className={`text-xs font-mono ${
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
                )}

                {/* Stats */}
                <div className="flex justify-center items-center gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#b5bac1]">Moves</span>
                        <span className="text-white font-mono font-semibold">{moves}</span>
                    </div>
                    <Timer startTime={startTime} stopped={solved} />
                </div>

                {/* Grid */}
                <div className="w-full max-w-[min(280px,80vw)] mx-auto p-3 rounded-xl bg-[#2b2d31] border border-[#3f4147]">
                    <GameGrid grid={grid} shape={shape} solved={solved} onCellClick={handleCellClick} />
                </div>

                {/* Race keeps undo */}
                {!solved && (
                    <div className="flex justify-center gap-2 mt-4">
                        <button
                            type="button"
                            onClick={handleUndo}
                            disabled={moveHistory.length === 0}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#2b2d31] border border-[#3f4147] text-white hover:border-[#5865f2]/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Undo2 className="w-4 h-4" /> Undo
                        </button>
                    </div>
                )}

                {/* Result */}
                <AnimatePresence>
                    {solved && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-6 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-center"
                        >
                            {winner?.discordId === discord.user.id ? (
                                <>
                                    <Crown className="w-8 h-8 text-amber-400 mx-auto mb-1" />
                                    <div className="text-xl font-bold text-amber-400">You won!</div>
                                </>
                            ) : winner ? (
                                <div className="text-xl font-bold text-purple-400">{winner.username} wins!</div>
                            ) : (
                                <div className="text-xl font-bold text-purple-400">Solved!</div>
                            )}

                            <p className="text-[#b5bac1] text-sm mt-1">
                                {moves} move{moves !== 1 ? 's' : ''} · {solveTime}s
                            </p>
                            {optimalMoves != null && (
                                <p className="text-[#949ba4] text-xs mt-0.5">
                                    Optimal: {optimalMoves} move{optimalMoves !== 1 ? 's' : ''}
                                </p>
                            )}

                            <div className="flex justify-center gap-2 mt-3">
                                <button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm font-medium"
                                >
                                    <Play className="w-3.5 h-3.5" /> New Race
                                </button>
                                <button
                                    type="button"
                                    onClick={onBack}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2b2d31] border border-[#3f4147] text-white hover:border-[#5865f2]/50 transition-colors text-sm font-medium"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" /> Menu
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
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
