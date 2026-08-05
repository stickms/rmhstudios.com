'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, Download, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { cn } from '@/lib/utils';
import {
  formatInZone,
  googleCalendarUrl,
  icsDownloadPath,
  outlookCalendarUrl,
  shortZoneLabel,
  viewerTimeZone,
  zonesDiffer,
  type CalendarEventInput,
} from './event-time';

/**
 * EventTime (B24) — every event time, in the viewer's zone, with the zone named.
 *
 * Two rules, both learned the hard way by everyone who has ever missed a call:
 *
 * 1. **Always render in the viewer's zone, and always say which zone it is.**
 *    An unlabelled time is read as local by definition, so an unlabelled time
 *    that is not local is a trap.
 * 2. **Show the organiser's zone in parentheses when it differs** — not instead,
 *    beside. It is the one piece of context that lets a reader sanity-check a
 *    time that looks wrong ("3am? …ah, they're in Tokyo").
 *
 * Formatting happens after mount (`suppressHydrationWarning` + a mounted gate):
 * SSR runs in the server's zone, so a zone-correct first paint is impossible by
 * construction, and a text mismatch makes React 19 throw the tree away.
 */

export interface EventTimeProps {
  /** Start instant, ISO 8601. */
  startsAt: string;
  /** End instant, if the organiser gave one. */
  endsAt?: string | null;
  /**
   * The organiser's IANA zone, when known. `CommunityEvent` does not store one
   * today (see the report accompanying B24), so this is optional — the
   * parenthetical simply does not render without it.
   */
  organizerTimeZone?: string | null;
  /** Event id — enables the add-to-calendar menu. */
  eventId?: string;
  /** Title/description/location for the calendar links. */
  calendar?: Omit<CalendarEventInput, 'startsAt' | 'endsAt'>;
  className?: string;
}

export function EventTime({
  startsAt,
  endsAt,
  organizerTimeZone,
  eventId,
  calendar,
  className,
}: EventTimeProps) {
  const { t } = useTranslation('common');
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const start = useMemo(() => new Date(startsAt), [startsAt]);
  const viewerZone = mounted ? viewerTimeZone() : null;

  const local = viewerZone ? formatInZone(start, viewerZone) : null;
  const localZone = viewerZone ? shortZoneLabel(start, viewerZone) : '';
  const showOrganizer = zonesDiffer(start, viewerZone, organizerTimeZone ?? null);
  const organizerText =
    showOrganizer && organizerTimeZone
      ? `${formatInZone(start, organizerTimeZone)} ${shortZoneLabel(start, organizerTimeZone)}`.trim()
      : null;

  const calendarEvent: CalendarEventInput | null = calendar
    ? { ...calendar, startsAt, endsAt: endsAt ?? null }
    : null;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <time dateTime={startsAt} className="text-sm text-site-text-muted" suppressHydrationWarning>
        {/* Before mount the only honest thing to print is the raw date; the
            zone-correct string lands one frame later. */}
        {local ?? new Date(startsAt).toISOString().slice(0, 10)}
        {localZone ? <span className="ms-1 text-xs text-site-text-dim">{localZone}</span> : null}
      </time>

      {organizerText && (
        <span className="text-xs text-site-text-dim" suppressHydrationWarning>
          {t('event-organizer-time', {
            time: organizerText,
            defaultValue: '({{time}} for the organiser)',
          })}
        </span>
      )}

      {eventId && calendarEvent && (
        <>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="inline-flex items-center gap-1 text-xs font-medium text-site-text-muted transition-colors hover:text-site-accent"
          >
            <CalendarPlus className="size-4" aria-hidden />
            {t('add-to-calendar', { defaultValue: 'Add to calendar' })}
          </button>

          <AnchoredMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={triggerRef}
            label={t('add-to-calendar', { defaultValue: 'Add to calendar' })}
            side="bottom"
            align="start"
            className="w-48"
          >
            <a
              href={googleCalendarUrl(calendarEvent)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-site-text transition-colors hover:bg-site-surface-hover"
            >
              <ExternalLink className="size-4 text-site-text-dim" aria-hidden />
              {t('calendar-google', { defaultValue: 'Google Calendar' })}
            </a>
            <a
              href={outlookCalendarUrl(calendarEvent)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-site-text transition-colors hover:bg-site-surface-hover"
            >
              <ExternalLink className="size-4 text-site-text-dim" aria-hidden />
              {t('calendar-outlook', { defaultValue: 'Outlook' })}
            </a>
            <a
              href={icsDownloadPath(eventId)}
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-site-text transition-colors hover:bg-site-surface-hover"
            >
              <Download className="size-4 text-site-text-dim" aria-hidden />
              {t('calendar-ics', { defaultValue: 'Download .ics' })}
            </a>
          </AnchoredMenu>
        </>
      )}
    </span>
  );
}
