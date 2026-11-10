import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pin, Trash2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { ListView } from '@/lib/lists/constants';
import type { ResolvedUser } from '@/lib/user-display';
import type { ListTimelinePost } from '@/lib/lists/lists.server';
import { api } from '@/lib/contract/client';
import { deleteListApi, listFeedApi, updateListApi } from '@/lib/lists/lists.contract';

export function ListDetailView({ list, members }: { list: ListView; members: ResolvedUser[] }) {
  const { t } = useTranslation('c-lists');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [pinned, setPinned] = useState(list.pinned);
  const [posts, setPosts] = useState<ListTimelinePost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api(listFeedApi, { params: { id: list.id } })
      .then((data) => {
        if (cancelled) return;
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
    let data;
    try {
      data = await api(listFeedApi, { params: { id: list.id }, query: { cursor } });
    } catch {
      return;
    }
    setPosts((prev) => [...prev, ...data.items]);
    setCursor(data.nextCursor);
  }

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    // A non-2xx answer throws (HttpError), so a refused pin rolls back too.
    await api(updateListApi, { params: { id: list.id }, body: { pinned: next } }).catch(() =>
      setPinned(!next),
    );
  }

  async function remove() {
    const ok = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this list?' }),
      description: t('delete-desc', { defaultValue: 'This cannot be undone.' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteListApi, { params: { id: list.id } });
    } catch {
      return;
    }
    toast.success(t('deleted', { defaultValue: 'List deleted' }));
    void navigate({ to: '/saves', search: { tab: 'lists' } });
  }

  return (
    <div className="px-4 pt-4 pb-12">
      <div className="mb-4">
        {list.isOwner ? (
          <div className="mb-3 flex items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={togglePin} aria-pressed={pinned}>
                <Pin className={pinned ? 'text-site-accent' : undefined} aria-hidden />
                {pinned
                  ? t('pinned', { defaultValue: 'Pinned' })
                  : t('pin', { defaultValue: 'Pin' })}
              </Button>
              <IconButton
                icon={Trash2}
                variant="ghost"
                size="icon-sm"
                onClick={remove}
                className="text-site-danger"
                label={t('delete-list', { defaultValue: 'Delete list' })}
              />
            </div>
          </div>
        ) : null}
        {list.bio ? <p className="text-sm text-site-text-muted">{list.bio}</p> : null}
        <div className="mt-3 flex -space-x-2">
          {members.slice(0, 12).map((m) => (
            <UserAvatar
              key={m.id}
              src={m.image ?? undefined}
              alt={m.name ?? 'User'}
              size={28}
              fallbackName={m.name ?? undefined}
            />
          ))}
          {list.memberCount > 12 ? (
            <span className="ms-3 self-center text-xs text-site-text-muted">
              +{list.memberCount - 12}
            </span>
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
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Card interactive className="px-4 py-3 sm:py-3">
                <Link to="/thread/$rootId" params={{ rootId: p.id }} className="block">
                  <span className="mb-1 flex items-center gap-2">
                    <UserAvatar
                      src={p.author.image ?? undefined}
                      alt={p.author.name ?? 'User'}
                      size={24}
                      fallbackName={p.author.name ?? undefined}
                    />
                    <span className="truncate text-sm font-medium text-site-text">
                      {p.author.name ?? p.author.handle}
                    </span>
                  </span>
                  <span className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-site-text">
                    {p.content}
                  </span>
                </Link>
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
