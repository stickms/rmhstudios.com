'use client';

/**
 * StreakChip — the learner's daily streak, from the site-wide streak (`useStreak`; the same
 * count the feed shows), as a compact flame and number with the full sentence for screen
 * readers. Its box is a fixed size in every state — loading, loaded, or given up — so the header
 * never moves. If the streak has not arrived after {@link GIVE_UP_MS} (the request failed: the
 * hook does not say so), the pulse stops and a quiet dash takes its place.
 */

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStreak } from '@/lib/useStreak';

const GIVE_UP_MS = 8000;
const BOX = 'inline-flex h-11 w-20 shrink-0 items-center justify-center gap-1.5';

export function StreakChip() {
  const { t } = useTranslation('c-rmhmusic');
  // The route is behind the auth gate, so there is always a signed-in learner.
  const streak = useStreak(true);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (streak) return;
    const timer = setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [streak]);

  if (!streak && !gaveUp) {
    return <span className={`${BOX} app-skeleton`} aria-hidden="true" />;
  }

  const days = streak?.current ?? 0;
  const sentence = !streak
    ? t('streak-unavailable', { defaultValue: 'Streak unavailable' })
    : days > 0
      ? t('streak-days', { count: days, defaultValue: '{{count}} day streak' })
      : t('streak-none', { defaultValue: 'No streak yet' });

  return (
    <p
      className={`${BOX} rmm-sheet rounded-(--app-radius-sm) text-sm font-semibold text-(--app-text)`}
      title={sentence}
    >
      <Flame
        className={`h-4 w-4 shrink-0 ${streak ? 'text-(--app-warning)' : 'text-(--app-text-dim)'}`}
        aria-hidden="true"
      />
      <span aria-hidden="true" className="tabular-nums">
        {streak ? days : '—'}
      </span>
      <span className="sr-only">{sentence}</span>
    </p>
  );
}
