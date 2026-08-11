'use client';

/**
 * A DeepSeek write-up, rendered.
 *
 * The same component draws all three periods; only the eyebrow changes, because
 * a day, a week and a month summary are the same object and giving each its own
 * card would be three components to keep in step.
 *
 * `summary` is model output, so it is rendered as TEXT — no `dangerouslySet`,
 * no markdown pass. React escapes it and that is the entire mitigation needed:
 * the model is fed message samples written by other people, and the one thing a
 * quoted message must never be able to do is arrive here as markup.
 */

import { useTranslation } from 'react-i18next';
import { formatWeekRange, formatDayLong, formatMonthLong } from '@/lib/sohumtracker/dates';
import type { WatchSummaryDTO } from '@/lib/sohumtracker/types';

interface SummaryCardProps {
  summary: WatchSummaryDTO | null;
  /** Shown when there is no summary for the period yet. */
  emptyTitle: string;
  emptyBody: string;
}

/** The human label for a period key, by period. */
function periodLabel(summary: WatchSummaryDTO): string {
  switch (summary.period) {
    case 'week':
      return formatWeekRange(summary.periodKey);
    case 'month':
      return formatMonthLong(summary.periodKey);
    default:
      return formatDayLong(summary.periodKey);
  }
}

export function SummaryCard({ summary, emptyTitle, emptyBody }: SummaryCardProps) {
  const { t } = useTranslation('r-sohumtracker');

  if (!summary) {
    return (
      <div className="stk-summary">
        <p className="stk-summary__eyebrow">{emptyTitle}</p>
        <p className="stk-summary__body">{emptyBody}</p>
      </div>
    );
  }

  const eyebrow =
    summary.period === 'week'
      ? t('summary-eyebrow-week', {
          range: periodLabel(summary),
          defaultValue: 'Week of {{range}}',
        })
      : summary.period === 'month'
        ? t('summary-eyebrow-month', {
            range: periodLabel(summary),
            defaultValue: '{{range}} in review',
          })
        : periodLabel(summary);

  return (
    <article className="stk-summary">
      <p className="stk-summary__eyebrow">{eyebrow}</p>
      <h3 className="stk-summary__headline">{summary.headline}</h3>
      <p className="stk-summary__body">{summary.summary}</p>

      {summary.verdict ? <p className="stk-summary__verdict">{summary.verdict}</p> : null}

      {summary.topics.length > 0 ? (
        <p className="stk-topics">
          <span className="stk-sr">{t('summary-topics', { defaultValue: 'Topics:' })}</span>
          {summary.topics.map((topic) => (
            <span key={topic} className="stk-topic">
              {topic}
            </span>
          ))}
        </p>
      ) : null}

      <p className="stk-summary__meta">
        {t('summary-generated', {
          defaultValue:
            'Written from the measured figures and a sample of his messages. The figures are counted, not estimated.',
        })}
      </p>
    </article>
  );
}
