'use client';

/**
 * A week or a month, in full — what `/sohumtracker/week/<key>` renders.
 *
 * The summarizer has always written all three periods; only the day had an
 * address. This is the missing half of that: a week is exactly as shareable a
 * unit as a day, and rather more legible when the point is "look what the last
 * seven days consisted of".
 *
 * One component for both periods, for the same reason `SummaryCard` is one
 * component for all three — a week and a month differ in how many days they
 * hold and in nothing else, and two components would be two things to keep in
 * step.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatCount, formatDuration } from '@/lib/sohumtracker/config';
import { formatDayShort } from '@/lib/sohumtracker/dates';
import type { WatchDayDTO, WatchSummaryDTO, WatchTotalsDTO } from '@/lib/sohumtracker/types';
import { SummaryCard } from './SummaryCard';

interface PeriodDetailProps {
  period: 'week' | 'month';
  days: WatchDayDTO[];
  totals: WatchTotalsDTO;
  summary: WatchSummaryDTO | null;
}

export function PeriodDetail({ period, days, totals, summary }: PeriodDetailProps) {
  const { t } = useTranslation('r-sohumtracker');

  // The heaviest day in the period, by time signed in — the one a reader would
  // click first, so it gets called out rather than being found by scanning.
  const heaviest = days.reduce<WatchDayDTO | null>((best, day) => {
    const signedIn = day.onlineSec + day.idleSec + day.dndSec;
    if (!best) return signedIn > 0 ? day : null;
    return signedIn > best.onlineSec + best.idleSec + best.dndSec ? day : best;
  }, null);

  const maxSignedIn = Math.max(
    1,
    ...days.map((day) => day.onlineSec + day.idleSec + day.dndSec),
  );

  // Literal keys, one `t()` per fact — `i18next-parser` is a static scanner and
  // a {key,label} table would extract nothing (CLAUDE.md §5).
  const facts: Array<{ id: string; label: string; value: string }> = [
    {
      id: 'signed-in',
      label: t('fact-signed-in', { defaultValue: 'Signed in to Discord' }),
      value: formatDuration(totals.presenceSec),
    },
    {
      id: 'online',
      label: t('fact-online', { defaultValue: 'Online' }),
      value: formatDuration(totals.onlineSec),
    },
    {
      id: 'idle',
      label: t('fact-idle', { defaultValue: 'Idle' }),
      value: formatDuration(totals.idleSec),
    },
    {
      id: 'mobile',
      label: t('fact-mobile', { defaultValue: 'On mobile' }),
      value: formatDuration(totals.mobileSec),
    },
    {
      id: 'desktop',
      label: t('fact-desktop', { defaultValue: 'On desktop' }),
      value: formatDuration(totals.desktopSec),
    },
    {
      id: 'voice',
      label: t('fact-voice', { defaultValue: 'In voice' }),
      value: formatDuration(totals.voiceSec),
    },
    {
      id: 'alone',
      label: t('fact-alone', { defaultValue: 'Alone in the channel' }),
      value: formatDuration(totals.aloneSec),
    },
    {
      id: 'late-voice',
      label: t('fact-late-voice', { defaultValue: 'In voice after midnight' }),
      value: formatDuration(totals.lateNightSec),
    },
    {
      id: 'messages',
      label: t('fact-messages', { defaultValue: 'Messages' }),
      value: formatCount(totals.messages),
    },
    {
      id: 'words',
      label: t('fact-words', { defaultValue: 'Words typed' }),
      value: formatCount(totals.words),
    },
    {
      id: 'gaming',
      label: t('fact-gaming', { defaultValue: 'In games' }),
      value: formatDuration(totals.gamingSec),
    },
    {
      id: 'active-days',
      label: t('fact-active-days', { defaultValue: 'Days he showed up' }),
      value: t('fact-active-days-value', {
        active: totals.activeDays,
        total: totals.days,
        defaultValue: '{{active}} of {{total}}',
      }),
    },
  ];

  return (
    <div className="stk-detail">
      <SummaryCard
        summary={summary}
        emptyTitle={
          period === 'week'
            ? t('week-empty-title', { defaultValue: 'This week' })
            : t('month-empty-title', { defaultValue: 'This month' })
        }
        emptyBody={
          period === 'week'
            ? t('week-empty-body', {
                defaultValue: 'Not written up yet. It settles once the week has enough in it.',
              })
            : t('month-empty-body', {
                defaultValue: 'Not written up yet. It settles once the month has enough in it.',
              })
        }
      />

      <div className="stk-facts">
        {facts.map((fact) => (
          <div key={fact.id} className="stk-fact">
            <span className="stk-fact__label">{fact.label}</span>
            <span className="stk-fact__value">{fact.value}</span>
          </div>
        ))}
      </div>

      <h3 className="stk-chart__title">
        {t('period-days-heading', { defaultValue: 'Day by day' })}
      </h3>
      <p className="stk-chart__note">
        {heaviest
          ? t('period-heaviest', {
              day: formatDayShort(heaviest.dateKey),
              value: formatDuration(
                heaviest.onlineSec + heaviest.idleSec + heaviest.dndSec,
              ),
              defaultValue: 'Heaviest day was {{day}} — {{value}} signed in.',
            })
          : t('period-heaviest-none', { defaultValue: 'Nothing recorded in this period.' })}
      </p>

      <ol className="stk-period-days">
        {days.map((day) => {
          const signedIn = day.onlineSec + day.idleSec + day.dndSec;
          return (
            <li key={day.dateKey}>
              <Link
                to="/sohumtracker/$date"
                params={{ date: day.dateKey }}
                className="stk-period-day"
              >
                <span className="stk-period-day__label">{formatDayShort(day.dateKey)}</span>
                {/* The bar is the comparison and the figures are the fact; the
                    width is set inline because it is data, not style. */}
                <span
                  className="stk-period-day__track"
                  aria-hidden
                  style={{ '--stk-fill': `${(signedIn / maxSignedIn) * 100}%` } as React.CSSProperties}
                >
                  <span className="stk-period-day__fill" />
                </span>
                <span className="stk-period-day__value">
                  {formatDuration(signedIn)}
                  {' · '}
                  {formatDuration(day.voiceSec)}
                  {' · '}
                  {t('period-day-messages', {
                    count: day.messages,
                    defaultValue: '{{count}} msg',
                  })}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
