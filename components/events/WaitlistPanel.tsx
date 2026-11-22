import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useArrival } from '@/components/ui/arrive';
import { serverError } from '@/lib/http';
import { removeFromWaitlist, waitlistQuery } from '@/lib/events/waitlist.queries';
import type { WaitlistViewDTO } from '@/lib/events/waitlist';

/**
 * The host's view of an event's waitlist: the queue in order, who joined when, and
 * a way to take someone off it. Rows on rules; the times are `t-meta`. Once the
 * event has started the queue is frozen (nobody is promoted) and says so.
 */
export function WaitlistPanel({ eventId, onChange }: { eventId: string; onChange?: (waiting: number) => void }) {
  const { t } = useTranslation('event-waitlist');
  const lf = useLocaleFormat();
  const queryClient = useQueryClient();
  const query = useQuery(waitlistQuery(eventId));
  const view: WaitlistViewDTO | null = query.data ?? null;
  const failed = query.isError;
  const [removing, setRemoving] = useState<string | null>(null);
  const arrival = useArrival(view != null || failed);

  const remove = useCallback(
    async (userId: string) => {
      setRemoving(userId);
      try {
        const next = await removeFromWaitlist(eventId, userId);
        queryClient.setQueryData(waitlistQuery(eventId).queryKey, next);
        onChange?.(next.waitlist.length);
        toast.success(t('removed', { defaultValue: 'Removed from the waitlist.' }));
      } catch (e) {
        toast.error(serverError(e) || t('remove-error', { defaultValue: 'Could not remove them from the waitlist.' }));
      } finally {
        setRemoving(null);
      }
    },
    [eventId, onChange, queryClient, t],
  );

  if (failed) {
    return (
      <p role="alert" className="t-body text-site-danger">
        {t('load-error', { defaultValue: 'Could not load the waitlist.' })}
      </p>
    );
  }
  if (!view) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <section aria-label={t('heading', { defaultValue: 'Waitlist' })} className={arrival}>
      {view.closed && (
        <p className="t-meta pb-2">
          {t('frozen', { defaultValue: 'The event has started. Nobody is promoted from the waitlist now.' })}
        </p>
      )}
      {view.waitlist.length === 0 ? (
        <p className="t-body py-2 text-site-text-muted">{t('empty', { defaultValue: 'Nobody is waiting.' })}</p>
      ) : (
        <ol>
          {view.waitlist.map((entry) => {
            const name = entry.name ?? entry.handle ?? t('someone', { defaultValue: 'A member' });
            return (
              <li key={entry.userId} className="flex items-center gap-3 border-b border-site-border py-2">
                <span className="t-meta w-6 shrink-0 text-right">{entry.position}</span>
                <UserAvatar src={entry.image} alt="" size={24} />
                <div className="min-w-0 flex-1">
                  <p className="t-body truncate text-site-text">{name}</p>
                  <p className="t-meta">
                    <time dateTime={entry.waitlistedAt}>
                      {t('joined', {
                        time: lf.dateTime(new Date(entry.waitlistedAt), { dateStyle: 'medium', timeStyle: 'short' }),
                        defaultValue: 'Joined {{time}}',
                      })}
                    </time>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removing === entry.userId}
                  aria-label={t('remove-aria', { name, defaultValue: 'Remove {{name}} from the waitlist' })}
                  onClick={() => remove(entry.userId)}
                >
                  {t('remove', { defaultValue: 'Remove' })}
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
