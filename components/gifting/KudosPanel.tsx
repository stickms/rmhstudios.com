'use client';

/**
 * Kudos on a profile (G4): free thank-you notes with a reason. Lazy-loaded by
 * ProfileColumn the first time the tab opens.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Heart, Trash2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { apiJson } from '@/components/economy-plus/api';
import { KUDOS_REASON_MAX, type KudosPage } from '@/lib/gifting/kudos';

export default function KudosPanel({ ownerId, isOwner }: { ownerId: string; isOwner: boolean }) {
  const { t } = useTranslation('f-gifting');
  const { data: session } = useSession();
  const me = session?.user?.id ?? null;
  const base = `/api/profile/${encodeURIComponent(ownerId)}/kudos`;
  const [page, setPage] = useState<KudosPage | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (cursor?: string | null) =>
      apiJson<KudosPage>(cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base).catch(
        () => null,
      ),
    [base],
  );

  useEffect(() => {
    let cancelled = false;
    void load().then((p) => {
      if (!cancelled) setPage(p ?? { kudos: [], nextCursor: null, total: 0, canGive: false });
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function give() {
    const reason = draft.trim();
    if (reason.length < 3 || busy) return;
    setBusy(true);
    try {
      await apiJson(base, { method: 'POST', body: { reason } });
      setDraft('');
      const fresh = await load();
      if (fresh) setPage(fresh);
      toast.success(t('kudos-sent', { defaultValue: 'Kudos sent' }));
    } catch {
      toast.error(t('kudos-error', { defaultValue: "Couldn't send kudos right now" }));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await apiJson(`/api/kudos/${id}`, { method: 'DELETE' }).catch(() => null);
    setPage((p) =>
      p ? { ...p, kudos: p.kudos.filter((k) => k.id !== id), total: p.total - 1 } : p,
    );
  }

  async function more() {
    if (!page?.nextCursor) return;
    const next = await load(page.nextCursor);
    if (next) setPage({ ...next, total: page.total, kudos: [...page.kudos, ...next.kudos] });
  }

  if (!page) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {page.canGive ? (
        <div className="glass-pane space-y-2 p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, KUDOS_REASON_MAX))}
            rows={2}
            placeholder={t('kudos-placeholder', {
              defaultValue: 'Thanks for… (helped me with my chart)',
            })}
            aria-label={t('kudos-placeholder', {
              defaultValue: 'Thanks for… (helped me with my chart)',
            })}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-site-text-muted">
              {t('kudos-note', { defaultValue: 'Free, one per person per day.' })}
            </p>
            <Button
              variant="accent"
              size="sm"
              loading={busy}
              disabled={draft.trim().length < 3}
              onClick={give}
            >
              <Heart />
              {t('kudos-give', { defaultValue: 'Give kudos' })}
            </Button>
          </div>
        </div>
      ) : null}

      {page.kudos.length === 0 ? (
        <EmptyState icon={Heart} title={t('kudos-empty', { defaultValue: 'No kudos yet' })} />
      ) : (
        <ul className="space-y-2">
          {page.kudos.map((k) => (
            <li key={k.id} className="glass-fill flex items-start gap-3 rounded-site-sm p-3">
              <UserAvatar
                src={k.from.image}
                alt={k.from.name ?? k.from.handle ?? ''}
                size={32}
                fallbackName={k.from.name ?? k.from.handle ?? '?'}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-site-text">{k.reason}</p>
                <p className="mt-0.5 text-xs text-site-text-muted">
                  {k.from.handle ? (
                    <Link
                      to="/u/$userid"
                      params={{ userid: k.from.handle }}
                      className="hover:underline"
                    >
                      @{k.from.handle}
                    </Link>
                  ) : (
                    (k.from.name ?? '')
                  )}{' '}
                  · {formatDistanceToNow(new Date(k.createdAt), { addSuffix: true })}
                </p>
              </div>
              {isOwner || k.from.id === me ? (
                <IconButton
                  icon={Trash2}
                  variant="ghost"
                  size="icon-sm"
                  label={t('kudos-remove', { defaultValue: 'Remove this note' })}
                  onClick={() => void remove(k.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <Button variant="ghost" size="sm" onClick={more}>
          {t('kudos-more', { defaultValue: 'Show more' })}
        </Button>
      ) : null}
    </div>
  );
}
