'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge } from 'lucide-react';
import { formatMicroDigits } from '@/lib/kaikai-debt/debt';
import {
  CREDIT_DECADE_PENALTY,
  CREDIT_SCORE_MAX,
  CREDIT_SCORE_MIN,
  creditBand,
  creditPointsPerYear,
  creditScoreDecimals,
  formatCreditScore,
  projectCreditScore,
  type CreditTier,
} from '@/lib/kaikai-debt/credit';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** Repaint cadence, in ms — the same ~14×/second the debt odometer runs at. */
const PAINT_INTERVAL_MS = 70;

/** Reduced motion: still falling, just not strobing. */
const REDUCED_INTERVAL_MS = 1_000;

/** How often the band and the rate are re-derived. They are prose; once a second is plenty. */
const SLOW_INTERVAL_MS = 1_000;

/**
 * RMH Capital's live credit rating on Kaikai.
 *
 * The second live number on the page, and built the same way as the first
 * (`DebtCounter`) for the same reasons — the long-form versions of which are in
 * that file's header, so only what differs is written out here:
 *
 *  - The digits are written to a ref with `textContent` on an interval rather
 *    than held in state, because fourteen React renders a second on a page with
 *    an infinite list under it is a main thread that never gets a quiet moment.
 *  - The loop runs only while the readout is on screen **and** the tab is in the
 *    foreground, and repaints immediately on resume, so a rating scrolled back
 *    into view is never briefly stale.
 *  - The first paint is computed from `asOfMs` — the server's own clock, handed
 *    down as a prop — so SSR and the hydrating client produce the same string by
 *    construction.
 *
 * What is genuinely different is the **direction and the speed**. The counter
 * accelerates; this falls, at a near-constant ~33 points a year, which is far
 * too slow to see in the whole-point digits. That is why the fractional tail is
 * not decoration here the way it is on a counter that visibly races: it is the
 * only part that moves at human timescales, and without it the reader would be
 * looking at a rating they had no reason to believe was live at all.
 *
 * The band and the rate ride React state rather than a ref, because both are
 * wrapped in translated strings — but they are re-derived once a second, not
 * fourteen times, so the component renders about as often as a clock.
 */
export function CreditScore({ basisCents, asOfMs }: { basisCents: number; asOfMs: number }) {
  const { t } = useTranslation('c-kaikai-debt');
  const reducedMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<HTMLSpanElement>(null);
  const microRef = useRef<HTMLSpanElement>(null);

  // Read inside the effect rather than as a dependency, so an SSE event that
  // moves the basis does not tear down and restart the loop.
  const basisRef = useRef(basisCents);
  basisRef.current = basisCents;

  const initial = projectCreditScore(basisCents, asOfMs);

  /**
   * Everything the prose needs, re-derived once a second.
   *
   * One object rather than three pieces of state, because the three are read
   * together to pick which sentence to render and a torn combination — a rate of
   * zero beside a grade that is still falling — would print a contradiction.
   * Seeded from `asOfMs` so the first paint matches the server's.
   */
  const [readout, setReadout] = useState(() => describe(basisCents, asOfMs));

  useEffect(() => {
    const container = containerRef.current;
    let interval: ReturnType<typeof setInterval> | null = null;
    let lastSlowAt = 0;
    let onScreen = true;

    const paint = () => {
      const now = Date.now();
      const basis = basisRef.current;
      const score = projectCreditScore(basis, now);

      if (pointsRef.current) pointsRef.current.textContent = formatCreditScore(score);
      if (microRef.current) {
        microRef.current.textContent = formatMicroDigits(score, creditScoreDecimals(basis, now));
      }

      if (now - lastSlowAt > SLOW_INTERVAL_MS) {
        lastSlowAt = now;
        setReadout(describe(basis, now));
      }
    };

    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    const start = () => {
      if (interval) return;
      paint();
      interval = setInterval(paint, reducedMotion ? REDUCED_INTERVAL_MS : PAINT_INTERVAL_MS);
    };

    const sync = () => {
      if (onScreen && document.visibilityState === 'visible') start();
      else stop();
    };

    let observer: IntersectionObserver | null = null;
    if (container && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((records) => {
        onScreen = records.some((r) => r.isIntersecting);
        sync();
      });
      observer.observe(container);
    }

    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [reducedMotion]);

  return (
    <section
      ref={containerRef}
      className="glass-pane flex flex-col gap-3 rounded-site p-4"
      aria-labelledby="kd-credit-title"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="kd-credit-title"
          className="site-kicker flex items-center gap-2 text-site-text-muted"
        >
          <Gauge className="size-4" aria-hidden />
          {t('credit.kicker', { defaultValue: 'RMH Capital credit score' })}
        </h2>
        <p className="text-sm text-site-text-muted">
          {t('credit.help', {
            defaultValue:
              'The desks below rate him off the balance above. Every tenfold increase in what he owes costs {{points}} points, so the rating falls at a steady clip for as long as the counter climbs.',
            points: CREDIT_DECADE_PENALTY,
          })}
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* One live region for the readout, and `off` rather than `polite`: a
            value repainting fourteen times a second would flood a screen reader
            with an unusable stream of digits. The summary below carries the same
            information at a readable cadence. */}
        <p
          className="kd-credit-score font-display text-[clamp(1.9rem,7vw,3.25rem)] leading-none font-bold text-site-text"
          aria-live="off"
        >
          <span ref={pointsRef}>{formatCreditScore(initial)}</span>
          <span className="kd-credit-score__micro align-super" ref={microRef} aria-hidden>
            {formatMicroDigits(initial, creditScoreDecimals(basisCents, asOfMs))}
          </span>
        </p>

        <span className="kd-credit-grade font-display text-xl font-semibold" aria-hidden>
          {readout.grade}
        </span>

        <span className="text-sm text-site-text-muted">
          {tierLabel(readout.tier, t)}
          {' · '}
          {t('credit.outOf', {
            defaultValue: 'out of {{max}}',
            max: CREDIT_SCORE_MAX,
          })}
        </span>
      </div>

      <p className="text-sm text-site-text-muted">
        {readout.state === 'clean' &&
          t('credit.clean', {
            defaultValue:
              'Nothing on the books, so nothing to hold against him. The rating starts falling the moment somebody logs something.',
          })}
        {readout.state === 'pinned' &&
          t('credit.pinned', {
            defaultValue: 'He has bottomed out at {{min}}. There is no lower rating to give him.',
            min: CREDIT_SCORE_MIN,
          })}
        {readout.state === 'falling' &&
          t('credit.rate', {
            defaultValue: '−{{points}} points a year at the current rate',
            points: readout.pointsPerYear.toFixed(1),
          })}
      </p>

      <p className="sr-only">
        {t('credit.screenReader', {
          defaultValue:
            'RMH Capital rates Kaikai at approximately {{score}} out of {{max}}, a {{grade}} credit. The figure updates continuously.',
          score: formatCreditScore(readout.score),
          max: CREDIT_SCORE_MAX,
          grade: readout.grade,
        })}
      </p>
    </section>
  );
}

/**
 * The rating as prose needs it: the score, its band, the rate, and which of the
 * three sentences applies.
 *
 * The state is derived rather than passed in, because the two edge cases are
 * both *rates of zero* that mean opposite things — a clean borrower with nothing
 * accruing, and a bottomed-out one whose score has stopped only because it hit
 * the floor. Rendering the rate sentence for either prints "−0.0 points a year",
 * which reads as a broken readout in the first case and as a reprieve he has
 * not earned in the second.
 */
function describe(basisCents: number, atMs: number) {
  const score = projectCreditScore(basisCents, atMs);
  const pointsPerYear = creditPointsPerYear(basisCents, atMs);
  const state =
    score >= CREDIT_SCORE_MAX ? 'clean' : score <= CREDIT_SCORE_MIN ? 'pinned' : 'falling';
  return { score, pointsPerYear, state, ...creditBand(score) } as const;
}

/**
 * The band descriptor.
 *
 * A lookup rather than an interpolated `{{tier}}` key, for the reason spelled
 * out on the counter's `unitLabel`: interpolating an English noun into a
 * translated sentence leaves the noun in English in all sixteen locales. The
 * letter grade beside it is deliberately not translated — see `CREDIT_BANDS`.
 */
function tierLabel(tier: CreditTier, t: ReturnType<typeof useTranslation>['t']): string {
  switch (tier) {
    case 'prime':
      return t('credit.tier.prime', { defaultValue: 'Prime' });
    case 'investment':
      return t('credit.tier.investment', { defaultValue: 'Lower investment grade' });
    case 'speculative':
      return t('credit.tier.speculative', { defaultValue: 'Speculative' });
    case 'distressed':
      return t('credit.tier.distressed', { defaultValue: 'Substantial risk' });
    default:
      return t('credit.tier.default', { defaultValue: 'In default' });
  }
}
