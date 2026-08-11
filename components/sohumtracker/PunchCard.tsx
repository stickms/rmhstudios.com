'use client';

/**
 * The punch card: every hour of every weekday, folded into one 7 × 24 grid.
 *
 * The day-by-day chart answers "how much"; the hour-of-day chart answers "when".
 * Neither answers the question this one does — *whether the when depends on the
 * which day*. A Tuesday 2pm block and a Saturday 2pm block are the same bar on
 * the clock chart and completely different facts about somebody's life.
 *
 * Drawn from the per-day hourly histograms the rollup already writes, so it
 * costs nothing but the fold (`buildPunchCard`). Bucketing was done in the
 * tracking zone by the tracker; nothing here re-interprets an instant.
 *
 * # Accessibility
 *
 * Same contract as the charts: one `role="img"` with a summarising label, arrow
 * keys walking the grid in two dimensions, a readout row under it, and the whole
 * thing repeated as a visually-hidden table. 168 focusable cells would be 168
 * tab stops and no reader would thank us for it.
 */

import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildPunchCard } from '@/lib/sohumtracker/analytics';
import { formatCount, formatDuration } from '@/lib/sohumtracker/config';
import type { WatchDayDTO } from '@/lib/sohumtracker/types';

/** Which figure tints the grid. */
type PunchMetric = 'voice' | 'messages';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function PunchCard({ days }: { days: WatchDayDTO[] }) {
  const { t } = useTranslation('r-sohumtracker');
  const [metric, setMetric] = useState<PunchMetric>('voice');
  const [active, setActive] = useState<number | null>(null);

  const card = useMemo(() => buildPunchCard(days), [days]);

  // Literal keys, one `t()` each: `i18next-parser` is a static scanner and a
  // `t(option.key)` over an array extracts nothing (CLAUDE.md §5).
  const metrics: ReadonlyArray<{ value: PunchMetric; label: string }> = [
    { value: 'voice', label: t('metric-voice', { defaultValue: 'Voice' }) },
    { value: 'messages', label: t('metric-messages', { defaultValue: 'Messages' }) },
  ];

  // Weekday names come from `Intl` rather than a `t()` table: they are already
  // translated in every locale the browser ships, and a hand-maintained list of
  // seven strings × 16 locales is seven strings × 16 chances to be wrong.
  const weekdayNames = useMemo(() => {
    const short = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' });
    // 2024-01-01 was a Monday, which is index 0 in `mondayIndex` order.
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.UTC(2024, 0, 1 + index));
      return { short: short.format(date), long: long.format(date) };
    });
  }, []);

  const max = metric === 'voice' ? card.maxVoiceSec : card.maxMessages;
  const valueOf = (index: number) =>
    metric === 'voice' ? card.cells[index].voiceSec : card.cells[index].messages;
  const render = (value: number) =>
    metric === 'voice' ? formatDuration(value) : formatCount(value);

  /** 0–4, matching the calendar's heat ramp so the two grids read alike. */
  const level = (value: number) => {
    if (value <= 0 || max <= 0) return 0;
    return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowLeft'
          ? -1
          : event.key === 'ArrowDown'
            ? 24
            : event.key === 'ArrowUp'
              ? -24
              : 0;
    if (step === 0) {
      if (event.key === 'Escape') setActive(null);
      return;
    }
    event.preventDefault();
    const base = active ?? (step > 0 ? -step : card.cells.length);
    setActive(Math.min(card.cells.length - 1, Math.max(0, base + step)));
  };

  const activeCell = active !== null ? card.cells[active] : null;
  const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  return (
    <div className="stk-chart">
      <div className="stk-chart__head">
        <h3 className="stk-chart__title">
          {t('punch-title', { defaultValue: 'Which hours of which days' })}
        </h3>
        <div
          className="stk-segmented"
          role="group"
          aria-label={t('punch-metric-label', { defaultValue: 'Which figure to shade' })}
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

      {/* Focusable on purpose: the grid is one image with a readout under it,
          and focus + arrow keys are the only way a keyboard user reaches that
          readout at all. Same contract as `Plot` in `ActivityCharts`. */}
      <div
        className="stk-punch"
        role="img"
        tabIndex={0}
        aria-label={t('punch-alt', {
          defaultValue:
            'Grid of activity by weekday and hour of day, darker where he was busier',
        })}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        <div className="stk-punch__corner" aria-hidden />
        {HOURS.map((hour) => (
          <span key={`h-${hour}`} className="stk-punch__hour" aria-hidden>
            {/* Every third hour, so the strip stays legible on a phone. */}
            {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
          </span>
        ))}
        {weekdayNames.map((name, weekday) => (
          // A fragment, not a wrapper element: the grid's columns are declared on
          // the container, so a row div would have to be `display: contents` to
          // let its cells participate — and a `display: contents` element is
          // removed from the a11y tree anyway. Fragments say the same thing
          // without the workaround.
          <Fragment key={name.long}>
            <span className="stk-punch__day" aria-hidden>
              {name.short}
            </span>
            {HOURS.map((hour) => {
              const index = weekday * 24 + hour;
              return (
                <span
                  key={`${weekday}-${hour}`}
                  className="stk-punch__cell"
                  data-level={level(valueOf(index))}
                  data-active={active === index}
                  onPointerEnter={() => setActive(index)}
                  onPointerDown={() => setActive(index)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      <p className="stk-chart__readout" aria-live="polite">
        {activeCell ? (
          <>
            <strong>
              {weekdayNames[activeCell.weekday].long} {hourLabel(activeCell.hour)}
            </strong>
            <span>
              {t('readout-voice', {
                value: formatDuration(activeCell.voiceSec),
                defaultValue: 'Voice {{value}}',
              })}
            </span>
            <span>
              {t('readout-messages', {
                value: formatCount(activeCell.messages),
                defaultValue: 'Messages {{value}}',
              })}
            </span>
          </>
        ) : card.busiest ? (
          t('punch-hint', {
            weekday: weekdayNames[card.busiest.weekday].long,
            hour: hourLabel(card.busiest.hour),
            count: card.sampledDays,
            defaultValue:
              'Busiest hour of his week: {{weekday}} at {{hour}}. Folded from {{count}} days.',
          })
        ) : (
          t('punch-empty', {
            defaultValue: 'Not enough recorded hours yet to fold into a week.',
          })
        )}
      </p>

      <div className="stk-sr">
        <table>
          <caption>
            {t('punch-table', { defaultValue: 'Voice time and messages by weekday and hour' })}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('table-hour', { defaultValue: 'Hour' })}</th>
              {weekdayNames.map((name) => (
                <th key={name.long} scope="col">
                  {name.long}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour) => (
              <tr key={hour}>
                <th scope="row">{hourLabel(hour)}</th>
                {weekdayNames.map((name, weekday) => (
                  <td key={name.long}>{render(valueOf(weekday * 24 + hour))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
