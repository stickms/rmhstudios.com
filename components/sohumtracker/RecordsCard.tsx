'use client';

/**
 * Personal bests, and this week measured against last.
 *
 * Two readings of the same day list that only make sense beside each other: a
 * record says how far it has ever gone, a trend says which way it is going now.
 * A record on its own is a trophy cabinet; a trend on its own has no scale.
 *
 * The comparison truncates BOTH weeks to the same number of elapsed days — see
 * `compareWeeks`. Without that, every Monday morning reports a collapse that is
 * a fact about the calendar rather than about him.
 */

import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildRecords,
  compareWeeks,
  type WatchRecord,
  type WeekDelta,
} from '@/lib/sohumtracker/analytics';
import { formatCount, formatDuration } from '@/lib/sohumtracker/config';
import { formatDayShort } from '@/lib/sohumtracker/dates';
import type { WatchDayDTO } from '@/lib/sohumtracker/types';

/** A change smaller than this is noise, and gets a flat arrow. */
const FLAT_THRESHOLD = 0.05;

export function RecordsCard({ days, todayKey }: { days: WatchDayDTO[]; todayKey: string }) {
  const { t } = useTranslation('r-sohumtracker');

  const records = useMemo(() => buildRecords(days), [days]);
  const comparison = useMemo(() => compareWeeks(days, todayKey), [days, todayKey]);

  // One literal `t()` per id rather than a `{id: label}` table: `i18next-parser`
  // is a static scanner, so a label looked up from a map never reaches
  // `locales/` and every non-English locale would serve English forever.
  const label = (id: string): string => {
    switch (id) {
      case 'presence':
        return t('record-presence', { defaultValue: 'Longest day signed in' });
      case 'voice':
        return t('record-voice', { defaultValue: 'Most time in voice' });
      case 'session':
        return t('record-session', { defaultValue: 'Longest single call' });
      case 'messages':
        return t('record-messages', { defaultValue: 'Most messages' });
      case 'gaming':
        return t('record-gaming', { defaultValue: 'Most time in games' });
      case 'alone':
        return t('record-alone', { defaultValue: 'Longest alone in a channel' });
      case 'late':
        return t('record-late', { defaultValue: 'Most time up past midnight' });
      case 'mobile':
        return t('record-mobile', { defaultValue: 'Most time on his phone' });
      default:
        return id;
    }
  };

  const trendLabel = (id: string): string => {
    switch (id) {
      case 'presence':
        return t('stat-online', { defaultValue: 'Signed in' });
      case 'voice':
        return t('stat-voice', { defaultValue: 'In voice' });
      case 'messages':
        return t('stat-messages', { defaultValue: 'Messages sent' });
      case 'gaming':
        return t('stat-gaming', { defaultValue: 'In games' });
      default:
        return id;
    }
  };

  const render = (entry: WatchRecord | WeekDelta, value: number) =>
    entry.kind === 'duration' ? formatDuration(value) : formatCount(value);

  return (
    <div className="stk-grid-2">
      <div className="stk-chart">
        <div className="stk-chart__head">
          <h3 className="stk-chart__title">
            {t('records-title', { defaultValue: 'Personal bests' })}
          </h3>
          <p className="stk-chart__note">
            {t('records-note', {
              count: days.length,
              defaultValue: 'across the tracked {{count}} days',
            })}
          </p>
        </div>
        <div className="stk-records">
          {records.map((record) => (
            <div key={record.id} className="stk-record">
              <span className="stk-record__label">{label(record.id)}</span>
              <span className="stk-record__value">{render(record, record.value)}</span>
              <span className="stk-record__when">
                {record.dateKey ? (
                  <Link to="/sohumtracker/$date" params={{ date: record.dateKey }}>
                    {formatDayShort(record.dateKey)}
                  </Link>
                ) : (
                  t('records-none', { defaultValue: 'never' })
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="stk-chart">
        <div className="stk-chart__head">
          <h3 className="stk-chart__title">
            {t('trend-title', { defaultValue: 'This week against last' })}
          </h3>
          <p className="stk-chart__note">
            {t('trend-note', {
              count: comparison.elapsedDays,
              defaultValue: 'first {{count}} days of each',
            })}
          </p>
        </div>
        <div className="stk-records">
          {comparison.deltas.map((delta) => {
            const direction =
              delta.change === null || Math.abs(delta.change) < FLAT_THRESHOLD
                ? 'flat'
                : delta.change > 0
                  ? 'up'
                  : 'down';
            const Arrow =
              direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight;
            return (
              <div key={delta.id} className="stk-record" data-direction={direction}>
                <span className="stk-record__label">{trendLabel(delta.id)}</span>
                <span className="stk-record__value">{render(delta, delta.current)}</span>
                <span className="stk-record__when stk-record__when--trend">
                  <Arrow aria-hidden size={13} />
                  {delta.change === null
                    ? t('trend-new', { defaultValue: 'nothing last week' })
                    : t('trend-change', {
                        value: `${delta.change > 0 ? '+' : ''}${Math.round(delta.change * 100)}`,
                        defaultValue: '{{value}}%',
                      })}
                </span>
              </div>
            );
          })}
        </div>
        <p className="stk-chart__readout">
          {t('trend-caveat', {
            defaultValue:
              'Both weeks are cut to the same number of days, so a Monday reading is not a collapse.',
          })}
        </p>
      </div>
    </div>
  );
}
