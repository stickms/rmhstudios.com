'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Receipt, TrendingUp } from 'lucide-react';
import {
  ANNUAL_INTEREST_RATE,
  describeVelocity,
  formatDebt,
  formatMicroDigits,
  odometerDecimals,
  projectDebtCents,
  type VelocityUnit,
} from '@/lib/kaikai-debt/debt';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The growth window, translated.
 *
 * A lookup rather than an interpolated `{{unit}}` catalog key, because the four
 * words have to exist as their own keys for a translator to ever see them —
 * interpolating an English noun into a translated sentence leaves "every second"
 * in English in all sixteen locales.
 */
function unitLabel(unit: VelocityUnit, t: TFunction): string {
  switch (unit) {
    case 'minute':
      return t('counter.unit.minute', { defaultValue: 'minute' });
    case 'hour':
      return t('counter.unit.hour', { defaultValue: 'hour' });
    case 'day':
      return t('counter.unit.day', { defaultValue: 'day' });
    default:
      return t('counter.unit.second', { defaultValue: 'second' });
  }
}

interface DebtCounterProps {
  /** The scalar the projection is evaluated against. Updated by SSE, never per frame. */
  basisCents: number;
  /** The server's clock when `basisCents` was read. The first paint uses this exactly. */
  asOfMs: number;
}

/**
 * How often the digits are repainted, in ms. ~14×/second.
 *
 * Deliberately a timer and NOT an animation-frame loop. rAF exists to align work
 * with the compositor's frame budget, which is what you want for a transform;
 * this writes a text node, gains nothing from frame alignment, and at 60fps
 * would do four times the work for a digit that is already too fast to read.
 * It also keeps this file out of `lib/__tests__/raf-loop-allowlist.test.ts` (the
 * §17.3 "animations always end" gate) honestly rather than by exemption: a
 * counter is the one animation that genuinely never settles, so the right answer
 * was to stop using the mechanism reserved for ones that do.
 *
 * (That gate greps for the API name as a plain substring, comments included, so
 * the identifier is spelled out nowhere in this file.)
 */
const PAINT_INTERVAL_MS = 70;

/** Reduced motion: still advancing, just not strobing. */
const REDUCED_INTERVAL_MS = 1_000;

/**
 * The odometer.
 *
 * ## Why it does not hold the number in state
 *
 * Fourteen React renders a second, forever, on a page with an infinite list
 * under it, is a main thread that never gets a quiet moment — and every one of
 * those renders would reconcile the entire subtree to change one text node. So
 * the loop writes `textContent` on two refs directly and the component renders
 * once. This is the rare case where reaching past React is the right call: the
 * value is derived, not owned; nothing else reads it; and it changes faster than
 * any reconciliation could usefully track.
 *
 * ## Why it stops
 *
 * The loop runs only while the counter is **on screen in a foreground tab**.
 * That is not a micro-optimisation on this page: it is an infinite scroll, so
 * within a few seconds of arriving the reader has the odometer somewhere far
 * above them and is looking at the log. Ticking a number nobody can see — or
 * one in a background tab, where timers are throttled into bursts anyway — is
 * pure waste. Each resume repaints immediately, so a counter scrolled back into
 * view is never briefly stale: the value is a pure function of the clock, and
 * nothing about it needs to have been running to be correct.
 *
 * ## Hydration
 *
 * The first paint renders `projectDebtCents(basis, asOfMs)` — the server's own
 * clock, passed down as a prop — so SSR and the hydrating client produce the
 * same string by construction. `Date.now()` only enters after mount. Computing
 * the initial value from the client clock instead would differ from the server's
 * by however long the response took, which React 19 treats as a failed
 * hydration and repays by re-rendering the whole tree.
 *
 * ## Reduced motion
 *
 * The counter still advances — a debt clock that does not is broken, not calm —
 * but on a 1s interval rather than every frame, and without the blur-fast
 * fractional digits. The information stays; the strobing goes.
 */
export function DebtCounter({ basisCents, asOfMs }: DebtCounterProps) {
  const { t } = useTranslation('c-kaikai-debt');
  const reducedMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const dollarsRef = useRef<HTMLSpanElement>(null);
  const microRef = useRef<HTMLSpanElement>(null);

  // Read inside the effect rather than as a dependency: the loop should pick up
  // a new basis without being torn down and restarted on every SSE event.
  const basisRef = useRef(basisCents);
  basisRef.current = basisCents;

  const initial = projectDebtCents(basisCents, asOfMs);
  const [velocity, setVelocity] = useState(() => describeVelocity(basisCents, asOfMs));

  useEffect(() => {
    const container = containerRef.current;
    let interval: ReturnType<typeof setInterval> | null = null;
    let lastVelocityAt = 0;
    let onScreen = true;

    const paint = () => {
      const now = Date.now();
      const cents = projectDebtCents(basisRef.current, now);
      const whole = Math.floor(cents);

      if (dollarsRef.current) dollarsRef.current.textContent = formatDebt(whole);
      if (microRef.current) {
        // The sub-cent remainder — the part that is genuinely too fast to read,
        // which is what makes the number look alive rather than merely large.
        // How many digits is derived from the total, not fixed: with no opening
        // balance the counter has to be legible at $12 and at $2M, and the
        // growth rate differs by five orders of magnitude between them.
        microRef.current.textContent = formatMicroDigits(cents, odometerDecimals(cents));
      }

      // The velocity readout is prose, not an odometer. Once a second is plenty,
      // and it goes through state because it is rendered with a translated
      // string around it.
      if (now - lastVelocityAt > 1_000) {
        lastVelocityAt = now;
        setVelocity(describeVelocity(basisRef.current, now));
      }
    };

    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    const start = () => {
      if (interval) return;
      // Repaint on the way in, so a counter coming back into view is correct
      // before the first tick rather than one interval later.
      paint();
      interval = setInterval(paint, reducedMotion ? REDUCED_INTERVAL_MS : PAINT_INTERVAL_MS);
    };

    /** Run only when the odometer is both visible and in a foreground tab. */
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
    <div ref={containerRef} className="relative flex flex-col items-center gap-3 py-6 text-center">
      <p className="site-kicker flex items-center gap-2 text-site-text-muted">
        <Receipt className="size-4" aria-hidden />
        {t('counter.kicker', { defaultValue: 'Kaikai currently owes' })}
      </p>

      {/* One live region for the whole readout, and `off` rather than `polite`:
          a value that changes eight times a second would otherwise flood a
          screen reader with an unusable stream of numbers. The accessible
          summary below carries the same information at a readable cadence. */}
      <p
        className="kd-odometer font-display text-[clamp(2.1rem,9vw,4.75rem)] leading-none font-bold text-site-text"
        aria-live="off"
      >
        <span ref={dollarsRef}>{formatDebt(Math.floor(initial))}</span>
        {!reducedMotion && (
          <span className="kd-odometer__micro align-super" ref={microRef} aria-hidden>
            {formatMicroDigits(initial, odometerDecimals(initial))}
          </span>
        )}
      </p>

      {/* `inline` rather than a flex row: as a flex item the icon is its own
          line box, so when the sentence wrapped on a phone the arrow was left
          stranded on the far left of an empty row. Inline, it wraps with the
          words it belongs to. */}
      <p className="text-center text-sm text-pretty text-site-text-muted">
        <TrendingUp className="mr-1.5 inline size-4 align-[-0.2em] text-site-accent" aria-hidden />
        {initial <= 0
          ? t('counter.clean', {
              defaultValue:
                'He owes nothing yet. Interest compounds at {{percent}}% a year on whatever gets logged.',
              percent: Math.round(ANNUAL_INTEREST_RATE * 100),
            })
          : t('counter.velocityRate', {
              defaultValue:
                '+{{rate}} every {{unit}} — {{percent}}% a year, compounded continuously',
              rate: formatDebt(velocity.cents),
              unit: unitLabel(velocity.unit, t),
              percent: Math.round(ANNUAL_INTEREST_RATE * 100),
            })}
      </p>

      <p className="sr-only">
        {initial <= 0
          ? t('counter.screenReaderClean', {
              defaultValue: 'Kaikai owes nothing yet. Nothing is accruing.',
            })
          : t('counter.screenReaderRate', {
              defaultValue:
                'Kaikai owes approximately {{amount}}, growing by {{rate}} every {{unit}}. The figure updates continuously.',
              amount: formatDebt(initial),
              rate: formatDebt(velocity.cents),
              unit: unitLabel(velocity.unit, t),
            })}
      </p>
    </div>
  );
}
