'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
    getDateSeed,
    formatDateKey,
    createSeededRng,
} from '@/lib/lights-out/seed';
import { getDailyShape, getShapeLabel, isActiveCell, type GridShape } from '@/lib/lights-out/shapes';
import {
    generatePuzzle,
    toggleCellInGrid,
    isSolved,
    createEmptyGrid,
    solvePuzzle,
    getOptimalMoves,
    type Grid,
} from '@/lib/lights-out/lights-out';
import {
    loadSave,
    saveProgress,
    loadHintsUsed,
    saveHintsUsed,
    saveToHistory,
    loadHistory,
    type PuzzleHistoryEntry,
} from '@/lib/lights-out/persistence';
import { getPerformanceRating, generateShareText } from '@/lib/lights-out/share';
import { authClient } from '@/lib/auth-client';
import {
    Sparkles, RotateCcw, Trophy, Loader2, Undo2, Lightbulb, Flag,
    ArrowLeft, Share2, MessageCircle, Send, Calendar, ChevronDown, ChevronUp, Check,
} from 'lucide-react';

type LeaderboardEntry = {
    rank: number;
    moves: number;
    dnf?: boolean;
    hintUsed?: boolean;
    displayName: string;
};

type ChatMessage = {
    id: string;
    message: string;
    displayName: string;
    avatar: string | null;
    createdAt: string;
};

export function LightsOutGame() {
    const today = new Date();
    const dateKey = formatDateKey(today);
    const seed = getDateSeed(today);
    const shape = getDailyShape(seed);

    const [grid, setGrid] = useState<Grid | null>(null);
    const [moveHistory, setMoveHistory] = useState<Grid[]>([]);
    const [hintsUsed, setHintsUsed] = useState(0);
    const [hintedCell, setHintedCell] = useState<[number, number] | null>(null);
    const [gaveUp, setGaveUp] = useState(false);
    const [moves, setMoves] = useState(0);
    const [solved, setSolved] = useState(false);
    const [bestMoves, setBestMoves] = useState<number | null>(null);
    const [optimalMoves, setOptimalMoves] = useState<number | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [scoreSubmitted, setScoreSubmitted] = useState(false);
    const [sharecopied, setShareCopied] = useState(false);

    // Chat state
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [chatSending, setChatSending] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Past puzzles
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<PuzzleHistoryEntry[]>([]);

    const session = authClient.useSession();

    // Compute optimal moves for the initial puzzle
    const computeOptimal = useCallback((puzzleGrid: Grid) => {
        const opt = getOptimalMoves(puzzleGrid, shape);
        setOptimalMoves(opt);
        return opt;
    }, [shape]);

    const initPuzzle = useCallback(() => {
        const initialGrid = generatePuzzle(createSeededRng(seed), shape);
        setGrid(initialGrid);
        setMoves(0);
        setSolved(false);
        setGaveUp(false);
        setMoveHistory([]);
        setHintedCell(null);
        setHintsUsed(loadHintsUsed(dateKey));
        computeOptimal(initialGrid);

        const save = loadSave(dateKey);
        if (save) {
            setBestMoves(save.solved && !save.dnf ? save.moves : null);
        } else {
            setBestMoves(null);
        }
    }, [dateKey, seed, shape, computeOptimal]);

    useEffect(() => {
        const save = loadSave(dateKey);
        if (save?.solved) {
            // Regenerate the puzzle to compute optimal
            const puzzleGrid = generatePuzzle(createSeededRng(seed), shape);
            const opt = computeOptimal(puzzleGrid);
            setGrid(createEmptyGrid(shape));
            setMoves(save.moves);
            setSolved(true);
            setGaveUp(save.dnf ?? false);
            setHintsUsed(loadHintsUsed(dateKey));
            setBestMoves(save.dnf ? null : save.moves);
            if (save.optimalMoves != null) setOptimalMoves(save.optimalMoves);
            else if (opt != null) setOptimalMoves(opt);
        } else {
            initPuzzle();
        }
    }, [dateKey, initPuzzle, shape, seed, computeOptimal]);

    // Load history
    useEffect(() => {
        setHistory(loadHistory());
    }, [solved]);

    // Fetch leaderboard (only when solved)
    const fetchLeaderboard = useCallback(async () => {
        setLeaderboardLoading(true);
        try {
            const res = await fetch(`/api/lights-out/leaderboard?date=${dateKey}`);
            if (!res.ok) return;
            const data = await res.json();
            setLeaderboard(data.leaderboard || []);
        } catch {
            /* ignore */
        } finally {
            setLeaderboardLoading(false);
        }
    }, [dateKey]);

    useEffect(() => {
        if (solved) fetchLeaderboard();
    }, [solved, fetchLeaderboard]);

    // Fetch chat (only when solved)
    const fetchChat = useCallback(async () => {
        setChatLoading(true);
        try {
            const res = await fetch(`/api/lights-out/chat?date=${dateKey}`);
            if (!res.ok) return;
            const data = await res.json();
            setChatMessages(data.chat || []);
        } catch {
            /* ignore */
        } finally {
            setChatLoading(false);
        }
    }, [dateKey]);

    useEffect(() => {
        if (solved) fetchChat();
    }, [solved, fetchChat]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const submitScore = useCallback(
        async (finalMoves: number, usedHints: boolean, dnfSubmission = false) => {
            if (!session.data || scoreSubmitted) return;
            setScoreSubmitted(true);
            try {
                await fetch('/api/lights-out/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        moves: finalMoves,
                        hintUsed: usedHints,
                        dnf: dnfSubmission,
                        date: dateKey,
                    }),
                });
                fetchLeaderboard();
            } catch {
                /* ignore */
            }
        },
        [session.data, scoreSubmitted, dateKey, fetchLeaderboard]
    );

    const handleCellClick = (r: number, c: number) => {
        if (!grid || solved) return;
        if (!isActiveCell(shape, r, c)) return;

        setMoveHistory((prev) => [...prev, grid.map((row) => [...row])]);
        const next = toggleCellInGrid(grid, r, c, shape);
        setGrid(next);
        const newMoves = moves + 1;
        setMoves(newMoves);

        if (isSolved(next, shape)) {
            setSolved(true);
            const prevBest = loadSave(dateKey)?.moves;
            const isNewBest = prevBest == null || newMoves < prevBest;
            if (isNewBest) setBestMoves(newMoves);
            saveProgress(dateKey, newMoves, true, false, optimalMoves ?? undefined);
            saveToHistory({
                dateKey,
                moves: newMoves,
                solved: true,
                dnf: false,
                hintUsed: hintsUsed > 0,
                shapeLabel: getShapeLabel(shape),
                optimalMoves: optimalMoves ?? undefined,
            });
            if (session.data) submitScore(newMoves, hintsUsed > 0);
        } else {
            saveProgress(dateKey, newMoves, false);
        }
    };

    const handleUndo = () => {
        if (!grid || solved || moveHistory.length === 0) return;
        const prev = moveHistory[moveHistory.length - 1];
        setMoveHistory((h) => h.slice(0, -1));
        setGrid(prev);
        setMoves((m) => m - 1);
        saveProgress(dateKey, moves - 1, false);
    };

    const handleHint = () => {
        if (!grid || solved || hintsUsed >= 3) return;
        const solution = solvePuzzle(grid, shape);
        if (!solution || solution.length === 0) return;
        const [r, c] = solution[0];
        const next = hintsUsed + 1;
        setHintsUsed(next);
        saveHintsUsed(dateKey, next);
        setHintedCell([r, c]);
        setTimeout(() => setHintedCell(null), 2500);
    };

    const handleGiveUp = () => {
        if (!grid || solved || hintsUsed < 3) return;
        setSolved(true);
        setGaveUp(true);
        saveProgress(dateKey, moves, true, true, optimalMoves ?? undefined);
        saveToHistory({
            dateKey,
            moves,
            solved: true,
            dnf: true,
            hintUsed: true,
            shapeLabel: getShapeLabel(shape),
            optimalMoves: optimalMoves ?? undefined,
        });
        if (session.data) submitScore(moves, true, true);
    };

    const handleShare = async () => {
        if (!solved || optimalMoves == null) return;
        const text = generateShareText(
            dateKey,
            shape,
            moves,
            optimalMoves,
            gaveUp,
            hintsUsed > 0
        );
        try {
            await navigator.clipboard.writeText(text);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        } catch {
            /* ignore */
        }
    };

    const handleSendChat = async () => {
        if (!chatInput.trim() || chatSending || !session.data) return;
        setChatSending(true);
        try {
            const res = await fetch('/api/lights-out/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: chatInput.trim(), date: dateKey }),
            });
            if (res.ok) {
                setChatInput('');
                fetchChat();
            }
        } catch {
            /* ignore */
        } finally {
            setChatSending(false);
        }
    };

    if (!grid) {
        return (
            <div className="min-h-100 flex items-center justify-center">
                <div className="animate-pulse text-site-text-muted">Loading...</div>
            </div>
        );
    }

    const isTriangle = shape.type === 'triangle';
    const isCustom = shape.type === 'custom';
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    const rating = solved && optimalMoves != null
        ? getPerformanceRating(moves, optimalMoves, gaveUp)
        : null;

    return (
        <div className="max-w-lg mx-auto px-4 py-8">
            {/* Back to Builds */}
            <Link
                to="/builds"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Builds
            </Link>

            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-site-text mb-1 flex items-center justify-center gap-2">
                    <Sparkles className="w-8 h-8 text-amber-400" />
                    Lights Out
                </h1>
                <p className="text-site-text-muted text-sm mb-2">
                    Daily puzzle · {dateKey} · {getShapeLabel(shape)}
                </p>
                <div className="inline-block px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-400 font-semibold text-sm">Goal: Turn off every light</p>
                    <p className="text-site-text-muted text-xs mt-0.5">
                        Tap a light to toggle it and its neighbors. Fewer moves = better.
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="flex justify-center items-center gap-6 mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-site-text-muted text-sm">Moves</span>
                    <span className="text-site-text font-mono font-semibold">{moves}</span>
                </div>
                {bestMoves != null && (
                    <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span className="text-site-text-muted text-sm">Best</span>
                        <span className="text-amber-400 font-mono font-semibold">{bestMoves}</span>
                    </div>
                )}
                <div className="flex items-center gap-2 text-site-text-muted text-sm">
                    <Lightbulb className="w-4 h-4" />
                    <span>{hintsUsed}/3 hints</span>
                </div>
            </div>

            {/* Grid */}
            <div className="w-full max-w-[320px] mx-auto p-4 rounded-2xl bg-site-surface border border-site-border">
                {isTriangle ? (
                    <div className="flex flex-col items-center gap-1.5 py-2">
                        {grid.map((row, r) => (
                            <div key={r} className="flex justify-center gap-1.5">
                                {row.map((on, c) => {
                                    const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;
                                    return (
                                        <button
                                            key={`${r}-${c}`}
                                            type="button"
                                            onClick={() => handleCellClick(r, c)}
                                            disabled={solved}
                                            className={`
                                                w-10 h-10 rounded-xl transition-all duration-150
                                                ${on
                                                    ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30'
                                                    : 'bg-site-bg-subtle border border-site-border'}
                                                ${isHinted && 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-site-surface animate-pulse'}
                                                ${!solved && 'hover:opacity-90 active:scale-95 cursor-pointer'}
                                                ${solved && 'cursor-default'}
                                            `}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div
                        className="grid gap-2 w-full"
                        style={{
                            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                            gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                            aspectRatio: `${gridCols} / ${gridRows}`,
                        }}
                    >
                        {grid.map((row, r) =>
                            row.map((on, c) => {
                                const active = isActiveCell(shape, r, c);
                                const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;

                                if (isCustom && !active) {
                                    return <div key={`${r}-${c}`} />;
                                }

                                return (
                                    <button
                                        key={`${r}-${c}`}
                                        type="button"
                                        onClick={() => handleCellClick(r, c)}
                                        disabled={solved || !active}
                                        className={`
                                            rounded-xl transition-all duration-150 min-h-0
                                            ${on
                                                ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30'
                                                : 'bg-site-bg-subtle border border-site-border'}
                                            ${isHinted && 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-site-surface animate-pulse'}
                                            ${!solved && active && 'hover:opacity-90 active:scale-95 cursor-pointer'}
                                            ${(solved || !active) && 'cursor-default'}
                                        `}
                                    />
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-3 mt-6 flex-wrap">
                <motion.button
                    type="button"
                    onClick={handleHint}
                    disabled={solved || hintsUsed >= 3}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-cyan-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Highlight next move (3 per day)"
                >
                    <Lightbulb className="w-4 h-4" />
                    Hint
                </motion.button>
                {hintsUsed >= 3 && !solved && (
                    <motion.button
                        type="button"
                        onClick={handleGiveUp}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-danger/50 text-site-danger hover:bg-site-danger/10 transition-colors"
                        title="End puzzle with DNF"
                    >
                        <Flag className="w-4 h-4" />
                        Give up?
                    </motion.button>
                )}
                <motion.button
                    type="button"
                    onClick={handleUndo}
                    disabled={solved || moveHistory.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Take back your last move"
                >
                    <Undo2 className="w-4 h-4" />
                    Undo
                </motion.button>
                <motion.button
                    type="button"
                    onClick={initPuzzle}
                    disabled={solved}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Restart today's puzzle"
                >
                    <RotateCcw className="w-4 h-4" />
                    Restart
                </motion.button>
            </div>

            {/* Win / DNF state + Share */}
            <AnimatePresence>
                {solved && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`mt-8 p-6 rounded-2xl bg-site-surface text-center ${
                            gaveUp ? 'border border-site-danger/30' : 'border border-amber-500/30'
                        }`}
                    >
                        {gaveUp ? (
                            <>
                                <div className="text-2xl font-bold text-site-danger mb-1">Did Not Finish</div>
                                <p className="text-site-text-muted text-sm">Submitted as DNF on the leaderboard.</p>
                            </>
                        ) : (
                            <>
                                {rating && (
                                    <div className="text-3xl mb-2">{rating.emoji}</div>
                                )}
                                <div className="text-2xl font-bold text-amber-400 mb-1">
                                    {rating ? rating.label : 'All lights out!'}
                                </div>
                                <p className="text-site-text-muted text-sm">
                                    Solved in {moves} move{moves !== 1 ? 's' : ''}.
                                    {bestMoves != null && moves === bestMoves && ' Personal best!'}
                                </p>
                                {optimalMoves != null && (
                                    <p className="text-site-text-dim text-xs mt-1">
                                        Optimal: {optimalMoves} move{optimalMoves !== 1 ? 's' : ''}
                                    </p>
                                )}

                                {/* Rating breakdown */}
                                {optimalMoves != null && (
                                    <div className="mt-4 text-left max-w-[260px] mx-auto">
                                        {[
                                            { emoji: '\u{1F31F}', label: 'Perfect!', desc: 'Optimal moves' },
                                            { emoji: '\u2728', label: 'Excellent!', desc: '+1 move' },
                                            { emoji: '\u{1F525}', label: 'Great!', desc: '+2\u20133 moves' },
                                            { emoji: '\u{1F44D}', label: 'Good!', desc: '+4\u20136 moves' },
                                            { emoji: '\u{1F4A1}', label: 'Solved!', desc: '+7 or more' },
                                        ].map((tier) => (
                                            <div
                                                key={tier.label}
                                                className={`flex items-center gap-2 py-1 px-2 rounded-md text-xs ${
                                                    rating?.label === tier.label
                                                        ? 'bg-amber-500/15 text-amber-400 font-semibold'
                                                        : 'text-site-text-dim'
                                                }`}
                                            >
                                                <span className="w-5 text-center">{tier.emoji}</span>
                                                <span className="w-20">{tier.label}</span>
                                                <span className="text-site-text-dim font-normal">{tier.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Share button */}
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={handleShare}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors font-medium text-sm"
                            >
                                {sharecopied ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Share2 className="w-4 h-4" />
                                        Share Result
                                    </>
                                )}
                            </button>
                        </div>

                        {!session.data && (
                            <p className="text-site-text-dim text-xs mt-3">
                                <Link to="/login" search={{ callbackURL: undefined }} className="text-site-accent hover:underline">
                                    Sign in
                                </Link>{' '}
                                to submit your score and join the chat.
                            </p>
                        )}
                        <p className="text-site-text-dim text-xs mt-2">
                            A new puzzle unlocks tomorrow — same for everyone worldwide.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Chat — only visible after solving */}
            <AnimatePresence>
                {solved && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-6 p-5 rounded-2xl bg-site-surface border border-site-border"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <MessageCircle className="w-5 h-5 text-amber-400" />
                            <h2 className="text-lg font-semibold text-site-text">Puzzle Chat</h2>
                            <span className="text-site-text-muted text-xs">Spoilers welcome!</span>
                        </div>

                        {chatLoading ? (
                            <div className="flex items-center justify-center py-6 text-site-text-muted">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        ) : chatMessages.length === 0 ? (
                            <p className="text-site-text-muted text-sm py-4 text-center">
                                No messages yet. Be the first to chat!
                            </p>
                        ) : (
                            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                                {chatMessages.map((msg) => (
                                    <div key={msg.id} className="flex gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-site-text font-medium text-sm truncate">
                                                    {msg.displayName}
                                                </span>
                                                <span className="text-site-text-dim text-xs shrink-0">
                                                    {new Date(msg.createdAt).toLocaleTimeString([], {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            </div>
                                            <p className="text-site-text-muted text-sm break-words">
                                                {msg.message}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                        )}

                        {session.data ? (
                            <div className="flex gap-2 mt-4">
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                    placeholder="Say something..."
                                    maxLength={280}
                                    className="flex-1 px-3 py-2 rounded-lg bg-site-bg-subtle border border-site-border text-site-text text-sm placeholder:text-site-text-dim focus:outline-none focus:border-amber-500/50"
                                />
                                <button
                                    type="button"
                                    onClick={handleSendChat}
                                    disabled={chatSending || !chatInput.trim()}
                                    className="px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {chatSending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        ) : (
                            <p className="text-site-text-dim text-xs mt-3 text-center">
                                <Link to="/login" search={{ callbackURL: undefined }} className="text-site-accent hover:underline">
                                    Sign in
                                </Link>{' '}
                                to join the chat.
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Leaderboard — only visible after solving */}
            <AnimatePresence>
                {solved && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-6 p-6 rounded-2xl bg-site-surface border border-site-border"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <Trophy className="w-5 h-5 text-amber-400" />
                            <h2 className="text-lg font-semibold text-site-text">Today&apos;s Leaderboard</h2>
                            <span className="text-site-text-muted text-xs">(least moves)</span>
                        </div>
                        {leaderboardLoading ? (
                            <div className="flex items-center justify-center py-8 text-site-text-muted">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        ) : leaderboard.length === 0 ? (
                            <p className="text-site-text-muted text-sm py-4 text-center">
                                No scores yet. You&apos;re the first!
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {leaderboard.map((e) => (
                                    <div
                                        key={e.rank}
                                        className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-site-bg-subtle"
                                    >
                                        <span className="text-site-text-muted font-mono text-sm w-6">#{e.rank}</span>
                                        <span className="text-site-text font-medium flex-1 truncate">{e.displayName}</span>
                                        <span className="flex items-center gap-1.5">
                                            {e.hintUsed && (
                                                <span title="Used hint"><Lightbulb className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden /></span>
                                            )}
                                            <span
                                                className={`font-mono font-semibold ${
                                                    e.dnf ? 'text-site-danger' : 'text-amber-400'
                                                }`}
                                            >
                                                {e.dnf ? 'DNF' : e.moves}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Past Puzzles */}
            <div className="mt-8">
                <button
                    type="button"
                    onClick={() => setShowHistory((prev) => !prev)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors text-sm font-medium"
                >
                    <Calendar className="w-4 h-4" />
                    Past Puzzles
                    {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                <AnimatePresence>
                    {showHistory && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 p-4 rounded-xl bg-site-surface border border-site-border">
                                {history.length === 0 ? (
                                    <p className="text-site-text-muted text-sm text-center py-4">
                                        No puzzle history yet. Solve today&apos;s puzzle to start your streak!
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {history.map((h) => {
                                            const hRating = h.optimalMoves != null
                                                ? getPerformanceRating(h.moves, h.optimalMoves, h.dnf)
                                                : null;
                                            return (
                                                <div
                                                    key={h.dateKey}
                                                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-site-bg-subtle"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-site-text-muted text-sm font-mono">
                                                            {h.dateKey}
                                                        </span>
                                                        <span className="text-site-text-dim text-xs">
                                                            {h.shapeLabel}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {h.hintUsed && (
                                                            <Lightbulb className="w-3.5 h-3.5 text-cyan-400" />
                                                        )}
                                                        {hRating && (
                                                            <span className="text-xs" title={hRating.label}>
                                                                {hRating.emoji}
                                                            </span>
                                                        )}
                                                        <span
                                                            className={`font-mono font-semibold text-sm ${
                                                                h.dnf ? 'text-site-danger' : 'text-amber-400'
                                                            }`}
                                                        >
                                                            {h.dnf ? 'DNF' : `${h.moves} moves`}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
