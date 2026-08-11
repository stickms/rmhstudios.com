'use client';

/**
 * `/sohumtracker` — the live activity dossier.
 *
 * Reading order, top to bottom, and it is the order the questions get asked in:
 *
 *   1. Is he on right now, and doing what     → the profile card
 *   2. How much of this is there              → the headline figures
 *   3. What does that look like over time     → the two charts
 *   4. What happened on a given day           → the calendar, and the day panel
 *   5. What does it all amount to             → the week and month write-ups
 *
 * The page is seeded by the route loader (so the first paint is server-rendered
 * and the unfurl is real) and then polls `/api/sohumtracker/activity`. Every
 * component below renders from one `WatchStateDTO`; nothing fetches on its own.
 *
 * The register is deliberately flat, the same as `/sohumbum`: the joke only
 * lands if the page reports rather than jeers. The numbers are measured, they
 * are stated, and none of them are on his side.
 */

import { Activity, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCount, formatDuration } from '@/lib/sohumtracker/config';
import { formatDayLong, isoWeekKey, monthKeyOf } from '@/lib/sohumtracker/dates';
import type { WatchStateDTO, WatchSummaryDTO } from '@/lib/sohumtracker/types';
import { ActivityCalendar } from './ActivityCalendar';
import { ActivityCharts } from './ActivityCharts';
import { DayDetail } from './DayDetail';
import { useWatchState } from './live';
import { ProfileCard } from './ProfileCard';
import { SummaryCard } from './SummaryCard';

interface SohumTrackerPageProps {
  initialState: WatchStateDTO;
  /** How many days the loader asked for; the poller keeps asking for the same. */
  historyDays: number;
  /** Deep-linked day, when the visitor arrived on a `/sohumtracker/<date>` URL. */
  initialSelectedKey?: string | null;
}

export function SohumTrackerPage({
  initialState,
  historyDays,
  initialSelectedKey = null,
}: SohumTrackerPageProps) {
  const { t } = useTranslation('r-sohumtracker');
  const { state, status, refreshing, refresh } = useWatchState(initialState, historyDays);

  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialSelectedKey ?? state.todayKey,
  );
  const [monthKey, setMonthKey] = useState(monthKeyOf(initialSelectedKey ?? state.todayKey));

  const { days, totals, live } = state;

  const selectedDay = useMemo(
    () => days.find((day) => day.dateKey === selectedKey) ?? null,
    [days, selectedKey],
  );

  // The week and month covering the SELECTED day, so the three write-ups on
  // screen always describe the same stretch of time. Picking "the latest" for
  // each instead would put August's month beside a Tuesday in June.
  const { week, month } = useMemo(() => {
    const key = selectedKey ?? state.todayKey;
    const pick = (list: WatchSummaryDTO[], match: (summary: WatchSummaryDTO) => boolean) =>
      list.find(match) ?? null;
    return {
      week: pick(state.weeks, (summary) => coversDay(summary, key)),
      month: pick(state.months, (summary) => key.startsWith(summary.periodKey)),
    };
  }, [state.weeks, state.months, selectedKey, state.todayKey]);

  const bounds = useMemo(
    () => ({
      first: days.length > 0 ? monthKeyOf(days[0].dateKey) : monthKeyOf(state.todayKey),
      last: monthKeyOf(state.todayKey),
    }),
    [days, state.todayKey],
  );

  const onSelect = useCallback((dateKey: string) => {
    setSelectedKey(dateKey);
    setMonthKey(monthKeyOf(dateKey));
  }, []);

  const activeShare =
    totals.days > 0 ? Math.round((totals.activeDays / totals.days) * 100) : 0;

  return (
    <div className="stk">
      <div className="stk-shell">
        <header className="stk-header">
          <span className="stk-header__mark" aria-hidden>
            <Activity size={18} />
          </span>
          <h1 className="stk-header__title">
            {t('title', { defaultValue: 'What Is Sohum Doing Right Now?' })}
            <span className="stk-header__sub">
              {t('subtitle', {
                defaultValue: 'A standing record of the Discord account, kept by rmhbot.',
              })}
            </span>
          </h1>
          <div className="stk-header__actions">
            {/* An honest connection indicator rather than a spinner that implies
                the page is broken while the stream is merely quiet. */}
            <span className="stk-feed-state" data-status={status} aria-live="polite">
              <span className="stk-feed-dot" aria-hidden />
              {status === 'live'
                ? t('feed-live', { defaultValue: 'Live' })
                : status === 'connecting'
                  ? t('feed-connecting', { defaultValue: 'Connecting…' })
                  : t('feed-offline', { defaultValue: 'Offline' })}
            </span>
            {/* Kept even though the stream pushes: it is the only way to pull
                back a summary written for an OLDER day, which the tick does not
                carry, and the obvious thing to reach for when a page has been
                open long enough to be doubted. */}
            <button
              type="button"
              className="stk-btn stk-btn--ghost stk-btn--icon"
              onClick={refresh}
              disabled={refreshing}
              aria-label={t('refresh', { defaultValue: 'Refresh now' })}
            >
              <RefreshCw aria-hidden size={15} data-spinning={refreshing} className="stk-spin" />
            </button>
          </div>
        </header>

        <ProfileCard live={live} generatedAt={state.generatedAt} />

        {state.empty ? (
          <section className="stk-section">
            <div className="stk-empty">
              <p className="stk-empty__title">
                {t('empty-title', { defaultValue: 'Nothing recorded yet' })}
              </p>
              <p className="stk-empty__body">
                {t('empty-body', {
                  defaultValue:
                    'rmhbot has not logged any activity for this account. Either it has just been switched on, or — and the evidence so far does not rule this out — he has not done anything.',
                })}
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="stk-section" aria-labelledby="stk-figures">
              <div className="stk-section__head">
                <h2 className="stk-section__title" id="stk-figures">
                  {t('figures-heading', { defaultValue: 'The last {{count}} days', count: totals.days })}
                </h2>
              </div>
              <div className="stk-stats">
                <Stat
                  label={t('stat-online', { defaultValue: 'Signed in' })}
                  value={formatDuration(totals.presenceSec)}
                  note={t('stat-online-note', {
                    online: formatDuration(totals.onlineSec),
                    idle: formatDuration(totals.idleSec),
                    defaultValue: '{{online}} online, {{idle}} idle',
                  })}
                />
                <Stat
                  label={t('stat-mobile', { defaultValue: 'On his phone' })}
                  value={formatDuration(totals.mobileSec)}
                  note={t('stat-mobile-note', {
                    desktop: formatDuration(totals.desktopSec),
                    defaultValue: '{{desktop}} on desktop',
                  })}
                />
                <Stat
                  label={t('stat-voice', { defaultValue: 'In voice' })}
                  value={formatDuration(totals.voiceSec)}
                  note={t('stat-voice-note', {
                    count: totals.activeDays,
                    defaultValue: 'across {{count}} active days',
                  })}
                />
                <Stat
                  label={t('stat-messages', { defaultValue: 'Messages sent' })}
                  value={formatCount(totals.messages)}
                  note={t('stat-messages-note', {
                    count: totals.words,
                    defaultValue: '{{count}} words',
                  })}
                />
                <Stat
                  label={t('stat-gaming', { defaultValue: 'In games' })}
                  value={formatDuration(totals.gamingSec)}
                  note={totals.topGame ?? t('stat-gaming-none', { defaultValue: 'nothing logged' })}
                />
                <Stat
                  label={t('stat-alone', { defaultValue: 'Alone in a call' })}
                  value={formatDuration(totals.aloneSec)}
                  note={t('stat-alone-note', { defaultValue: 'nobody else in the channel' })}
                  alarm
                />
                <Stat
                  label={t('stat-late', { defaultValue: 'Up past midnight' })}
                  value={formatDuration(totals.lateNightSec)}
                  note={t('stat-late-note', {
                    count: totals.lateNightMessages,
                    defaultValue: '{{count}} messages after midnight',
                  })}
                  alarm
                />
                <Stat
                  label={t('stat-streak', { defaultValue: 'Current streak' })}
                  value={t('stat-streak-value', {
                    count: totals.currentStreak,
                    defaultValue: '{{count}} days',
                  })}
                  note={t('stat-streak-note', {
                    count: totals.longestStreak,
                    defaultValue: 'best run {{count}} days',
                  })}
                />
                <Stat
                  label={t('stat-peak', { defaultValue: 'Biggest day' })}
                  value={formatDuration(totals.peakVoiceSec)}
                  note={
                    totals.peakVoiceDateKey
                      ? formatDayLong(totals.peakVoiceDateKey)
                      : t('stat-peak-none', { defaultValue: 'no record' })
                  }
                />
                <Stat
                  label={t('stat-presence', { defaultValue: 'Days he showed up' })}
                  value={`${activeShare}%`}
                  note={t('stat-presence-note', {
                    defaultValue: 'of the period, on Discord at all',
                  })}
                />
              </div>
            </section>

            <section className="stk-section" aria-labelledby="stk-charts">
              <div className="stk-section__head">
                <h2 className="stk-section__title" id="stk-charts">
                  {t('charts-heading', { defaultValue: 'Shape of it' })}
                </h2>
              </div>
              <ActivityCharts days={days} />
            </section>

            <section className="stk-section" aria-labelledby="stk-calendar">
              <div className="stk-section__head">
                <h2 className="stk-section__title" id="stk-calendar">
                  {t('calendar-heading', { defaultValue: 'The calendar' })}
                </h2>
                <p className="stk-section__note">
                  {t('calendar-note', {
                    zone: state.timeZone.replace('_', ' '),
                    defaultValue: 'Days run midnight to midnight, {{zone}}.',
                  })}
                </p>
              </div>
              <div className="stk-grid-2">
                <div className="stk-card stk-card--pad">
                  <ActivityCalendar
                    monthKey={monthKey}
                    days={days}
                    todayKey={state.todayKey}
                    selectedKey={selectedKey}
                    onSelect={onSelect}
                    onMonthChange={setMonthKey}
                    bounds={bounds}
                  />
                </div>
                <div>
                  {selectedDay ? (
                    <DayDetail day={selectedDay} />
                  ) : (
                    <div className="stk-empty">
                      <p className="stk-empty__title">
                        {t('pick-a-day-title', { defaultValue: 'Pick a day' })}
                      </p>
                      <p className="stk-empty__body">
                        {t('pick-a-day-body', {
                          defaultValue: 'Choose a date to see what it consisted of.',
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="stk-section" aria-labelledby="stk-periods">
              <div className="stk-section__head">
                <h2 className="stk-section__title" id="stk-periods">
                  {t('periods-heading', { defaultValue: 'The wider view' })}
                </h2>
                <p className="stk-section__note">
                  {t('periods-note', {
                    defaultValue: 'The week and month containing the selected day.',
                  })}
                </p>
              </div>
              <div className="stk-grid-2">
                <SummaryCard
                  summary={week}
                  emptyTitle={t('week-empty-title', { defaultValue: 'This week' })}
                  emptyBody={t('week-empty-body', {
                    defaultValue: 'Not written up yet. It settles once the week has enough in it.',
                  })}
                />
                <SummaryCard
                  summary={month}
                  emptyTitle={t('month-empty-title', { defaultValue: 'This month' })}
                  emptyBody={t('month-empty-body', {
                    defaultValue: 'Not written up yet. It settles once the month has enough in it.',
                  })}
                />
              </div>
            </section>
          </>
        )}

        <footer className="stk-footer">
          <p>
            {t('colophon', {
              defaultValue:
                'Every figure on this page is measured by rmhbot from Discord gateway events — voice sessions timed from join to leave, messages counted as they are sent, games timed from rich presence. Nothing is estimated and nothing is self-reported. The written summaries are generated from those same figures and a sample of his own messages; the prose is a machine\'s, the numbers are not.',
            })}
          </p>
          <p>
            {t('colophon-scope', {
              defaultValue:
                'One account is tracked, by explicit configuration. Message text is kept only long enough to summarise the day it belongs to and is then deleted; the totals and the write-ups are what remain.',
            })}
          </p>
          <p>
            {t('colophon-sibling', {
              defaultValue: 'The four terms he set himself are reviewed separately.',
            })}{' '}
            <a href="/sohumbum">{t('colophon-link', { defaultValue: 'Is Sohum Joshi a bum yet?' })}</a>
          </p>
        </footer>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  alarm = false,
}: {
  label: string;
  value: string;
  note: string;
  alarm?: boolean;
}) {
  return (
    <div className={alarm ? 'stk-stat stk-stat--alarm' : 'stk-stat'}>
      <span className="stk-stat__label">{label}</span>
      <span className="stk-stat__value">{value}</span>
      <span className="stk-stat__note">{note}</span>
    </div>
  );
}

/**
 * Whether a weekly summary covers a given day.
 *
 * Derived from the summary's own ISO week key rather than recomputed from the
 * date, so a page built against a key the summarizer wrote can never disagree
 * with it about which week that is.
 */
function coversDay(summary: WatchSummaryDTO, dateKey: string): boolean {
  return summary.period === 'week' && isoWeekKey(dateKey) === summary.periodKey;
}
