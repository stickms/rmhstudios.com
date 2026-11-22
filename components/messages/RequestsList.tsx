import { useRefusalText } from '@/components/errors/useRefusalText';
import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { useSession } from '@/components/Providers';
import { api } from '@/lib/contract/client';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { toggleBlockApi } from '@/lib/moderation/moderation.contract';
import {
  decideMessageRequestApi,
  listMessageRequestsApi,
  type MessageRequestItem,
} from '@/lib/messages/requests.contract';
import { toast } from '@/lib/toast';

type Action = 'accept' | 'decline' | 'block';

/**
 * The Requests folder (s04-16): the one text message each stranger left, with
 * Accept, Decline and Block. Reading a request marks nothing as read for the
 * sender; only Accept opens the conversation.
 */
export function RequestsList() {
  const { t, i18n } = useTranslation('message-requests');
  const refusalText = useRefusalText();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['message-requests'],
    enabled: !!session,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api(listMessageRequestsApi, { query: { cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = useMemo(
    () => (list.data?.pages ?? []).flatMap((p) => p.requests).filter((r) => !answered.has(r.id)),
    [list.data, answered],
  );
  const arrival = useArrival(!list.isPending);
  const isNew = useArrivingKeys(rows.map((r) => r.id));

  if (!session) {
    return (
      <EmptyState
        title={t('sign-in-title', { defaultValue: 'Sign in to see message requests' })}
        description={t('sign-in-description', {
          defaultValue: 'Message requests are private to your account.',
        })}
        action={
          <Button asChild>
            <Link to="/login" search={{ callbackURL: undefined }}>
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>
          </Button>
        }
      />
    );
  }

  if (list.isPending) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={24} />
      </div>
    );
  }

  if (list.isError && rows.length === 0) {
    return (
      <EmptyState
        title={t('load-failed-title', { defaultValue: 'Could not load message requests' })}
        description={t('load-failed-description', { defaultValue: 'Check your connection and try again.' })}
        action={<Button onClick={() => void list.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
      />
    );
  }

  const decide = async (request: MessageRequestItem, action: Action) => {
    const name = request.sender.name ?? request.sender.username ?? '';
    if (action === 'block') {
      const ok = await confirm({
        title: t('block-confirm-title', { name, defaultValue: 'Block {{name}}?' }),
        description: t('block-confirm-description', {
          defaultValue: 'They will not be able to message you or see your posts, and this request is declined.',
        }),
        confirmLabel: t('block', { defaultValue: 'Block' }),
        cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(request.id);
    try {
      // Block is the existing block, after the request is declined: a failure between the two leaves a declined
      // request, never a blocked sender whose request still waits.
      const res = await api(decideMessageRequestApi, {
        params: { id: request.id },
        body: { action: action === 'accept' ? 'accept' : 'decline' },
      });
      if (action === 'block') await api(toggleBlockApi, { body: { targetUserId: request.sender.id } });
      setAnswered((prev) => new Set(prev).add(request.id));
      if (action === 'accept') {
        toast.success(t('accepted', { name, defaultValue: 'Accepted. You can now message {{name}}.' }));
        void navigate({ to: `/messages/${res.conversationId}` as string });
      } else if (action === 'block') {
        toast.success(t('blocked', { name, defaultValue: 'Blocked {{name}}.' }));
      } else {
        toast.success(t('declined', { defaultValue: 'Request declined.' }));
      }
    } catch (error) {
      toast.error(refusalText.maybe(error) ?? t('decide-failed', { defaultValue: 'Could not update the request.' }));
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        className={arrival}
        title={t('empty-title', { defaultValue: 'No message requests' })}
        description={t('empty-description', {
          defaultValue: 'When someone who cannot message you directly writes to you, it waits here.',
        })}
      />
    );
  }

  return (
    <div className={arrival}>
      <ul aria-label={t('list-label', { defaultValue: 'Message requests' })}>
        {rows.map((request) => {
          const name = request.sender.name ?? request.sender.username ?? '';
          const disabled = busy === request.id;
          return (
            <li
              key={request.id}
              className={`flex flex-col gap-3 border-b border-site-border py-4 ${isNew(request.id) ? ARRIVE : ''}`}
            >
              <div className="flex items-start gap-3">
                <UserAvatar src={request.sender.image} alt="" size={40} fallbackName={name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="t-body truncate font-medium text-site-text">{name}</span>
                    <time className="t-meta shrink-0" dateTime={request.createdAt}>
                      {formatRelativeTime(request.createdAt, i18n.language)}
                    </time>
                  </div>
                  <p dir="auto" className="t-body mt-1 whitespace-pre-wrap break-words text-site-text">
                    {request.content}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 ps-13">
                <Button
                  variant="primary"
                  disabled={disabled}
                  aria-label={t('accept-label', { name, defaultValue: 'Accept message request from {{name}}' })}
                  onClick={() => void decide(request, 'accept')}
                >
                  {t('accept', { defaultValue: 'Accept' })}
                </Button>
                <Button
                  disabled={disabled}
                  aria-label={t('decline-label', { name, defaultValue: 'Decline message request from {{name}}' })}
                  onClick={() => void decide(request, 'decline')}
                >
                  {t('decline', { defaultValue: 'Decline' })}
                </Button>
                <Button
                  variant="ghost"
                  disabled={disabled}
                  aria-label={t('block-label', { name, defaultValue: 'Block {{name}}' })}
                  onClick={() => void decide(request, 'block')}
                >
                  {t('block', { defaultValue: 'Block' })}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {list.hasNextPage && (
        <div className="py-4">
          <Button onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {t('load-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      )}
    </div>
  );
}
