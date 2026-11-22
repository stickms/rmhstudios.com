import { SchoolLink } from './SchoolLink';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { cn } from '@/lib/utils';
import type { LiveEventDto } from '../medschools.contract';
import { useMedLabels } from './labels';

/**
 * One reported event: what, where, when, from which source. No person is named (D8).
 * Two lines on every width, so rows have one shape: the event and the school, then the program, the time and the source.
 */
export function LiveRow({ event, className }: { event: LiveEventDto; className?: string | undefined }) {
  const { eventLabel, programLabel, sourceName } = useMedLabels();
  const lf = useLocaleFormat();
  return (
    <li className={cn('border-b border-site-border py-3', className)}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="t-body">{eventLabel(event.eventType)}</span>
        <SchoolLink slug={event.school.slug} className="t-body">
          {event.school.shortName}
        </SchoolLink>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="t-meta">{programLabel(event.program, event.school.degree)}</span>
        <RelativeTime date={event.occurredAt} format={(ts) => lf.relative(ts)} className="t-meta" />
        <span className="t-meta">{sourceName(event.source)}</span>
      </div>
    </li>
  );
}
