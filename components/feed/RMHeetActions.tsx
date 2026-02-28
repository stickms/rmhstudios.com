'use client';

import { MessageCircle, Repeat2, Heart, Eye, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFeedStore } from '@/stores/feedStore';
import { authClient } from '@/lib/auth-client';
import type { FeedItem } from '@/lib/feed-types';

interface RMHeetActionsProps {
  item: FeedItem;
  onUpdate?: (id: string, updates: Partial<FeedItem>) => void;
  onRemove?: (id: string) => void;
}

function formatCount(n: number | undefined): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function RMHeetActions({ item, onUpdate, onRemove }: RMHeetActionsProps) {
  const router = useRouter();
  const { updateItem: storeUpdate, removeItem: storeRemove } = useFeedStore();
  const { data: session } = authClient.useSession();

  const updateItem = onUpdate ?? storeUpdate;
  const removeItem = onRemove ?? storeRemove;

  const actualId = item.actualId ?? item.id;
  const isAuthor = session?.user?.id === item.user?.id;

  const handleCommentClick = () => {
    router.push(`/${item.user?.id}/post/${actualId}`);
  };

  const toggleLike = async () => {
    if (!session) return;
    const wasLiked = item.liked;
    updateItem(item.id, {
      liked: !wasLiked,
      likeCount: (item.likeCount ?? 0) + (wasLiked ? -1 : 1),
    });

    try {
      const res = await fetch(`/api/rmheets/${actualId}/like`, { method: 'POST' });
      if (!res.ok) {
        updateItem(item.id, { liked: wasLiked, likeCount: item.likeCount });
      }
    } catch {
      updateItem(item.id, { liked: wasLiked, likeCount: item.likeCount });
    }
  };

  const toggleRepost = async () => {
    if (!session) return;
    const wasReposted = item.reposted;
    updateItem(item.id, {
      reposted: !wasReposted,
      repostCount: (item.repostCount ?? 0) + (wasReposted ? -1 : 1),
    });

    try {
      const res = await fetch(`/api/rmheets/${actualId}/repost`, { method: 'POST' });
      if (!res.ok) {
        updateItem(item.id, { reposted: wasReposted, repostCount: item.repostCount });
      }
    } catch {
      updateItem(item.id, { reposted: wasReposted, repostCount: item.repostCount });
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this RMHeet?')) return;
    removeItem(item.id);
    try {
      await fetch(`/api/rmheets/${actualId}`, { method: 'DELETE' });
    } catch {
      // Item already removed from UI
    }
  };

  return (
    <div className="flex items-center justify-between mt-3 -ml-2 max-w-md">
      {/* Comment */}
      <button
        onClick={handleCommentClick}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent-dim/50 transition-colors group"
      >
        <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
        <span className="text-xs">{formatCount(item.commentCount)}</span>
      </button>

      {/* ReRMH */}
      <button
        onClick={toggleRepost}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors group ${
          item.reposted
            ? 'text-emerald-400'
            : 'text-site-text-dim hover:text-emerald-400 hover:bg-emerald-400/10'
        }`}
      >
        <Repeat2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
        <span className="text-xs">{formatCount(item.repostCount)}</span>
      </button>

      {/* Like */}
      <button
        onClick={toggleLike}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors group ${
          item.liked
            ? 'text-rose-400'
            : 'text-site-text-dim hover:text-rose-400 hover:bg-rose-400/10'
        }`}
      >
        <Heart className={`w-4 h-4 group-hover:scale-110 transition-transform ${item.liked ? 'fill-current' : ''}`} />
        <span className="text-xs">{formatCount(item.likeCount)}</span>
      </button>

      {/* Views */}
      <div className="flex items-center gap-1.5 px-2 py-1 text-site-text-dim">
        <Eye className="w-4 h-4" />
        <span className="text-xs">{formatCount(item.viewCount)}</span>
      </div>

      {/* Delete (author only) */}
      {isAuthor && (
        <button
          onClick={handleDelete}
          className="flex items-center px-2 py-1 rounded-full text-site-text-dim hover:text-site-danger hover:bg-site-danger/10 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
