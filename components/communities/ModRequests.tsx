'use client';

/** Pending join requests for a private community: approve or deny. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import type { JoinRequestDTO } from '@/lib/communities/join-requests.server';

export function ModRequests({ slug }: { slug: string }) {
  const { t } = useTranslation('f-communities-plus');
  const [requests, setRequests] = useState<JoinRequestDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    const res = await plusFetch<{ requests: JoinRequestDTO[] }>(
      communityApi(slug, '/join-requests'),
    );
    setRequests(res.data?.requests ?? []);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (r: JoinRequestDTO, decision: 'approve' | 'deny') => {
    setBusy(r.id);
    const res = await plusFetch(communityApi(slug, `/join-requests/${r.id}`), 'POST', { decision });
    setBusy(null);
    // Already decided by someone else (404) just means the row is stale: drop it.
    if (!res.ok && res.status !== 404) {
      toast.error(t('requests-error', { defaultValue: "Couldn't update the request" }));
      return;
    }
    setRequests((cur) => cur?.filter((x) => x.id !== r.id) ?? null);
    // The decided row is gone and its button with it: keep keyboard focus in the list.
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('button')?.focus());
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
        title={t('requests-empty', { defaultValue: 'No pending requests' })}
      />
    );
  }

  return (
    <ul ref={listRef} className="flex flex-col gap-2">
      {requests.map((r) => {
        const name = r.user.name || r.user.handle || t('someone', { defaultValue: 'Someone' });
        return (
          <li key={r.id} className="glass-fill flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <UserAvatar src={r.user.image} alt="" size={36} fallbackName={name} />
              <div className="min-w-32 flex-1">
                <p className="truncate text-sm font-semibold text-site-text">{name}</p>
                <p className="text-xs text-site-text-muted">
                  {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                </p>
              </div>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === r.id}
                  onClick={() => decide(r, 'deny')}
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
                  disabled={busy === r.id}
                  onClick={() => decide(r, 'approve')}
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
              <p className="whitespace-pre-wrap break-words text-sm text-site-text-muted">
                {r.message}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
