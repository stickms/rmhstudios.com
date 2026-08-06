'use client';

/**
 * The credit dial — a FICO-style half circle, and the only one on the site.
 *
 * Two surfaces draw a credit score: the hero, right under the total debt, and
 * the analytics panel's full viewer. They are the same dial at two sizes rather
 * than two dials, because a second copy of a component is this repo's most
 * common defect (design-language.md §0.3) and because a gauge that read 410 in
 * one place and 480 in another would be worse than having only one.
 *
 * ## Why a half circle
 *
 * It is the shape everybody already knows how to read: 300 on the left, 850 on
 * the right, five bands, a needle. A full ring would have to invent where the
 * scale starts and a bar would throw away the one association the form has.
 * Exactly 180° — the arc ends sit on the horizontal, so the dial's bounding box
 * is its own semicircle and it packs against the counter above it without a
 * band of dead space underneath.
 *
 * ## Why the needle and the band are written, not rendered
 *
 * The score moves ~14 times a second, forever. Every one of those updates would
 * otherwise reconcile this subtree — and on the hero, the subtree containing the
 * odometer. So the interval writes three things directly: the needle's
 * `transform`, the digits' `textContent`, and a `data-band` attribute that CSS
 * turns into the lit arc and the right one of five pre-rendered labels
 * (`.kd-band` / `.kd-dial` in kaikai-debt.css).
 *
 * That last part is not an optimisation, it is a correctness fix: the band used
 * to render from a once-a-second React summary while the digits came from the
 * interval, and the two visibly disagreed — a readout saying 410 beside a chip
 * still saying "Poor".
 */

import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  CREDIT_BANDS,
  CREDIT_MAX,
  CREDIT_MIN,
  CREDIT_REDUCED_TICK_MS,
  CREDIT_TICK_MS,
  bandTrack,
  creditBand,
  creditScoreAt,
  type CreditBand,
  type CreditInputs,
} from '@/lib/kaikai-debt/credit';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The dial's own coordinate system. A 200×112 box holding a semicircle of
 * radius 84 centred on (100, 96) — the centre sits below the box's bottom edge
 * by the stroke's half-width so the arc's ends are not clipped.
 */
const DIAL = { width: 200, height: 124, cx: 100, cy: 100, radius: 82, thickness: 14 } as const;

/** 180°, opening upward: 300 at due west, 850 at due east. */
const START_DEG = 180;
const SWEEP_DEG = 180;

const angleFor = (score: number): number =>
  START_DEG + ((score - CREDIT_MIN) / (CREDIT_MAX - CREDIT_MIN)) * SWEEP_DEG;

function onDial(angleDeg: number, radius: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: DIAL.cx + Math.cos(a) * radius, y: DIAL.cy + Math.sin(a) * radius };
}

/**
 * One band's arc.
 *
 * A 1° inset at each end is the 2px surface gap the mark spec asks for between
 * adjacent fills — without it the five bands read as one continuous ramp and
 * the boundaries a viewer is meant to locate ("am I in 'poor' or 'fair'?")
 * disappear.
 */
function bandArc(fromScore: number, toScore: number, radius: number): string {
  const a0 = angleFor(fromScore) + 1;
  const a1 = angleFor(toScore) - 1;
  const p0 = onDial(a0, radius);
  const p1 = onDial(a1, radius);
  return `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)}A${radius} ${radius} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

export function bandLabel(band: CreditBand, t: TFunction): string {
  switch (band) {
    case 'exceptional':
      return t('credit.band.exceptional', { defaultValue: 'Exceptional' });
    case 'good':
      return t('credit.band.good', { defaultValue: 'Good' });
    case 'fair':
      return t('credit.band.fair', { defaultValue: 'Fair' });
    case 'poor':
      return t('credit.band.poor', { defaultValue: 'Poor' });
    default:
      return t('credit.band.ruinous', { defaultValue: 'Ruinous' });
  }
}

/** Which palette slot a band takes. Fixed, so the dial never repaints. */
export const BAND_SERIES: Record<CreditBand, number> = {
  ruinous: 7,
  poor: 0,
  fair: 4,
  good: 2,
  exceptional: 6,
};

/* -------------------------------------------------------------------------- */
/* The dial                                                                   */
/* -------------------------------------------------------------------------- */

interface CreditDialProps {
  inputs: CreditInputs;
  /** The server's instant. The first paint uses exactly this — see the header. */
  asOfMs: number;
  /** Multiplies the model's volatility. The panel's stress-test control. */
  volatility?: number;
  /** Stop the interval. A frozen dial costs nothing — the timer is torn down. */
  paused?: boolean;
  size?: 'sm' | 'lg';
  className?: string;
  /**
   * Called at most once a second with the current score, for callers that need
   * to render prose about it. Deliberately not once per tick: the point of
   * writing the fast parts to the DOM is that nothing upstream re-renders at
   * that rate.
   */
  onSample?: (score: number) => void;
}

export function CreditDial({
  inputs,
  asOfMs,
  volatility = 1,
  paused = false,
  size = 'lg',
  className,
  onSample,
}: CreditDialProps) {
  const { t } = useTranslation('c-kaikai-debt');
  const reduced = useReducedMotion();

  const rootRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<SVGGElement>(null);
  const needleRef = useRef<SVGGElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);

  // Read inside the loop rather than as effect dependencies: a slider drag
  // should not tear down and restart the interval, which drops a frame at
  // exactly the moment the viewer is watching hardest.
  const optionsRef = useRef({ inputs, volatility });
  optionsRef.current = { inputs, volatility };

  const initial = useMemo(
    () => creditScoreAt(inputs, asOfMs, { volatility }),
    // `volatility` deliberately absent: the FIRST paint must match the server's,
    // and the server does not know what the viewer has since dragged the
    // stress-test slider to. The loop picks the new value up on its next tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputs, asOfMs],
  );

  const sampleRef = useRef(onSample);
  sampleRef.current = onSample;

  useEffect(() => {
    if (paused) return;
    const period = reduced ? CREDIT_REDUCED_TICK_MS : CREDIT_TICK_MS;
    let interval: ReturnType<typeof setInterval> | null = null;
    let previous = creditScoreAt(optionsRef.current.inputs, asOfMs);
    let lastSampleAt = 0;
    let onScreen = true;

    const paint = () => {
      const options = optionsRef.current;
      const now = Date.now();
      const score = creditScoreAt(options.inputs, now, { volatility: options.volatility });

      if (scoreRef.current) scoreRef.current.textContent = String(Math.round(score));
      if (deltaRef.current) {
        const delta = score - previous;
        deltaRef.current.textContent = `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`;
      }
      previous = score;

      needleRef.current?.setAttribute(
        'transform',
        `rotate(${angleFor(score).toFixed(2)} ${DIAL.cx} ${DIAL.cy})`,
      );

      const band = creditBand(score);
      if (rootRef.current?.dataset.band !== band) {
        if (rootRef.current) rootRef.current.dataset.band = band;
        dialRef.current?.setAttribute('data-band', band);
      }

      if (now - lastSampleAt > 1_000) {
        lastSampleAt = now;
        sampleRef.current?.(score);
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
    /** Live only while on screen and in a foreground tab. */
    const sync = () => {
      if (onScreen && document.visibilityState === 'visible') start();
      else stop();
    };

    let observer: IntersectionObserver | null = null;
    const host = rootRef.current;
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
  }, [reduced, paused, asOfMs]);

  const track = useMemo(() => bandTrack(), []);
  const initialBand = creditBand(initial);
  const large = size === 'lg';

  return (
    <div
      ref={rootRef}
      data-band={initialBand}
      className={cn('kd-band flex flex-col items-center', className)}
    >
      <svg
        viewBox={`0 0 ${DIAL.width} ${DIAL.height}`}
        className={cn('w-full', large ? 'max-w-[16rem]' : 'max-w-[13rem]')}
        role="img"
      >
        <title>{t('credit.gaugeTitle', { defaultValue: 'Credit score dial' })}</title>
        <desc>
          {t('credit.gaugeDesc', {
            defaultValue:
              'A dial from 300 to 850 divided into five bands, with a needle at the current score.',
          })}
        </desc>

        <g ref={dialRef} className="kd-dial" data-band={initialBand}>
          {track.map((segment) => (
            <path
              key={segment.band}
              className={`kd-dial__arc kd-dial__arc--${segment.band} kd-series-${BAND_SERIES[segment.band]}`}
              d={bandArc(segment.from, segment.to, DIAL.radius)}
              stroke="currentColor"
              strokeWidth={DIAL.thickness}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
        </g>

        {/* One group with one transform, so the ~14Hz update is a single
            compositor-friendly attribute write. */}
        <g
          ref={needleRef}
          transform={`rotate(${angleFor(initial).toFixed(2)} ${DIAL.cx} ${DIAL.cy})`}
        >
          <line
            x1={DIAL.cx - 6}
            y1={DIAL.cy}
            x2={DIAL.cx + DIAL.radius - DIAL.thickness - 2}
            y2={DIAL.cy}
            className="stroke-site-text"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
        <circle cx={DIAL.cx} cy={DIAL.cy} r={6} className="fill-site-text" />

        {/* The scale's ends, tucked under the arc's own ends and anchored
            outward — on the same baseline as the score they crowded it, and a
            reader parsing "300" twice on one line is a reader who has stopped
            reading the dial. */}
        <text
          x={onDial(START_DEG, DIAL.radius).x - 2}
          y={DIAL.cy + 18}
          className="kd-chart__label"
          textAnchor="start"
        >
          {CREDIT_MIN}
        </text>
        <text
          x={onDial(START_DEG + SWEEP_DEG, DIAL.radius).x + 2}
          y={DIAL.cy + 18}
          className="kd-chart__label"
          textAnchor="end"
        >
          {CREDIT_MAX}
        </text>
      </svg>

      {/* `aria-live="off"`: a value that changes fourteen times a second would
          flood a screen reader with an unusable stream of numbers. Every caller
          pairs this with a summary sentence at a readable cadence — the same
          choice the odometer makes. */}
      <p className="flex items-baseline gap-2" aria-live="off">
        <span
          ref={scoreRef}
          className={cn(
            'kd-odometer font-display leading-none font-bold text-site-text tabular-nums',
            large ? 'text-[clamp(2.2rem,9vw,3rem)]' : 'text-3xl',
          )}
        >
          {Math.round(initial)}
        </span>
        <span ref={deltaRef} className="text-xs text-site-text-muted tabular-nums">
          +0.0
        </span>
      </p>

      <p className="mt-1 flex items-center gap-1.5 rounded-full bg-current/12 px-2.5 py-1 text-xs font-medium">
        <span className="text-site-text">
          {CREDIT_BANDS.map((name) => (
            <span key={name} className={`kd-band__label kd-band__label--${name}`}>
              {bandLabel(name, t)}
            </span>
          ))}
        </span>
      </p>
    </div>
  );
}
