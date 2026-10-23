'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Trophy, Plus, X, Send, Link2 } from 'lucide-react';
import {
    generateChainlinkPuzzle,
    isValidAssociation,
    computeChainlinkScore,
    type ChainlinkPuzzle,
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
import { fetchDailyPuzzle } from '@/lib/daily-puzzles/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    PuzzlePage,
    PuzzleHeader,
    PuzzleNotice,
    PuzzleSection,
    PuzzleResultCard,
    PuzzleResultStack,
    PuzzleShareRow,
    PuzzleFootnote,
} from '@/components/daily-puzzles/PuzzleShell';
import { PuzzleLoading } from '@/components/daily-puzzles/PuzzleLoading';
import { useSession } from '@/components/Providers';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';

const MAX_MIDDLE_LINKS = 6;

function ChainlinkGameLoader({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
    const [puzzle, setPuzzle] = useState<ChainlinkPuzzle | null>(null);

    useEffect(() => {
        let cancelled = false;
        setPuzzle(null);
        fetchDailyPuzzle('chainlink', dateKey, generateChainlinkPuzzle).then((p) => {
            if (!cancelled) setPuzzle(p);
        });
        return () => {
            cancelled = true;
        };
    }, [dateKey]);

    if (!puzzle) return <PuzzleLoading title="Chainlink" emoji="🔗" />;
    return <ChainlinkGameContent puzzle={puzzle} dateKey={dateKey} isToday={isToday} />;
}

function ChainlinkGameContent({ puzzle, dateKey, isToday }: { puzzle: ChainlinkPuzzle; dateKey: string; isToday: boolean }) {
    const { t } = useTranslation("c-daily-puzzles");
    const selectedDate = useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [dateKey]);
    const puzzleNumber = getPuzzleNumber(selectedDate);

    const [chain, setChain] = useState<string[]>(['']);
    const [validationErrors, setValidationErrors] = useState<(string | null)[]>([]);
    const [completed, setCompleted] = useState(false);
    const [gaveUp, setGaveUp] = useState(false);
    const [score, setScore] = useState(0);

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

    const session = useSession();

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

    const shareText = generateChainlinkShare(
        puzzleNumber,
        puzzle.startWord,
        puzzle.endWord,
        gaveUp ? 0 : fullChain.length,
        score,
        puzzle.parLinks,
    );

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

    const endpoint = (n: number, word: string, label: string) => (
        <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-xs font-bold text-site-accent">
                {n}
            </span>
            <div className="glass-fill flex flex-1 items-baseline gap-2 rounded-site-sm border border-site-accent/40 px-4 py-3">
                <span className="text-lg font-bold tracking-wide text-site-text">{word}</span>
                <span className="text-xs text-site-text-muted">{label}</span>
            </div>
        </div>
    );

    return (
        <>
            <PuzzleHeader
                icon={<Link2 />}
                title={t("chainlink-title", { defaultValue: "Chainlink" })}
                subtitle={<>{t("daily-puzzle", { defaultValue: "Daily puzzle" })} &middot; {dateKey} &middot; #{puzzleNumber}</>}
            >
                <PuzzleNotice title={t("connect-words-instruction", { defaultValue: "Connect the words through association" })}>
                    {t("build-chain-instruction", { defaultValue: "Build a chain from start to end. Each adjacent pair must be associated." })}
                </PuzzleNotice>
            </PuzzleHeader>

            {/* Chain builder */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-3"
            >
                {endpoint(1, puzzle.startWord, t("start-label", { defaultValue: "start" }))}

                {/* Middle links (editable) */}
                <AnimatePresence mode="popLayout">
                    {chain.map((word, i) => (
                        <motion.div
                            key={`link-${i}`}
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-start gap-3"
                        >
                            <span
                                className={`mt-1.5 flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                                    validationErrors[i]
                                        ? 'border-site-danger/50 bg-site-danger/10 text-site-danger'
                                        : 'glass-inset border-site-border bg-site-surface text-site-text-muted'
                                }`}
                            >
                                {i + 2}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <div className="relative">
                                    <Input
                                        ref={(el) => {
                                            inputRefs.current[i] = el;
                                        }}
                                        type="text"
                                        value={word}
                                        onChange={(e) => handleInputChange(i, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, i)}
                                        disabled={isGameOver}
                                        placeholder={t("type-linking-word", { defaultValue: "Type a linking word..." })}
                                        aria-label={t("link-word-label", { defaultValue: "Link {{n}}", n: i + 2 })}
                                        aria-invalid={validationErrors[i] ? true : undefined}
                                        aria-describedby={validationErrors[i] ? `chainlink-err-${i}` : undefined}
                                        className={!isGameOver && chain.length > 1 ? 'pr-12' : undefined}
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                    {!isGameOver && chain.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => handleRemoveLink(i)}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-site-text-muted"
                                            aria-label={t("remove-link", { defaultValue: "Remove link" })}
                                        >
                                            <X aria-hidden />
                                        </Button>
                                    )}
                                </div>
                                {validationErrors[i] && (
                                    <p id={`chainlink-err-${i}`} role="alert" className="text-xs text-site-danger">
                                        {validationErrors[i]}
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {endpoint(chain.length + 2, puzzle.endWord, t("end-label", { defaultValue: "end" }))}
            </motion.div>

            {/* Action buttons (while playing) */}
            {!isGameOver && (
                <div className="mt-6 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        {chain.length < MAX_MIDDLE_LINKS && (
                            <Button type="button" variant="secondary" onClick={handleAddLink}>
                                <Plus aria-hidden />
                                {t("add-link", { defaultValue: "Add Link" })}
                            </Button>
                        )}
                        <Button type="button" variant="accent" onClick={handleSubmit}>
                            <Send aria-hidden />
                            {t("submit-chain", { defaultValue: "Submit Chain" })}
                        </Button>
                        <Button type="button" variant="outline" onClick={handleGiveUp}>
                            <X aria-hidden />
                            {t("give-up", { defaultValue: "Give Up" })}
                        </Button>
                    </div>
                    <p className="text-center text-xs text-site-text-muted">
                        {t("chain-length-info", { defaultValue: "Chain length: {{length}} words · Par: {{par}} · Score if submitted: {{score}} pts", length: chainLength, par: puzzle.parLinks, score: computeChainlinkScore(chainLength) })}
                    </p>
                </div>
            )}

            {/* Result screen */}
            <AnimatePresence>
                {isGameOver && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                    >
                        <PuzzleResultStack>
                            <PuzzleResultCard
                                tone={gaveUp ? 'danger' : 'success'}
                                title={gaveUp ? t("chain-broken", { defaultValue: "Chain Broken" }) : t("chain-complete", { defaultValue: "Chain Complete!" })}
                                description={
                                    gaveUp ? (
                                        t("gave-up-message", { defaultValue: "You gave up on today's puzzle." })
                                    ) : (
                                        <>
                                            {t("chain-complete-message-pre", { defaultValue: "You connected" })}{' '}
                                            <span className="font-medium text-site-text">{puzzle.startWord}</span>{' '}
                                            {t("chain-complete-message-to", { defaultValue: "to" })}{' '}
                                            <span className="font-medium text-site-text">{puzzle.endWord}</span>{' '}
                                            {t("chain-complete-message-in", { defaultValue: "in" })}{' '}
                                            {chainLength} {t("links-label", { defaultValue: "links." })}
                                        </>
                                    )
                                }
                                stats={[
                                    { key: 'points', icon: <Trophy />, value: score, label: t("points-label", { defaultValue: "points" }), tone: 'warning' },
                                    { key: 'length', icon: <Link2 />, value: gaveUp ? '--' : chainLength, label: t("chain-length-label", { defaultValue: "chain length" }) },
                                    {
                                        key: 'par',
                                        icon: !gaveUp && chainLength <= puzzle.parLinks ? '🟢' : '🔴',
                                        value: puzzle.parLinks,
                                        label: t("par-label", { defaultValue: "par" }),
                                    },
                                ]}
                            />

                            {/* Example chain comparison */}
                            <PuzzleSection icon={<Link2 />} title={t("example-chain", { defaultValue: "Example Chain" })}>
                                <ol className="flex flex-col gap-2">
                                    {puzzle._exampleChain.map((word, i) => (
                                        <li key={i} className="flex flex-col gap-1">
                                            <span
                                                className={`self-start rounded-site-sm border px-3 py-1 text-sm font-medium text-site-text ${
                                                    i === 0 || i === puzzle._exampleChain.length - 1
                                                        ? 'border-site-accent/40 bg-site-accent-dim'
                                                        : 'border-site-border bg-site-bg-subtle'
                                                }`}
                                            >
                                                {word}
                                            </span>
                                            {i < puzzle._exampleChain.length - 1 && puzzle._connectionExplanations?.[i] && (
                                                <span className="pl-3 text-xs italic text-site-text-muted">
                                                    <span aria-hidden>↓ </span>
                                                    {puzzle._connectionExplanations[i]}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            </PuzzleSection>

                            <PuzzleShareRow shareText={shareText} />
                            <PuzzleFootnote>
                                {t("new-chain-tomorrow", { defaultValue: "A new chain unlocks tomorrow — same for everyone worldwide." })}
                            </PuzzleFootnote>
                        </PuzzleResultStack>
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
        <PuzzlePage>
            <ChainlinkGameLoader key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="chainlink"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </PuzzlePage>
    );
}
