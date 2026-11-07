/**
 * /admin/emoji-packs — the emoji & sticker pack review queue.
 *
 * A pack is installable by anyone else only once it is APPROVED, and any edit
 * sends it back here. Each decision carries the pack's `updatedAt` as the
 * reviewer saw it, so an item added after this page loaded makes the decision
 * 409 instead of being approved unseen — the queue then reloads.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { Smile, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminBody } from '@/components/admin/AdminBody';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_site/admin/emoji-packs')({
  head: () => ({ meta: [{ title: 'Emoji Pack Review | RMH Studios' }] }),
  component: AdminEmojiPacksPage,
});

interface PendingPackRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: 'emoji' | 'sticker' | 'mixed';
  visibility: 'public' | 'unlisted' | 'private';
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string | null; handle: string | null; image: string | null };
  items: { id: string; name: string; url: string; alt: string }[];
}

type Action = 'approve' | 'remove';

function AdminEmojiPacksPage() {
  const { t, i18n } = useTranslation('admin');
  const [rows, setRows] = useState<PendingPackRow[]>([]);
  const [loading, setLoading] = useState(true);
  // One decision at a time: while any request is in flight every action is
  // disabled, so a double click cannot fire approve and remove back to back.
  const [busy, setBusy] = useState<{ id: string; action: Action } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/emoji-packs', { credentials: 'include' });
      const data = await res.json().catch(() => ({ packs: [] }));
      setRows(res.ok ? (data.packs ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (pack: PendingPackRow, action: Action) => {
    if (busy) return;
    setBusy({ id: pack.id, action });
    try {
      const res = await fetch(`/api/admin/emoji-packs/${pack.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          reason: reasons[pack.id]?.trim() || undefined,
          version: pack.updatedAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.error ??
            t('emoji-pack-action-failed', { defaultValue: 'Could not update that pack.' }),
        );
        // A 409 means the pack changed or was decided elsewhere: show the
        // queue as it is now rather than the stale copy.
        if (res.status === 409) void load();
        return;
      }
      toast.success(
        action === 'approve'
          ? t('emoji-pack-approved', { defaultValue: 'Pack approved.' })
          : t('emoji-pack-removed', { defaultValue: 'Pack removed.' }),
      );
      setRows((prev) => prev.filter((r) => r.id !== pack.id));
    } catch {
      toast.error(t('emoji-pack-action-failed', { defaultValue: 'Could not update that pack.' }));
    } finally {
      setBusy(null);
    }
  };

  const kindLabel = (kind: PendingPackRow['kind']) =>
    kind === 'sticker'
      ? t('emoji-pack-kind-sticker', { defaultValue: 'Stickers' })
      : kind === 'mixed'
        ? t('emoji-pack-kind-mixed', { defaultValue: 'Mixed' })
        : t('emoji-pack-kind-emoji', { defaultValue: 'Emoji' });

  return (
    <PageLayout
      title={t('emoji-packs-review-title', { defaultValue: 'Emoji Pack Review' })}
      description={t('emoji-packs-review-subtitle', {
        defaultValue:
          'New and edited packs wait here. Only approved packs can be found and installed by other people.',
      })}
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
      wide
    >
      <AdminBody width="narrow">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Smile}
            title={t('emoji-packs-review-empty', {
              defaultValue: 'No packs are waiting for review.',
            })}
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((p) => (
              <li key={p.id} className="glass-fill space-y-3 rounded-site p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 truncate text-base font-medium text-site-text">
                    {p.name}
                  </h2>
                  <Badge variant="outline" size="sm">
                    {kindLabel(p.kind)}
                  </Badge>
                  {p.visibility === 'unlisted' && (
                    <Badge variant="outline" size="sm">
                      {t('emoji-pack-unlisted', { defaultValue: 'Unlisted' })}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-site-text-dim">
                  <span className="inline-flex items-center gap-1.5">
                    <UserAvatar
                      src={p.owner.image}
                      alt={p.owner.name || t('user', { defaultValue: 'User' })}
                      size={20}
                      fallbackName={p.owner.name || 'U'}
                    />
                    <span className="text-site-text">
                      {p.owner.handle
                        ? `@${p.owner.handle}`
                        : (p.owner.name ?? p.owner.id.slice(0, 6))}
                    </span>
                  </span>
                  <span>
                    {t('emoji-pack-item-count', {
                      defaultValue: '{{count}} items',
                      defaultValue_one: '{{count}} item',
                      count: p.itemCount,
                    })}
                  </span>
                  <span>
                    {t('emoji-pack-edited-ago', {
                      defaultValue: 'edited {{when}}',
                      when: formatRelativeTime(p.updatedAt, i18n.language),
                    })}
                  </span>
                </div>

                {p.description && <p className="text-sm text-site-text-muted">{p.description}</p>}

                <ul className="glass-inset flex flex-wrap gap-2 rounded-site-sm p-3">
                  {p.items.map((item) => (
                    <li key={item.id} title={`:${item.name}:`}>
                      <img
                        src={item.url}
                        alt={item.alt}
                        loading="lazy"
                        decoding="async"
                        className="size-12 object-contain"
                      />
                    </li>
                  ))}
                </ul>
                {p.itemCount > p.items.length && (
                  <p className="text-xs text-site-text-dim">
                    {t('emoji-pack-more-items', {
                      defaultValue: 'Showing {{shown}} of {{count}} items.',
                      shown: p.items.length,
                      count: p.itemCount,
                    })}
                  </p>
                )}

                <Textarea
                  rows={2}
                  value={reasons[p.id] ?? ''}
                  onChange={(e) => setReasons((r) => ({ ...r, [p.id]: e.target.value }))}
                  maxLength={500}
                  placeholder={t('emoji-pack-reason-placeholder', {
                    defaultValue: 'Optional reason — the owner sees this if the pack is removed.',
                  })}
                  aria-label={t('emoji-pack-reason', { defaultValue: 'Reason' })}
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => decide(p, 'approve')}
                    disabled={busy !== null}
                    loading={busy?.id === p.id && busy.action === 'approve'}
                  >
                    <Check className="size-4" aria-hidden />
                    {t('emoji-pack-approve', { defaultValue: 'Approve' })}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => decide(p, 'remove')}
                    disabled={busy !== null}
                    loading={busy?.id === p.id && busy.action === 'remove'}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {t('emoji-pack-remove', { defaultValue: 'Remove' })}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminBody>
    </PageLayout>
  );
}
