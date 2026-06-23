'use client';

import { MessageCircle, Repeat2, Heart, Eye, Repeat, PenSquare } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useState, useRef, useEffect } from 'react';
import { useFeedStore } from '@/stores/feedStore';
import { authClient } from '@/lib/auth-client';
import { ComposeModal } from './ComposeModal';
import type { FeedItem } from '@/lib/feed-types';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('feed');
  const { updateItem: storeUpdate } = useFeedStore();
  const { data: session } = authClient.useSession();
  const [repostMenu, setRepostMenu] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const repostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!repostMenu) return;
    const onClick = (e: MouseEvent) => {
      if (repostRef.current && !repostRef.current.contains(e.target as Node)) setRepostMenu(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [repostMenu]);

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

  const toggleRepost = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
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
      <div className="relative" ref={repostRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setRepostMenu((v) => !v); }}
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
        {repostMenu && (
          <div className="absolute left-0 top-full mt-1 w-40 bg-site-bg border border-site-border rounded-xl shadow-xl py-1 z-30" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setRepostMenu(false); toggleRepost(); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <Repeat className="w-4 h-4 text-site-text-dim" />
              {item.reposted ? 'Undo reRMHark' : 'reRMHark'}
            </button>
            <button
              onClick={() => { setRepostMenu(false); setQuoteOpen(true); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <PenSquare className="w-4 h-4 text-site-text-dim" />
              {t('quote', { defaultValue: 'Quote' })}
            </button>
          </div>
        )}
      </div>

      <ComposeModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        quoteItem={{ id: item.actualId ?? item.id, content: item.content, user: item.user }}
      />

      {/* Like */}
      <button
        onClick={toggleLike}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors group ${
          item.liked
            ? 'text-rose-400'
            : 'text-site-text-dim hover:text-rose-400 hover:bg-rose-400/10'
        }`}
        title={t('like', { defaultValue: 'Like' })}
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
