import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { BellOff, BellPlus, Pencil, Trash2 } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { RMHarkCard } from '@/components/feed/RMHarkCard';
import { Spine, SpineItem } from '@/components/ui/spine';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { FeedItem } from '@/lib/feed-types';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { cn } from '@/lib/utils';
import { getCustomFeedApi, type CustomFeedView } from '@/lib/discovery/discovery.contract';
import { FeedForm, feedBody, type FeedFormValue } from './FeedForm';

/** /feeds/$id - one custom feed: keyset-paginated posts, subscribe, and owner edit (A4). */
export function FeedPage({ id }: { id: string }) {
  const { t } = useTranslation('f-discovery');
  const { data: session } = useSession();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [view, setView] = useState<CustomFeedView | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Steel M9: the feed replaces the skeleton; "Load more" appends rows that fade one by one.
  const arrival = useArrival(!!view || missing);
  const isNew = useArrivingKeys(items.map((i) => i.id));

  const load = useCallback(
    async (cursor?: string) => {
      try {
        const v = await api(getCustomFeedApi, { params: { id }, query: cursor ? { cursor } : {} });
        setView(v);
        setItems((prev) => (cursor ? [...prev, ...v.items] : v.items));
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) {
          setMissing(true);
          return;
        }
        toast.error(t('feed-load-failed', { defaultValue: 'Could not load the feed' }));
      }
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
        <div className={cn('pb-12', arrival)}>
          <EmptyState
            title={t('feed-missing', { defaultValue: 'This feed does not exist or is private' })}
          />
        </div>
      </PageLayout>
    );
  }
  if (!view) {
    return (
      <PageLayout title={t('feed-title', { defaultValue: 'Feed' })} backTo="/feeds">
        <div className="pb-12">
          <Skeleton className="h-40 w-full" />
        </div>
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
      <Spine className={cn('pb-12', arrival)}>
        <SpineItem dot={false} className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-site-text-muted">
            {[...feed.tags.map((x) => `#${x}`), ...feed.keywords].join(' · ')}
            {feed.peopleCount
              ? ` · ${t('feeds-people', { count: feed.peopleCount, defaultValue: '{{count}} people' })}`
              : ''}
          </p>
          {!feed.isOwner && session && (
            <Button
              variant={feed.subscribed ? 'default' : 'default'}
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
              <Button variant="default" size="sm">
                {t('feeds-signin-cta', { defaultValue: 'Sign in' })}
              </Button>
            </Link>
          )}
          {feed.isOwner && (
            <div className="flex gap-2">
              <Button variant="default" size="sm" onClick={() => setEditing((e) => !e)}>
                <Pencil aria-hidden /> {t('feed-edit', { defaultValue: 'Edit' })}
              </Button>
              <Button
                variant="default"
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
        </SpineItem>

        {editing && feed.isOwner && (
          <SpineItem dot={false}>
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
          </SpineItem>
        )}

        {items.length === 0 ? (
          <EmptyState title={t('feed-empty', { defaultValue: 'No matching posts yet' })} />
        ) : (
          items.map((item) =>
            isNew(item.id) ? (
              <div key={item.id} className="arrive-group">
                <RMHarkCard item={item} />
              </div>
            ) : (
              <RMHarkCard key={item.id} item={item} />
            ),
          )
        )}
        {view.nextCursor && (
          <SpineItem dot={false} className="flex justify-center border-b-0">
            <Button variant="default" size="sm" onClick={() => void load(view.nextCursor!)}>
              {t('feed-more', { defaultValue: 'Load more' })}
            </Button>
          </SpineItem>
        )}
      </Spine>
    </PageLayout>
  );
}
