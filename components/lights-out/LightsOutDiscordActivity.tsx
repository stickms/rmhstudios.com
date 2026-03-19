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

interface LobbyState {
    phase: LobbyPhase;
    hostId: string;
    seed: number | null;
    roundNumber: number;
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

    // Check if already completed (localStorage first, then server for cross-platform)
    const [existingCompletion, setExistingCompletion] = useState<DailyCompletion | null>(getDailyCompletion(todayKey));
    const [showModal, setShowModal] = useState(!!existingCompletion);

    useEffect(() => {
        if (existingCompletion) return;
        fetchDailyCompletion(discord.user.id, todayKey).then(result => {
            if (result) {
                setExistingCompletion(result);
                setShowModal(true);
                setSolved(true);
            }
        });
    }, [discord.user.id, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Instructions modal — show once per user
    const [showInstructions, setShowInstructions] = useState(() => {
        try { return !localStorage.getItem(INSTRUCTIONS_SEEN_KEY); }
        catch { return true; }
    });
    const dismissInstructions = () => {
        setShowInstructions(false);
        try { localStorage.setItem(INSTRUCTIONS_SEEN_KEY, '1'); } catch {}
    };

    const [grid, setGrid] = useState<Grid | null>(null);
    const [moves, setMoves] = useState(existingCompletion?.moves ?? 0);
    const [solved, setSolved] = useState(!!existingCompletion);
    const [optimalMoves, setOptimalMoves] = useState<number | null>(existingCompletion?.optimalMoves ?? null);
    const [scoreSynced, setScoreSynced] = useState(false);
    const [ratingLabel, setRatingLabel] = useState(existingCompletion?.ratingLabel ?? '');
    const [ratingEmoji, setRatingEmoji] = useState(existingCompletion?.ratingEmoji ?? '');
    const notifiedStart = useRef(false);
    const gameAreaRef = useRef<HTMLDivElement>(null);
    const [gridSize, setGridSize] = useState<number | undefined>(undefined);

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

    // Grid dimensions for aspect-ratio-aware sizing
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    // Compute grid size once on mount + on window resize only (not content changes)
    useEffect(() => {
        const compute = () => {
            const el = gameAreaRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const availH = rect.height - 48;
            const availW = rect.width;
            // For non-square grids, constrain width so height also fits
            const maxWidthFromHeight = gridRows > gridCols
                ? availH * (gridCols / gridRows)
                : availH;
            const size = Math.min(availW, maxWidthFromHeight, 400);
            setGridSize(Math.max(size, 160));
        };

        requestAnimationFrame(compute);
        window.addEventListener('resize', compute);
        return () => window.removeEventListener('resize', compute);
    }, [gridCols, gridRows]);

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
        <div className="h-dvh bg-[#313338] flex flex-col overflow-hidden pt-10 sm:pt-0">
            {/* Header — fixed at top */}
            <div className="shrink-0 px-4 pt-4 pb-2">
                <div className="max-w-sm mx-auto flex items-center justify-between">
                    <button type="button" onClick={onBack} className="text-[#b5bac1] hover:text-white text-sm transition-colors p-1">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-amber-400" />
                            Daily Puzzle
                        </h2>
                        <p className="text-[#b5bac1] text-xs">{todayKey} · {shapeLabel}</p>
                    </div>
                    <div className="w-7" />
                </div>
            </div>

            {/* Centered game area — grid sizes to fit available space */}
            <div ref={gameAreaRef} className="flex-1 flex flex-col items-center justify-center px-4 pb-4 min-h-0">
                {/* Move counter */}
                <div className="flex justify-center items-center gap-4 mb-3 text-sm shrink-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#b5bac1]">Moves</span>
                        <span className="text-white font-mono font-semibold">{moves}</span>
                    </div>
                </div>

                {/* Grid — constrained to fit within the available area */}
                <div
                    className="p-3 rounded-xl bg-[#2b2d31] border border-[#3f4147] w-full"
                    style={{ maxWidth: gridSize ?? 400 }}
                >
                    <GameGrid
                        grid={grid}
                        shape={shape}
                        solved={solved}
                        onCellClick={handleCellClick}
                    />
                </div>
            </div>

            {/* Instructions Modal */}
            <AnimatePresence>
                {showInstructions && !existingCompletion && (
                    <InstructionsModal onClose={dismissInstructions} />
                )}
            </AnimatePresence>

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

// ─── Race Mode (Lobby-based, WebSocket) ─────────────────────────────

function RaceGame({ discord, onBack }: { discord: DiscordContext; onBack: () => void }) {
    const instanceId = discord.sdk.instanceId;
    const discordId = discord.user.id;
    const username = discord.user.global_name || discord.user.username;
    const [lobby, setLobby] = useState<LobbyState | null>(null);
    const socketRef = useRef<ReturnType<typeof import('socket.io-client').io> | null>(null);

    // Connect socket, join lobby, listen for state updates
    useEffect(() => {
        let mounted = true;

        import('socket.io-client').then(({ io: ioClient }) => {
            if (!mounted) return;

            // Connect through Discord's proxy (same origin, path /socket/)
            const socket = ioClient(window.location.origin, {
                path: '/socket/',
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 10000,
                timeout: 10000,
            });

            socketRef.current = socket;

            socket.on('connect', () => {
                socket.emit('lights-out:join', {
                    instanceId,
                    discordId,
                    username,
                    avatar: discord.user.avatar,
                });
            });

            socket.on('lights-out:state', (state: LobbyState) => {
                setLobby(state);
            });

            socket.on('lights-out:error', (err: { message: string }) => {
                console.error('Lights Out socket error:', err.message);
            });
        });

        return () => {
            mounted = false;
            if (socketRef.current) {
                socketRef.current.emit('lights-out:leave', { instanceId, discordId });
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [instanceId, discordId, username, discord.user.avatar]);

    const emit = useCallback((event: string, data: Record<string, unknown>) => {
        socketRef.current?.emit(event, { instanceId, discordId, ...data });
    }, [instanceId, discordId]);

    const handleBack = useCallback(() => {
        emit('lights-out:leave', {});
        socketRef.current?.disconnect();
        onBack();
    }, [emit, onBack]);

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
    const [optimalMoves, setOptimalMoves] = useState<number | null>(null);
    const gameAreaRef = useRef<HTMLDivElement>(null);
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
        setOptimalMoves(getOptimalMoves(initialGrid, shape));
    }, [seed, shape]);

    // Grid sizing
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    useEffect(() => {
        const compute = () => {
            const el = gameAreaRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const reservedV = 104;
            const availH = rect.height - reservedV;
            const availW = rect.width - 32;
            const maxWidthFromHeight = gridRows > gridCols
                ? availH * (gridCols / gridRows)
                : availH;
            const size = Math.min(availW, maxWidthFromHeight, 400);
            setGridSize(Math.max(size, 160));
        };

        requestAnimationFrame(compute);
        window.addEventListener('resize', compute);
        return () => window.removeEventListener('resize', compute);
    }, [gridCols, gridRows]);

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
            <div className="shrink-0 px-4 pt-4 pb-2">
                <div className="max-w-sm mx-auto flex items-center justify-between">
                    <button type="button" onClick={onBack} className="text-[#b5bac1] hover:text-white text-sm transition-colors p-1">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Swords className="w-5 h-5 text-purple-400" />
                            Race Mode
                        </h2>
                        <p className="text-[#b5bac1] text-xs">{getShapeLabel(shape)}</p>
                    </div>
                    <div className="w-7" />
                </div>
            </div>

            {/* Racers bar */}
            {racers.length > 0 && (
                <div className="shrink-0 px-4 pb-2">
                    <div className="max-w-sm mx-auto p-3 rounded-lg bg-[#2b2d31] border border-[#3f4147]">
                        <div className="text-[#b5bac1] text-xs font-medium mb-2 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> Racers
                        </div>
                        <div className="space-y-1.5">
                            {racers.map((p: LobbyParticipant) => (
                                <div key={p.discordId} className="flex items-center justify-between text-sm">
                                    <span className={p.discordId === discord.user.id ? 'text-white font-semibold' : 'text-[#b5bac1]'}>
                                        {p.username}
                                    </span>
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
                </div>
            )}

            {/* Game area */}
            <div ref={gameAreaRef} className="flex-1 flex flex-col items-center justify-center px-4 pb-4 min-h-0">
                {isRacer && (
                    <div className="flex justify-center items-center gap-4 mb-3 text-sm shrink-0">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[#b5bac1]">Moves</span>
                            <span className="text-white font-mono font-semibold">{moves}</span>
                        </div>
                        {lobby.raceStartedAt && (
                            <Timer startTime={lobby.raceStartedAt} stopped={solved} />
                        )}
                    </div>
                )}

                <div
                    className="p-3 rounded-xl bg-[#2b2d31] border border-[#3f4147] w-full"
                    style={{ maxWidth: gridSize ?? 400 }}
                >
                    <GameGrid grid={grid} shape={shape} solved={solved || !isRacer} onCellClick={handleCellClick} />
                </div>

                {isRacer && !solved && !isCountdown && (
                    <div className="flex justify-center gap-2 mt-4 shrink-0">
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

                {!isRacer && (
                    <p className="text-[#949ba4] text-xs mt-4">Spectating — joined mid-race</p>
                )}
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

    const solved = lobby.participants
        .filter((p: LobbyParticipant) => p.status === 'solved')
        .sort((a: LobbyParticipant, b: LobbyParticipant) => (a.moves - b.moves) || ((a.finishedAt ?? 0) - (b.finishedAt ?? 0)));
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
                    <p className="text-[#b5bac1] text-xs">Round {lobby.roundNumber} · {shapeLabel}{optimal != null ? ` · Optimal: ${optimal}` : ''}</p>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center px-4 pb-4 min-h-0 overflow-y-auto">
                {/* Leaderboard */}
                <div className="w-full max-w-sm space-y-2 mt-4">
                    {ranked.map((p: LobbyParticipant, i: number) => {
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
                                    {isSolvedP ? `${p.moves} move${p.moves !== 1 ? 's' : ''}` :
                                     p.status === 'dnf' ? 'DNF' : 'Spectator'}
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
