'use client';

/**
 * The live credit score viewer.
 *
 * A gauge, a number that will not hold still, a rolling chart of the last few
 * minutes, and the five factors underneath it. The model is
 * `lib/kaikai-debt/credit.ts`; this file draws it and gives you the controls.
 *
 * ## Two things it does that a normal live readout cannot
 *
 * **The history is complete on the first frame.** The score is a pure function
 * of the clock, so the chart does not accumulate samples — it *evaluates* the
 * last minute (or hour) on mount and draws all of it immediately. Switching the
 * window is the same call with different bounds, not a longer buffer, so the
 * one-hour view is populated the instant you ask for it rather than in an hour.
 *
 * **Scrubbing is exact.** Hovering the chart does not interpolate between stored
 * points; it evaluates the model at the timestamp under the pointer. What you
 * read off the tooltip is the score, not the nearest sample to it.
 *
 * ## Why the fast parts write to the DOM directly
 *
 * The score repaints ~14 times a second, forever, and so does the needle and so
 * does the line. Holding any of it in React state would reconcile this subtree
 * fourteen times a second on a page that also has an infinite log on it. So the
 * interval writes `textContent` on two nodes, one `transform` on the needle and
 * one `d` on the path — four writes, no renders — exactly the trade `DebtCounter`
 * makes for the odometer, and for the same reason. The factor bars and the
 * volatility statistics *are* React state, because they move slowly enough for
 * that to be free.
 *
 * The loop is an interval rather than an animation frame, deliberately: this
 * writes text and one path attribute, gains nothing from frame alignment, and at
 * 60fps would do four times the work for digits already too fast to read.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Activity, Pause, Play, Zap } from 'lucide-react';
import {
  CREDIT_MAX,
  CREDIT_MIN,
  CREDIT_REDUCED_TICK_MS,
  CREDIT_TICK_MS,
  CREDIT_WINDOWS,
  creditBand,
  creditFactors,
  creditScoreAt,
  creditStats,
  sampleCredit,
  type CreditFactor,
  type CreditInputs,
} from '@/lib/kaikai-debt/credit';
import { formatShare, linearScale, linePath } from '@/lib/kaikai-debt/stats';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Slider } from '@/components/ui/slider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { ChartToggle, Readout, ReadoutRow, makePlot, pointerInViewBox } from './chart-kit';
import { BAND_SERIES, CreditDial, bandLabel } from './CreditDial';

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The rolling chart's plot box. The DIAL's geometry is not here — it moved to
 * `CreditDial`, which is the one component that draws a credit score on this
 * site (the hero renders the same one, smaller).
 */
const SPARK = makePlot(720, 180, { left: 44, right: 10, top: 12, bottom: 20 });
/** Samples across the rolling chart. One per ~3px at full width. */
const SPARK_SAMPLES = 240;

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

function factorLabel(id: CreditFactor['id'], t: TFunction): string {
  switch (id) {
    case 'payment':
      return t('credit.factor.payment', { defaultValue: 'Payment history' });
    case 'utilization':
      return t('credit.factor.utilization', { defaultValue: 'Utilisation' });
    case 'age':
      return t('credit.factor.age', { defaultValue: 'Length of history' });
    case 'mix':
      return t('credit.factor.mix', { defaultValue: 'Credit mix' });
    default:
      return t('credit.factor.inquiries', { defaultValue: 'New accounts' });
  }
}

function factorValue(factor: CreditFactor, t: TFunction): string {
  switch (factor.id) {
    case 'payment':
      return t('credit.value.payment', { defaultValue: 'never, not once' });
    case 'utilization':
      return t('credit.value.utilization', {
        defaultValue: '{{percent}} of a $500 limit',
        percent: formatShare(factor.value),
      });
    case 'age':
      return t('credit.value.age', {
        defaultValue: '{{years}} years on file',
        years: factor.value.toFixed(1),
      });
    case 'mix':
      return t('credit.value.mix', {
        defaultValue: '{{count}} of 8 kinds of debt',
        count: Math.round(factor.value),
      });
    default:
      return t('credit.value.inquiries', {
        defaultValue: '{{count}} opened in his name',
        count: Math.round(factor.value),
      });
  }
}

/* -------------------------------------------------------------------------- */
/* The viewer                                                                 */
/* -------------------------------------------------------------------------- */

interface CreditScoreProps {
  inputs: CreditInputs;
  /** The server's clock. The first paint uses exactly this — see the header. */
  asOfMs: number;
}

export function CreditScore({ inputs, asOfMs }: CreditScoreProps) {
  const { t } = useTranslation('c-kaikai-debt');
  const reduced = useReducedMotion();

  const [windowMs, setWindowMs] = useState<number>(CREDIT_WINDOWS[1]);
  const [paused, setPaused] = useState(false);
  const [volatility, setVolatility] = useState(1);
  const [scrub, setScrub] = useState<{ atMs: number; score: number } | null>(null);

  // Slow-moving state. Updated once a second, so it can afford to be React.
  const [summary, setSummary] = useState(() => {
    const samples = sampleCredit(inputs, asOfMs - CREDIT_WINDOWS[1], asOfMs, SPARK_SAMPLES);
    return {
      atMs: asOfMs,
      score: creditScoreAt(inputs, asOfMs),
      stats: creditStats(samples),
      factors: creditFactors(inputs, asOfMs),
    };
  });

  const lineRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);

  // The loop reads these rather than being torn down and restarted whenever a
  // control moves — a restarting interval drops a frame every time you touch a
  // slider, which on a slider that controls the volatility is exactly when you
  // are watching most closely.
  const optionsRef = useRef({ inputs, windowMs, paused, volatility });
  optionsRef.current = { inputs, windowMs, paused, volatility };

  /** The chart's y scale. Fixed to the full 300–850 range, never auto-fitted. */
  const y = useMemo(
    () => linearScale(CREDIT_MIN, CREDIT_MAX, SPARK.innerBottom, SPARK.innerTop),
    [],
  );

  /**
   * Evaluate the window and turn it into the two path strings.
   *
   * Returns the paths rather than setting them, so the same function serves the
   * interval (which writes them to the DOM) and the first render (which needs
   * them as JSX attributes for SSR).
   */
  const buildPaths = useCallback(
    (atMs: number, spanMs: number, vol: number, source: CreditInputs) => {
      const samples = sampleCredit(source, atMs - spanMs, atMs, SPARK_SAMPLES, {
        volatility: vol,
      });
      const x = linearScale(atMs - spanMs, atMs, SPARK.innerLeft, SPARK.innerRight);
      const points = samples.map((sample) => ({ x: x(sample.atMs), y: y(sample.score) }));
      const line = linePath(points);
      return {
        samples,
        line,
        // Not `areaPath`: the fill is closed to the BOTTOM OF THE SCALE (300),
        // not to the bottom of the plot box, so the shaded region means "how far
        // above rock bottom he is" rather than "how far up the picture".
        area: `${line}L${SPARK.innerRight.toFixed(2)} ${y(CREDIT_MIN).toFixed(2)}L${SPARK.innerLeft.toFixed(2)} ${y(CREDIT_MIN).toFixed(2)}Z`,
      };
    },
    [y],
  );

  // First paint: the server's instant, so SSR and hydration produce identical
  // markup. Nothing here reads `Date.now()`.
  const initial = useMemo(
    () => ({
      score: creditScoreAt(inputs, asOfMs),
      ...buildPaths(asOfMs, CREDIT_WINDOWS[1], 1, inputs),
    }),
    [inputs, asOfMs, buildPaths],
  );

  useEffect(() => {
    const period = reduced ? CREDIT_REDUCED_TICK_MS : CREDIT_TICK_MS;
    let interval: ReturnType<typeof setInterval> | null = null;
    let lastSummaryAt = 0;
    let onScreen = true;

    const paint = () => {
      const options = optionsRef.current;
      if (options.paused) return;
      const now = Date.now();
      const paths = buildPaths(now, options.windowMs, options.volatility, options.inputs);
      lineRef.current?.setAttribute('d', paths.line);
      areaRef.current?.setAttribute('d', paths.area);

      // The prose under the chart moves once a second — it is read, not watched.
      // The DIAL is not driven from here at all: it owns its own interval and
      // writes its own needle, digits and band (see `CreditDial`), which is what
      // keeps one component responsible for one number.
      if (now - lastSummaryAt > 1_000) {
        lastSummaryAt = now;
        setSummary({
          atMs: now,
          score: creditScoreAt(options.inputs, now, { volatility: options.volatility }),
          stats: creditStats(paths.samples),
          factors: creditFactors(options.inputs, now),
        });
      }
    };

    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const start = () => {
      if (interval) return;
      paint();
      interval = setInterval(paint, period);
    };
    /** Live only while on screen, in a foreground tab, and not paused. */
    const sync = () => {
      if (onScreen && document.visibilityState === 'visible' && !optionsRef.current.paused) start();
      else stop();
    };

    let observer: IntersectionObserver | null = null;
    const host = lineRef.current;
    if (host && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((records) => {
        onScreen = records.some((record) => record.isIntersecting);
        sync();
      });
      observer.observe(host);
    }

    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
    // `paused` is a dependency so pausing tears the interval down rather than
    // leaving it spinning on a no-op — a paused readout should cost nothing.
  }, [reduced, paused, inputs, asOfMs, buildPaths]);

  // The chart's ink follows the band of the once-a-second summary, not of the
  // instantaneous score: a line that changed colour fourteen times a second
  // would be a strobe, and unlike the digits it is a shape you read over time.
  const band = creditBand(summary.score);

  return (
    <section className="glass-pane flex flex-col gap-4 rounded-site p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-display text-base font-semibold text-site-text">
            {t('credit.title', { defaultValue: 'Live credit score' })}
          </h3>
          <p className="max-w-prose text-xs text-pretty text-site-text-muted">
            {t('credit.hint', {
              defaultValue:
                'Recomputed continuously from the books, and about as stable as his finances. Everyone watching sees the same number at the same instant — it is a function of the clock, not a random walk in your tab.',
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ChartToggle pressed={paused} onPressedChange={setPaused}>
            {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            {paused
              ? t('credit.resume', { defaultValue: 'Resume' })
              : t('credit.pause', { defaultValue: 'Freeze' })}
          </ChartToggle>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2">
          <CreditDial
            inputs={inputs}
            asOfMs={asOfMs}
            volatility={volatility}
            paused={paused}
            size="lg"
          />
          <p className="sr-only">
            {t('credit.screenReader', {
              defaultValue:
                'Kaikai’s credit score is approximately {{score}}, rated {{band}}. It has moved between {{min}} and {{max}} over the last window. The figure updates continuously.',
              score: Math.round(summary.score),
              band: bandLabel(band, t),
              min: Math.round(summary.stats.min),
              max: Math.round(summary.stats.max),
            })}
          </p>
        </div>

        {/* ── The tape ─────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-2">
          {/* The window strip gets its own row. A segmented control's track
              spans its container, so sharing a flex row with the stress slider
              wrapped it onto two lines and it read as a floating 2×2 box rather
              than as one control. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <LiquidTabs
              size="sm"
              className="w-full sm:w-64"
              value={String(windowMs)}
              onChange={(id) => setWindowMs(Number(id))}
              aria-label={t('credit.windowLabel', { defaultValue: 'How much history to show' })}
              tabs={CREDIT_WINDOWS.map((ms) => ({
                id: String(ms),
                label:
                  ms < 3_600_000
                    ? t('credit.windowMinutes', {
                        defaultValue: '{{count}}m',
                        count: Math.round(ms / 60_000),
                      })
                    : t('credit.windowHour', { defaultValue: '1h' }),
              }))}
            />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <label htmlFor="kd-credit-volatility" className="shrink-0 text-xs text-site-text-muted">
                <Zap className="mr-1 inline size-3.5" aria-hidden />
                {t('credit.stress', { defaultValue: 'Stress test' })}
              </label>
              {/* This scales the MODEL, not the drawing: waves, noise and shocks
                  are all multiplied, so what you see at 3× is the same process
                  with three times the amplitude — not a zoomed-in picture. */}
              <Slider
                id="kd-credit-volatility"
                min={0}
                max={300}
                step={5}
                value={[volatility * 100]}
                onValueChange={([next]) => setVolatility((next ?? 100) / 100)}
                aria-label={t('credit.stress', { defaultValue: 'Stress test' })}
              />
              <span className="w-9 shrink-0 text-right text-xs text-site-text-muted tabular-nums">
                {volatility.toFixed(1)}×
              </span>
            </div>
          </div>

          <div className="relative">
            <svg
              viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
              className="kd-chart"
              role="img"
              onPointerMove={(event) => {
                const point = pointerInViewBox(event, SPARK);
                if (point.x < SPARK.innerLeft || point.x > SPARK.innerRight) {
                  setScrub(null);
                  return;
                }
                // Exact, not interpolated: the model is evaluated at the instant
                // under the pointer. A tooltip that reported the nearest stored
                // sample would be wrong by up to a whole shock.
                const options = optionsRef.current;
                const end = summary.atMs;
                const atMs =
                  end -
                  options.windowMs *
                    (1 - (point.x - SPARK.innerLeft) / SPARK.innerWidth);
                setScrub({
                  atMs,
                  score: creditScoreAt(options.inputs, atMs, { volatility: options.volatility }),
                });
              }}
              onPointerLeave={() => setScrub(null)}
            >
              <title>{t('credit.chartTitle', { defaultValue: 'Credit score, recently' })}</title>
              <desc>
                {t('credit.chartDesc', {
                  defaultValue: 'A line chart of the credit score over the selected time window.',
                })}
              </desc>
              {[CREDIT_MIN, 480, 580, 670, 800, CREDIT_MAX].map((value) => (
                <g key={value}>
                  <line
                    className="kd-chart__grid"
                    x1={SPARK.innerLeft}
                    x2={SPARK.innerRight}
                    y1={y(value)}
                    y2={y(value)}
                  />
                  <text
                    className="kd-chart__label"
                    x={SPARK.innerLeft - 8}
                    y={y(value)}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {value}
                  </text>
                </g>
              ))}
              <g className={`kd-series-${BAND_SERIES[band]}`}>
                <path ref={areaRef} className="kd-chart__area" d={initial.area} />
                <path ref={lineRef} className="kd-chart__line" d={initial.line} />
              </g>
              {scrub && (
                <line
                  className="kd-chart__crosshair"
                  x1={
                    SPARK.innerLeft +
                    SPARK.innerWidth * (1 - (summary.atMs - scrub.atMs) / windowMs)
                  }
                  x2={
                    SPARK.innerLeft +
                    SPARK.innerWidth * (1 - (summary.atMs - scrub.atMs) / windowMs)
                  }
                  y1={SPARK.innerTop}
                  y2={SPARK.innerBottom}
                />
              )}
            </svg>
            {scrub && (
              <Readout
                x={(SPARK.innerLeft + SPARK.innerWidth * (1 - (summary.atMs - scrub.atMs) / windowMs)) / SPARK.width}
                y={y(scrub.score) / SPARK.height}
              >
                <ReadoutRow
                  label={t('credit.readoutScore', { defaultValue: 'Score' })}
                  value={String(Math.round(scrub.score))}
                />
                <ReadoutRow
                  label={t('credit.readoutAgo', { defaultValue: 'Seconds ago' })}
                  value={Math.round((summary.atMs - scrub.atMs) / 1000).toLocaleString('en-US')}
                />
              </Readout>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini
              label={t('credit.stat.low', { defaultValue: 'Window low' })}
              value={String(Math.round(summary.stats.min))}
            />
            <Mini
              label={t('credit.stat.high', { defaultValue: 'Window high' })}
              value={String(Math.round(summary.stats.max))}
            />
            <Mini
              label={t('credit.stat.mean', { defaultValue: 'Mean' })}
              value={String(Math.round(summary.stats.mean))}
            />
            <Mini
              label={t('credit.stat.sigma', { defaultValue: 'Volatility (σ)' })}
              value={summary.stats.stdev.toFixed(1)}
            />
          </dl>
        </div>
      </div>

      {/* ── The factors ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-site-text-muted">
          <Activity className="size-3.5" aria-hidden />
          {t('credit.factors', { defaultValue: 'What is dragging it down' })}
        </h4>
        <ul className="flex flex-col gap-2">
          {summary.factors.map((factor) => (
            <li key={factor.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                <span className="text-site-text">
                  {factorLabel(factor.id, t)}{' '}
                  <span className="text-site-text-muted">{formatShare(factor.weight)}</span>
                </span>
                <span className="text-site-text-muted">{factorValue(factor, t)}</span>
                <span className="shrink-0 font-medium text-site-text tabular-nums">
                  {t('credit.penalty', {
                    defaultValue: '−{{points}} pts',
                    points: Math.round(factor.penaltyPoints),
                  })}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-site-surface-active" aria-hidden>
                <div
                  className={cn(
                    'h-full rounded-full bg-current transition-[width] duration-site',
                    `kd-series-${factor.health > 0.5 ? 2 : factor.health > 0.2 ? 4 : 7}`,
                  )}
                  style={{ width: `${Math.max(1.5, factor.health * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-pretty text-site-text-muted">
          {t('credit.utilisationNote', {
            defaultValue:
              'Utilisation is measured against a notional $500 limit — a limit large enough for the ratio to ever fall under 100% is a limit nobody would extend to this borrower. Payment history is not an estimate: there is no repayment path in this system at all, so “never” is the literal state of the data.',
          })}
        </p>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-fill flex flex-col gap-0.5 rounded-site-sm px-2.5 py-2">
      <dt className="text-xs text-site-text-muted">{label}</dt>
      <dd className="font-display text-sm font-semibold text-site-text tabular-nums">{value}</dd>
    </div>
  );
}
