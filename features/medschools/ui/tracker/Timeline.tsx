import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import { buildTimeline } from '../../engine/timeline';
import type { TrackerApplicationDto } from '../../medschools.contract';
import { useMedLabels } from '../labels';
import { StatusText } from '../status/StatusText';
import { statusOfMilestone } from '../status/status';
import { StepIcon } from './StepIcon';

/**
 * The member's own milestones for the cycle, across every school, oldest first (rows on rules), each with the wait since
 * the step before it ("Interview invite · 34 days after application complete"). Built on the client from the tracker the
 * page already holds; nothing is requested and no one else's date is involved.
 */
export function Timeline({ applications }: { applications: readonly TrackerApplicationDto[] }) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const { milestoneLabel } = useMedLabels();
  const rows = buildTimeline(applications);
  if (rows.length === 0) return null;
  const nf = new Intl.NumberFormat(locale);

  return (
    <section className="medapp-section medapp-section--panel" aria-labelledby="med-timeline-heading" data-timeline="">
      <h2 id="med-timeline-heading" className="medapp-h2">
        {t('timeline-heading', { defaultValue: 'Timeline' })}
      </h2>
      <p className="medapp-meta">
        {t('timeline-note', { defaultValue: 'Your own dates, oldest first. Only you can see this.' })}
      </p>
      <ol className="medapp-timeline">
        {rows.map((r) => {
          const status = statusOfMilestone(r.type);
          return (
            <li key={`${r.applicationId}-${r.type}`}>
              <time dateTime={r.date}>{formatUtcDay(r.date, locale)}</time>
              <StepIcon type={r.type} />
              <span className="medapp-timeline__body">
                {status ? (
                  <span>
                    <StatusText status={status}>{milestoneLabel(r.type)}</StatusText>
                    {` ${t('timeline-entry-school', { defaultValue: '· {{school}}', school: r.school.shortName })}`}
                  </span>
                ) : (
                  <span>
                    {t('timeline-entry', {
                      defaultValue: '{{milestone}} · {{school}}',
                      milestone: milestoneLabel(r.type),
                      school: r.school.shortName,
                    })}
                  </span>
                )}
                {r.waitDays !== null && r.since ? (
                  <span className="medapp-timeline__wait">
                    {t('timeline-wait', {
                      count: r.waitDays,
                      n: nf.format(r.waitDays),
                      since: milestoneLabel(r.since),
                      defaultValue_one: '{{n}} day after {{since}}',
                      defaultValue_other: '{{n}} days after {{since}}',
                      defaultValue: '{{n}} days after {{since}}',
                    })}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
