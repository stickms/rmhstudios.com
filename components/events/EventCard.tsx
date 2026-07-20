'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Clock, Gamepad2, Link as LinkIcon, MapPin, Radio, Trophy, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { safeHref } from '@/lib/url-safety';
import { cn } from '@/lib/utils';
import type { EventDTO, EventVenueKindValue, RsvpResult } from '@/lib/events.server';
import { RsvpButton } from './RsvpButton';

const VENUE_META: Record<EventVenueKindValue, { icon: LucideIcon; labelKey: string; label: string }> = {
  SPACE: { icon: Radio, labelKey: 'venue-space', label: 'Space' },
  TOURNAMENT: { icon: Trophy, labelKey: 'venue-tournament', label: 'Tournament' },
  GAME: { icon: Gamepad2, labelKey: 'venue-game', label: 'Game' },
  URL: { icon: LinkIcon, labelKey: 'venue-url', label: 'Online' },
  IRL: { icon: MapPin, labelKey: 'venue-irl', label: 'In person' },
};

export function EventCard({ event }: { event: EventDTO }) {
  const { t } = useTranslation('site');
  // Local RSVP state so the button + counts update without a full refetch.
  const [going, setGoing] = useState(event.goingCount);
  const [maybe, setMaybe] = useState(event.maybeCount);
  const [viewerRsvp, setViewerRsvp] = useState(event.viewerRsvp);

  const canceled = !!event.canceledAt;
  const past = useMemo(() => new Date(event.startsAt).getTime() < Date.now(), [event.startsAt]);

  // Localized in the viewer's own timezone/locale. Suppressed for hydration
  // because the SSR pass formats with the server's timezone.
  const when = useMemo(() => {
    const start = new Date(event.startsAt);
    const fmt = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return fmt.format(start);
  }, [event.startsAt]);

  const venue = VENUE_META[event.venueKind];
  const VenueIcon = venue.icon;

  const onChange = (r: RsvpResult) => {
    setGoing(r.goingCount);
    setMaybe(r.maybeCount);
    setViewerRsvp(r.viewerRsvp);
  };

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-site border border-site-border bg-site-surface p-4',
        canceled && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-site-accent-dim px-2 py-0.5 text-xs font-medium text-site-accent">
              <VenueIcon className="h-3.5 w-3.5" aria-hidden />
              {t(venue.labelKey, { defaultValue: venue.label })}
            </span>
            {event.community && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-site-text-muted"
                style={{ background: (event.community.color || 'var(--site-accent)') + '1f' }}
              >
                {event.community.icon || '👥'} {event.community.name}
              </span>
            )}
            {canceled && (
              <span className="rounded-full bg-site-danger/15 px-2 py-0.5 text-xs font-medium text-site-danger">
                {t('event-canceled', { defaultValue: 'Canceled' })}
              </span>
            )}
          </div>
          <h3 className="mt-2 truncate text-base font-bold text-site-text">{event.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-site-text-muted">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            <time dateTime={event.startsAt} suppressHydrationWarning>
              {when}
            </time>
          </p>
        </div>
      </div>

      {event.description && (
        <p className="line-clamp-3 whitespace-pre-wrap text-sm text-site-text-muted">{event.description}</p>
      )}

      {event.venueKind === 'URL' && event.venueRef && !canceled && (
        <a
          href={safeHref(event.venueRef)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-site-accent hover:underline"
        >
          <LinkIcon className="h-4 w-4" aria-hidden />
          {t('event-join-link', { defaultValue: 'Join link' })}
        </a>
      )}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {event.attendees.length > 0 && (
            <div className="flex -space-x-2" aria-hidden>
              {event.attendees.slice(0, 5).map((a) => (
                <UserAvatar
                  key={a.id}
                  src={a.image}
                  alt={a.name ?? ''}
                  size={24}
                  className="ring-2 ring-site-surface"
                />
              ))}
            </div>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-site-text-dim">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {t('event-going-count', {
              count: going,
              defaultValue: '{{count}} going',
            })}
            {event.capacity != null ? ` / ${event.capacity}` : ''}
            {maybe > 0 ? ` · ${t('event-maybe-count', { count: maybe, defaultValue: '{{count}} maybe' })}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`/api/events/${event.id}/ics`}
            className="inline-flex items-center gap-1 text-xs font-medium text-site-text-muted hover:text-site-accent"
            aria-label={t('event-add-to-calendar', { defaultValue: 'Add to calendar' })}
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            {t('event-calendar', { defaultValue: 'Calendar' })}
          </a>
          {!canceled && !past && (
            <RsvpButton
              eventId={event.id}
              status={viewerRsvp}
              goingCount={going}
              capacity={event.capacity}
              onChange={onChange}
            />
          )}
        </div>
      </div>
    </li>
  );
}
