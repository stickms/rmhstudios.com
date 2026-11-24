import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { SCHOOL_SEARCH_DEFAULTS } from '../engine/search';
import type { LiveEventDto } from '../medschools.contract';
import { EventTime } from './EventTime';
import { isDayOnlyEvent } from './event-time';
import { useMedLabels } from './labels';
import { SchoolCrest } from './SchoolCrest';
import { StatusIcon } from './status/StatusIcon';
import { StatusText } from './status/StatusText';
import { statusOfEvent } from './status/status';

/**
 * One reported event: which school, what happened, when, from which source. No person is named (D8). One component
 * for the live page and the rail (owner 2026-11-24), so the two cannot drift: one grid, the school's crest (initials
 * when it has none) with the decision as a small status badge on its top-right corner (`aria-hidden`: the status is
 * written out), the school's name, the status in its colour, and the time at the row's end (`EventTime`: the exact
 * local time on hover, focus or tap). The live page adds one muted line of program, place and source; the rail
 * (`compact`) leaves it out (it is 320px wide and the page names its sources).
 */
export function LiveRow({
  event,
  className,
  compact,
}: {
  event: LiveEventDto;
  className?: string | undefined;
  /** The rail: name, status and time only. */
  compact?: boolean | undefined;
}) {
  const { t } = useTranslation('medschools');
  const { eventLabel, programLabel, sourceName } = useMedLabels();
  const status = statusOfEvent(event.eventType);
  // ADMIT and SDN events with a day only are stored at UTC midnight: a relative time would be a lie.
  const dayOnly = isDayOnlyEvent(event.source, event.occurredAt);
  return (
    <li className={cn('medapp-row medapp-liverow', compact && 'medapp-row--compact', className)}>
      <span className="medapp-crestbadge">
        <SchoolCrest slug={event.school.slug} name={event.school.name} size={40} />
        <StatusIcon status={status} size="xs" className="medapp-crestbadge__badge" />
      </span>
      <div className="medapp-row__body">
        <p className="medapp-row__name">
          <Link to="/med/$slug" params={{ slug: event.school.slug }} search={SCHOOL_SEARCH_DEFAULTS}>
            {event.school.name}
          </Link>
        </p>
        <p className="medapp-row__status">
          <StatusText status={status}>{eventLabel(event.eventType)}</StatusText>
        </p>
        {compact ? null : (
          <p className="medapp-row__meta">
            {t('live-row-place', {
              defaultValue: '{{program}} · {{city}}, {{state}}',
              program: programLabel(event.program, event.school.degree),
              city: event.school.city,
              state: event.school.state,
            })}
            {' · '}
            {sourceName(event.source)}
            {event.wave ? <> · {t('live-wave', { defaultValue: 'Part of a wave' })}</> : null}
          </p>
        )}
      </div>
      <EventTime iso={event.occurredAt} dayOnly={dayOnly} relative align="end" className="medapp-liverow__when" />
    </li>
  );
}
