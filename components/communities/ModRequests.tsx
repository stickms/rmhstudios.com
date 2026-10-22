'use client';

/** Pending join requests for a private community: approve or deny. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import { focusAfterRemoval } from '@/components/communities/focus-after-removal';
import type { JoinRequestDTO } from '@/lib/communities/join-requests.server';

export function ModRequests({ slug }: { slug: string }) {
  const { t } = useTranslation('f-communities-plus');
  const [requests, setRequests] = useState<JoinRequestDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLSpanElement>(null);

  const load = useCallback(async () => {
    const res = await plusFetch<{ requests: JoinRequestDTO[] }>(
      communityApi(slug, '/join-requests'),
    );
    setRequests(res.data?.requests ?? []);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = (r: JoinRequestDTO) =>
    r.user.name || r.user.handle || t('someone', { defaultValue: 'Someone' });

  const decide = async (r: JoinRequestDTO, decision: 'approve' | 'deny') => {
    setBusy(r.id);
    const res = await plusFetch(communityApi(slug, `/join-requests/${r.id}`), 'POST', { decision });
    setBusy(null);
    // Already decided by someone else (404) just means the row is stale: drop it.
    if (!res.ok && res.status !== 404) {
      toast.error(t('requests-error', { defaultValue: "Couldn't update the request" }));
      return;
    }
    // Announce the outcome (sonner's live region), then keep keyboard focus in
    // the list: the decided row and its button are about to unmount.
    const name = displayName(r);
    toast.success(
      decision === 'approve'
        ? t('requests-approved-toast', { name, defaultValue: 'Approved {{name}}' })
        : t('requests-denied-toast', { name, defaultValue: 'Denied {{name}}' }),
    );
    const target = focusAfterRemoval(
      (requests ?? []).map((x) => x.id),
      r.id,
    );
    // Commit the removal now so the next row (or the empty state) exists to focus.
    flushSync(() => setRequests((cur) => cur?.filter((x) => x.id !== r.id) ?? null));
    if (target.kind === 'empty') {
      emptyRef.current?.focus();
      return;
    }
    // The neighbour's Approve (the safe, primary action) - never Deny (destructive).
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-request-id]') ?? [],
    ).find((el) => el.dataset.requestId === target.id);
    row?.querySelector<HTMLElement>('[data-action="approve"]')?.focus();
  };

  if (!requests) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={UserPlus}
        // The last row's button unmounted: focus lands on this heading (tabIndex -1).
        title={
          <span ref={emptyRef} tabIndex={-1} className="outline-none">
            {t('requests-empty', { defaultValue: 'No pending requests' })}
          </span>
        }
      />
    );
  }

  return (
    <ul ref={listRef} className="flex flex-col gap-2">
      {requests.map((r) => (
        <RequestRow
          key={r.id}
          request={r}
          name={displayName(r)}
          busy={busy === r.id}
          onDecide={(decision) => decide(r, decision)}
        />
      ))}
    </ul>
  );
}

/** One pending request. Exported so its markup can be tested without a fetch. */
export function RequestRow({
  request: r,
  name,
  busy,
  onDecide,
}: {
  request: JoinRequestDTO;
  name: string;
  busy: boolean;
  onDecide: (decision: 'approve' | 'deny') => void;
}) {
  const { t } = useTranslation('f-communities-plus');
  return (
    <li data-request-id={r.id} className="glass-fill flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <UserAvatar src={r.user.image} alt="" size={36} fallbackName={name} />
        <div className="min-w-32 flex-1">
          <p className="truncate text-sm font-semibold text-site-text">{name}</p>
          <p className="text-xs text-site-text-muted">
            {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
          </p>
        </div>
        <div className="ms-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            data-action="deny"
            disabled={busy}
            onClick={() => onDecide('deny')}
            aria-label={t('requests-deny-named', {
              name,
              defaultValue: 'Deny {{name}}',
            })}
          >
            {t('requests-deny', { defaultValue: 'Deny' })}
          </Button>
          <Button
            size="sm"
            variant="accent"
            data-action="approve"
            disabled={busy}
            onClick={() => onDecide('approve')}
            aria-label={t('requests-approve-named', {
              name,
              defaultValue: 'Approve {{name}}',
            })}
          >
            {t('requests-approve', { defaultValue: 'Approve' })}
          </Button>
        </div>
      </div>
      {r.message && (
        <p className="whitespace-pre-wrap break-words text-sm text-site-text-muted">{r.message}</p>
      )}
    </li>
  );
}
