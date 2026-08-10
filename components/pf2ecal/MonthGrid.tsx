'use client';

/**
 * The month view — an overview, and a way to jump to a date.
 *
 * Days are bucketed by the viewer's own timezone, not by UTC and not by the
 * campaign's: a session at 8pm Eastern is *the next morning* for a player in
 * Europe, and putting the dot on the Eastern date would show them a calendar
 * that disagrees with their own phone.
 *
 * Selecting a day scrolls the agenda to it rather than filtering to it. A
 * filtered month view is a dead end on a phone — you tap a day, see one thing,
 * and have to tap again to get back — where scrolling keeps the surrounding
 * weeks in reach.
 */

import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Session } from '@/lib/pf2ecal/types';
import { zonedDateKey } from '@/lib/pf2ecal/zoned-time';
import { formatMonthLabel } from './format';

/** Weekday initials in the viewer's locale, starting Sunday. */
function useWeekdayInitials(): string[] {
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
    // 2024-01-07 was a Sunday; seven consecutive days from it give the labels
    // in the order the grid lays them out.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 7 + i))));
  }, []);
}

interface DayCell {
  key: string;
  day: number;
  outside: boolean;
}

/** Six weeks starting on the Sunday on or before the 1st — a stable 42 cells. */
function buildCells(year: number, month: number): DayCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = first.getUTCDay();
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(Date.UTC(year, month - 1, 1 - leading + i));
    cells.push({
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
        date.getUTCDate(),
      ).padStart(2, '0')}`,
      day: date.getUTCDate(),
      outside: date.getUTCMonth() !== month - 1,
    });
  }
  return cells;
}

interface MonthGridProps {
  year: number;
  month: number;
  sessions: Session[];
  timeZone: string;
  now: Date;
  selectedKey: string | null;
  onSelect: (dateKey: string) => void;
  onShift: (delta: number) => void;
  onToday: () => void;
}

export function MonthGrid({
  year,
  month,
  sessions,
  timeZone,
  now,
  selectedKey,
  onSelect,
  onShift,
  onToday,
}: MonthGridProps) {
  const { t } = useTranslation('r-pf2ecal');
  const weekdays = useWeekdayInitials();
  const cells = useMemo(() => buildCells(year, month), [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const session of sessions) {
      const key = zonedDateKey(session.startsAt, timeZone);
      const list = map.get(key);
      if (list) list.push(session);
      else map.set(key, [session]);
    }
    return map;
  }, [sessions, timeZone]);

  const todayKey = zonedDateKey(now, timeZone);

  return (
    <section
      className="pf2e-card pf2e-month-card"
      aria-label={t('month-overview', { defaultValue: 'Month overview' })}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        {/* The TITLE gives up space, not the controls. "September 2026" is
            wider than the rail's title slot; letting it wrap pushed the header
            onto two lines, and the first fix — `min-w-0` on the control group
            — was worse: the buttons are `flex-shrink: 0`, so they simply
            overflowed their own container at every width. The title truncates
            (`min-w-0` is what makes `truncate` work on a flex child) and the
            controls keep their intrinsic size. */}
        <h2 className="pf2e-title min-w-0 truncate text-[1.0625rem]">
          {formatMonthLabel(year, month)}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="pf2e-btn pf2e-btn-ghost pf2e-btn-sm" onClick={onToday}>
            {t('today', { defaultValue: 'Today' })}
          </button>
          <button
            type="button"
            className="pf2e-btn pf2e-btn-ghost pf2e-btn-icon"
            onClick={() => onShift(-1)}
            aria-label={t('previous-month', { defaultValue: 'Previous month' })}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="pf2e-btn pf2e-btn-ghost pf2e-btn-icon"
            onClick={() => onShift(1)}
            aria-label={t('next-month', { defaultValue: 'Next month' })}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </header>

      <div className="pf2e-month mb-1" aria-hidden>
        {weekdays.map((label) => (
          <div key={label} className="pf2e-mono-label py-1 text-center">
            {label.slice(0, 2)}
          </div>
        ))}
      </div>

      {/* Keyed on the month so the grid cross-fades when it changes; without
          the key React reuses the cells and the numbers snap. */}
      <motion.div
        key={`${year}-${month}`}
        className="pf2e-month"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      >
        {cells.map((cell) => {
          const daySessions = byDay.get(cell.key) ?? [];
          const live = daySessions.filter((s) => !s.canceledAt);
          const label = daySessions.length
            ? t('day-with-sessions', {
                defaultValue: '{{date}}, {{count}} session',
                defaultValue_other: '{{date}}, {{count}} sessions',
                date: cell.key,
                count: daySessions.length,
              })
            : cell.key;
          return (
            <button
              key={cell.key}
              type="button"
              className="pf2e-daycell"
              data-outside={cell.outside}
              data-today={cell.key === todayKey}
              data-selected={cell.key === selectedKey}
              aria-label={label}
              aria-current={cell.key === todayKey ? 'date' : undefined}
              onClick={() => onSelect(cell.key)}
            >
              <span className="pf2e-daynum">{cell.day}</span>
              <span className="pf2e-dots">
                {/* Capped at three: a busy day must not change the cell's
                    height, which would reflow the whole grid. */}
                {daySessions.slice(0, 3).map((session) => (
                  <span
                    key={session.id}
                    className="pf2e-dot"
                    data-canceled={Boolean(session.canceledAt)}
                  />
                ))}
              </span>
              {live.length > 3 && (
                <span className="pf2e-sr-only">{t('and-more', { defaultValue: 'and more' })}</span>
              )}
            </button>
          );
        })}
      </motion.div>
    </section>
  );
}
