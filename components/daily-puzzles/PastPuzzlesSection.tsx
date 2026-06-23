'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, ChevronUp, Play, CheckCircle2, ArrowLeft } from 'lucide-react';
import { formatDateKey, getTodayEST } from '@/lib/daily-puzzles/seed';
import { getCompletedDates, syncFromServer, type PuzzleResult } from '@/lib/daily-puzzles/persistence';
import { authClient } from '@/lib/auth-client';

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
    const session = authClient.useSession();
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
        <>
            {/* Back to today button when viewing past puzzle */}
            {!isToday && (
                <div className="mt-4 text-center">
                    <button
                        type="button"
                        onClick={() => onSelectDate(todayKey)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors text-xs font-medium"
                    >
                        <ArrowLeft className="w-3 h-3" />
                        {t("back-to-todays-puzzle", { defaultValue: "Back to today's puzzle" })}
                    </button>
                </div>
            )}

            <div className="mt-8">
                <button
                    type="button"
                    onClick={() => setShowHistory((prev) => !prev)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors text-sm font-medium"
                >
                    <Calendar className="w-4 h-4" />
                    {t("past-puzzles", { defaultValue: "Past Puzzles" })}
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
                                <div className="space-y-2">
                                    {pastDates.map((p) => {
                                        const result = completedMap[p.dateKey];
                                        const isSelected = p.dateKey === selectedDateKey;

                                        return (
                                            <div
                                                key={p.dateKey}
                                                className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                                                    isSelected
                                                        ? 'bg-amber-500/15 border border-amber-500/30'
                                                        : 'bg-site-bg-subtle hover:bg-site-bg-subtle/80'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-site-text-muted text-sm font-mono">
                                                        {p.dateKey}
                                                    </span>
                                                    {result && (
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {result ? (
                                                        renderScore ? (
                                                            renderScore(result)
                                                        ) : (
                                                            <span className="font-mono font-semibold text-sm text-amber-400">
                                                                {t("score-pts", { defaultValue: "{{score}} pts", score: result.score })}
                                                            </span>
                                                        )
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => onSelectDate(p.dateKey)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-site-surface border border-site-border text-site-text hover:border-amber-500/50 transition-colors text-xs font-medium"
                                                        >
                                                            <Play className="w-3 h-3" />
                                                            {t("play", { defaultValue: "Play" })}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
}
