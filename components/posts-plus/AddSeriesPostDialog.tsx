'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { FeedItem } from '@/lib/feed-types';

/**
 * X5 - pick one of your own older public posts to append to a series. Lists the
 * author's recent posts that are not already in a series (their profile feed,
 * one page); the server re-checks ownership, audience and series membership.
 */
export default function AddSeriesPostDialog({
  seriesId,
  authorKey,
  onClose,
  onAdded,
}: {
  seriesId: string;
  authorKey: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useTranslation('f-posts-plus');
  const [posts, setPosts] = useState<FeedItem[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/profile/${encodeURIComponent(authorKey)}/rmharks?limit=30`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: FeedItem[] } | null) => {
        if (cancelled) return;
        // Own original posts only: reposts carry another author, quotes are fine.
        setPosts(
          (d?.items ?? []).filter((i) => !i.seriesId && !i.repostedBy && !i.locked && !i.pending),
        );
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authorKey]);

  const add = async (postId: string) => {
    setAdding(postId);
    try {
      const res = await fetch(`/api/series/${encodeURIComponent(seriesId)}/posts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(
          err?.error ?? t('series-add-failed', { defaultValue: 'Could not add that post' }),
        );
        return;
      }
      setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? prev);
      onAdded();
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80dvh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>
            {t('series-add-title', { defaultValue: 'Add a post to this series' })}
          </DialogTitle>
          <DialogDescription>
            {t('series-add-hint', {
              defaultValue: 'Pick one of your recent public posts. It becomes the next part.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {posts === null ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : posts.length === 0 ? (
            <p className="py-6 text-center text-sm text-site-text-muted">
              {t('series-add-none', { defaultValue: 'No other recent posts to add.' })}
            </p>
          ) : (
            <ul className="divide-y divide-site-border/50">
              {posts.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 text-sm text-site-text line-clamp-2">
                    {p.content || t('series-add-media', { defaultValue: '(media post)' })}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={adding === p.id}
                    onClick={() => void add(p.id)}
                  >
                    {t('series-add', { defaultValue: 'Add' })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
