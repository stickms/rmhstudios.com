import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { cn } from '@/lib/utils';
import { formatUtcDay } from '../engine/public-read';
import { SCHOOL_SEARCH_DEFAULTS } from '../engine/search';
import type { LiveEventDto } from '../medschools.contract';
import { useMedLabels } from './labels';

/**
 * One reported event: what, where, when, from which source. No person is named (D8).
 * Two lines on every width, so rows have one shape: the event and the school, then the program, the time and the source.
 */
export function LiveRow({ event, className }: { event: LiveEventDto; className?: string | undefined }) {
  const { t } = useTranslation('medschools');
  const { eventLabel, programLabel, sourceName } = useMedLabels();
  const lf = useLocaleFormat();
  // SDN events dated before their post are stored at UTC midnight (day precision only): a relative time would be a lie.
  const dayOnly = event.source === 'SDN' && event.occurredAt.slice(10) === 'T00:00:00.000Z';
  return (
    <li className={cn('border-b border-site-border py-3', className)}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="t-body">{eventLabel(event.eventType)}</span>
        <Link
          to="/rmh-medschool/$slug"
          params={{ slug: event.school.slug }}
          search={SCHOOL_SEARCH_DEFAULTS}
          className="t-body"
        >
          {event.school.shortName}
        </Link>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="t-meta">
          {t('live-row-place', {
            defaultValue: '{{program}} · {{city}}, {{state}}',
            program: programLabel(event.program, event.school.degree),
            city: event.school.city,
            state: event.school.state,
          })}
        </span>
        {dayOnly ? (
          <time dateTime={event.occurredAt.slice(0, 10)} className="t-meta">
            {formatUtcDay(event.occurredAt.slice(0, 10), lf.locale)}
          </time>
        ) : (
          <RelativeTime date={event.occurredAt} format={(ts) => lf.relative(ts)} className="t-meta" />
        )}
        <span className="t-meta">{sourceName(event.source)}</span>
      </div>
    </li>
  );
}
