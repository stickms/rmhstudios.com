import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Gamepad2, Link as LinkIcon, MapPin, Radio, Trophy, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SITE_URL } from '@/lib/seo';
import { safeHref } from '@/lib/url-safety';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import type { EventDTO, EventVenueKindValue, RsvpResult } from '@/lib/events.server';
import { EventTime } from './EventTime';
import { RsvpButton } from './RsvpButton';
import { CohostsPanel } from './CohostsPanel';
import { EventComposer } from './EventComposer';
import { WaitlistPanel } from './WaitlistPanel';
import { UpcomingDates } from './OccurrenceMenu';
import { EventUpdates } from './EventUpdates';
import { formatDate } from '@/lib/core/format';
import type { OccurrencesRes } from '@/lib/events/occurrences.contract';
import { EventRecurrenceInfo } from '@/components/calendar/EventRecurrenceInfo';
import { canManage, cohostLabels, type CohostEntryDTO, type CohostPersonDTO, type EventViewerRole } from '@/lib/events/cohosts';

const VENUE_META: Record<
  EventVenueKindValue,
  { icon: LucideIcon; labelKey: string; label: string }
> = {
  SPACE: { icon: Radio, labelKey: 'venue-space', label: 'Space' },
  TOURNAMENT: { icon: Trophy, labelKey: 'venue-tournament', label: 'Tournament' },
  GAME: { icon: Gamepad2, labelKey: 'venue-game', label: 'Game' },
  URL: { icon: LinkIcon, labelKey: 'venue-url', label: 'Online' },
  IRL: { icon: MapPin, labelKey: 'venue-irl', label: 'In person' },
};

export function EventCard({ event: initial, className }: { event: EventDTO; className?: string }) {
  const { t } = useTranslation('site');
  const { t: tr } = useTranslation('event-waitlist');
  const { t: tc, i18n } = useTranslation('event-cohosts');
  const { t: to } = useTranslation('event-occurrences');
  // An edit made here (by the host or a co-host) replaces what the list handed down.
  const [edited, setEdited] = useState<EventDTO | null>(null);
  const event = edited ?? initial;
  const [role, setRole] = useState<EventViewerRole>(initial.viewerRole);
  const [cohosts, setCohosts] = useState<CohostPersonDTO[]>(initial.cohosts);
  const [editing, setEditing] = useState(false);
  const [cohostsOpen, setCohostsOpen] = useState(false);
  const { data: session } = useSession();
  // Local RSVP state so the button + counts update without a full refetch.
  const [going, setGoing] = useState(event.goingCount);
  const [maybe, setMaybe] = useState(event.maybeCount);
  const [viewerRsvp, setViewerRsvp] = useState(event.viewerRsvp);
  const [waiting, setWaiting] = useState(event.waitlistCount);
  const [place, setPlace] = useState(event.viewerWaitlistPosition);
  const [hostOpen, setHostOpen] = useState(false);

  const canceled = !!event.canceledAt;
  const past = useMemo(() => new Date(event.startsAt).getTime() < Date.now(), [event.startsAt]);

  // One location line, reused by the venue chip and by the calendar entries, so
  // an event added to somebody's calendar says where it is.
  const location = useMemo(() => {
    if (event.venueKind === 'URL') return event.venueRef;
    if (event.venueRef) return `${event.venueKind}: ${event.venueRef}`;
    return event.community?.name ?? null;
  }, [event.venueKind, event.venueRef, event.community]);

  const venue = VENUE_META[event.venueKind];
  const VenueIcon = venue.icon;

  const onChange = (r: RsvpResult) => {
    setGoing(r.goingCount);
    setMaybe(r.maybeCount);
    setViewerRsvp(r.viewerRsvp);
    setWaiting(r.waitlistCount ?? 0);
    setPlace(r.viewerWaitlistPosition ?? null);
  };

  // The host and an accepted co-host manage the event; an invited member has no rights until they accept.
  const manager = canManage(role);
  const isHost = role === 'host';
  const viewerId = session?.user.id ?? null;
  const hostedBy = (() => {
    const others = cohostLabels(cohosts);
    const host = event.host.name ?? (event.host.handle ? `@${event.host.handle}` : null);
    if (others.length === 0 || !host) return null;
    const list = new Intl.ListFormat(i18n.language || undefined, { style: 'long', type: 'conjunction' }).format(others);
    return tc('hosted-by', { host, others: list, defaultValue: 'Hosted by {{host}} with {{others}}' });
  })();
  const onRole = (next: EventViewerRole) => {
    setRole(next);
    if (next === 'cohost' && session) {
      const me = { id: session.user.id, name: session.user.name ?? null, handle: null, image: session.user.image ?? null };
      setCohosts((list) => (list.some((c) => c.id === me.id) ? list : [...list, me]));
    } else if (next === null && session) {
      setCohosts((list) => list.filter((c) => c.id !== session.user.id));
    }
  };
  // s06-10 — the host changed a date: refresh the list and, when the shown date itself moved or was
  // skipped, the time in the header.
  const onOccurrences = ({ upcoming, summary }: OccurrencesRes) => {
    const rec = event.recurrence;
    if (!rec) return;
    const live = upcoming.find((u) => u.state !== 'skipped');
    // The counts and the viewer's answer belong to the date shown: when that date changed, take the new one's.
    if (summary && summary.occurrenceAt !== rec.occurrenceAt) {
      setGoing(summary.goingCount);
      setMaybe(summary.maybeCount);
      setViewerRsvp(summary.viewerRsvp);
      setWaiting(0);
      setPlace(null);
    }
    setEdited({
      ...event,
      ...(live ? { startsAt: live.startsAt, endsAt: live.endsAt } : {}),
      recurrence: { ...rec, ...(live ? { occurrenceAt: live.occurrenceAt } : {}), upcoming },
    });
  };
  const movedFrom = event.recurrence?.upcoming?.find(
    (u) => u.occurrenceAt === event.recurrence?.occurrenceAt && u.state === 'moved',
  );
  const onEntries = (entries: CohostEntryDTO[]) => setCohosts(entries.filter((c) => c.status === 'accepted'));
  const waitlistLine =
    viewerRsvp === 'waitlist' && place != null
      ? tr('card-waitlisted', { count: place, defaultValue: 'Waitlisted, number {{count}}' })
      : waiting > 0
        ? tr('card-full-waiting', { count: waiting, defaultValue: 'Full · {{count}} waiting' })
        : null;

  return (
    <li
      className={cn(
'flex flex-col gap-3 py-4',
        canceled && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">
              <VenueIcon aria-hidden />
              {t(venue.labelKey, { defaultValue: venue.label })}
            </Badge>
            {event.community && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-site-text-muted"
                style={{ background: (event.community.color || 'var(--site-accent)') + '1f' }}
              >
                {event.community.icon || '👥'} {event.community.name}
              </span>
            )}
            {canceled && (
              <Badge variant="danger">{t('event-canceled', { defaultValue: 'Canceled' })}</Badge>
            )}
          </div>
          <h3 className="mt-2 truncate text-base font-semibold text-site-text">{event.title}</h3>
          {hostedBy && <p className="t-meta mt-1">{hostedBy}</p>}
          {/* Always the viewer's zone, always labelled — plus the organiser's
              in parentheses when the two clocks differ (B24). */}
          <p className="mt-1 flex items-center gap-2 text-sm text-site-text-muted">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            <EventTime
              startsAt={event.startsAt}
              endsAt={event.endsAt}
              eventId={event.id}
              calendar={{
                title: event.title,
                description: event.description,
                location,
                url:
                  event.venueKind === 'URL' && event.venueRef
                    ? event.venueRef
                    : `${SITE_URL}/events`,
              }}
            />
          </p>
          {movedFrom && event.recurrence && (
            <p className="t-meta mt-1">
              {to('moved-from', {
                date: formatDate(movedFrom.occurrenceAt, i18n.language, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  timeZone: event.recurrence.tz,
                }),
                defaultValue: 'Moved from {{date}}',
              })}
              {movedFrom.note ? ` · ${movedFrom.note}` : ''}
            </p>
          )}
        </div>
      </div>

      {event.description && (
        <p dir="auto" className="line-clamp-3 whitespace-pre-wrap text-sm text-site-text-muted">
          {event.description}
        </p>
      )}

      <EventUpdates
        eventId={event.id}
        manager={manager || !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin}
        canceled={canceled}
        repeating={event.recurrence?.upcoming ? { tz: event.recurrence.tz, dates: event.recurrence.upcoming } : undefined}
      />

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
          <span className="inline-flex items-center gap-1 text-xs text-site-text-muted">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {t('event-going-count', {
              count: going,
              defaultValue: '{{count}} going',
            })}
            {event.capacity != null ? ` / ${event.capacity}` : ''}
            {maybe > 0
              ? ` · ${t('event-maybe-count', { count: maybe, defaultValue: '{{count}} maybe' })}`
              : ''}
            {waitlistLine ? ` · ${waitlistLine}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* The add-to-calendar menu moved up beside the time (B24): it is a
              property of *when*, and splitting them made it easy to miss. */}
          {!canceled && !past && (
            <RsvpButton
              eventId={event.id}
              status={viewerRsvp}
              goingCount={going}
              capacity={event.capacity}
              waitlistPosition={place}
              onChange={onChange}
            />
          )}
          {!canceled && past && (waiting > 0 || viewerRsvp === 'waitlist') && (
            <span className="t-meta">{tr('closed', { defaultValue: 'Waitlist closed' })}</span>
          )}
        </div>
      </div>
      {manager && !event.recurrence && waiting > 0 && (
        <div>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={hostOpen}
            aria-controls={`waitlist-${event.id}`}
            onClick={() => setHostOpen((open) => !open)}
          >
            {hostOpen
              ? tr('host-hide', { defaultValue: 'Hide waitlist' })
              : tr('host-show', { count: waiting, defaultValue: 'Show waitlist ({{count}})' })}
          </Button>
          {hostOpen && (
            <div id={`waitlist-${event.id}`} className="mt-2">
              <WaitlistPanel eventId={event.id} onChange={setWaiting} />
            </div>
          )}
        </div>
      )}
      {manager && !canceled && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {tc('edit', { defaultValue: 'Edit event' })}
          </Button>
          {isHost && (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={cohostsOpen}
              aria-controls={`cohosts-${event.id}`}
              onClick={() => setCohostsOpen((open) => !open)}
            >
              {cohostsOpen ? tc('hide', { defaultValue: 'Hide co-hosts' }) : tc('show', { defaultValue: 'Co-hosts' })}
            </Button>
          )}
        </div>
      )}
      {viewerId && (role === 'invited' || role === 'cohost' || (isHost && cohostsOpen)) && (
        <div id={`cohosts-${event.id}`}>
          <CohostsPanel
            eventId={event.id}
            viewerId={viewerId}
            hostId={event.hostId}
            role={role}
            onRole={onRole}
            onEntries={onEntries}
          />
        </div>
      )}
      {editing && (
        <EventComposer
          open
          event={event}
          onOpenChange={setEditing}
          onUpdated={(updated) => setEdited(updated)}
        />
      )}
      {event.recurrence && !canceled && !past && (
        <EventRecurrenceInfo event={{ ...event, viewerRsvp }} onChange={onChange} />
      )}
      {event.recurrence?.upcoming && !canceled && !past && (
        <UpcomingDates
          eventId={event.id}
          tz={event.recurrence.tz}
          dates={event.recurrence.upcoming}
          canManage={manager}
          onChanged={onOccurrences}
        />
      )}
    </li>
  );
}
