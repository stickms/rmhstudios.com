'use client';

/**
 * The shared "betting closes in Ns" countdown used by every live-table casino
 * game (baccarat, blackjack, roulette).
 *
 * All three had a byte-identical `useEffect` ticking a local second counter and
 * a byte-identical block of JSX rendering it. Keeping three copies meant a fix
 * to the tick logic — or a change to the low-time threshold — had to land three
 * times or the tables would visibly disagree with each other.
 *
 * The `t()` call stays on the `c-rmhcoins` namespace so the already-shipped
 * `betting-closes-in` key keeps resolving in all 16 locales.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Seconds remaining at which the timer turns red and pulses. */
const LOW_TIME_SECONDS = 5;

/**
 * Mirror the server's betting countdown into a locally-ticking second counter.
 *
 * Returns `null` whenever the table is not in its betting phase, which is also
 * the signal for `<BettingCountdown>` to render nothing.
 */
export function useBettingCountdown(
  tablePhase: string,
  bettingCountdown: number | null,
): number | null {
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (tablePhase !== 'betting' || bettingCountdown === null) {
      setCountdown(null);
      return;
    }
    setCountdown(bettingCountdown);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [tablePhase, bettingCountdown]);

  return countdown;
}

/** Renders the countdown line; nothing at all when betting isn't open. */
export function BettingCountdown({ countdown }: { countdown: number | null }) {
  const { t } = useTranslation('c-rmhcoins');
  if (countdown === null) return null;
  const isLow = countdown <= LOW_TIME_SECONDS;

  return (
    <div className="text-center">
      <span className="text-sm text-site-text-dim">
        {t('betting-closes-in', { defaultValue: 'Betting closes in ' })}
      </span>
      <span
        className={`font-bold text-lg tabular-nums ${isLow ? 'text-site-danger animate-pulse' : 'text-site-accent'}`}
      >
        {countdown}s
      </span>
    </div>
  );
}
