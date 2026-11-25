/**
 * A community's Events tab (s10-07): upcoming events with RSVP through the ordinary event card, a "Host an event" button
 * for moderators (the composer with `communityId`), and the last 20 ended events below a rule once asked for. A lazy
 * chunk, fetched when the tab opens; one request, the past list only when someone wants it.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useArrival } from '@/components/ui/arrive';
import { EventCard } from '@/components/events/EventCard';
import { EventComposer } from '@/components/events/EventComposer';
import { apiQuery } from '@/lib/contract/client';
import { communityEventsApi } from '@/lib/communities/events.contract';
import type { EventDTO } from '@/lib/events.server';

/**
 * A row's key: the event and what the server says about it. The card keeps its own RSVP counts once it has mounted, so
 * a list read again after a refused RSVP remounts the row to show the server's counts, not the card's.
 */
export const eventRowKey = (
  event: Pick<EventDTO, 'id' | 'goingCount' | 'maybeCount' | 'waitlistCount' | 'viewerRsvp'>,
): string => [event.id, event.goingCount, event.maybeCount, event.waitlistCount, event.viewerRsvp ?? 'none'].join(':');

/** The rows of one list: each event is its own card, divided by a rule. */
export function CommunityEventRows({
  events,
  className,
  onRsvpRefused,
}: {
  events: EventDTO[];
  className?: string | undefined;
  onRsvpRefused?: (() => void) | undefined;
}) {
  return (
    <ul className={className}>
      {events.map((event) => (
        <li key={eventRowKey(event)} className="border-b border-site-border">
          <EventCard event={event} {...(onRsvpRefused ? { onRsvpRefused } : {})} />
        </li>
      ))}
    </ul>
  );
}

/** What the panel shows for a list that has settled; pure, so the markup can be tested without a query client. */
export function CommunityEventsView({
  events,
  isMod,
  onHost,
  pastOpen,
  onShowPast,
  past,
  pastLoading,
  pastFailed,
  onRsvpRefused,
}: {
  events: EventDTO[];
  isMod: boolean;
  onHost: () => void;
  pastOpen: boolean;
  onShowPast: () => void;
  past: EventDTO[] | undefined;
  pastLoading: boolean;
  pastFailed: boolean;
  /** An RSVP was refused: read the lists again. */
  onRsvpRefused?: (() => void) | undefined;
}) {
  const { t } = useTranslation('community-events');
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="t-meta" aria-live="polite">
          {events.length === 0
            ? t('count-none', { defaultValue: 'No events coming up' })
            : t('count-coming', { n: events.length, defaultValue: '{{n}} coming up' })}
        </p>
        {isMod && (
          <Button variant="default" size="sm" onClick={onHost}>
            {t('host-button', { defaultValue: 'Host an event' })}
          </Button>
        )}
      </div>

      {events.length === 0 ? (
        <EmptyState
          className="px-4"
          title={t('empty-title', { defaultValue: 'No events yet' })}
          description={
            isMod
              ? t('empty-mod', { defaultValue: 'Host a game night or a meet-up and members can answer here.' })
              : t('empty-member', { defaultValue: 'When a moderator hosts an event, it will be listed here.' })
          }
        />
      ) : (
        <CommunityEventRows events={events} onRsvpRefused={onRsvpRefused} />
      )}

      <section aria-label={t('past-label', { defaultValue: 'Past events' })} className="border-t border-site-border">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h3 className="t-label">{t('past-heading', { defaultValue: 'Past events' })}</h3>
          {!pastOpen && (
            <Button variant="ghost" size="sm" onClick={onShowPast}>
              {t('past-show', { defaultValue: 'Show past events' })}
            </Button>
          )}
        </div>
        {pastOpen && pastLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {pastOpen && pastFailed && (
          <p className="t-body px-4 pb-4 text-site-text-muted" role="alert">
            {t('past-error', { defaultValue: 'Could not load past events.' })}
          </p>
        )}
        {pastOpen && past && past.length === 0 && (
          <p className="t-body px-4 pb-4 text-site-text-muted">
            {t('past-empty', { defaultValue: 'No past events.' })}
          </p>
        )}
        {pastOpen && past && past.length > 0 && <CommunityEventRows events={past} onRsvpRefused={onRsvpRefused} />}
      </section>
    </div>
  );
}

export default function CommunityEventsPanel({
  slug,
  communityId,
  communityName,
  isMod,
}: {
  slug: string;
  communityId: string;
  communityName: string;
  isMod: boolean;
}) {
  const { t } = useTranslation('community-events');
  const [composerOpen, setComposerOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  const queryClient = useQueryClient();
  // An RSVP that was refused (a full event, a ban) means the card's counts may not be the server's: the lists are read
  // again, and a row whose counts changed is remounted (`eventRowKey`).
  const refreshEvents = () => void queryClient.invalidateQueries({ queryKey: [communityEventsApi.path] });

  const upcoming = useQuery(apiQuery(communityEventsApi, { params: { slug }, query: { when: 'upcoming' } }));
  const pastQuery = useQuery({
    ...apiQuery(communityEventsApi, { params: { slug }, query: { when: 'past' } }),
    enabled: pastOpen,
  });
  const arrival = useArrival(!!upcoming.data);

  if (upcoming.isError) {
    return (
      <EmptyState
        className="px-4"
        title={t('error-title', { defaultValue: 'Could not load events' })}
        action={
          <Button variant="default" size="sm" onClick={() => void upcoming.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        }
      />
    );
  }
  if (!upcoming.data) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className={arrival}>
      <CommunityEventsView
        events={upcoming.data.events}
        isMod={isMod}
        onHost={() => setComposerOpen(true)}
        pastOpen={pastOpen}
        onShowPast={() => setPastOpen(true)}
        past={pastQuery.data?.events}
        pastLoading={pastQuery.isPending && pastQuery.fetchStatus !== 'idle'}
        pastFailed={pastQuery.isError}
        onRsvpRefused={refreshEvents}
      />
      {isMod && composerOpen && (
        <EventComposer
          open
          onOpenChange={setComposerOpen}
          communityId={communityId}
          communityName={communityName}
          onCreated={() => void upcoming.refetch()}
        />
      )}
    </div>
  );
}
