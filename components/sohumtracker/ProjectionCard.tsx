'use client';

/**
 * What the current rate comes to by January 1st, 2030.
 *
 * `/sohumbum` counts DOWN to that date because it is the date he named. This
 * card counts what happens in the meantime at the rate he is going — which is
 * the only thing the two pages can say to each other, and the reason both exist.
 *
 * The arithmetic is a flat linear carry-forward and the card says so. Fitting a
 * curve to four months of one person's Discord habit would be a decoration on
 * the same guess; the page's register is measured figures stated plainly, and a
 * projection is already the one thing on it that is not measured.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { projectToDeadline, type ProjectedFigure } from '@/lib/sohumtracker/analytics';
import { formatCount, formatDuration, formatSpan } from '@/lib/sohumtracker/config';
import type { WatchDayDTO } from '@/lib/sohumtracker/types';

export function ProjectionCard({ days, todayKey }: { days: WatchDayDTO[]; todayKey: string }) {
  const { t } = useTranslation('r-sohumtracker');
  const projection = useMemo(() => projectToDeadline(days, todayKey), [days, todayKey]);

  // Literal keys, one per figure — see the note in `RecordsCard`.
  const label = (id: string): string => {
    switch (id) {
      case 'presence':
        return t('project-presence', { defaultValue: 'Signed in to Discord' });
      case 'voice':
        return t('project-voice', { defaultValue: 'In a voice channel' });
      case 'messages':
        return t('project-messages', { defaultValue: 'Messages sent' });
      case 'gaming':
        return t('project-gaming', { defaultValue: 'In games' });
      case 'mobile':
        return t('project-mobile', { defaultValue: 'On his phone' });
      default:
        return id;
    }
  };

  // The projected column is a multi-year span, so it renders in days; the
  // per-day column beside it is hours and minutes. Two units on one row on
  // purpose — `603d 6h` and `11h 41m a day` are each legible, and one unit for
  // both would make one of them unreadable.
  const renderTotal = (figure: ProjectedFigure) =>
    figure.kind === 'duration' ? formatSpan(figure.remaining) : formatCount(figure.remaining);
  const renderRate = (figure: ProjectedFigure) =>
    figure.kind === 'duration' ? formatDuration(figure.perDay) : formatCount(figure.perDay);

  if (projection.expired) {
    return (
      <div className="stk-chart">
        <div className="stk-chart__head">
          <h3 className="stk-chart__title">
            {t('project-title', { defaultValue: 'Between here and the deadline' })}
          </h3>
        </div>
        <p className="stk-empty">
          <span className="stk-empty__title">
            {t('project-over-title', { defaultValue: 'The deadline has passed' })}
          </span>
          <span className="stk-empty__body">
            {t('project-over-body', {
              defaultValue:
                'January 1st, 2030 is behind us. There is nothing left to project; there is only the record.',
            })}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="stk-chart">
      <div className="stk-chart__head">
        <h3 className="stk-chart__title">
          {t('project-title', { defaultValue: 'Between here and the deadline' })}
        </h3>
        <p className="stk-chart__note">
          {t('project-remaining', {
            count: projection.daysRemaining,
            defaultValue: '{{count}} days to January 1st, 2030',
          })}
        </p>
      </div>

      <div className="stk-records">
        {projection.figures.map((figure) => (
          <div key={figure.id} className="stk-record">
            <span className="stk-record__label">{label(figure.id)}</span>
            <span className="stk-record__value">{renderTotal(figure)}</span>
            <span className="stk-record__when">
              {t('project-per-day', {
                value: renderRate(figure),
                defaultValue: '{{value}} a day',
              })}
            </span>
          </div>
        ))}
      </div>

      <p className="stk-summary__verdict">
        {t('project-verdict', {
          share: Math.round(projection.voiceShare * 100),
          rest: 100 - Math.round(projection.voiceShare * 100),
          defaultValue:
            'At the rate he is going he will spend {{share}}% of the rest of the decade in a voice channel. He said he would have a job, a girl, no baby mamas and a house by then. The other {{rest}}% is where all four of those would have to fit.',
        })}
      </p>

      <p className="stk-chart__readout">
        {t('project-caveat', {
          count: projection.sampleDays,
          defaultValue:
            'A flat carry-forward of the last {{count}} days, quiet ones included. Not a forecast — a statement of what this rate adds up to.',
        })}{' '}
        <a href="/sohumbum">
          {t('project-link', { defaultValue: 'The four terms he set himself' })}
        </a>
      </p>
    </div>
  );
}
