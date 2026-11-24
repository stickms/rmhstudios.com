import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import { buildTimeline } from '../../engine/timeline';
import type { TrackerApplicationDto } from '../../medschools.contract';
import { useMedLabels } from '../labels';

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
    <section className="mt-6" aria-labelledby="med-timeline-heading" data-timeline="">
      <h2 id="med-timeline-heading" className="t-heading m-0">
        {t('timeline-heading', { defaultValue: 'Timeline' })}
      </h2>
      <p className="t-meta m-0 mt-1">
        {t('timeline-note', { defaultValue: 'Your own dates, oldest first. Only you can see this.' })}
      </p>
      <ol className="m-0 mt-2 list-none border-t border-site-border p-0">
        {rows.map((r) => (
          <li
            key={`${r.applicationId}-${r.type}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0 border-b border-site-border py-2"
          >
            <time dateTime={r.date} className="t-meta w-16 shrink-0">
              {formatUtcDay(r.date, locale)}
            </time>
            <span className="t-body min-w-40 flex-1">
              {t('timeline-entry', {
                defaultValue: '{{milestone}} · {{school}}',
                milestone: milestoneLabel(r.type),
                school: r.school.shortName,
              })}
            </span>
            {r.waitDays !== null && r.since ? (
              <span className="t-meta">
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
          </li>
        ))}
      </ol>
    </section>
  );
}
