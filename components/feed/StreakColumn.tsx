'use client';

import { useEffect, useState } from 'react';
import { Flame, Trophy, CalendarCheck, Check } from 'lucide-react';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useTranslation } from 'react-i18next';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion';
import { LIFT_CARD } from '@/components/feed/motionHelpers';
import { ColumnHeader } from './ColumnHeader';

interface StreakState {
  current: number;
  longest: number;
  totalCheckIns: number;
  checkedInToday: boolean;
  reward: number;
}

// Streak milestones that unlock rewards / achievements.
const MILESTONES = [
  { day: 7, label: '7-day streak' },
  { day: 30, label: '30-day streak' },
  { day: 100, label: '100-day streak' },
];

export function StreakColumn({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const { t } = useTranslation('feed');
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/streak', { credentials: 'include' });
        if (res.ok && active) setStreak(await res.json());
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (!streak) {
    return (
      <EmptyState
        description={t('streak-load-error', { defaultValue: 'Could not load your streak.' })}
      />
    );
  }

  const next = MILESTONES.find((m) => m.day > streak.current);
  const nextPct = next ? Math.min(100, Math.round((streak.current / next.day) * 100)) : 100;

  return (
    <div className={hideHeader ? '' : 'min-h-screen'}>
      {/* hideHeader === embedded in JourneyColumn, which supplies the page
          header (and the drawer button) itself. */}
      {!hideHeader && (
        <ColumnHeader>
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-site-warning" />
            <h1 className="text-lg font-bold text-site-text">
              {t('streak-title', { defaultValue: 'Streak' })}
            </h1>
          </div>
        </ColumnHeader>
      )}

      <div className="space-y-8 p-4">
        {/* Current streak hero */}
        <Reveal>
          <section className="flex flex-col items-center gap-3 rounded-site border border-site-border bg-site-surface p-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-site-warning/15">
              <Flame className="h-10 w-10 fill-site-warning/30 text-site-warning" />
            </div>
            <div>
              <p className="text-4xl font-extrabold text-site-text">{streak.current}</p>
              <p className="text-sm text-site-text-muted">
                {streak.current === 1
                  ? t('streak-day-in-a-row', { defaultValue: 'day in a row' })
                  : t('streak-days-in-a-row', { defaultValue: 'days in a row' })}
              </p>
            </div>
            {streak.checkedInToday ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-site-success/15 px-3 py-1.5 text-sm font-semibold text-site-success">
                <Check className="h-4 w-4" />{' '}
                {t('checked-in-today', { defaultValue: 'Checked in today' })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-site-warning/15 px-3 py-1.5 text-sm font-semibold text-site-warning">
                <Flame className="h-4 w-4" />{' '}
                {t('visit-today-to-keep-alive', { defaultValue: 'Visit today to keep it alive' })}
              </span>
            )}
          </section>
        </Reveal>

        {/* Stats */}
        <Reveal>
          <RevealGroup as="div" className="grid grid-cols-2 gap-3">
            <RevealItem>
              <div
                className={`rounded-site border border-site-border bg-site-surface p-4 ${LIFT_CARD}`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                  <Trophy className="h-3.5 w-3.5" />{' '}
                  {t('longest-label', { defaultValue: 'Longest' })}
                </div>
                <p className="mt-1 text-2xl font-bold text-site-text">{streak.longest}</p>
                <p className="text-xs text-site-text-muted">
                  {streak.longest === 1
                    ? t('day-unit', { defaultValue: 'day' })
                    : t('days-unit', { defaultValue: 'days' })}
                </p>
              </div>
            </RevealItem>
            <RevealItem>
              <div
                className={`rounded-site border border-site-border bg-site-surface p-4 ${LIFT_CARD}`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                  <CalendarCheck className="h-3.5 w-3.5" />{' '}
                  {t('total-check-ins-label', { defaultValue: 'Total check-ins' })}
                </div>
                <p className="mt-1 text-2xl font-bold text-site-text">{streak.totalCheckIns}</p>
                <p className="text-xs text-site-text-muted">
                  {t('all-time', { defaultValue: 'all time' })}
                </p>
              </div>
            </RevealItem>
          </RevealGroup>
        </Reveal>

        {/* Next milestone */}
        {next && (
          <Reveal>
            <section className="rounded-site border border-site-border bg-site-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-site-text">
                  {t('next-milestone', { defaultValue: 'Next milestone' })}
                </h2>
                <span className="text-xs text-site-text-muted">
                  {streak.current} / {next.day} days
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-site-bg">
                <div
                  className="h-full rounded-full bg-site-warning transition-[width] duration-300"
                  style={{ width: `${nextPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-site-text-dim">
                {next.day - streak.current === 1
                  ? t('more-day-to-milestone', {
                      label: next.label,
                      defaultValue: '{{count}} more day to reach the {{label}}.',
                      count: next.day - streak.current,
                    })
                  : t('more-days-to-milestone', {
                      label: next.label,
                      defaultValue: '{{count}} more days to reach the {{label}}.',
                      count: next.day - streak.current,
                    })}
              </p>
            </section>
          </Reveal>
        )}

        {/* Milestones list */}
        <Reveal>
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              {t('milestones-heading', { defaultValue: 'Milestones' })}
            </h2>
            <div className="space-y-2">
              {MILESTONES.map((m) => {
                const reached = streak.current >= m.day || streak.longest >= m.day;
                return (
                  <div
                    key={m.day}
                    className={`flex items-center gap-3 rounded-site border p-3 transition-[transform,border-color] duration-200 ${
                      reached
                        ? 'border-site-border bg-site-surface'
                        : 'border-site-border/60 bg-site-bg opacity-70'
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-site-sm ${
                        reached
                          ? 'bg-site-warning/15 text-site-warning'
                          : 'bg-site-surface text-site-text-dim'
                      }`}
                    >
                      <Flame className={`h-4 w-4 ${reached ? 'fill-site-warning/30' : ''}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-site-text">{m.label}</p>
                      <p className="text-xs text-site-text-muted">
                        {t('reach-day-streak', {
                          day: m.day,
                          defaultValue: 'Reach a {{day}}-day check-in streak.',
                        })}
                      </p>
                    </div>
                    {reached && <Check className="h-4 w-4 shrink-0 text-site-success" />}
                  </div>
                );
              })}
            </div>
          </section>
        </Reveal>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-site-text-dim">
          <CoinIcon className="h-3.5 w-3.5" />{' '}
          {t('check-in-daily-earn-coins', {
            defaultValue: 'Check in daily to earn coins — rewards grow as your streak does.',
          })}
        </p>
      </div>
    </div>
  );
}
