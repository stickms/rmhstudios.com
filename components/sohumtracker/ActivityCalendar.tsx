'use client';

/**
 * The month calendar — the spine of `/sohumtracker`.
 *
 * One cell per day, tinted by how long he spent in voice, carrying the figure
 * itself rather than only the colour: a heatmap you have to decode against a
 * legend is a puzzle, and this one has room for the number.
 *
 * # Why months rather than one long GitHub-style strip
 *
 * The summaries are written per day, per ISO week and per month, and a month
 * grid is the only layout where all three line up — you can see the week rows
 * the weekly write-up describes, inside the month the monthly one does. A
 * 53-week strip also collapses to unreadable squares on a phone, which is the
 * width most of this page is read at.
 *
 * Weeks start on MONDAY, matching the ISO week keys the summarizer writes
 * (`isoWeekKey`); a Sunday-first grid would draw week rows that straddle two
 * summaries.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCount, formatDuration } from '@/lib/sohumtracker/config';
import {
  enumerateDateKeys,
  formatDayLong,
  formatMonthLong,
  mondayIndex,
  monthBounds,
} from '@/lib/sohumtracker/dates';
import type { WatchDayDTO } from '@/lib/sohumtracker/types';

/**
 * Voice-time thresholds for the five heat levels, in seconds.
 *
 * Fixed rather than relative to the busiest day on screen: a relative ramp
 * re-colours every cell when the range changes, so the same Tuesday is dark in
 * one view and bright in another. These are absolute claims — level 4 means
 * "over six hours in voice", in June and in December.
 */
const HEAT_THRESHOLDS = [0, 30 * 60, 2 * 3600, 4 * 3600, 6 * 3600] as const;

export function heatLevel(voiceSec: number): number {
  let level = 0;
  for (let i = 1; i < HEAT_THRESHOLDS.length; i += 1) {
    if (voiceSec >= HEAT_THRESHOLDS[i]) level = i;
  }
  return voiceSec > 0 ? Math.max(1, level) : 0;
}

interface CalendarProps {
  /** `YYYY-MM` currently shown. */
  monthKey: string;
  days: WatchDayDTO[];
  todayKey: string;
  selectedKey: string | null;
  onSelect: (dateKey: string) => void;
  onMonthChange: (monthKey: string) => void;
  /** Months with data, ascending — bounds the prev/next buttons. */
  bounds: { first: string; last: string };
}

export function ActivityCalendar({
  monthKey,
  days,
  todayKey,
  selectedKey,
  onSelect,
  onMonthChange,
  bounds,
}: CalendarProps) {
  const { t } = useTranslation('r-sohumtracker');

  const byKey = useMemo(() => new Map(days.map((day) => [day.dateKey, day])), [days]);
  const { firstKey, lastKey } = monthBounds(monthKey);
  const cells = enumerateDateKeys(firstKey, lastKey);
  // Leading blanks so the 1st lands under its real weekday column.
  const leading = mondayIndex(firstKey);

  // Literal keys: `i18next-parser` cannot see through `t(item.key)` over an
  // array, so a mapped lookup would never reach `locales/`.
  const dayNames = [
    t('dow-mon', { defaultValue: 'Mon' }),
    t('dow-tue', { defaultValue: 'Tue' }),
    t('dow-wed', { defaultValue: 'Wed' }),
    t('dow-thu', { defaultValue: 'Thu' }),
    t('dow-fri', { defaultValue: 'Fri' }),
    t('dow-sat', { defaultValue: 'Sat' }),
    t('dow-sun', { defaultValue: 'Sun' }),
  ];

  const shiftMonth = (delta: number) => {
    const [year, month] = monthKey.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const prev = shiftMonth(-1);
  const next = shiftMonth(1);

  return (
    <div>
      <div className="stk-calendar__nav">
        <button
          type="button"
          className="stk-btn stk-btn--ghost stk-btn--icon"
          onClick={() => onMonthChange(prev)}
          disabled={prev < bounds.first}
          aria-label={t('cal-prev', { defaultValue: 'Previous month' })}
        >
          <ChevronLeft aria-hidden size={18} />
        </button>
        <h3 className="stk-calendar__month">{formatMonthLong(monthKey)}</h3>
        <button
          type="button"
          className="stk-btn stk-btn--ghost stk-btn--icon"
          onClick={() => onMonthChange(next)}
          disabled={next > bounds.last}
          aria-label={t('cal-next', { defaultValue: 'Next month' })}
        >
          <ChevronRight aria-hidden size={18} />
        </button>
      </div>

      <div className="stk-calendar__grid">
        {dayNames.map((name) => (
          <div key={name} className="stk-calendar__dow" aria-hidden>
            {name}
          </div>
        ))}

        {Array.from({ length: leading }, (_, i) => (
          <div key={`blank-${i}`} className="stk-day stk-day--blank" aria-hidden />
        ))}

        {cells.map((dateKey) => {
          const day = byKey.get(dateKey);
          const voiceSec = day?.voiceSec ?? 0;
          const level = heatLevel(voiceSec);
          const isFuture = dateKey > todayKey;

          // A day that has not happened is drawn as an empty cell WITH its date,
          // not as nothing: the rest of the month is the shape of the grid, and
          // a blank tail made the card look broken rather than unfinished.
          if (isFuture) {
            return (
              <div key={dateKey} className="stk-day stk-day--future" aria-hidden>
                <span className="stk-day__num">{Number(dateKey.slice(8, 10))}</span>
              </div>
            );
          }

          // One accessible name carrying everything the cell shows visually, so
          // a screen reader gets the figures and not just "11".
          const label = [
            formatDayLong(dateKey),
            voiceSec > 0
              ? t('cal-cell-voice', {
                  value: formatDuration(voiceSec),
                  defaultValue: '{{value}} in voice',
                })
              : t('cal-cell-quiet', { defaultValue: 'no voice' }),
            day?.messages
              ? t('cal-cell-messages', {
                  count: day.messages,
                  defaultValue: '{{count}} messages',
                })
              : null,
            day?.summary ? t('cal-cell-has-summary', { defaultValue: 'has a write-up' }) : null,
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <button
              key={dateKey}
              type="button"
              className="stk-day"
              data-level={level}
              data-today={dateKey === todayKey}
              data-selected={dateKey === selectedKey}
              style={{ '--stk-heat': `var(--stk-heat-${level})` } as React.CSSProperties}
              onClick={() => onSelect(dateKey)}
              aria-label={label}
              aria-pressed={dateKey === selectedKey}
            >
              <span className="stk-day__num" aria-hidden>
                {Number(dateKey.slice(8, 10))}
              </span>
              <span className="stk-day__voice" aria-hidden>
                {voiceSec > 0 ? formatDuration(voiceSec) : '—'}
              </span>
              <span className="stk-day__msgs" aria-hidden>
                {day?.messages ? formatCount(day.messages) : ''}
              </span>
              {day?.summary ? <span className="stk-day__mark" aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      <p className="stk-legend">
        <span>{t('cal-legend-less', { defaultValue: 'Less' })}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="stk-legend__cell"
            style={{ '--stk-heat': `var(--stk-heat-${level})` } as React.CSSProperties}
            aria-hidden
          />
        ))}
        <span>{t('cal-legend-more', { defaultValue: 'More — 6h+ in voice' })}</span>
      </p>
    </div>
  );
}
