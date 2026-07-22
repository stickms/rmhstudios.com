'use client';

/**
 * EventsColumn — the Events surface, extracted from the old `/events` route so it
 * can be embedded as a tab inside `/communities`. Unlike the former route (which
 * SSR'd the "upcoming" list via a loader), this column fetches its own data
 * CLIENT-SIDE on mount — so the host page's loader only ever carries the
 * communities directory, not three datasets.
 *
 * The data still flows through the same `loadEvents` server function the route
 * used (kept here so the "My communities" sub-tab keeps calling
 * `listMemberCommunityEvents`, which the public `/api/events` endpoint doesn't
 * expose). TanStack Start compiles `.handler` into a typed RPC stub on the
 * client, so `@/lib/events.server` / `@/lib/auth` never reach the browser bundle.
 */

import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { CalendarDays, Plus } from 'lucide-react';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import { EventCard } from '@/components/events/EventCard';
import { EventComposer } from '@/components/events/EventComposer';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { auth } from '@/lib/auth';
import { listEvents, listMemberCommunityEvents, type EventDTO } from '@/lib/events.server';
import { AsyncReveal } from '@/components/motion';
import { useStableListMotion } from '@/hooks/useStableListMotion';

type EventTab = 'upcoming' | 'communities' | 'mine';

// One server function powering every sub-tab. On the client, TanStack Start
// turns this into an RPC — the handler body (and its server-only imports) is
// stripped from the browser bundle.
const loadEvents = createServerFn({ method: 'GET' })
  .validator((tab: EventTab): EventTab =>
    tab === 'communities' || tab === 'mine' ? tab : 'upcoming',
  )
  .handler(async ({ data: tab }): Promise<{ events: EventDTO[]; signedIn: boolean }> => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    const userId = session?.user.id ?? null;
    let events: EventDTO[];
    if (tab === 'mine') events = userId ? await listEvents({ scope: 'mine', userId }) : [];
    else if (tab === 'communities') events = userId ? await listMemberCommunityEvents(userId) : [];
    else events = await listEvents({ scope: 'upcoming', userId });
    return { events, signedIn: !!session };
  });

export function EventsColumn({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const signedIn = !!session;

  const [tab, setTab] = useState<EventTab>('upcoming');
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const enteringEvents = useStableListMotion(
    events.map((event) => event.id),
    { skipFirstAddition: true },
  );

  // No route loader seeds this column anymore, so we fetch on mount and again
  // whenever the sub-tab changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadEvents({ data: tab })
      .then((r) => {
        if (active) setEvents(r.events);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab]);

  const tabs: LiquidTab[] = [
    {
      id: 'upcoming',
      label: t('events-tab-upcoming', { defaultValue: 'Upcoming' }),
    },
    {
      id: 'communities',
      label: t('events-tab-communities', { defaultValue: 'My communities' }),
    },
    { id: 'mine', label: t('events-tab-mine', { defaultValue: "RSVP'd" }) },
  ];

  const needsSignIn = !signedIn && (tab === 'communities' || tab === 'mine');

  const onCreated = (event: EventDTO) => {
    setEvents((prev) => [event, ...prev.filter((e) => e.id !== event.id)]);
  };

  return (
    <div className="min-h-screen">
      <ColumnHeader
        icon={CalendarDays}
        title={t('events-heading', { defaultValue: 'Events' })}
        sticky={!embedded}
        showMenuButton={!embedded}
        actions={
          signedIn && (
            <Button size="sm" variant="accent" onClick={() => setComposerOpen(true)}>
              <Plus className="h-4 w-4" /> {t('new-button', { defaultValue: 'New' })}
            </Button>
          )
        }
      />

      <div className="px-3 py-3">
        <LiquidTabs
          tabs={tabs}
          value={tab}
          onChange={(id) => setTab(id as EventTab)}
          idBase="events"
          fullWidth
          scroll
          aria-label={t('events-filters', { defaultValue: 'Event filters' })}
        />
      </div>

      <div role="tabpanel" id={`events-panel-${tab}`} aria-labelledby={`events-tab-${tab}`}>
        {loading && (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        )}
        <AsyncReveal show={!loading}>
          {needsSignIn ? (
            <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
              <p className="font-medium text-site-text">
                {t('sign-in-to-see-events', { defaultValue: 'Sign in to see your events' })}
              </p>
              <Link to="/login" search={{ callbackURL: '/events' }}>
                <Button variant="accent">{t('sign-in', { defaultValue: 'Sign in' })}</Button>
              </Link>
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              description={
                tab === 'mine'
                  ? t('no-rsvp-events', {
                      defaultValue: "You haven't RSVP'd to any upcoming events yet.",
                    })
                  : tab === 'communities'
                    ? t('no-community-events', {
                        defaultValue: 'No upcoming events in your communities.',
                      })
                    : t('no-upcoming-events', {
                        defaultValue: 'No upcoming events yet — create the first one!',
                      })
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  className={enteringEvents.has(event.id) ? 'content-item-enter' : undefined}
                />
              ))}
            </ul>
          )}
        </AsyncReveal>
      </div>

      {signedIn && (
        <EventComposer open={composerOpen} onOpenChange={setComposerOpen} onCreated={onCreated} />
      )}
    </div>
  );
}
