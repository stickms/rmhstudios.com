'use client';

/**
 * "Where am I?" — the progress ring, the four numbers that matter, and a
 * verdict with one-tap fixes when the plan runs past the deadline.
 */

import { m as motion } from 'framer-motion';
import { CheckCircle2, Flame, PartyPopper, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AeroWindow } from './AeroWindow';
import { Win7Progress } from './Win7Progress';
import { formatMinutes, type Plan } from '@/lib/dunesday/schedule';
import type { Progress } from '@/lib/dunesday/state';
import { fmtDay, SHORT } from './format';

export function StatusPanel({
  plan,
  progress,
  deadline,
  fitMinutes,
  essentialsFinish,
  onUseFit,
  onEssentials,
}: {
  plan: Plan;
  progress: Progress;
  deadline: string;
  /** The average that would finish on time, or null if even 24h/day would not. */
  fitMinutes: number | null;
  /** Projected finish if only the essentials were kept, at the current pace. */
  essentialsFinish: string | null;
  onUseFit: () => void;
  onEssentials: () => void;
}) {
  const { t, i18n } = useTranslation('c-dunesday');
  const pct = progress.totalMinutes
    ? Math.round((progress.watchedMinutes / progress.totalMinutes) * 100)
    : 0;
  const r = 56;
  const circ = 2 * Math.PI * r;
  const remaining = Math.max(0, progress.totalMinutes - progress.watchedMinutes);
  const done = progress.titlesTotal > 0 && progress.titlesWatched === progress.titlesTotal;

  return (
    <AeroWindow title={t('status-title', { defaultValue: 'Marathon status' })}>
      <div className="ds-status">
        <div className="ds-ring">
          <svg viewBox="0 0 132 132" aria-hidden="true">
            <defs>
              <linearGradient id="ds-ring-grad" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#8ae65c" />
                <stop offset="1" stopColor="#19b5f0" />
              </linearGradient>
            </defs>
            <circle
              cx="66"
              cy="66"
              r={r}
              fill="none"
              stroke="rgba(150,190,220,0.3)"
              strokeWidth="12"
            />
            <motion.circle
              cx="66"
              cy="66"
              r={r}
              fill="none"
              stroke="url(#ds-ring-grad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circ}
              initial={false}
              animate={{ strokeDashoffset: circ * (1 - pct / 100) }}
              transition={{ type: 'spring', stiffness: 80, damping: 20 }}
            />
          </svg>
          <div className="ds-ring-label">
            <span className="ds-ring-pct">{pct}%</span>
            <span className="ds-hint">{t('watched', { defaultValue: 'watched' })}</span>
          </div>
        </div>

        <div>
          <div className="ds-stats">
            <div className="ds-card ds-stat">
              <div className="ds-stat-label">{t('stat-titles', { defaultValue: 'Titles' })}</div>
              <div className="ds-stat-value">
                {progress.titlesWatched}/{progress.titlesTotal}
              </div>
            </div>
            <div className="ds-card ds-stat">
              <div className="ds-stat-label">{t('stat-left', { defaultValue: 'Time left' })}</div>
              <div className="ds-stat-value">{formatMinutes(remaining)}</div>
            </div>
            <div className="ds-card ds-stat">
              <div className="ds-stat-label">{t('stat-pace', { defaultValue: 'Avg / day' })}</div>
              <div className="ds-stat-value">{formatMinutes(plan.minutesPerDay)}</div>
            </div>
            <div className="ds-card ds-stat">
              <div className="ds-stat-label">{t('stat-streak', { defaultValue: 'Streak' })}</div>
              <div className="ds-stat-value">
                <Flame
                  size={18}
                  aria-hidden="true"
                  style={{ verticalAlign: '-2px', color: '#ff8a2b' }}
                />{' '}
                {t('streak-days', {
                  count: progress.streak,
                  defaultValue: '{{count}} days',
                  defaultValue_one: '{{count}} day',
                  defaultValue_other: '{{count}} days',
                })}
              </div>
            </div>
          </div>

          <Win7Progress
            className="ds-status-progress"
            value={progress.totalMinutes ? progress.watchedMinutes / progress.totalMinutes : 0}
            label={t('progress-label', { defaultValue: 'Marathon progress' })}
          />

          {done ? (
            <div className="ds-banner ds-banner--done" role="status">
              <PartyPopper size={18} aria-hidden="true" />
              <span>
                {t('all-done', {
                  defaultValue: 'Every title watched. You are ready for Dunesday!',
                })}
              </span>
            </div>
          ) : plan.onTime ? (
            <div className="ds-banner ds-banner--ok" role="status">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>
                {plan.finishDate
                  ? t('on-track', {
                      defaultValue: 'On track: you finish {{finish}}, {{count}} days to spare.',
                      defaultValue_one: 'On track: you finish {{finish}}, {{count}} day to spare.',
                      defaultValue_other:
                        'On track: you finish {{finish}}, {{count}} days to spare.',
                      finish: fmtDay(plan.finishDate, i18n.language, SHORT),
                      count: plan.slackDays,
                    })
                  : t('nothing-left', { defaultValue: 'Nothing left on the list.' })}
              </span>
            </div>
          ) : (
            <div className="ds-banner ds-banner--late" role="status">
              <TriangleAlert size={18} aria-hidden="true" />
              <span>
                {plan.impossible
                  ? t('impossible', {
                      defaultValue:
                        'Even round-the-clock viewing can’t fit it all before {{deadline}}. Trim the list.',
                      deadline: fmtDay(deadline, i18n.language, SHORT),
                    })
                  : t('behind', {
                      defaultValue: 'At this pace you finish {{finish}}, {{count}} days late.',
                      defaultValue_one: 'At this pace you finish {{finish}}, {{count}} day late.',
                      defaultValue_other:
                        'At this pace you finish {{finish}}, {{count}} days late.',
                      finish: plan.finishDate ? fmtDay(plan.finishDate, i18n.language, SHORT) : '—',
                      count: -plan.slackDays,
                    })}
              </span>
              <span className="ds-row" style={{ marginLeft: 'auto' }}>
                {fitMinutes !== null && !plan.impossible && (
                  <button type="button" className="ds-btn ds-btn--sm" onClick={onUseFit}>
                    {t('use-fit', {
                      defaultValue: 'Watch {{pace}}/day instead',
                      pace: formatMinutes(fitMinutes),
                    })}
                  </button>
                )}
                {essentialsFinish && (
                  <button
                    type="button"
                    className="ds-btn ds-btn--sand ds-btn--sm"
                    onClick={onEssentials}
                  >
                    {t('use-essentials', {
                      defaultValue: 'Essentials only (done {{finish}})',
                      finish: fmtDay(essentialsFinish, i18n.language, SHORT),
                    })}
                  </button>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </AeroWindow>
  );
}
