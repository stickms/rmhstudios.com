'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pin, Trash2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { ListView } from '@/lib/lists/constants';
import type { ResolvedUser } from '@/lib/user-display';
import type { ListTimelinePost } from '@/lib/lists/lists.server';

export function ListDetailView({
  list,
  members,
}: {
  list: ListView;
  members: ResolvedUser[];
}) {
  const { t } = useTranslation('c-lists');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [pinned, setPinned] = useState(list.pinned);
  const [posts, setPosts] = useState<ListTimelinePost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lists/${list.id}/feed`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items: ListTimelinePost[]; nextCursor: string | null } | null) => {
        if (cancelled || !data) return;
        setPosts(data.items);
        setCursor(data.nextCursor);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [list.id]);

  async function loadMore() {
    if (!cursor) return;
    const res = await fetch(`/api/lists/${list.id}/feed?cursor=${cursor}`);
    if (!res.ok) return;
    const data = (await res.json()) as { items: ListTimelinePost[]; nextCursor: string | null };
    setPosts((prev) => [...prev, ...data.items]);
    setCursor(data.nextCursor);
  }

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    await fetch(`/api/lists/${list.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: next }),
    }).catch(() => setPinned(!next));
  }

  async function remove() {
    const ok = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this list?' }),
      description: t('delete-desc', { defaultValue: 'This cannot be undone.' }),
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/lists/${list.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success(t('deleted', { defaultValue: 'List deleted' }));
      void navigate({ to: '/lists' });
    }
  }

  return (
    <div className="px-4 pt-4 pb-12">
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-site-text">{list.name}</h2>
          {list.isOwner ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={togglePin} aria-pressed={pinned}>
                <Pin className={pinned ? 'h-4 w-4 text-site-accent' : 'h-4 w-4'} aria-hidden />
                {pinned ? t('pinned', { defaultValue: 'Pinned' }) : t('pin', { defaultValue: 'Pin' })}
              </Button>
              <Button variant="ghost" size="sm" onClick={remove} className="text-site-danger">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
        {list.bio ? <p className="text-sm text-site-text-muted">{list.bio}</p> : null}
        <div className="mt-3 flex -space-x-2">
          {members.slice(0, 12).map((m) => (
            <UserAvatar key={m.id} src={m.image ?? undefined} alt={m.name ?? 'User'} size={28} fallbackName={m.name ?? undefined} />
          ))}
          {list.memberCount > 12 ? (
            <span className="ms-3 self-center text-xs text-site-text-muted">+{list.memberCount - 12}</span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          title={t('feed-empty-title', { defaultValue: 'No posts yet' })}
          description={t('feed-empty-desc', { defaultValue: 'Posts from this list show up here.' })}
        />
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Card interactive className="px-4 py-3">
                <a href={`/thread/${p.id}`} className="block">
                  <span className="mb-1 flex items-center gap-2">
                    <UserAvatar src={p.author.image ?? undefined} alt={p.author.name ?? 'User'} size={24} fallbackName={p.author.name ?? undefined} />
                    <span className="truncate text-sm font-medium text-site-text">{p.author.name ?? p.author.handle}</span>
                  </span>
                  <span className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-site-text">
                    {p.content}
                  </span>
                </a>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {cursor ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={loadMore}>
            {t('load-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
