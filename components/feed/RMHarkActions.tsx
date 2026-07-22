'use client';

import { MessageCircle, Repeat2, Heart, Eye, Repeat, PenSquare } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { useFeedStore } from '@/stores/feedStore';
import { useSession } from '@/components/Providers';
import type { FeedItem } from '@/lib/feed-types';

// Quote-compose modal — only opens on the "quote" repost action, so it's
// code-split out of the initial feed chunk and imported on first open.
const ComposeModal = lazy(() =>
  import('./ComposeModal').then((m) => ({ default: m.ComposeModal })),
);
import { useTranslation } from 'react-i18next';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { useLiquidPop } from '@/components/ui/liquid-pop';

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
  // Select just the action (a stable reference) so this component doesn't
  // re-render on every unrelated feed-store change.
  const storeUpdate = useFeedStore((s) => s.updateItem);
  // Shared root-level session (one subscription for the whole app).
  const { data: session } = useSession();
  const [repostMenu, setRepostMenu] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // Latch so the quote modal stays mounted after first open (close animation).
  const quoteMounted = useRef(false);
  quoteMounted.current ||= quoteOpen;
  const repostRef = useRef<HTMLDivElement>(null);
  const repostBtnRef = useRef<HTMLButtonElement>(null);
  const repostPanelRef = useRef<HTMLDivElement>(null);
  // §15.6 liquid pop — the reRMHark menu buds out of its trigger.
  const { underlay: repostUnderlay } = useLiquidPop({
    triggerRef: repostBtnRef,
    panelRef: repostPanelRef,
    open: repostMenu,
  });
  const { run: runLike } = useOptimisticAction();
  const { run: runRepost } = useOptimisticAction();

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

  const toggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) return;
    const wasLiked = item.liked;
    const prevCount = item.likeCount;
    runLike({
      apply: () =>
        updateItem(item.id, {
          liked: !wasLiked,
          likeCount: (item.likeCount ?? 0) + (wasLiked ? -1 : 1),
        }),
      rollback: () => updateItem(item.id, { liked: wasLiked, likeCount: prevCount }),
      commit: () => fetch(`/api/rmharks/${actualId}/like`, { method: 'POST' }),
    });
  };

  const toggleRepost = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!session) return;
    const wasReposted = item.reposted;
    const prevCount = item.repostCount;
    runRepost({
      apply: () =>
        updateItem(item.id, {
          reposted: !wasReposted,
          repostCount: (item.repostCount ?? 0) + (wasReposted ? -1 : 1),
        }),
      rollback: () => updateItem(item.id, { reposted: wasReposted, repostCount: prevCount }),
      commit: () => fetch(`/api/rmharks/${actualId}/repost`, { method: 'POST' }),
    });
  };

  return (
    <div className="flex items-center justify-between mt-3 -ml-2 max-w-md">
      {/* Comment */}
      <button
        onClick={handleCommentClick}
        title={t('comment', { defaultValue: 'Comment' })}
        aria-label={t('comment', { defaultValue: 'Comment' })}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent-dim/50 transition-[color,background-color,transform] duration-150 group active:scale-95"
      >
        <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform" aria-hidden />
        <AnimatedCount
          value={item.commentCount}
          format={formatCount}
          hideZero
          className="text-xs"
        />
      </button>

      {/* reRMHark */}
      <div className="relative" ref={repostRef}>
        {repostUnderlay}
        <button
          ref={repostBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            setRepostMenu((v) => !v);
          }}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-[color,background-color,transform] duration-150 group active:scale-95 ${
            item.reposted
              ? 'text-site-success'
              : 'text-site-text-dim hover:text-site-success hover:bg-site-success/10'
          }`}
          title="reRMHark"
          aria-label="reRMHark"
        >
          <Repeat2 className="w-4 h-4 group-hover:scale-110 transition-transform" aria-hidden />
          <AnimatedCount
            value={item.repostCount}
            format={formatCount}
            hideZero
            className="text-xs"
          />
        </button>
        {repostMenu && (
          <div
            ref={repostPanelRef}
            className="absolute left-0 top-full mt-1 w-40 glass-overlay py-1 z-30"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setRepostMenu(false);
                toggleRepost();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <Repeat className="w-4 h-4 text-site-text-dim" />
              {item.reposted ? 'Undo reRMHark' : 'reRMHark'}
            </button>
            <button
              onClick={() => {
                setRepostMenu(false);
                setQuoteOpen(true);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <PenSquare className="w-4 h-4 text-site-text-dim" />
              {t('quote', { defaultValue: 'Quote' })}
            </button>
          </div>
        )}
      </div>

      {quoteMounted.current && (
        <Suspense fallback={null}>
          <ComposeModal
            open={quoteOpen}
            onClose={() => setQuoteOpen(false)}
            quoteItem={{ id: item.actualId ?? item.id, content: item.content, user: item.user }}
          />
        </Suspense>
      )}

      {/* Like */}
      <button
        onClick={toggleLike}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-[color,background-color,transform] duration-150 group active:scale-95 ${
          item.liked
            ? 'text-site-danger'
            : 'text-site-text-dim hover:text-site-danger hover:bg-site-danger/10'
        }`}
        title={t('like', { defaultValue: 'Like' })}
        aria-label={t('like', { defaultValue: 'Like' })}
      >
        <Heart
          className={`w-4 h-4 group-hover:scale-110 transition-transform ${item.liked ? 'fill-current' : ''}`}
          aria-hidden
        />
        <AnimatedCount value={item.likeCount} format={formatCount} hideZero className="text-xs" />
      </button>

      {/* Views */}
      <div className="flex items-center gap-1.5 px-2 py-1 text-site-text-dim">
        <Eye className="w-4 h-4" />
        <AnimatedCount value={item.viewCount} format={formatCount} hideZero className="text-xs" />
      </div>
    </div>
  );
}
