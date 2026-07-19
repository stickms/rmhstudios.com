import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Plus } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import { EventCard } from '@/components/events/EventCard';
import { EventComposer } from '@/components/events/EventComposer';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { listEvents, listMemberCommunityEvents, type EventDTO } from '@/lib/events.server';

type EventTab = 'upcoming' | 'communities' | 'mine';

// Single server function powering both the SSR loader and client-side tab
// switches. On the client, TanStack Start turns this into an RPC.
const loadEvents = createServerFn({ method: 'GET' })
  .validator((tab: EventTab): EventTab => (tab === 'communities' || tab === 'mine' ? tab : 'upcoming'))
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

export const Route = createFileRoute('/_site/events')({
  head: () => ({
    meta: [
      { title: 'Events | RMH Studios' },
      {
        name: 'description',
        content: 'Upcoming community events, tournaments, watch parties, and game nights. RSVP and get reminders.',
      },
    ],
  }),
  loader: () => loadEvents({ data: 'upcoming' }),
  component: EventsPage,
});

function EventsPage() {
  const initial = Route.useLoaderData();
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const signedIn = !!session;

  const [tab, setTab] = useState<EventTab>('upcoming');
  const [events, setEvents] = useState<EventDTO[]>(initial.events);
  const [loading, setLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // The loader already provided the 'upcoming' tab, so skip the first effect run
  // and only fetch when the tab actually changes.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
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

  const tabs: { id: EventTab; label: string; requiresAuth: boolean }[] = [
    { id: 'upcoming', label: t('events-tab-upcoming', { defaultValue: 'Upcoming' }), requiresAuth: false },
    { id: 'communities', label: t('events-tab-communities', { defaultValue: 'My communities' }), requiresAuth: true },
    { id: 'mine', label: t('events-tab-mine', { defaultValue: "RSVP'd" }), requiresAuth: true },
  ];

  const needsSignIn = !signedIn && (tab === 'communities' || tab === 'mine');

  const onCreated = (event: EventDTO) => {
    setEvents((prev) => [event, ...prev.filter((e) => e.id !== event.id)]);
  };

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <div className="min-h-screen">
          <ColumnHeader
            icon={CalendarDays}
            title={t('events-heading', { defaultValue: 'Events' })}
            actions={
              signedIn && (
                <Button size="sm" variant="accent" onClick={() => setComposerOpen(true)}>
                  <Plus className="h-4 w-4" /> {t('new-button', { defaultValue: 'New' })}
                </Button>
              )
            }
          />

          <div className="flex items-center gap-1 border-b border-site-border p-2">
            {tabs.map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setTab(tabItem.id)}
                aria-pressed={tab === tabItem.id}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === tabItem.id
                    ? 'bg-site-accent-dim text-site-accent'
                    : 'text-site-text-muted hover:bg-site-surface-hover hover:text-site-text',
                )}
              >
                {tabItem.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : needsSignIn ? (
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
                  ? t('no-rsvp-events', { defaultValue: "You haven't RSVP'd to any upcoming events yet." })
                  : tab === 'communities'
                    ? t('no-community-events', { defaultValue: 'No upcoming events in your communities.' })
                    : t('no-upcoming-events', { defaultValue: 'No upcoming events yet — create the first one!' })
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </ul>
          )}
        </div>
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />

      {signedIn && <EventComposer open={composerOpen} onOpenChange={setComposerOpen} onCreated={onCreated} />}
    </>
  );
}
