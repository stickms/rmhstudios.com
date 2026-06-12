'use client';

import { MessageCircle, Repeat2, Heart, Eye } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useFeedStore } from '@/stores/feedStore';
import { authClient } from '@/lib/auth-client';
import type { FeedItem } from '@/lib/feed-types';

interface RMHarkActionsProps {
  item: FeedItem;
  onUpdate?: (id: string, updates: Partial<FeedItem>) => void;
}

function formatCount(n: number | undefined): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function RMHarkActions({ item, onUpdate }: RMHarkActionsProps) {
  const navigate = useNavigate();
  const { updateItem: storeUpdate } = useFeedStore();
  const { data: session } = authClient.useSession();

  const updateItem = onUpdate ?? storeUpdate;
  const actualId = item.actualId ?? item.id;

  const handleCommentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate({ to: `/u/${item.user?.handle || item.user?.id}/post/${actualId}` });
  };

  const toggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) return;
    const wasLiked = item.liked;
    updateItem(item.id, {
      liked: !wasLiked,
      likeCount: (item.likeCount ?? 0) + (wasLiked ? -1 : 1),
    });

    try {
      const res = await fetch(`/api/rmharks/${actualId}/like`, { method: 'POST' });
      if (!res.ok) {
        updateItem(item.id, { liked: wasLiked, likeCount: item.likeCount });
      }
    } catch {
      updateItem(item.id, { liked: wasLiked, likeCount: item.likeCount });
    }
  };

  const toggleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) return;
    const wasReposted = item.reposted;
    updateItem(item.id, {
      reposted: !wasReposted,
      repostCount: (item.repostCount ?? 0) + (wasReposted ? -1 : 1),
    });

    try {
      const res = await fetch(`/api/rmharks/${actualId}/repost`, { method: 'POST' });
      if (!res.ok) {
        updateItem(item.id, { reposted: wasReposted, repostCount: item.repostCount });
      }
    } catch {
      updateItem(item.id, { reposted: wasReposted, repostCount: item.repostCount });
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

      {/* reRMHark */}
      <button
        onClick={toggleRepost}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors group ${
          item.reposted
            ? 'text-emerald-400'
            : 'text-site-text-dim hover:text-emerald-400 hover:bg-emerald-400/10'
        }`}
        title="reRMHark"
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
        title="Like"
      >
        <Heart className={`w-4 h-4 group-hover:scale-110 transition-transform ${item.liked ? 'fill-current' : ''}`} />
        <span className="text-xs">{formatCount(item.likeCount)}</span>
      </button>

      {/* Views */}
      <div className="flex items-center gap-1.5 px-2 py-1 text-site-text-dim">
        <Eye className="w-4 h-4" />
        <span className="text-xs">{formatCount(item.viewCount)}</span>
      </div>
    </div>
  );
}
