'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
    ArrowLeft,
    Trophy,
    Copy,
    Check,
    Plus,
    X,
    Send,
    Link2,
} from 'lucide-react';
import {
    generateChainlinkPuzzle,
    isValidAssociation,
    computeChainlinkScore,
} from '@/lib/daily-puzzles/chainlink';
import {
    formatDateKey,
    getTodayEST,
    getPuzzleNumber,
} from '@/lib/daily-puzzles/seed';
import {
    getResult,
    saveResult,
    hasCompleted,
    saveResultWithSync,
    fetchResultFromServer,
} from '@/lib/daily-puzzles/persistence';
import { generateChainlinkShare } from '@/lib/daily-puzzles/share';
import { authClient } from '@/lib/auth-client';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';

const MAX_MIDDLE_LINKS = 6;

function ChainlinkGameContent({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
    const { t } = useTranslation("c-daily-puzzles");
    const selectedDate = useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [dateKey]);
    const puzzleNumber = getPuzzleNumber(selectedDate);
    const puzzle = generateChainlinkPuzzle(selectedDate);

    const [chain, setChain] = useState<string[]>(['']);
    const [validationErrors, setValidationErrors] = useState<(string | null)[]>([]);
    const [completed, setCompleted] = useState(false);
    const [gaveUp, setGaveUp] = useState(false);
    const [score, setScore] = useState(0);
    const [copied, setCopied] = useState(false);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Check persistence on mount
    useEffect(() => {
        if (hasCompleted('chainlink', dateKey)) {
            const result = getResult('chainlink', dateKey);
            if (result) {
                const data = result.resultJson;
                setChain(data.chain ?? ['']);
                setCompleted(data.completed ?? false);
                setGaveUp(data.gaveUp ?? false);
                setScore(result.score);
            }
        }
    }, [dateKey]);

    const session = authClient.useSession();

    useEffect(() => {
        if (session.data && !hasCompleted('chainlink', dateKey)) {
            fetchResultFromServer('chainlink', dateKey).then(serverResult => {
                if (serverResult) {
                    saveResult('chainlink', dateKey, serverResult);
                    const data = serverResult.resultJson;
                    setChain(data.chain ?? ['']);
                    setCompleted(data.completed ?? false);
                    setGaveUp(data.gaveUp ?? false);
                    setScore(serverResult.score);
                }
            });
        }
    }, [dateKey, session.data]);

    const fullChain = [puzzle.startWord, ...chain, puzzle.endWord];
    const chainLength = fullChain.length;

    const handleInputChange = (index: number, value: string) => {
        const updated = [...chain];
        updated[index] = value;
        setChain(updated);
        // Clear validation error for this input on change
        if (validationErrors[index]) {
            const newErrors = [...validationErrors];
            newErrors[index] = null;
            setValidationErrors(newErrors);
        }
    };

    const handleAddLink = () => {
        if (chain.length >= MAX_MIDDLE_LINKS) return;
        setChain([...chain, '']);
        setValidationErrors([...validationErrors, null]);
        // Focus the new input after render
        setTimeout(() => {
            inputRefs.current[chain.length]?.focus();
        }, 50);
    };

    const handleRemoveLink = (index: number) => {
        if (chain.length <= 1) return;
        const updated = chain.filter((_, i) => i !== index);
        const updatedErrors = validationErrors.filter((_, i) => i !== index);
        setChain(updated);
        setValidationErrors(updatedErrors);
    };

    const handleSubmit = () => {
        // Build the full chain: start + middle words + end
        const full = [puzzle.startWord, ...chain.map(w => w.trim()), puzzle.endWord];
        const errors: (string | null)[] = new Array(chain.length).fill(null);
        let hasError = false;

        // Check for empty inputs
        for (let i = 0; i < chain.length; i++) {
            if (!chain[i].trim()) {
                errors[i] = t("enter-a-word", { defaultValue: "Enter a word" });
                hasError = true;
            }
        }

        if (!hasError) {
            // Check each adjacent pair
            // full[0] is start, full[1..chain.length] are middle, full[chain.length+1] is end
            // For middle word at index i, check pair (full[i], full[i+1]) and (full[i+1], full[i+2])
            // Actually, check all adjacent pairs and map errors to the link between them
            for (let i = 0; i < full.length - 1; i++) {
                if (!isValidAssociation(full[i], full[i + 1])) {
                    hasError = true;
                    // Map to middle chain index:
                    // i=0 means start->chain[0] is invalid -> error on chain[0] (index 0)
                    // i=chain.length means chain[last]->end is invalid -> error on chain[last]
                    if (i === 0) {
                        errors[0] = t("no-link-between", { defaultValue: 'No link between "{{a}}" and "{{b}}"', a: full[0], b: full[1] });
                    } else if (i === full.length - 2) {
                        errors[chain.length - 1] = t("no-link-between", { defaultValue: 'No link between "{{a}}" and "{{b}}"', a: full[i], b: full[i + 1] });
                    } else {
                        // Between two middle words: mark the second one
                        errors[i] = t("no-link-between", { defaultValue: 'No link between "{{a}}" and "{{b}}"', a: full[i], b: full[i + 1] });
                    }
                }
            }
        }

        setValidationErrors(errors);

        if (!hasError) {
            // Success
            const finalScore = computeChainlinkScore(full.length);
            setCompleted(true);
            setScore(finalScore);
            saveResultWithSync('chainlink', dateKey, {
                puzzleDate: dateKey,
                score: finalScore,
                timeSeconds: null,
                resultJson: { chain: chain.map(w => w.trim()), completed: true, gaveUp: false },
                completedAt: new Date().toISOString(),
            }, !!session.data);
        }
    };

    const handleGiveUp = () => {
        setGaveUp(true);
        setCompleted(true);
        setScore(0);
        saveResultWithSync('chainlink', dateKey, {
            puzzleDate: dateKey,
            score: 0,
            timeSeconds: null,
            resultJson: { chain: chain.map(w => w.trim()), completed: true, gaveUp: true },
            completedAt: new Date().toISOString(),
        }, !!session.data);
    };

    const handleShare = async () => {
        const shareText = generateChainlinkShare(
            puzzleNumber,
            puzzle.startWord,
            puzzle.endWord,
            gaveUp ? 0 : fullChain.length,
            score,
            puzzle.parLinks,
        );
        try {
            await navigator.clipboard.writeText(shareText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard not available */
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // If last input and not at max, add a new link
            if (index === chain.length - 1 && chain.length < MAX_MIDDLE_LINKS && chain[index].trim()) {
                handleAddLink();
            } else if (chain[index].trim()) {
                // Focus next input or submit
                const nextInput = inputRefs.current[index + 1];
                if (nextInput) {
                    nextInput.focus();
                } else {
                    handleSubmit();
                }
            }
        }
    };

    const isGameOver = completed;

    return (
        <>
            {/* Back link */}
            <Link
                to="/daily"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                {t("back-to-daily-puzzles", { defaultValue: "Back to Daily Puzzles" })}
            </Link>

            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-site-text mb-1 flex items-center justify-center gap-2">
                    <Link2 className="w-8 h-8 text-blue-400" />
                    Chainlink
                </h1>
                <p className="text-site-text-muted text-sm mb-2">
                    Daily puzzle &middot; {dateKey} &middot; #{puzzleNumber}
                </p>
                <div className="inline-block px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <p className="text-blue-400 font-semibold text-sm">{t("connect-words-instruction", { defaultValue: "Connect the words through association" })}</p>
                    <p className="text-site-text-muted text-xs mt-0.5">
                        {t("build-chain-instruction", { defaultValue: "Build a chain from start to end. Each adjacent pair must be associated." })}
                    </p>
                </div>
            </div>

            {/* Chain builder */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 mb-6"
            >
                {/* Start word (fixed) */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
                        <span className="text-blue-400 text-xs font-bold">1</span>
                    </div>
                    <div className="flex-1 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                        <span className="text-blue-400 font-bold text-lg tracking-wide">{puzzle.startWord}</span>
                        <span className="text-site-text-muted text-xs ml-2">{t("start-label", { defaultValue: "start" })}</span>
                    </div>
                </div>

                {/* Middle links (editable) */}
                <AnimatePresence mode="popLayout">
                    {chain.map((word, i) => (
                        <motion.div
                            key={`link-${i}`}
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-3"
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                validationErrors[i]
                                    ? 'bg-red-500/20 border border-red-500/40'
                                    : 'bg-site-surface border border-site-border'
                            }`}>
                                <span className={`text-xs font-bold ${
                                    validationErrors[i] ? 'text-red-400' : 'text-site-text-muted'
                                }`}>{i + 2}</span>
                            </div>
                            <div className="flex-1 relative">
                                <input
                                    ref={el => { inputRefs.current[i] = el; }}
                                    type="text"
                                    value={word}
                                    onChange={e => handleInputChange(i, e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, i)}
                                    disabled={isGameOver}
                                    placeholder={t("type-linking-word", { defaultValue: "Type a linking word..." })}
                                    className={`w-full px-4 py-3 rounded-xl bg-site-surface border text-site-text placeholder:text-site-text-muted/50 focus:outline-none focus:ring-2 transition-all ${
                                        validationErrors[i]
                                            ? 'border-red-500/50 focus:ring-red-500/30'
                                            : 'border-site-border focus:ring-blue-500/30 focus:border-blue-500/50'
                                    } ${isGameOver ? 'opacity-70 cursor-default' : ''}`}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                                {!isGameOver && chain.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveLink(i)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-site-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                        title={t("remove-link", { defaultValue: "Remove link" })}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Validation error messages */}
                <AnimatePresence>
                    {validationErrors.map((err, i) =>
                        err ? (
                            <motion.p
                                key={`err-${i}`}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="text-red-400 text-xs pl-11"
                            >
                                {err}
                            </motion.p>
                        ) : null,
                    )}
                </AnimatePresence>

                {/* End word (fixed) */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
                        <span className="text-blue-400 text-xs font-bold">{chain.length + 2}</span>
                    </div>
                    <div className="flex-1 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                        <span className="text-blue-400 font-bold text-lg tracking-wide">{puzzle.endWord}</span>
                        <span className="text-site-text-muted text-xs ml-2">{t("end-label", { defaultValue: "end" })}</span>
                    </div>
                </div>
            </motion.div>

            {/* Action buttons (while playing) */}
            {!isGameOver && (
                <div className="flex justify-center gap-3 flex-wrap mb-6">
                    {chain.length < MAX_MIDDLE_LINKS && (
                        <motion.button
                            type="button"
                            onClick={handleAddLink}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text-muted hover:text-site-text hover:border-blue-500/40 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            {t("add-link", { defaultValue: "Add Link" })}
                        </motion.button>
                    )}
                    <motion.button
                        type="button"
                        onClick={handleSubmit}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 font-semibold hover:bg-blue-500/30 transition-colors text-sm"
                    >
                        <Send className="w-4 h-4" />
                        {t("submit-chain", { defaultValue: "Submit Chain" })}
                    </motion.button>
                    <motion.button
                        type="button"
                        onClick={handleGiveUp}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text-muted hover:text-red-400 hover:border-red-500/40 transition-colors text-sm"
                    >
                        <X className="w-4 h-4" />
                        {t("give-up", { defaultValue: "Give Up" })}
                    </motion.button>
                </div>
            )}

            {/* Chain length indicator */}
            {!isGameOver && (
                <p className="text-center text-site-text-muted text-xs mb-4">
                    {t("chain-length-info", { defaultValue: "Chain length: {{length}} words · Par: {{par}} · Score if submitted: {{score}} pts", length: chainLength, par: puzzle.parLinks, score: computeChainlinkScore(chainLength) })}
                </p>
            )}

            {/* Result screen */}
            <AnimatePresence>
                {isGameOver && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-6 space-y-4"
                    >
                        {/* Outcome banner */}
                        <div
                            className={`p-6 rounded-2xl text-center ${
                                gaveUp
                                    ? 'bg-site-surface border border-red-500/30'
                                    : 'bg-site-surface border border-emerald-500/30'
                            }`}
                        >
                            {gaveUp ? (
                                <>
                                    <div className="text-2xl font-bold text-red-400 mb-1">{t("chain-broken", { defaultValue: "Chain Broken" })}</div>
                                    <p className="text-site-text-muted text-sm">
                                        {t("gave-up-message", { defaultValue: "You gave up on today's puzzle." })}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="text-2xl font-bold text-emerald-400 mb-1">{t("chain-complete", { defaultValue: "Chain Complete!" })}</div>
                                    <p className="text-site-text-muted text-sm">
                                        {t("chain-complete-message-pre", { defaultValue: "You connected" })}{' '}
                                        <span className="text-site-text font-medium">{puzzle.startWord}</span>{' '}
                                        {t("chain-complete-message-to", { defaultValue: "to" })}{' '}
                                        <span className="text-site-text font-medium">{puzzle.endWord}</span>{' '}
                                        {t("chain-complete-message-in", { defaultValue: "in" })}{' '}
                                        {chainLength} {t("links-label", { defaultValue: "links." })}
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Score display */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.15 }}
                            className="p-5 rounded-2xl bg-site-surface border border-site-border text-center"
                        >
                            <div className="flex items-center justify-center gap-6 flex-wrap">
                                <div className="flex flex-col items-center">
                                    <Trophy className="w-6 h-6 text-amber-400 mb-1" />
                                    <span className="text-2xl font-bold text-amber-400">{score}</span>
                                    <span className="text-site-text-muted text-xs">{t("points-label", { defaultValue: "points" })}</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <Link2 className="w-6 h-6 text-blue-400 mb-1" />
                                    <span className="text-2xl font-bold text-site-text">{gaveUp ? '--' : chainLength}</span>
                                    <span className="text-site-text-muted text-xs">{t("chain-length-label", { defaultValue: "chain length" })}</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-xl mb-1">
                                        {!gaveUp && chainLength <= puzzle.parLinks ? '🟢' : '🔴'}
                                    </span>
                                    <span className="text-2xl font-bold text-site-text">{puzzle.parLinks}</span>
                                    <span className="text-site-text-muted text-xs">{t("par-label", { defaultValue: "par" })}</span>
                                </div>
                            </div>
                        </motion.div>

                        {/* Example chain comparison */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="p-5 rounded-2xl bg-site-surface border border-site-border"
                        >
                            <h3 className="text-sm font-semibold text-site-text uppercase tracking-wide mb-3 flex items-center gap-2">
                                <Link2 className="w-4 h-4 text-blue-400" />
                                {t("example-chain", { defaultValue: "Example Chain" })}
                            </h3>
                            <div className="space-y-2">
                                {puzzle._exampleChain.map((word, i) => (
                                    <div key={i}>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`px-2.5 py-1 rounded-lg text-sm font-medium ${
                                                    i === 0 || i === puzzle._exampleChain.length - 1
                                                        ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                                        : 'bg-site-bg text-site-text border border-site-border'
                                                }`}
                                            >
                                                {word}
                                            </span>
                                        </div>
                                        {i < puzzle._exampleChain.length - 1 && puzzle._connectionExplanations?.[i] && (
                                            <div className="ml-3 mt-1 mb-1 flex items-center gap-1.5">
                                                <span className="text-site-text-muted text-xs">↓</span>
                                                <span className="text-site-text-muted text-xs italic">
                                                    {puzzle._connectionExplanations[i]}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Actions */}
                        <div className="flex justify-center gap-3 flex-wrap">
                            <motion.button
                                type="button"
                                onClick={handleShare}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.45 }}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors"
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copied ? t("copied", { defaultValue: "Copied!" }) : t("share-result", { defaultValue: "Share Result" })}
                            </motion.button>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5 }}
                            >
                                <Link
                                    to="/daily"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    {t("all-puzzles", { defaultValue: "All Puzzles" })}
                                </Link>
                            </motion.div>
                        </div>

                        <p className="text-site-text-muted text-xs text-center">
                            {t("new-chain-tomorrow", { defaultValue: "A new chain unlocks tomorrow — same for everyone worldwide." })}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {isToday && (
                <DailyPuzzleLeaderboard
                    gameMode="chainlink"
                    dateKey={dateKey}
                    score={score}
                    completed={completed}
                    resultJson={{ chain: chain.map(w => w.trim()), completed, gaveUp }}
                />
            )}
        </>
    );
}

export function ChainlinkGame() {
    const todayKey = formatDateKey(getTodayEST());
    const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <ChainlinkGameContent key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="chainlink"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </div>
    );
}
