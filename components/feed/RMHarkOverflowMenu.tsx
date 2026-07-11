'use client';

/**
 * Shared "three-dots" overflow menu for a RMHark. Used by both the feed card
 * (RMHarkCard) and the post-detail page (PostDetail) so the two can't drift
 * apart again — every action (bookmark, likes/reposts, share, insights, edit,
 * pin, delete, tip, report, mute, block) and its modal live here once.
 *
 * Translation is the one action left to the parent: the translated text is
 * rendered in the post body, which each surface lays out differently, so the
 * parent owns that state and passes a `translate` control for the menu item.
 */

import { useEffect, useRef, useState } from 'react';
import {
  MoreHorizontal, Heart, Repeat, Trash2, Share2, Flag, Ban, VolumeX,
  Bookmark, Coins, Pin, Pencil, Languages, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feed-types';
import { ReportDialog } from '@/components/moderation/ReportDialog';
import { TipDialog } from '@/components/economy/TipDialog';
import { EditPostModal } from './EditPostModal';
import { EngagementListModal } from './EngagementListModal';
import { InsightsModal } from './InsightsModal';
import { ShareModal } from './ShareModal';

export interface RMHarkTranslateControl {
  translating: boolean;
  hasTranslation: boolean;
  showing: boolean;
  onToggle: () => void;
}

interface RMHarkOverflowMenuProps {
  item: FeedItem;
  isAuthor: boolean;
  /** Sync count/content changes back to the surface (feed store, local state). */
  onUpdate?: (updates: Partial<FeedItem>) => void;
  /** Remove the post from view after delete/block/mute (feed removes the row;
   *  the post page navigates away). */
  onRemove?: () => void;
  /** Optional translate menu item; the translated body is rendered by the parent. */
  translate?: RMHarkTranslateControl;
  /** Classes for the trigger button. */
  buttonClassName?: string;
  /** Classes for the trigger icon (e.g. `w-4 h-4` on compact cards). */
  iconClassName?: string;
  /** Extra classes for the positioned wrapper. */
  className?: string;
}

export function RMHarkOverflowMenu({
  item,
  isAuthor,
  onUpdate,
  onRemove,
  translate,
  buttonClassName,
  iconClassName,
  className,
}: RMHarkOverflowMenuProps) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const { data: session } = authClient.useSession();
  const actualId = item.actualId ?? item.id;
  const targetUserId = item.user?.id;

  const [menuOpen, setMenuOpen] = useState(false);
  const [engagementModal, setEngagementModal] = useState<'likes' | 'reposts' | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [pinned, setPinned] = useState(!!item.pinned);
  const [bookmarked, setBookmarked] = useState(!!item.bookmarked);
  const menuRef = useRef<HTMLDivElement>(null);
  const { run: runBookmark } = useOptimisticAction();
  const { run: runPin } = useOptimisticAction();

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/u/${item.user?.handle || item.user?.id}/post/${actualId}`
      : '';

  const handleShare = () => {
    setMenuOpen(false);
    const userName = item.user?.name || item.user?.handle || 'someone';
    const shareText = `Check out what ${userName} RMHark'd on RMH Studios!`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'RMH', text: shareText, url: shareUrl }).catch(() => {});
    } else {
      setShareModalOpen(true);
    }
  };

  const handleBookmark = () => {
    setMenuOpen(false);
    const next = !bookmarked;
    runBookmark({
      apply: () => setBookmarked(next),
      rollback: () => setBookmarked(!next),
      commit: () => fetch(`/api/rmharks/${actualId}/bookmark`, { method: 'POST', credentials: 'include' }),
      reconcile: async (res) => {
        const data = await res.json().catch(() => ({}));
        setBookmarked(!!data.bookmarked);
        onUpdate?.({ bookmarked: !!data.bookmarked });
        toast.success(
          data.bookmarked
            ? t('bookmark-saved', { defaultValue: 'Saved to bookmarks' })
            : t('bookmark-removed', { defaultValue: 'Removed from bookmarks' })
        );
      },
      onError: (_err, res) => {
        if (res?.status === 401)
          toast.error(t('bookmark-sign-in', { defaultValue: 'Please sign in to bookmark posts.' }));
      },
    });
  };

  const handlePin = () => {
    setMenuOpen(false);
    const next = !pinned;
    runPin({
      apply: () => setPinned(next),
      rollback: () => setPinned(!next),
      commit: () => fetch(`/api/rmharks/${actualId}/pin`, { method: 'POST', credentials: 'include' }),
      reconcile: async (res) => {
        const data = await res.json().catch(() => ({}));
        setPinned(!!data.pinned);
        onUpdate?.({ pinned: !!data.pinned });
        toast.success(
          data.pinned
            ? t('pinned-success', { defaultValue: 'Pinned to your profile' })
            : t('unpinned-success', { defaultValue: 'Unpinned' })
        );
      },
      onError: (_err, res) => {
        if (res) {
          res.json().catch(() => ({})).then((data: { error?: string }) =>
            toast.error(data.error || t('pin-error', { defaultValue: 'Could not pin post' }))
          );
        } else {
          toast.error(t('pin-error', { defaultValue: 'Could not pin post' }));
        }
      },
    });
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!(await confirm({ title: t('delete-confirm', { defaultValue: 'Delete this RMHark?' }), danger: true }))) return;
    try {
      await fetch(`/api/rmharks/${actualId}`, { method: 'DELETE' });
      onRemove?.();
    } catch {
      // ignore — surface handles its own error UX
    }
  };

  const handleBlock = async () => {
    setMenuOpen(false);
    if (!targetUserId) return;
    try {
      const res = await fetch('/api/moderation/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.blocked ? t('user-blocked', { defaultValue: 'User blocked' }) : t('user-unblocked', { defaultValue: 'User unblocked' }));
        if (data.blocked) onRemove?.();
      } else {
        toast.error(data.error || t('block-error', { defaultValue: 'Could not block user' }));
      }
    } catch {
      toast.error(t('block-error', { defaultValue: 'Could not block user' }));
    }
  };

  const handleMute = async () => {
    setMenuOpen(false);
    if (!targetUserId) return;
    try {
      const res = await fetch('/api/moderation/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.muted ? t('user-muted', { defaultValue: 'User muted' }) : t('user-unmuted', { defaultValue: 'User unmuted' }));
        if (data.muted) onRemove?.();
      } else {
        toast.error(data.error || t('mute-error', { defaultValue: 'Could not mute user' }));
      }
    } catch {
      toast.error(t('mute-error', { defaultValue: 'Could not mute user' }));
    }
  };

  const itemClass = 'flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors';
  const dangerClass = 'flex items-center gap-2 w-full px-3 py-2 text-sm text-site-danger hover:bg-site-danger/10 transition-colors';
  const showTranslate =
    translate && !!item.content && !item.deletedAt && (item.content?.length ?? 0) > 8;

  return (
    // Lift above sibling content (comments, related posts) while the menu is open.
    <div className={cn('relative', menuOpen && 'z-30', className)} ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        aria-label={t('more-options', { defaultValue: 'More options' })}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={cn('p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors', buttonClassName)}
      >
        <MoreHorizontal className={cn('w-5 h-5', iconClassName)} />
      </button>
      {menuOpen && (
        <div
          role="menu"
          tabIndex={-1}
          className="absolute right-0 top-full mt-1 w-44 bg-site-bg border border-site-border rounded-site shadow-xl py-1 z-30"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {session && (
            <button onClick={handleBookmark} className={itemClass}>
              <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-site-accent text-site-accent' : 'text-site-text-dim'}`} />
              {bookmarked ? t('bookmark-saved-label', { defaultValue: 'Saved' }) : t('bookmark-label', { defaultValue: 'Bookmark' })}
            </button>
          )}
          <button onClick={() => { setMenuOpen(false); setEngagementModal('likes'); }} className={itemClass}>
            <Heart className="w-4 h-4 text-site-text-dim" />
            {t('liked-by', { defaultValue: 'Liked by' })}
          </button>
          <button onClick={() => { setMenuOpen(false); setEngagementModal('reposts'); }} className={itemClass}>
            <Repeat className="w-4 h-4 text-site-text-dim" />
            {t('rermharkd-by', { defaultValue: "reRMHark'd by" })}
          </button>
          <button onClick={handleShare} className={itemClass}>
            <Share2 className="w-4 h-4 text-site-text-dim" />
            {t('share', { defaultValue: 'Share' })}
          </button>
          {showTranslate && (
            <button
              onClick={() => { setMenuOpen(false); translate!.onToggle(); }}
              disabled={translate!.translating}
              className={cn(itemClass, 'disabled:opacity-60')}
            >
              <Languages className="w-4 h-4 text-site-text-dim" />
              {translate!.translating
                ? t('translating', { defaultValue: 'Translating…' })
                : translate!.hasTranslation
                  ? (translate!.showing ? t('show-original', { defaultValue: 'Show original' }) : t('show-translation', { defaultValue: 'Show translation' }))
                  : t('translate', { defaultValue: 'Translate' })}
            </button>
          )}
          {isAuthor && (
            <>
              <button onClick={() => { setMenuOpen(false); setInsightsOpen(true); }} className={itemClass}>
                <TrendingUp className="w-4 h-4 text-site-text-dim" />
                {t('view-insights', { defaultValue: 'View insights' })}
              </button>
              <button onClick={() => { setMenuOpen(false); setEditOpen(true); }} className={itemClass}>
                <Pencil className="w-4 h-4 text-site-text-dim" />
                {t('edit', { defaultValue: 'Edit' })}
              </button>
              <button onClick={handlePin} className={itemClass}>
                <Pin className={`w-4 h-4 ${pinned ? 'fill-site-accent text-site-accent' : 'text-site-text-dim'}`} />
                {pinned ? t('unpin-from-profile', { defaultValue: 'Unpin from profile' }) : t('pin-to-profile', { defaultValue: 'Pin to profile' })}
              </button>
              <button onClick={handleDelete} className={dangerClass}>
                <Trash2 className="w-4 h-4" />
                {t('delete', { defaultValue: 'Delete' })}
              </button>
            </>
          )}
          {!isAuthor && session && (
            <>
              {targetUserId && (
                <button onClick={() => { setMenuOpen(false); setTipOpen(true); }} className={itemClass}>
                  <Coins className="w-4 h-4 text-site-warning" />
                  {t('send-tip', { defaultValue: 'Send tip' })}
                </button>
              )}
              <button onClick={() => { setMenuOpen(false); setReportOpen(true); }} className={itemClass}>
                <Flag className="w-4 h-4 text-site-text-dim" />
                {t('report', { defaultValue: 'Report' })}
              </button>
              <button onClick={handleMute} className={itemClass}>
                <VolumeX className="w-4 h-4 text-site-text-dim" />
                {t('mute', { defaultValue: 'Mute' })}
              </button>
              <button onClick={handleBlock} className={dangerClass}>
                <Ban className="w-4 h-4" />
                {t('block', { defaultValue: 'Block' })}
              </button>
            </>
          )}
        </div>
      )}

      {engagementModal && (
        <EngagementListModal
          open={engagementModal !== null}
          onClose={() => setEngagementModal(null)}
          postId={actualId}
          type={engagementModal}
        />
      )}

      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        url={shareUrl}
        embedId={actualId}
        text={`Check out what ${item.user?.name || item.user?.handle || 'someone'} RMHark'd on RMH Studios!`}
      />

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} entityType="rmhark" entityId={actualId} />

      {targetUserId && (
        <TipDialog
          open={tipOpen}
          onOpenChange={setTipOpen}
          recipientId={targetUserId}
          recipientName={item.user?.name ?? item.user?.handle}
          entityType="rmhark"
          entityId={actualId}
        />
      )}

      {isAuthor && (
        <EditPostModal
          open={editOpen}
          onOpenChange={setEditOpen}
          postId={actualId}
          initialContent={item.content ?? ''}
          initialGifUrl={item.gifUrl ?? ''}
          onSaved={(content, gifUrl) => onUpdate?.({ content, gifUrl: gifUrl ?? undefined, edited: true })}
        />
      )}

      {isAuthor && insightsOpen && (
        <InsightsModal open={insightsOpen} onClose={() => setInsightsOpen(false)} postId={actualId} />
      )}
    </div>
  );
}
