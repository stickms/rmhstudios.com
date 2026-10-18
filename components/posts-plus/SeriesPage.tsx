'use client';

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, BellOff, BellPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { RMHarkCard } from '@/components/feed/RMHarkCard';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { FeedItem } from '@/lib/feed-types';
import { MAX_SERIES_TITLE } from '@/lib/posts-plus/constants';

// The "add an existing post" picker loads only when the owner opens it.
const AddSeriesPostDialog = lazy(() => import('./AddSeriesPostDialog'));

interface View {
  series: {
    id: string;
    title: string;
    description: string | null;
    total: number;
    followCount: number;
    following: boolean;
    isOwner: boolean;
    author: { id: string; name: string | null; handle: string | null };
  };
  items: FeedItem[];
}

/**
 * /series/$id - a series: its parts in order, a follow button for readers (new
 * parts notify followers), and for the author the tools to rename it, reorder or
 * remove parts, add existing posts, or delete the series (the posts stay).
 */
export function SeriesPage({ id }: { id: string }) {
  const { t } = useTranslation('f-posts-plus');
  const { data: session } = useSession();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [view, setView] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/series/${encodeURIComponent(id)}`, { credentials: 'include' });
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const v = (await res.json()) as View;
      setView(v);
      setTitle(v.series.title);
    } catch {
      toast.error(t('series-load-failed', { defaultValue: 'Could not load the series' }));
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (url: string, init: RequestInit, failed: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error ?? failed);
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <PageLayout title={t('series-page-title', { defaultValue: 'Series' })} backTo="/series">
        <EmptyState
          title={t('series-missing', { defaultValue: 'This series does not exist' })}
          action={
            <Link to="/">
              <Button variant="outline">
                {t('series-home', { defaultValue: 'Back to the feed' })}
              </Button>
            </Link>
          }
        />
      </PageLayout>
    );
  }

  if (!view) {
    return (
      <PageLayout title={t('series-page-title', { defaultValue: 'Series' })}>
        <div className="space-y-3 px-4">
          <Skeleton className="h-20 w-full rounded-site" />
          <Skeleton className="h-32 w-full rounded-site" />
        </div>
      </PageLayout>
    );
  }

  const { series, items } = view;
  const owner = series.isOwner;

  const toggleFollow = async () => {
    const next = !series.following;
    const ok = await call(
      `/api/series/${encodeURIComponent(id)}/follow`,
      { method: next ? 'PUT' : 'DELETE' },
      t('series-follow-failed', { defaultValue: 'Could not update your follow' }),
    );
    if (ok) await load();
  };

  const rename = async () => {
    const ok = await call(
      `/api/series/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify({ title: title.trim() }) },
      t('series-rename-failed', { defaultValue: 'Could not rename the series' }),
    );
    if (ok) {
      setRenaming(false);
      await load();
    }
  };

  const remove = async () => {
    const yes = await confirm({
      title: t('series-delete-title', { defaultValue: 'Delete this series?' }),
      description: t('series-delete-desc', {
        defaultValue: 'The posts stay exactly where they are; only the grouping goes.',
      }),
      confirmLabel: t('series-delete-confirm', { defaultValue: 'Delete series' }),
      danger: true,
    });
    if (!yes) return;
    const ok = await call(
      `/api/series/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      t('series-delete-failed', { defaultValue: 'Could not delete the series' }),
    );
    if (ok) void navigate({ to: '/series' });
  };

  const move = async (postId: string, direction: 'up' | 'down') => {
    const ok = await call(
      `/api/series/${encodeURIComponent(id)}/posts/${encodeURIComponent(postId)}`,
      { method: 'PATCH', body: JSON.stringify({ direction }) },
      t('series-move-failed', { defaultValue: 'Could not reorder the series' }),
    );
    if (ok) await load();
  };

  const take = async (postId: string) => {
    const ok = await call(
      `/api/series/${encodeURIComponent(id)}/posts/${encodeURIComponent(postId)}`,
      { method: 'DELETE' },
      t('series-remove-failed', { defaultValue: 'Could not remove the post' }),
    );
    if (ok) await load();
  };

  return (
    <PageLayout
      title={series.title}
      wrapTitle
      backTo={owner ? '/series' : undefined}
      description={series.description ?? undefined}
    >
      <div className="space-y-4 px-4 pt-2 pb-12">
        <section className="glass-pane flex flex-wrap items-center gap-3 rounded-site p-4">
          <p className="min-w-0 flex-1 text-sm text-site-text-muted">
            {t('series-by', { defaultValue: 'A series by' })}{' '}
            <Link
              to="/u/$userid"
              params={{ userid: series.author.handle ?? series.author.id }}
              className="font-semibold text-site-text hover:underline"
            >
              {series.author.name ?? series.author.handle}
            </Link>
            {' · '}
            {t('series-parts', { defaultValue: '{{n}} parts', n: series.total })}
            {' · '}
            {t('series-followers', { defaultValue: '{{n}} following', n: series.followCount })}
          </p>

          {!owner && session && (
            <Button
              variant={series.following ? 'outline' : 'accent'}
              size="sm"
              loading={busy}
              onClick={() => void toggleFollow()}
            >
              {series.following ? <BellOff aria-hidden /> : <BellPlus aria-hidden />}
              {series.following
                ? t('series-unfollow', { defaultValue: 'Following' })
                : t('series-follow', { defaultValue: 'Follow series' })}
            </Button>
          )}
          {!owner && !session && (
            <Link to="/login" search={{ callbackURL: `/series/${id}` }}>
              <Button variant="accent" size="sm">
                {t('series-sign-in', { defaultValue: 'Sign in to follow' })}
              </Button>
            </Link>
          )}

          {owner && (
            <div className="flex flex-wrap items-center gap-2">
              {renaming ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void rename();
                  }}
                >
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, MAX_SERIES_TITLE))}
                    aria-label={t('series-name', { defaultValue: 'Series name' })}
                    className="h-9 w-56"
                    autoFocus
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="accent"
                    loading={busy}
                    disabled={title.trim().length < 2}
                  >
                    {t('series-save', { defaultValue: 'Save' })}
                  </Button>
                  <IconButton
                    icon={X}
                    label={t('cancel', { defaultValue: 'Cancel' })}
                    onClick={() => {
                      setRenaming(false);
                      setTitle(series.title);
                    }}
                  />
                </form>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setRenaming(true)}>
                  <Pencil aria-hidden />
                  {t('series-rename', { defaultValue: 'Rename' })}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                {t('series-add-post', { defaultValue: 'Add a post' })}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void remove()}>
                <Trash2 aria-hidden />
                {t('series-delete', { defaultValue: 'Delete' })}
              </Button>
            </div>
          )}
        </section>

        {items.length === 0 ? (
          <EmptyState
            title={t('series-empty', { defaultValue: 'No parts yet' })}
            description={
              owner
                ? t('series-empty-owner', {
                    defaultValue:
                      'Add one of your public posts, or pick this series when you compose a new one.',
                  })
                : t('series-empty-reader', {
                    defaultValue: 'Nothing has been added to this series yet.',
                  })
            }
          />
        ) : (
          <ol className="space-y-4">
            {items.map((item, i) => (
              <li key={item.id}>
                <div className="mb-1 flex items-center gap-2 px-1">
                  <span className="text-xs font-semibold text-site-text-dim">
                    {t('series-part-label', { defaultValue: 'Part {{k}}', k: i + 1 })}
                  </span>
                  {owner && (
                    <span className="ms-auto flex items-center gap-1">
                      <IconButton
                        icon={ArrowUp}
                        label={t('series-move-up', { defaultValue: 'Move earlier' })}
                        disabled={i === 0 || busy}
                        onClick={() => void move(item.id, 'up')}
                      />
                      <IconButton
                        icon={ArrowDown}
                        label={t('series-move-down', { defaultValue: 'Move later' })}
                        disabled={i === items.length - 1 || busy}
                        onClick={() => void move(item.id, 'down')}
                      />
                      <IconButton
                        icon={X}
                        label={t('series-remove', { defaultValue: 'Take out of the series' })}
                        disabled={busy}
                        onClick={() => void take(item.id)}
                      />
                    </span>
                  )}
                </div>
                <RMHarkCard item={item} />
              </li>
            ))}
          </ol>
        )}
      </div>

      {adding && (
        <Suspense fallback={null}>
          <AddSeriesPostDialog
            seriesId={id}
            authorKey={series.author.handle ?? series.author.id}
            onClose={() => setAdding(false)}
            onAdded={() => void load()}
          />
        </Suspense>
      )}
    </PageLayout>
  );
}
