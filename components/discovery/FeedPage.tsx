'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BellOff, BellPlus, Pencil, Trash2 } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { RMHarkCard } from '@/components/feed/RMHarkCard';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { FeedItem } from '@/lib/feed-types';
import type { FeedSummary } from '@/lib/discovery/feeds.server';
import { FeedForm, feedBody, type FeedFormValue } from './FeedForm';

interface View {
  feed: FeedSummary & {
    people: string[];
    owner: { name: string | null; handle: string | null; id: string };
  };
  items: FeedItem[];
  nextCursor: string | null;
}

/** /feeds/$id - one custom feed: keyset-paginated posts, subscribe, and owner edit (A4). */
export function FeedPage({ id }: { id: string }) {
  const { t } = useTranslation('f-discovery');
  const { data: session } = useSession();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [view, setView] = useState<View | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (cursor?: string) => {
      const res = await fetch(
        `/api/feeds/${encodeURIComponent(id)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        {
          credentials: 'include',
        },
      );
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      if (!res.ok) {
        toast.error(t('feed-load-failed', { defaultValue: 'Could not load the feed' }));
        return;
      }
      const v = (await res.json()) as View;
      setView(v);
      setItems((prev) => (cursor ? [...prev, ...v.items] : v.items));
    },
    [id, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error ?? t('feed-action-failed', { defaultValue: 'That did not work' }));
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <PageLayout title={t('feed-title', { defaultValue: 'Feed' })} backTo="/feeds">
        <EmptyState
          title={t('feed-missing', { defaultValue: 'This feed does not exist or is private' })}
        />
      </PageLayout>
    );
  }
  if (!view) {
    return (
      <PageLayout title={t('feed-title', { defaultValue: 'Feed' })} backTo="/feeds">
        <Skeleton className="m-4 h-40" />
      </PageLayout>
    );
  }
  const { feed } = view;
  const initial: FeedFormValue = {
    name: feed.name,
    description: feed.description ?? '',
    tags: feed.tags.join(', '),
    people: feed.people.join(', '),
    keywords: feed.keywords.join(', '),
    isPublic: feed.isPublic,
  };

  return (
    <PageLayout
      title={feed.name}
      wrapTitle
      backTo="/feeds"
      description={feed.description ?? undefined}
    >
      <div className="space-y-4 px-4 pt-2 pb-12">
        <section className="glass-pane flex flex-wrap items-center gap-3 rounded-site p-4">
          <p className="min-w-0 flex-1 text-sm text-site-text-muted">
            {[...feed.tags.map((x) => `#${x}`), ...feed.keywords].join(' · ')}
            {feed.peopleCount
              ? ` · ${t('feeds-people', { count: feed.peopleCount, defaultValue: '{{count}} people' })}`
              : ''}
          </p>
          {!feed.isOwner && session && (
            <Button
              variant={feed.subscribed ? 'outline' : 'accent'}
              size="sm"
              loading={busy}
              onClick={async () => {
                if (await send(`/api/feeds/${id}/subscribe`, feed.subscribed ? 'DELETE' : 'POST'))
                  void load();
              }}
            >
              {feed.subscribed ? <BellOff aria-hidden /> : <BellPlus aria-hidden />}
              {feed.subscribed
                ? t('feed-subscribed', { defaultValue: 'Subscribed' })
                : t('feed-subscribe', { defaultValue: 'Subscribe' })}
            </Button>
          )}
          {!feed.isOwner && !session && (
            <Link to="/login" search={{ callbackURL: `/feeds/${id}` }}>
              <Button variant="accent" size="sm">
                {t('feeds-signin-cta', { defaultValue: 'Sign in' })}
              </Button>
            </Link>
          )}
          {feed.isOwner && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)}>
                <Pencil aria-hidden /> {t('feed-edit', { defaultValue: 'Edit' })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={busy}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: t('feed-delete-confirm', { defaultValue: 'Delete this feed?' }),
                      danger: true,
                    }))
                  )
                    return;
                  if (await send(`/api/feeds/${id}`, 'DELETE')) void navigate({ to: '/feeds' });
                }}
              >
                <Trash2 aria-hidden /> {t('feed-delete', { defaultValue: 'Delete' })}
              </Button>
            </div>
          )}
        </section>

        {editing && feed.isOwner && (
          <FeedForm
            initial={initial}
            busy={busy}
            submitLabel={t('feed-save', { defaultValue: 'Save' })}
            onCancel={() => setEditing(false)}
            onSubmit={async (v) => {
              if (await send(`/api/feeds/${id}`, 'PATCH', feedBody(v))) {
                setEditing(false);
                void load();
              }
            }}
          />
        )}

        {items.length === 0 ? (
          <EmptyState title={t('feed-empty', { defaultValue: 'No matching posts yet' })} />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <RMHarkCard item={item} />
              </li>
            ))}
          </ul>
        )}
        {view.nextCursor && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => void load(view.nextCursor!)}>
              {t('feed-more', { defaultValue: 'Load more' })}
            </Button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
