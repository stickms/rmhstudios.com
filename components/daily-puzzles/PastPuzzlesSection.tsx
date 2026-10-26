'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, ChevronUp, Play, CheckCircle2, ArrowLeft } from 'lucide-react';
import { formatDateKey, getTodayEST } from '@/lib/daily-puzzles/seed';
import { getCompletedDates, syncFromServer, type PuzzleResult } from '@/lib/daily-puzzles/persistence';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';

interface PastPuzzlesSectionProps {
    gameMode: string;
    selectedDateKey: string;
    onSelectDate: (dateKey: string) => void;
    /** Render score/status for a completed puzzle */
    renderScore?: (result: PuzzleResult) => React.ReactNode;
}

export function PastPuzzlesSection({
    gameMode,
    selectedDateKey,
    onSelectDate,
    renderScore,
}: PastPuzzlesSectionProps) {
    const { t } = useTranslation("c-daily-puzzles");
    const [showHistory, setShowHistory] = useState(false);
    const [completedMap, setCompletedMap] = useState<Record<string, PuzzleResult>>({});
    const session = useSession();
    const todayKey = formatDateKey(getTodayEST());
    const isToday = selectedDateKey === todayKey;

    // Load completion data
    useEffect(() => {
        setCompletedMap(getCompletedDates(gameMode));

        if (session.data) {
            syncFromServer(gameMode).then(() => {
                setCompletedMap(getCompletedDates(gameMode));
            });
        }
    }, [gameMode, session.data, selectedDateKey]);

    // Past 14 days (excluding today)
    const pastDates = useMemo(() => {
        const entries: { dateKey: string; label: string }[] = [];
        const today = getTodayEST();
        for (let i = 1; i <= 14; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dk = formatDateKey(d);
            const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
            entries.push({ dateKey: dk, label: `${weekday} ${dk}` });
        }
        return entries;
    }, []);

    return (
        <div className="mt-6 flex flex-col gap-3">
            {/* Back to today button when viewing past puzzle */}
            {!isToday && (
                <div className="text-center">
                    <Button type="button" variant="outline" size="sm" onClick={() => onSelectDate(todayKey)}>
                        <ArrowLeft aria-hidden />
                        {t("back-to-todays-puzzle", { defaultValue: "Back to today's puzzle" })}
                    </Button>
                </div>
            )}

            <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => setShowHistory((prev) => !prev)}
                aria-expanded={showHistory}
            >
                <Calendar aria-hidden />
                {t("past-puzzles", { defaultValue: "Past Puzzles" })}
                {showHistory ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            </Button>

            <AnimatePresence>
                {showHistory && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <ul className="glass-fill flex flex-col gap-2 rounded-site p-4">
                            {pastDates.map((p) => {
                                const result = completedMap[p.dateKey];
                                const isSelected = p.dateKey === selectedDateKey;

                                return (
                                    <li
                                        key={p.dateKey}
                                        className={`flex items-center justify-between gap-3 rounded-site-sm px-3 py-2 ${
                                            isSelected ? 'bg-site-accent-dim' : 'bg-site-bg-subtle'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-sm text-site-text-muted">{p.dateKey}</span>
                                            {result && <CheckCircle2 className="size-4 shrink-0 text-site-success" aria-hidden />}
                                        </div>
                                        {result ? (
                                            renderScore ? (
                                                renderScore(result)
                                            ) : (
                                                <span className="font-mono text-sm font-semibold text-site-text">
                                                    {t("score-pts", { defaultValue: "{{score}} pts", score: result.score })}
                                                </span>
                                            )
                                        ) : (
                                            <Button type="button" variant="outline" size="sm" onClick={() => onSelectDate(p.dateKey)}>
                                                <Play aria-hidden />
                                                {t("play", { defaultValue: "Play" })}
                                            </Button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
