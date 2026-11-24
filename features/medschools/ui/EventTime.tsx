import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveNow } from '@/components/ui/RelativeTime';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { cn } from '@/lib/utils';
import { formatUtcDay } from '../engine/public-read';
import { EVENT_TIP_CLOSED, exactEventTime, nextEventTip } from './event-time';

const noSubscribe = () => () => undefined;

/**
 * A short event date with the exact time on hover, focus or tap (owner 2026-11-24): a `<time dateTime>` holding the
 * visible text, and a small tooltip with the exact timestamp in the viewer's own zone ("Tue, Nov 24, 2026, 3:42 PM
 * EST"), or, for a day-only event, the full calendar date and "No time reported" (never an invented time).
 *
 * The server does not know the viewer's zone, so the tooltip text is built on the client after hydration (empty in the
 * HTML; no server-zone string is ever printed). The visible text is the caller's, or: the UTC day on the server and the
 * hydrating render, then "21 hours ago" (`relative`), so the two renders agree.
 *
 * `nested`: inside another control (a tracker step is a button), where a second focus stop is not allowed: the time
 * then carries the exact text as its `title` only.
 */
export function EventTime({
  iso,
  dayOnly,
  relative = false,
  nested = false,
  align = 'start',
  className,
  children,
}: {
  iso: string;
  dayOnly: boolean;
  relative?: boolean;
  nested?: boolean;
  /** Which edge the tooltip lines up with: `end` for a time at the end of a row. */
  align?: 'start' | 'end';
  className?: string | undefined;
  children?: ReactNode;
}) {
  const { t } = useTranslation('medschools');
  const lf = useLocaleFormat();
  const id = useId();
  const client = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const now = useLiveNow();
  const [tip, setTip] = useState(EVENT_TIP_CLOSED);
  const open = tip.open;
  const on = (event: Parameters<typeof nextEventTip>[1]) => setTip((s) => nextEventTip(s, event));
  const day = iso.slice(0, 10);
  const visible =
    children ??
    (!dayOnly && relative && now !== null ? lf.relative(new Date(iso).getTime()) : formatUtcDay(day, lf.locale));
  const exact = client ? exactEventTime(iso, dayOnly, lf.locale) : null;
  const noTime = t('event-time-no-time', { defaultValue: 'No time reported' });
  const dateTime = dayOnly ? day : iso;

  if (nested) {
    return (
      <time
        dateTime={dateTime}
        className={className}
        title={exact ? (exact.dayOnly ? `${exact.text} · ${noTime}` : exact.text) : undefined}
      >
        {visible}
      </time>
    );
  }
  return (
    <span className={cn('medapp-when', align === 'end' && 'medapp-when--end')}>
      <time
        dateTime={dateTime}
        // A focus stop of its own, so the keyboard reaches the exact time; a tap pins it.
        tabIndex={0}
        aria-describedby={`${id}-tip`}
        className={cn('medapp-when__time', className)}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') on('hover');
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') on('leave');
        }}
        onFocus={() => on('focus')}
        onBlur={() => on('blur')}
        onClick={() => on('press')}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            on('escape');
          }
        }}
      >
        {visible}
      </time>
      <span id={`${id}-tip`} role="tooltip" className="medapp-when__tip" hidden={!open}>
        {exact ? (
          <>
            <span>{exact.text}</span>
            {exact.dayOnly ? <span className="medapp-when__note">{noTime}</span> : null}
          </>
        ) : null}
      </span>
    </span>
  );
}
