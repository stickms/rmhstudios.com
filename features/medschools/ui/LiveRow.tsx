import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { cn } from '@/lib/utils';
import { formatUtcDay } from '../engine/public-read';
import { SCHOOL_SEARCH_DEFAULTS } from '../engine/search';
import type { LiveEventDto } from '../medschools.contract';
import { useMedLabels } from './labels';
import { StatusIcon } from './status/StatusIcon';
import { StatusText } from './status/StatusText';
import { statusOfEvent } from './status/status';

/**
 * One reported event: which school, what happened, when, from which source. No person is named (D8).
 * Name first (the mockup's order): the school, then the status in its own colour with its icon at the left, then one
 * muted line of program, place, time and source. The status is always written out, so colour is never the only cue.
 */
export function LiveRow({
  event,
  className,
  compact,
}: {
  event: LiveEventDto;
  className?: string | undefined;
  /** The rail: no source in the meta line (it is 320px wide and the page names its sources). */
  compact?: boolean | undefined;
}) {
  const { t } = useTranslation('medschools');
  const { eventLabel, programLabel, sourceName } = useMedLabels();
  const lf = useLocaleFormat();
  const status = statusOfEvent(event.eventType);
  // SDN events dated before their post are stored at UTC midnight (day precision only): a relative time would be a lie.
  const dayOnly = event.source === 'SDN' && event.occurredAt.slice(10) === 'T00:00:00.000Z';
  return (
    <li className={cn('medapp-row', compact && 'medapp-row--compact', className)}>
      <StatusIcon status={status} />
      <div className="medapp-row__body">
        <p className="medapp-row__name">
          <Link to="/med/$slug" params={{ slug: event.school.slug }} search={SCHOOL_SEARCH_DEFAULTS}>
            {event.school.name}
          </Link>
        </p>
        <p className="medapp-row__status">
          <StatusText status={status}>{eventLabel(event.eventType)}</StatusText>
        </p>
        <p className="medapp-row__meta">
          {t('live-row-place', {
            defaultValue: '{{program}} · {{city}}, {{state}}',
            program: programLabel(event.program, event.school.degree),
            city: event.school.city,
            state: event.school.state,
          })}
          {' · '}
          {dayOnly ? (
            <time dateTime={event.occurredAt.slice(0, 10)}>
              {formatUtcDay(event.occurredAt.slice(0, 10), lf.locale)}
            </time>
          ) : (
            <RelativeTime date={event.occurredAt} format={(ts) => lf.relative(ts)} />
          )}
          {compact ? null : <> · {sourceName(event.source)}</>}
          {event.wave ? <> · {t('live-wave', { defaultValue: 'Part of a wave' })}</> : null}
        </p>
      </div>
    </li>
  );
}
