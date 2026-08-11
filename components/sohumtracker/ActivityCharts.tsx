'use client';

/**
 * The charts on `/sohumtracker`, drawn as plain SVG.
 *
 * No charting library: the repo ships `chart.js` and `d3` only for the RMHVibe
 * sandbox's package list, and pulling either into the main bundle to draw
 * rectangles would cost more than the whole page. Everything here is a `<rect>`
 * or a `<path>` in a `viewBox`, which also means the charts scale to any width
 * without a resize observer and never make the page scroll sideways.
 *
 * # Accessibility
 *
 * A chart is a picture of a table, so both are rendered: the SVG is `role="img"`
 * with a summarising label, and the same numbers follow in a visually-hidden
 * `<table>` that a screen reader can actually navigate. The plot is focusable
 * and arrow keys walk the bars, which is what makes the readout reachable
 * without a pointer.
 *
 * # Interaction
 *
 * Hover, touch and arrow keys all set one `active` index, and the readout is a
 * fixed-height row UNDER the plot rather than a floating tooltip — on a phone a
 * tooltip that follows a finger renders underneath it.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCount, formatDuration } from '@/lib/sohumtracker/config';
import { formatDayShort } from '@/lib/sohumtracker/dates';
import type { WatchDayDTO } from '@/lib/sohumtracker/types';

/** The plot's internal coordinate space; the viewBox scales it to any width. */
const PLOT_W = 720;
const PLOT_H = 200;
const PAD_L = 34;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 20;

/** Which figure the trend chart is plotting. */
type TrendMetric = 'online' | 'voice' | 'messages' | 'gaming';

interface ChartsProps {
  days: WatchDayDTO[];
}

export function ActivityCharts({ days }: ChartsProps) {
  const { t } = useTranslation('r-sohumtracker');
  const [metric, setMetric] = useState<TrendMetric>('online');

  // Literal keys, not a table lookup: `i18next-parser` is a static scanner and
  // `t(option.key)` over an array extracts nothing, so the string would never
  // reach `locales/` and every non-English locale would serve English forever.
  const metrics: ReadonlyArray<{ value: TrendMetric; label: string }> = [
    { value: 'online', label: t('metric-online', { defaultValue: 'Online' }) },
    { value: 'voice', label: t('metric-voice', { defaultValue: 'Voice' }) },
    { value: 'messages', label: t('metric-messages', { defaultValue: 'Messages' }) },
    { value: 'gaming', label: t('metric-gaming', { defaultValue: 'Games' }) },
  ];

  return (
    <div className="stk-grid-2">
      <div className="stk-chart">
        <div className="stk-chart__head">
          <h3 className="stk-chart__title">
            {t('chart-trend-title', { defaultValue: 'Day by day' })}
          </h3>
          <div
            className="stk-segmented"
            role="group"
            aria-label={t('chart-metric-label', { defaultValue: 'Which figure to plot' })}
          >
            {metrics.map((option) => (
              <button
                key={option.value}
                type="button"
                className="stk-segment"
                aria-pressed={metric === option.value}
                onClick={() => setMetric(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <TrendChart days={days} metric={metric} />
      </div>

      <div className="stk-chart">
        <div className="stk-chart__head">
          <h3 className="stk-chart__title">
            {t('chart-clock-title', { defaultValue: 'What time of day' })}
          </h3>
          <div className="stk-chart__legend">
            <span
              className="stk-chart__key"
              style={{ '--stk-swatch': 'var(--stk-accent)' } as React.CSSProperties}
            >
              <span className="stk-chart__swatch" aria-hidden />
              {t('legend-voice', { defaultValue: 'Voice' })}
            </span>
            <span
              className="stk-chart__key"
              style={{ '--stk-swatch': 'var(--stk-online)' } as React.CSSProperties}
            >
              <span className="stk-chart__swatch" aria-hidden />
              {t('legend-messages', { defaultValue: 'Messages' })}
            </span>
          </div>
        </div>
        <ClockChart days={days} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Trend                                                                      */
/* -------------------------------------------------------------------------- */

function TrendChart({ days, metric }: { days: WatchDayDTO[]; metric: TrendMetric }) {
  const { t } = useTranslation('r-sohumtracker');
  const [active, setActive] = useState<number | null>(null);

  const series = useMemo(
    () =>
      days.map((day) => {
        switch (metric) {
          case 'online':
            return day.onlineSec + day.idleSec + day.dndSec;
          case 'voice':
            return day.voiceSec;
          case 'gaming':
            return day.gamingSec;
          default:
            return day.messages;
        }
      }),
    [days, metric],
  );
  const isDuration = metric !== 'messages';
  const render = useCallback(
    (value: number) => (isDuration ? formatDuration(value) : formatCount(value)),
    [isDuration],
  );

  const max = Math.max(1, ...series);
  const innerW = PLOT_W - PAD_L - PAD_R;
  const innerH = PLOT_H - PAD_T - PAD_B;
  const slot = innerW / Math.max(1, series.length);
  // A hairline minimum so a day with a single message is still a visible mark
  // rather than an indistinguishable gap in the row.
  const barW = Math.max(1, slot - Math.min(3, slot * 0.25));

  const activeDay = active !== null ? days[active] : null;

  return (
    <>
      <Plot
        count={series.length}
        active={active}
        setActive={setActive}
        label={t('chart-trend-alt', {
          count: days.length,
          defaultValue: 'Bar chart of activity across the last {{count}} days',
        })}
      >
        {[0.5, 1].map((fraction) => (
          <line
            key={fraction}
            className="stk-chart__grid-line"
            x1={PAD_L}
            x2={PLOT_W - PAD_R}
            y1={PAD_T + innerH * (1 - fraction)}
            y2={PAD_T + innerH * (1 - fraction)}
          />
        ))}
        <text className="stk-chart__axis" x={0} y={PAD_T + 8}>
          {render(max)}
        </text>

        {series.map((value, index) => {
          const height = (value / max) * innerH;
          const x = PAD_L + index * slot + (slot - barW) / 2;
          return (
            <rect
              key={days[index].dateKey}
              className="stk-chart__bar"
              data-active={active === index}
              x={x}
              y={PAD_T + innerH - height}
              width={barW}
              height={Math.max(value > 0 ? 1 : 0, height)}
              rx={Math.min(2, barW / 2)}
            />
          );
        })}

        {/* One full-height hit target per bar, so a 2px bar is still tappable. */}
        {series.map((_, index) => (
          <rect
            key={`hit-${days[index].dateKey}`}
            className="stk-chart__hit"
            x={PAD_L + index * slot}
            y={PAD_T}
            width={slot}
            height={innerH}
            onPointerEnter={() => setActive(index)}
            onPointerDown={() => setActive(index)}
          />
        ))}

        {days.length > 0 ? (
          <>
            <text className="stk-chart__axis" x={PAD_L} y={PLOT_H - 6}>
              {formatDayShort(days[0].dateKey)}
            </text>
            <text
              className="stk-chart__axis"
              x={PLOT_W - PAD_R}
              y={PLOT_H - 6}
              textAnchor="end"
            >
              {formatDayShort(days[days.length - 1].dateKey)}
            </text>
          </>
        ) : null}
      </Plot>

      <p className="stk-chart__readout" aria-live="polite">
        {activeDay ? (
          <>
            <strong>{formatDayShort(activeDay.dateKey)}</strong>
            <span>
              {t('readout-online', {
                value: formatDuration(activeDay.onlineSec + activeDay.idleSec + activeDay.dndSec),
                defaultValue: 'Signed in {{value}}',
              })}
            </span>
            <span>
              {t('readout-voice', {
                value: formatDuration(activeDay.voiceSec),
                defaultValue: 'Voice {{value}}',
              })}
            </span>
            <span>
              {t('readout-messages', {
                value: formatCount(activeDay.messages),
                defaultValue: 'Messages {{value}}',
              })}
            </span>
            <span>
              {t('readout-gaming', {
                value: formatDuration(activeDay.gamingSec),
                defaultValue: 'Games {{value}}',
              })}
            </span>
          </>
        ) : (
          t('readout-hint', { defaultValue: 'Hover, tap or arrow-key a bar for that day.' })
        )}
      </p>

      <DataTable
        caption={t('chart-trend-table', { defaultValue: 'Activity by day' })}
        head={[
          t('table-day', { defaultValue: 'Day' }),
          t('table-voice', { defaultValue: 'Voice' }),
          t('table-messages', { defaultValue: 'Messages' }),
          t('table-gaming', { defaultValue: 'Games' }),
        ]}
        rows={days.map((day) => [
          day.dateKey,
          formatDuration(day.voiceSec),
          formatCount(day.messages),
          formatDuration(day.gamingSec),
        ])}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Hour of day                                                                */
/* -------------------------------------------------------------------------- */

/**
 * When he is awake, folded across the whole range.
 *
 * Two series on one 24-slot axis: voice seconds as the tall bars and messages
 * as a shorter overlay, each scaled to its OWN maximum. They share no unit, so
 * a shared scale would just make one of them invisible — the shapes are the
 * comparison, and the readout carries the actual figures.
 */
function ClockChart({ days }: { days: WatchDayDTO[] }) {
  const { t } = useTranslation('r-sohumtracker');
  const [active, setActive] = useState<number | null>(null);

  const { voice, messages } = useMemo(() => {
    const voiceHours = new Array<number>(24).fill(0);
    const messageHours = new Array<number>(24).fill(0);
    for (const day of days) {
      day.hourlyVoiceSec?.forEach((value, hour) => {
        voiceHours[hour] += value;
      });
      day.hourlyMessages?.forEach((value, hour) => {
        messageHours[hour] += value;
      });
    }
    return { voice: voiceHours, messages: messageHours };
  }, [days]);

  const maxVoice = Math.max(1, ...voice);
  const maxMessages = Math.max(1, ...messages);
  const innerW = PLOT_W - PAD_L - PAD_R;
  const innerH = PLOT_H - PAD_T - PAD_B;
  const slot = innerW / 24;
  const barW = slot * 0.34;

  const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  return (
    <>
      <Plot
        count={24}
        active={active}
        setActive={setActive}
        label={t('chart-clock-alt', {
          defaultValue: 'Activity by hour of the day, voice time and messages',
        })}
      >
        <line
          className="stk-chart__grid-line"
          x1={PAD_L}
          x2={PLOT_W - PAD_R}
          y1={PAD_T + innerH}
          y2={PAD_T + innerH}
        />
        {/* The small hours are the point of this chart, so they get a marker. */}
        <line
          className="stk-chart__cursor"
          x1={PAD_L + slot * 5}
          x2={PAD_L + slot * 5}
          y1={PAD_T}
          y2={PAD_T + innerH}
        />

        {voice.map((value, hour) => {
          const height = (value / maxVoice) * innerH;
          return (
            <rect
              key={`v-${hour}`}
              className="stk-chart__bar"
              data-active={active === hour}
              x={PAD_L + hour * slot + slot / 2 - barW}
              y={PAD_T + innerH - height}
              width={barW}
              height={Math.max(value > 0 ? 1 : 0, height)}
              rx={1}
            />
          );
        })}
        {messages.map((value, hour) => {
          const height = (value / maxMessages) * innerH * 0.7;
          return (
            <rect
              key={`m-${hour}`}
              className="stk-chart__bar stk-chart__bar--alt"
              x={PAD_L + hour * slot + slot / 2}
              y={PAD_T + innerH - height}
              width={barW}
              height={Math.max(value > 0 ? 1 : 0, height)}
              rx={1}
            />
          );
        })}

        {voice.map((_, hour) => (
          <rect
            key={`hit-${hour}`}
            className="stk-chart__hit"
            x={PAD_L + hour * slot}
            y={PAD_T}
            width={slot}
            height={innerH}
            onPointerEnter={() => setActive(hour)}
            onPointerDown={() => setActive(hour)}
          />
        ))}

        {[0, 6, 12, 18].map((hour) => (
          <text
            key={`x-${hour}`}
            className="stk-chart__axis"
            x={PAD_L + hour * slot + slot / 2}
            y={PLOT_H - 6}
            textAnchor="middle"
          >
            {hourLabel(hour)}
          </text>
        ))}
        <text className="stk-chart__axis" x={0} y={PAD_T + 8}>
          {formatDuration(maxVoice)}
        </text>
      </Plot>

      <p className="stk-chart__readout" aria-live="polite">
        {active !== null ? (
          <>
            <strong>{hourLabel(active)}</strong>
            <span>
              {t('readout-voice', {
                value: formatDuration(voice[active]),
                defaultValue: 'Voice {{value}}',
              })}
            </span>
            <span>
              {t('readout-messages', {
                value: formatCount(messages[active]),
                defaultValue: 'Messages {{value}}',
              })}
            </span>
          </>
        ) : (
          t('readout-clock-hint', {
            defaultValue: 'Totals per hour, local time. The dashed line is 5am.',
          })
        )}
      </p>

      <DataTable
        caption={t('chart-clock-table', { defaultValue: 'Activity by hour' })}
        head={[
          t('table-hour', { defaultValue: 'Hour' }),
          t('table-voice', { defaultValue: 'Voice' }),
          t('table-messages', { defaultValue: 'Messages' }),
        ]}
        rows={voice.map((value, hour) => [
          hourLabel(hour),
          formatDuration(value),
          formatCount(messages[hour]),
        ])}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared plot chrome                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The focusable, arrow-navigable SVG wrapper both charts sit in.
 *
 * `role="img"` with a label, because the marks inside are one picture rather
 * than a list of things to tab through; the numbers are reachable through the
 * hidden table beside it. Focus + arrow keys exist for the sighted keyboard
 * user, who otherwise has no way to reach the readout at all.
 */
function Plot({
  count,
  active,
  setActive,
  label,
  children,
}: {
  count: number;
  active: number | null;
  setActive: (index: number | null) => void;
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<SVGSVGElement>(null);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (count === 0) return;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      if (event.key === 'Escape') setActive(null);
      return;
    }
    event.preventDefault();
    const base = active ?? (step > 0 ? -1 : count);
    setActive(Math.min(count - 1, Math.max(0, base + step)));
  };

  return (
    <div className="stk-chart__plot">
      <svg
        ref={ref}
        viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        {children}
      </svg>
    </div>
  );
}

/**
 * The chart's numbers, for a screen reader. Hidden, not absent.
 *
 * The clip lives on a WRAPPER div, not on the `<table>` itself: a table's layout
 * algorithm sizes it to its content and ignores `height: 1px`, so the usual
 * sr-only recipe applied directly to a 120-row table leaves a 2,900px element in
 * the document. It is invisible, so the only symptom is a page that scrolls a
 * screen and a half past its own footer — which is exactly what it did.
 */
function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: string[][];
}) {
  return (
    <div className="stk-sr">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              <th scope="row">{row[0]}</th>
              {row.slice(1).map((cell, index) => (
                <td key={`${row[0]}-${head[index + 1]}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
