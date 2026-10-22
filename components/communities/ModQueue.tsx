'use client';

/** N4 — the community mod queue: held and flagged content, plus the removal log. */
import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import { MacroField } from '@/components/safety/MacroField';
import type { ModItemDTO } from '@/lib/communities/plus';

export function ModQueue({ slug }: { slug: string }) {
  const { t } = useTranslation('f-communities-plus');
  const [view, setView] = useState<'pending' | 'log'>('pending');
  const [items, setItems] = useState<ModItemDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // S4: per-item message to the author, filled from a macro.
  const [messages, setMessages] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setItems(null);
    const res = await plusFetch<{ items: ModItemDTO[] }>(
      communityApi(slug, `/modqueue?view=${view}`),
    );
    setItems(res.data?.items ?? []);
  }, [slug, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: ModItemDTO, decision: 'approve' | 'remove') => {
    setBusy(item.id);
    const res = await plusFetch(communityApi(slug, `/modqueue/${item.id}`), 'POST', {
      decision,
      message: decision === 'remove' ? messages[item.id]?.trim() || undefined : undefined,
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error || t('queue-error', { defaultValue: "Couldn't update the item" }));
      return;
    }
    setItems((cur) => cur?.filter((i) => i.id !== item.id) ?? null);
  };

  const actionLabel = (a: ModItemDTO['action']) =>
    a === 'hold'
      ? t('queue-action-hold', { defaultValue: 'Held' })
      : a === 'flag'
        ? t('queue-action-flag', { defaultValue: 'Flagged' })
        : t('queue-action-remove', { defaultValue: 'Removed' });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={view === 'pending' ? 'accent' : 'outline'}
          onClick={() => setView('pending')}
        >
          {t('queue-pending', { defaultValue: 'Needs review' })}
        </Button>
        <Button
          size="sm"
          variant={view === 'log' ? 'accent' : 'outline'}
          onClick={() => setView('log')}
        >
          {t('queue-log', { defaultValue: 'Resolved and removed' })}
        </Button>
      </div>
      {!items ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title={t('queue-empty', { defaultValue: 'Nothing here' })} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.id} className="glass-fill flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-site-text-muted">
                <span className="font-semibold text-site-text">
                  {i.author.name || i.author.handle || t('someone', { defaultValue: 'Someone' })}
                </span>
                <span>
                  {i.entityType === 'comment'
                    ? t('queue-kind-comment', { defaultValue: 'comment' })
                    : t('queue-kind-post', { defaultValue: 'post' })}
                </span>
                <span>·</span>
                <span>
                  {actionLabel(i.action)}
                  {' · '}
                  {t('queue-rule', { rule: i.ruleName, defaultValue: 'rule: {{rule}}' })}
                </span>
                <span>·</span>
                <span>{formatDistanceToNow(new Date(i.createdAt), { addSuffix: true })}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-site-text">{i.snapshot}</p>
              {i.status === 'PENDING' && (
                <MacroField
                  scope={{ kind: 'community', slug }}
                  vars={{ user: i.author.name || i.author.handle || undefined, reason: i.ruleName }}
                  value={messages[i.id] ?? ''}
                  onChange={(v) => setMessages((m) => ({ ...m, [i.id]: v }))}
                />
              )}
              {i.status === 'PENDING' ? (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === i.id}
                    onClick={() => decide(i, 'remove')}
                  >
                    {i.action === 'flag'
                      ? t('queue-remove-live', { defaultValue: 'Remove it' })
                      : t('queue-keep-removed', { defaultValue: 'Keep removed' })}
                  </Button>
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={busy === i.id}
                    onClick={() => decide(i, 'approve')}
                  >
                    {i.action === 'flag'
                      ? t('queue-dismiss', { defaultValue: 'Looks fine' })
                      : t('queue-approve', { defaultValue: 'Approve' })}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-site-text-muted">
                  {i.status === 'APPROVED'
                    ? t('queue-status-approved', { defaultValue: 'Approved' })
                    : t('queue-status-removed', { defaultValue: 'Removed' })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
