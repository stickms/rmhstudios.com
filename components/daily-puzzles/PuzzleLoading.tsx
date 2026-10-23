'use client';

import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { PuzzleBackLink } from '@/components/daily-puzzles/PuzzleShell';

/**
 * Loading state shown while a daily puzzle is fetched from the server
 * (generated on the fly for the day, then cached). Keeps the back link so the
 * player is never stranded.
 */
export function PuzzleLoading({ title, emoji }: { title: string; emoji?: string }) {
    const { t } = useTranslation('c-daily-puzzles');
    return (
        <>
            <PuzzleBackLink />
            <div role="status" className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                {emoji && (
                    <div aria-hidden className="text-4xl">
                        {emoji}
                    </div>
                )}
                <Spinner size={24} />
                <p className="font-medium text-site-text">{title}</p>
                <p className="text-sm text-site-text-muted">
                    {t('loading-puzzle', { defaultValue: "Preparing today's puzzle…" })}
                </p>
            </div>
        </>
    );
}
