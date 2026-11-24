import type { MedSchoolListItemDto } from '../medschools.contract';
import { EventTime } from './EventTime';
import { useMedLabels } from './labels';
import { StatusIcon } from './status/StatusIcon';
import { StatusText } from './status/StatusText';
import { statusOfEvent } from './status/status';

/**
 * A school's newest public status at the end of its index row (owner 2026-11-24): the words in the status hue with how
 * long ago under them, right-aligned, then the status disc at the row's far end, both on the row's centre line ("Interview invite · 24m ago"). The time is `EventTime`: the server and the hydrating render print the calendar
 * day (so they agree), the client the time ago, and hover, focus or a tap shows the exact local time. A day-only event
 * (a source that gave a date, not a time) always prints its day. The words always print beside the disc.
 */
export function LatestStatus({ latest }: { latest: NonNullable<MedSchoolListItemDto['latest']> }) {
  const { eventLabel } = useMedLabels();
  const status = statusOfEvent(latest.eventType);
  return (
    <span className="medapp-latest" data-latest={latest.eventType}>
      <span className="medapp-latest__text">
        <StatusText status={status} className="medapp-latest__label">
          {eventLabel(latest.eventType)}
        </StatusText>
        <EventTime
          iso={latest.occurredAt}
          dayOnly={latest.dayOnly}
          relative
          align="end"
          className="medapp-latest__when"
        />
      </span>
      <StatusIcon status={status} size="sm" />
    </span>
  );
}
