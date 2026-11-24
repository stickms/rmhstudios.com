import { useSyncExternalStore } from 'react';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../engine/public-read';
import type { MedSchoolListItemDto } from '../medschools.contract';
import { useMedLabels } from './labels';
import { StatusIcon } from './status/StatusIcon';
import { StatusText } from './status/StatusText';
import { statusOfEvent } from './status/status';

const noSubscribe = () => () => undefined;

/**
 * A school's newest public status at the end of its index row: the status disc, the words in the status hue and how long
 * ago ("Interview invite · 24m ago"). The time is worked out when the row renders, never on a timer: the server and the
 * hydrating render print the calendar day (so they agree), the client's own renders the time ago. A day-only event (a
 * source that gave a date, not a time) always prints its day. The words always print beside the disc.
 */
export function LatestStatus({ latest }: { latest: NonNullable<MedSchoolListItemDto['latest']> }) {
  const { eventLabel } = useMedLabels();
  const lf = useLocaleFormat();
  const client = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const status = statusOfEvent(latest.eventType);
  const day = formatUtcDay(latest.occurredAt.slice(0, 10), lf.locale);
  const when = !latest.dayOnly && client ? lf.relative(new Date(latest.occurredAt).getTime()) : day;
  return (
    <span className="medapp-latest" data-latest={latest.eventType}>
      <StatusIcon status={status} size="sm" />
      <span className="medapp-latest__text">
        <StatusText status={status} className="medapp-latest__label">
          {eventLabel(latest.eventType)}
        </StatusText>
        <time
          dateTime={latest.dayOnly ? latest.occurredAt.slice(0, 10) : latest.occurredAt}
          className="medapp-latest__when"
        >
          {when}
        </time>
      </span>
    </span>
  );
}
