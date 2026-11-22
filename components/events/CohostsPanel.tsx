/**
 * s05-05 — the viewer's side of an event's co-hosts, on the event card:
 *  - the host: who is invited or co-hosting (rows on rules), Remove, and the member search to invite;
 *  - an accepted co-host: a way to step down;
 *  - an invited member: Accept (the view's one ink primary) and Decline.
 * State changes are announced in a polite live region.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import { listCohostsApi, removeCohostApi, respondCohostApi } from '@/lib/events/cohosts.contract';
import {
  MAX_COHOSTS,
  personLabel,
  type CohostEntryDTO,
  type CohostRefusal,
  type EventViewerRole,
} from '@/lib/events/cohosts';
import { CohostInvite } from './CohostInvite';

interface CohostsPanelProps {
  eventId: string;
  /** The signed-in member (needed to step down). */
  viewerId: string;
  /** The host's own id, so the invite search does not suggest them. */
  hostId: string;
  /** The viewer's role as the card knows it. */
  role: EventViewerRole;
  /** The viewer's role changed (accepted, declined, stepped down). */
  onRole: (role: EventViewerRole) => void;
  /** The host's list changed; the card shows the accepted ones. */
  onEntries: (entries: CohostEntryDTO[]) => void;
}

export function CohostsPanel({ eventId, viewerId, hostId, role, onRole, onEntries }: CohostsPanelProps) {
  const { t } = useTranslation('event-cohosts');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const options = apiQuery(listCohostsApi, { params: { id: eventId } });
  const query = useQuery({ ...options, enabled: role === 'host', retry: false });
  const entries = query.data?.cohosts ?? null;
  const arrival = useArrival(entries != null);

  const failed = (e: unknown) => {
    const code = errorField<CohostRefusal>(e, 'code');
    toast.error(
      code === 'canceled'
        ? t('error-canceled', { defaultValue: 'This event was canceled.' })
        : code === 'no-invite' || code === 'not-found'
          ? t('error-gone', { defaultValue: 'That invitation is no longer open.' })
          : t('error-generic', { defaultValue: 'Something went wrong. Try again.' }),
    );
  };

  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await api(respondCohostApi, { params: { id: eventId }, body: { accept } });
      setAnnouncement(
        accept
          ? t('accepted-announce', { defaultValue: 'You are now a co-host.' })
          : t('declined-announce', { defaultValue: 'Invitation declined.' }),
      );
      onRole(accept ? 'cohost' : null);
    } catch (e) {
      failed(e);
      if (errorField<CohostRefusal>(e, 'code') === 'no-invite') onRole(null);
    } finally {
      setBusy(false);
    }
  };

  const stepDown = async () => {
    const ok = await confirm({
      title: t('step-down-title', { defaultValue: 'Step down as co-host?' }),
      description: t('step-down-body', {
        defaultValue:
          'You will no longer be able to edit this event or manage its guests. The host can invite you again.',
      }),
      confirmLabel: t('step-down', { defaultValue: 'Step down' }),
      cancelLabel: t('keep-role', { defaultValue: 'Stay co-host' }),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(removeCohostApi, { params: { id: eventId }, query: { userId: viewerId } });
      setAnnouncement(t('stepped-down-announce', { defaultValue: 'You stepped down as co-host.' }));
      onRole(null);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  const publish = (next: CohostEntryDTO[]) => {
    queryClient.setQueryData(options.queryKey, { cohosts: next, max: MAX_COHOSTS });
    onEntries(next);
  };

  const remove = async (entry: CohostEntryDTO) => {
    const name = personLabel(entry) ?? t('someone', { defaultValue: 'A member' });
    const ok = await confirm({
      title: t('remove-title', { name, defaultValue: 'Remove {{name}}?' }),
      description: t('remove-body', {
        defaultValue: 'They lose access to this event right away. They are not told.',
      }),
      confirmLabel: t('remove', { defaultValue: 'Remove' }),
      cancelLabel: t('keep', { defaultValue: 'Keep' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(removeCohostApi, { params: { id: eventId }, query: { userId: entry.id } });
      setAnnouncement(t('removed-announce', { name, defaultValue: '{{name}} was removed.' }));
      publish((entries ?? []).filter((c) => c.id !== entry.id));
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  const live = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  if (role === 'invited') {
    return (
      <section
        aria-label={t('heading', { defaultValue: 'Co-hosts' })}
        className="flex flex-col gap-2 border-t border-site-border pt-3"
      >
        <p className="t-body">{t('invited-body', { defaultValue: 'You were invited to co-host this event.' })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void respond(true)}>
            {t('accept', { defaultValue: 'Accept' })}
          </Button>
          <Button variant="default" disabled={busy} onClick={() => void respond(false)}>
            {t('decline', { defaultValue: 'Decline' })}
          </Button>
        </div>
        {live}
      </section>
    );
  }

  if (role === 'cohost') {
    return (
      <section
        aria-label={t('heading', { defaultValue: 'Co-hosts' })}
        className="flex flex-wrap items-center justify-between gap-2 border-t border-site-border pt-3"
      >
        <p className="t-body text-site-text-muted">{t('cohost-body', { defaultValue: 'You co-host this event.' })}</p>
        <Button variant="default" disabled={busy} onClick={() => void stepDown()}>
          {t('step-down', { defaultValue: 'Step down' })}
        </Button>
        {live}
      </section>
    );
  }

  if (role !== 'host') return null;

  const statusLabel = (entry: CohostEntryDTO) =>
    entry.status === 'accepted'
      ? t('status-accepted', { defaultValue: 'Co-host' })
      : t('status-invited', { defaultValue: 'Invited' });

  return (
    <section
      aria-label={t('heading', { defaultValue: 'Co-hosts' })}
      className="flex flex-col gap-3 border-t border-site-border pt-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="t-heading">{t('heading', { defaultValue: 'Co-hosts' })}</h4>
        {entries && (
          <p className="t-meta">
            {t('used', { used: entries.length, max: MAX_COHOSTS, defaultValue: '{{used}} of {{max}}' })}
          </p>
        )}
      </div>
      {query.isError ? (
        <p role="alert" className="t-body text-site-danger">
          {t('load-error', { defaultValue: 'Could not load the co-hosts.' })}
        </p>
      ) : !entries ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <div className={arrival}>
          {entries.length === 0 ? (
            <p className="t-body text-site-text-muted">
              {t('empty', { defaultValue: 'No co-hosts yet. A co-host can edit the event and look after its guests.' })}
            </p>
          ) : (
            <ul>
              {entries.map((entry) => {
                const name = personLabel(entry) ?? t('someone', { defaultValue: 'A member' });
                return (
                  <li key={entry.id} className="flex items-center gap-3 border-b border-site-border py-2">
                    <UserAvatar src={entry.image} alt="" size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="t-body truncate text-site-text">{name}</p>
                      <p className="t-meta">{statusLabel(entry)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={t('remove-aria', { name, defaultValue: 'Remove {{name}} as co-host' })}
                      onClick={() => void remove(entry)}
                    >
                      {t('remove', { defaultValue: 'Remove' })}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {entries.length < MAX_COHOSTS ? (
            <div className="pt-3">
              <CohostInvite
                eventId={eventId}
                excludeIds={[hostId, ...entries.map((c) => c.id)]}
                onAnnounce={setAnnouncement}
                onInvited={(entry) => publish([...entries.filter((c) => c.id !== entry.id), entry])}
              />
            </div>
          ) : (
            <p className="t-meta pt-3">
              {t('full', { max: MAX_COHOSTS, defaultValue: 'That is the most co-hosts an event can have ({{max}}).' })}
            </p>
          )}
        </div>
      )}
      {live}
    </section>
  );
}
