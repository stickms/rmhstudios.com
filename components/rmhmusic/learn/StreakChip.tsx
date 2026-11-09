/**
 * StreakChip — the learner's daily streak, from the site-wide streak (`useStreak`; the same
 * count the feed shows): a flame and the number, with the full sentence for screen readers, and
 * only while there is a streak. At zero, or when the streak never arrives, nothing shows: an
 * empty slot of the same size, so the header never moves. While it loads the slot pulses; if the
 * streak has not arrived after {@link GIVE_UP_MS} (the request failed: the hook does not say so),
 * the pulse stops and the slot stays empty.
 */

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStreak } from '@/lib/useStreak';

const GIVE_UP_MS = 8000;
// Wide enough for a flame and three digits.
const BOX = 'inline-flex h-11 w-16 shrink-0 items-center justify-center gap-1.5';

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
  if (days <= 0) return <span className={BOX} aria-hidden="true" />;

  const sentence = t('streak-days', { count: days, defaultValue: '{{count}} day streak' });
  return (
    <p className={`${BOX} text-sm font-semibold text-(--app-text)`} title={sentence}>
      <Flame className="h-4 w-4 shrink-0 text-(--app-warning)" aria-hidden="true" />
      <span aria-hidden="true" className="tabular-nums">
        {days}
      </span>
      <span className="sr-only">{sentence}</span>
    </p>
  );
}
