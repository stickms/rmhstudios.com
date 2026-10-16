'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Package, PackageOpen, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatCountdown } from '@/lib/posts-plus/constants';

interface Capsule {
  id: string;
  content: string;
  imageCount: number;
  hasGif: boolean;
  hasPoll: boolean;
  audience: string;
  openAt: string;
  sealedAt: string;
  postId: string | null;
  postHandle: string;
}

/**
 * Z7 - the "Time capsules" list on /drafts: sealed capsules with a countdown
 * (refreshed once a minute, not per frame) and the ones that opened recently.
 * Opening is done by the publish job, so a capsule opens on its date whether or
 * not this page is ever visited.
 */
export function TimeCapsuleList() {
  const { t } = useTranslation('f-posts-plus');
  const confirm = useConfirm();
  const [data, setData] = useState<{ sealed: Capsule[]; opened: Capsule[] } | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduled/capsules', { credentials: 'include' });
      if (res.ok) setData(await res.json());
      else setData({ sealed: [], opened: [] });
    } catch {
      setData({ sealed: [], opened: [] });
    }
  }, []);

  useEffect(() => {
    void load();
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const cancel = async (c: Capsule) => {
    const ok = await confirm({
      title: t('capsule-cancel-title', { defaultValue: 'Cancel this time capsule?' }),
      description: t('capsule-cancel-desc', {
        defaultValue: 'It will be discarded and will not post.',
      }),
      confirmLabel: t('capsule-cancel-confirm', { defaultValue: 'Discard capsule' }),
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/scheduled/${encodeURIComponent(c.id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      toast.error(t('capsule-cancel-failed', { defaultValue: 'Could not cancel the capsule' }));
      return;
    }
    setData((d) => (d ? { ...d, sealed: d.sealed.filter((x) => x.id !== c.id) } : d));
  };

  if (!data || (data.sealed.length === 0 && data.opened.length === 0)) return null;

  const extras = (c: Capsule) =>
    [
      c.imageCount > 0
        ? t('capsule-images', { defaultValue: '{{n}} image(s)', n: c.imageCount })
        : null,
      c.hasGif ? t('capsule-gif', { defaultValue: 'GIF' }) : null,
      c.hasPoll ? t('capsule-poll', { defaultValue: 'Poll' }) : null,
    ].filter(Boolean);

  return (
    <section className="px-4 pt-6 pb-8" aria-labelledby="capsules-heading">
      <h2
        id="capsules-heading"
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-site-text"
      >
        <Package className="h-4 w-4 text-site-accent" aria-hidden />
        {t('capsules-title', { defaultValue: 'Time capsules' })}
      </h2>

      <ul className="space-y-2">
        {data.sealed.map((c) => (
          <li key={c.id} className="glass-fill flex items-start gap-3 rounded-site px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-site-text line-clamp-3 whitespace-pre-wrap">
                {c.content || extras(c).join(' · ')}
              </p>
              <p className="mt-1 text-xs text-site-text-muted">
                {t('capsule-opens', {
                  defaultValue: 'Opens {{date}} · in {{countdown}}',
                  date: new Date(c.openAt).toLocaleString(),
                  countdown: formatCountdown(c.openAt, now ?? Date.parse(c.sealedAt)),
                })}
              </p>
            </div>
            <IconButton
              icon={Trash2}
              variant="ghost"
              size="icon-sm"
              label={t('capsule-cancel', { defaultValue: 'Cancel capsule' })}
              onClick={() => void cancel(c)}
            />
          </li>
        ))}
        {data.opened.map((c) => (
          <li
            key={c.id}
            className="glass-fill flex items-start gap-3 rounded-site px-4 py-3 opacity-90"
          >
            <PackageOpen className="mt-0.5 h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-site-text line-clamp-2 whitespace-pre-wrap">{c.content}</p>
              <p className="mt-1 text-xs text-site-text-muted">
                {t('capsule-opened', {
                  defaultValue: 'Opened {{date}}',
                  date: new Date(c.openAt).toLocaleDateString(),
                })}
                {c.postId && (
                  <>
                    {' · '}
                    <Link
                      to="/u/$userid/post/$postid"
                      params={{ userid: c.postHandle, postid: c.postId }}
                      className="text-site-accent hover:underline"
                    >
                      {t('capsule-view-post', { defaultValue: 'View post' })}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
