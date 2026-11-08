'use client';

/**
 * StreakChip — the learner's daily streak, from the site-wide streak
 * (`useStreak`; the same count the feed shows). Reserves its size while the
 * streak loads so the header does not jump.
 */

import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStreak } from '@/lib/useStreak';

export function StreakChip() {
  const { t } = useTranslation('c-rmhmusic');
  // The route is behind the auth gate, so there is always a signed-in learner.
  const streak = useStreak(true);

  if (!streak) {
    return <div className="app-skeleton h-9 w-28" aria-hidden="true" />;
  }

  const days = streak.current;
  return (
    <p className="flex min-h-9 items-center gap-1.5 glass-fill rounded-(--app-radius-sm) px-3 text-sm font-medium text-(--app-text)">
      <Flame className="h-4 w-4 shrink-0 text-(--app-warning)" aria-hidden="true" />
      {days > 0
        ? t('streak-days', {
            count: days,
            defaultValue: '{{count}} day streak',
          })
        : t('streak-none', { defaultValue: 'No streak yet' })}
    </p>
  );
}
