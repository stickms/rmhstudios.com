/**
 * s06-11 — the host's updates on the event card: the latest one under the description with its author and time,
 * "All updates (n)" for the rest, "Post an update" for the host, co-hosts and admins, and Delete for ten minutes.
 * Updates are rows on rules; text renders as text, with links made safe by `SafeLink`.
 */
import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { SafeLink } from '@/components/safety/SafeLink';
import { api, apiQuery } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { formatDate, formatTime } from '@/lib/core/format';
import { safeHref } from '@/lib/url-safety';
import { deleteUpdateApi, listUpdatesApi } from '@/lib/events/updates.contract';
import { UPDATE_DELETE_WINDOW_MS, type EventUpdateDTO } from '@/lib/events/updates';
import type { UpcomingDateDTO } from '@/lib/events/occurrences';
import { PostUpdateDialog } from './PostUpdateDialog';

const URL_RE = /(https?:\/\/[^\s<>]+)/g;

/** Plain text with each web address turned into a checked link. Nothing is ever parsed as markup. */
function Linked({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 === 1 && safeHref(part) !== '#' ? (
          <SafeLink key={i} href={part} className="underline">
            {part}
          </SafeLink>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function EventUpdates({
  eventId,
  manager,
  canceled,
  repeating,
  className,
}: {
  eventId: string;
  /** The viewer is the host, an accepted co-host or an admin. */
  manager: boolean;
  canceled: boolean;
  repeating?: { tz: string; dates: UpcomingDateDTO[] } | undefined;
  className?: string;
}) {
  const { t, i18n } = useTranslation('event-updates');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const listOptions = apiQuery(listUpdatesApi, { params: { id: eventId } });
  const listQuery = useQuery({ ...listOptions, retry: false });
  const updates: EventUpdateDTO[] | null = listQuery.data?.updates ?? null;
  const failed = listQuery.isError;
  const setUpdates = (next: (list: EventUpdateDTO[] | null) => EventUpdateDTO[]) =>
    queryClient.setQueryData(listOptions.queryKey, (old: { updates: EventUpdateDTO[] } | undefined) => ({
      ...old,
      updates: next(old?.updates ?? null),
    }));
  const [all, setAll] = useState(false);
  const [posting, setPosting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const arrive = useArrival(updates !== null);

  const stamp = (u: EventUpdateDTO) => {
    const at = new Date(u.createdAt);
    return `${formatDate(at, i18n.language, { day: 'numeric', month: 'short' })}, ${formatTime(at, i18n.language, { hour: 'numeric', minute: '2-digit' })}`;
  };
  const shown = useMemo(() => (updates ?? []).slice(0, all ? undefined : 1), [updates, all]);

  const remove = async (u: EventUpdateDTO) => {
    const ok = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this update?' }),
      description: t('delete-body', { defaultValue: 'It is removed from the event. People who were told keep their notification.' }),
      confirmLabel: t('delete', { defaultValue: 'Delete' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteUpdateApi, { params: { id: eventId, updateId: u.id } });
      setUpdates((list) => (list ?? []).filter((x) => x.id !== u.id));
    } catch {
      toast.error(t('error-delete', { defaultValue: 'That update can no longer be deleted.' }));
      setNow(Date.now());
    }
  };

  const canPost = manager && !canceled;
  if (failed && !canPost) return null;

  return (
    <section aria-labelledby={`updates-${eventId}`} className={cn('flex flex-col gap-2', className)}>
      {(updates === null || updates.length > 0 || canPost) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 id={`updates-${eventId}`} className="t-label">
            {t('title', { defaultValue: 'Updates' })}
          </h4>
          {canPost && (
            <Button size="sm" variant="ghost" onClick={() => setPosting(true)}>
              {t('post', { defaultValue: 'Post an update' })}
            </Button>
          )}
        </div>
      )}
      {updates === null && !failed && <Skeleton className="h-10 w-full" />}
      {failed && (
        <p role="alert" className="t-meta">
          {t('error-load', { defaultValue: 'Updates could not be loaded.' })}
        </p>
      )}
      {updates && updates.length > 0 && (
        <ul className={arrive}>
          {shown.map((u) => (
            <li key={u.id} className="flex flex-col gap-1 border-b border-site-border py-2">
              <p className="t-body whitespace-pre-wrap break-words">
                <Linked text={u.body} />
              </p>
              <p className="t-meta flex flex-wrap items-center gap-x-2">
                <span>{u.author?.name ?? (u.author?.handle ? `@${u.author.handle}` : t('author-unknown', { defaultValue: 'The host' }))}</span>
                <span>{stamp(u)}</span>
                {u.canDelete && now - new Date(u.createdAt).getTime() < UPDATE_DELETE_WINDOW_MS && (
                  <Button size="sm" variant="ghost" onClick={() => void remove(u)}>
                    {t('delete', { defaultValue: 'Delete' })}
                  </Button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {updates && updates.length > 1 && (
        <div>
          <Button size="sm" variant="ghost" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all
              ? t('show-latest', { defaultValue: 'Latest only' })
              : t('show-all', { count: updates.length, defaultValue: 'All updates ({{count}})' })}
          </Button>
        </div>
      )}
      {posting && (
        <PostUpdateDialog
          open
          onOpenChange={setPosting}
          eventId={eventId}
          repeating={repeating}
          onPosted={(u) => setUpdates((list) => [u, ...(list ?? [])])}
        />
      )}
    </section>
  );
}
