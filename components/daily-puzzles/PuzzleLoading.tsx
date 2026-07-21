'use client';

import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Loader2 } from 'lucide-react';

/**
 * Loading state shown while a daily puzzle is fetched from the server
 * (generated on the fly for the day, then cached). Keeps the back link so the
 * player is never stranded.
 */
export function PuzzleLoading({ title, emoji }: { title: string; emoji?: string }) {
    const { t } = useTranslation('c-daily-puzzles');
    return (
        <>
            <Link
                to="/daily"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                {t('back-to-daily-puzzles', { defaultValue: 'Back to Daily Puzzles' })}
            </Link>
            <div className="flex flex-col items-center justify-center py-20 text-center">
                {emoji && <div className="mb-3 text-4xl">{emoji}</div>}
                <Loader2 className="mb-3 h-6 w-6 animate-spin text-site-accent" aria-hidden />
                <p className="font-medium text-site-text">{title}</p>
                <p className="mt-1 text-sm text-site-text-muted">
                    {t('loading-puzzle', { defaultValue: "Preparing today's puzzle…" })}
                </p>
            </div>
        </>
    );
}
